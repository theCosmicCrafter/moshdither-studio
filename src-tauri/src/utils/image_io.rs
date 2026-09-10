use crate::effects::types::Frame;
use crate::error::{AppError, Result};
use image::ImageEncoder;
use std::path::Path;

/// Load an image from disk into a Frame (RGBA).
pub fn load_image<P: AsRef<Path>>(path: P) -> Result<Frame> {
    // Identify by EXTENSION first, falling back to content sniffing.
    //
    // This used to be `load_from_memory`, which only sniffs magic bytes. TGA has
    // none worth sniffing, so opening a .tga file failed with "The image format
    // could not be determined" even though the decoder is compiled in and the
    // open dialog offers .tga. The fallback still covers a file whose extension
    // is missing or lies about its contents.
    let reader = image::ImageReader::open(&path).map_err(AppError::Io)?;
    let img = match reader.format() {
        Some(_) => match reader.decode() {
            Ok(img) => img,
            Err(_) => image::ImageReader::open(&path)
                .map_err(AppError::Io)?
                .with_guessed_format()
                .map_err(AppError::Io)?
                .decode()
                .map_err(|e| AppError::Image(e.to_string()))?,
        },
        None => reader
            .with_guessed_format()
            .map_err(AppError::Io)?
            .decode()
            .map_err(|e| AppError::Image(e.to_string()))?,
    };

    // NOTE: Automatic downscale is disabled by default. If image exceeds 2048px, a warning is logged and original size is kept.
    let (w, h) = (img.width(), img.height());
    if w > 2048 || h > 2048 {
        tracing::warn!(
            "Image dimensions {}x{} exceed 2048px limit. No automatic resize applied.",
            w,
            h
        );
        // No resize performed.
    }

    let rgba = img.to_rgba8();
    let (width, height) = rgba.dimensions();
    Ok(Frame {
        width,
        height,
        data: rgba.into_raw(),
    })
}

/// Load an image from memory (bytes) into a Frame (RGBA).
pub fn load_image_from_memory(bytes: &[u8]) -> Result<Frame> {
    let img = image::load_from_memory(bytes).map_err(|e| AppError::Image(e.to_string()))?;

    // NOTE: Automatic downscale is disabled by default. If image exceeds 2048px, a warning is logged and original size is kept.
    let (w, h) = (img.width(), img.height());
    if w > 2048 || h > 2048 {
        tracing::warn!(
            "Image dimensions {}x{} exceed 2048px limit. No automatic resize applied.",
            w,
            h
        );
        // No resize performed.
    }

    let rgba = img.to_rgba8();
    let (width, height) = rgba.dimensions();
    Ok(Frame {
        width,
        height,
        data: rgba.into_raw(),
    })
}

/// Save a Frame to disk as PNG.
pub fn save_png<P: AsRef<Path>>(frame: &Frame, path: P) -> Result<()> {
    let img = image::RgbaImage::from_raw(frame.width, frame.height, frame.data.clone())
        .ok_or_else(|| AppError::Image("Invalid frame dimensions".to_string()))?;
    img.save(path).map_err(|e| AppError::Image(e.to_string()))?;
    Ok(())
}

/// Save a Frame to disk as JPEG (lossy, ignores alpha).
pub fn save_jpeg<P: AsRef<Path>>(frame: &Frame, path: P, quality: u8) -> Result<()> {
    let img = image::RgbaImage::from_raw(frame.width, frame.height, frame.data.clone())
        .ok_or_else(|| AppError::Image("Invalid frame dimensions".to_string()))?;
    let rgb = image::DynamicImage::ImageRgba8(img).to_rgb8();
    let mut output = std::fs::File::create(path).map_err(AppError::Io)?;
    let mut encoder = image::codecs::jpeg::JpegEncoder::new_with_quality(&mut output, quality);
    encoder
        .encode_image(&rgb)
        .map_err(|e| AppError::Image(e.to_string()))?;
    Ok(())
}

/// Save a Frame to disk as BMP.
pub fn save_bmp<P: AsRef<Path>>(frame: &Frame, path: P) -> Result<()> {
    let img = image::RgbaImage::from_raw(frame.width, frame.height, frame.data.clone())
        .ok_or_else(|| AppError::Image("Invalid frame dimensions".to_string()))?;
    let mut output = std::fs::File::create(path).map_err(AppError::Io)?;
    let encoder = image::codecs::bmp::BmpEncoder::new(&mut output);
    encoder
        .write_image(
            &img,
            img.width(),
            img.height(),
            image::ExtendedColorType::Rgba8,
        )
        .map_err(|e| AppError::Image(e.to_string()))?;
    Ok(())
}

/// Save a Frame to disk as TIFF.
pub fn save_tiff<P: AsRef<Path>>(frame: &Frame, path: P) -> Result<()> {
    let img = image::RgbaImage::from_raw(frame.width, frame.height, frame.data.clone())
        .ok_or_else(|| AppError::Image("Invalid frame dimensions".to_string()))?;
    let mut output = std::fs::File::create(path).map_err(AppError::Io)?;
    let encoder = image::codecs::tiff::TiffEncoder::new(&mut output);
    encoder
        .write_image(
            &img,
            img.width(),
            img.height(),
            image::ExtendedColorType::Rgba8,
        )
        .map_err(|e| AppError::Image(e.to_string()))?;
    Ok(())
}

/// Save a Frame to disk choosing the format based on the file extension.
/// Supported formats: png, jpg, jpeg, bmp, tiff.
pub fn save_image<P: AsRef<Path>>(
    frame: &Frame,
    path: P,
    format: Option<&str>,
    quality: Option<u8>,
) -> Result<()> {
    let path = path.as_ref();
    let format = format
        .map(|s| s.to_lowercase())
        .or_else(|| {
            path.extension()
                .and_then(|e| e.to_str())
                .map(|s| s.to_lowercase())
        })
        .unwrap_or_else(|| "png".to_string());
    match format.as_str() {
        "png" => save_png(frame, path),
        "jpg" | "jpeg" => save_jpeg(frame, path, quality.unwrap_or(90)),
        "bmp" => save_bmp(frame, path),
        "tiff" | "tif" => save_tiff(frame, path),
        _ => Err(AppError::Image(format!(
            "Unsupported image format: {}",
            format
        ))),
    }
}

#[cfg(test)]
mod tests {
    /// Every still format the open dialog offers must actually be DECODABLE.
    ///
    /// `reading_enabled()` alone is not enough and would have passed this build
    /// wrongly: image 0.25 reports it for AVIF whenever the `avif` feature is on,
    /// but that feature only supplies the ENCODER -- decoding needs
    /// `avif-native` (dav1d). So each format is proved by decoding real bytes.
    ///
    /// Offering an extension the binary cannot read is a broken promise the user
    /// only discovers after picking a file.
    #[test]
    fn every_offered_still_format_actually_decodes() {
        // 2x2 samples encoded by the `image` crate itself where it can write
        // them; anything it cannot write, it cannot round-trip here, and those
        // are listed explicitly below rather than skipped silently.
        use image::{ImageFormat, RgbaImage};
        let img = RgbaImage::from_fn(2, 2, |x, y| {
            image::Rgba([(x * 120) as u8, (y * 120) as u8, 40, 255])
        });

        // extension -> the format the dialog implies
        // Must stay in step with the dialog list in src/lib/tauri.ts.
        // avif and dds are absent from both: no decoder in this build.
        let offered: &[(&str, ImageFormat)] = &[
            ("png", ImageFormat::Png),
            ("jpg", ImageFormat::Jpeg),
            ("jpeg", ImageFormat::Jpeg),
            ("gif", ImageFormat::Gif),
            ("bmp", ImageFormat::Bmp),
            ("tiff", ImageFormat::Tiff),
            ("webp", ImageFormat::WebP),
            ("ico", ImageFormat::Ico),
            ("tga", ImageFormat::Tga),
            ("qoi", ImageFormat::Qoi),
            ("pnm", ImageFormat::Pnm),
        ];

        let mut broken = Vec::new();
        for (ext, fmt) in offered {
            if !fmt.reading_enabled() {
                broken.push(format!("{ext}: no decoder compiled in ({fmt:?})"));
                continue;
            }
            // Round-trip through real bytes. If the crate cannot write the
            // format we cannot prove decoding here, and say so rather than
            // counting it as verified.
            let mut buf = std::io::Cursor::new(Vec::new());
            // JPEG has no alpha channel, so writing an RGBA sample fails and the
            // format would fall through to the weaker reading_enabled() check.
            // Drop alpha for those so every format gets a real round-trip.
            let write = if matches!(fmt, ImageFormat::Jpeg) {
                image::DynamicImage::ImageRgba8(img.clone())
                    .to_rgb8()
                    .write_to(&mut buf, *fmt)
            } else {
                img.write_to(&mut buf, *fmt)
            };
            match write {
                Ok(()) => {
                    // Written to a real file and loaded by PATH, because that is
                    // what the open dialog does. Decoding from memory sniffs
                    // magic bytes, and TGA has none -- so a from-memory check
                    // reports TGA broken when opening a .tga file works fine.
                    let dir = std::env::temp_dir().join("moshdither-still-formats");
                    let _ = std::fs::create_dir_all(&dir);
                    let path = dir.join(format!("sample.{ext}"));
                    if std::fs::write(&path, buf.into_inner()).is_err() {
                        broken.push(format!("{ext}: could not write a sample file"));
                        continue;
                    }
                    if let Err(e) = load_image(&path) {
                        broken.push(format!("{ext}: encoder works but decode failed: {e}"));
                    }
                    let _ = std::fs::remove_file(&path);
                }
                Err(_) => {
                    // Encoder absent. reading_enabled() said the decoder is
                    // there; that is the best evidence available for this one.
                    eprintln!("note: {ext} decode asserted via reading_enabled() only                                (this build cannot write {fmt:?} to round-trip it)");
                }
            }
        }

        assert!(
            broken.is_empty(),
            "the open dialog offers formats this build cannot read:
  {}
             Either enable the decoder feature on the `image` crate or stop              offering the extension in src/lib/tauri.ts.",
            broken.join("
  ")
        );
    }

    use super::*;
    use std::env;

    fn test_dir() -> std::path::PathBuf {
        env::temp_dir().join("moshdither_test")
    }

    fn ensure_test_dir() {
        let dir = test_dir();
        if !dir.exists() {
            std::fs::create_dir_all(&dir).unwrap();
        }
    }

    fn create_test_frame() -> Frame {
        Frame {
            width: 4,
            height: 4,
            data: vec![
                255, 0, 0, 255, 0, 255, 0, 255, 0, 0, 255, 255, 255, 255, 0, 255, 255, 0, 255, 255,
                0, 255, 255, 255, 255, 255, 255, 255, 0, 0, 0, 255, 128, 128, 128, 255, 64, 64, 64,
                255, 192, 192, 192, 255, 32, 32, 32, 255, 100, 150, 200, 255, 50, 100, 150, 255,
                200, 100, 50, 255, 150, 200, 100, 255,
            ],
        }
    }

    #[test]
    fn test_save_and_load_png_roundtrip() {
        ensure_test_dir();
        let frame = create_test_frame();
        let path = test_dir().join("roundtrip.png");

        save_png(&frame, &path).unwrap();
        let loaded = load_image(&path).unwrap();

        assert_eq!(loaded.width, frame.width);
        assert_eq!(loaded.height, frame.height);
        assert_eq!(loaded.data, frame.data);

        std::fs::remove_file(&path).ok();
    }

    #[test]
    fn test_load_nonexistent_file_fails() {
        let result = load_image("/nonexistent/path.png");
        assert!(result.is_err());
    }

    #[test]
    fn test_save_jpeg() {
        ensure_test_dir();
        let frame = create_test_frame();
        let path = test_dir().join("test.jpg");

        save_jpeg(&frame, &path, 90).unwrap();
        assert!(path.exists());

        std::fs::remove_file(&path).ok();
    }

    #[test]
    fn test_load_image_from_memory() {
        ensure_test_dir();
        let frame = create_test_frame();
        let path = test_dir().join("memory_test.png");
        save_png(&frame, &path).unwrap();

        let bytes = std::fs::read(&path).unwrap();
        let loaded = load_image_from_memory(&bytes).unwrap();

        assert_eq!(loaded.width, frame.width);
        assert_eq!(loaded.height, frame.height);
        assert_eq!(loaded.data, frame.data);

        std::fs::remove_file(&path).ok();
    }

    #[test]
    fn test_load_image_from_memory_invalid_data() {
        let invalid = b"not an image";
        let result = load_image_from_memory(invalid);
        assert!(result.is_err());
    }
}
