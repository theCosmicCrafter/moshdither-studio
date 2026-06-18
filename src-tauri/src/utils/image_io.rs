use crate::effects::types::Frame;
use crate::error::{AppError, Result};
use std::path::Path;

/// Load an image from disk into a Frame (RGBA).
pub fn load_image<P: AsRef<Path>>(path: P) -> Result<Frame> {
    let bytes = std::fs::read(&path).map_err(AppError::Io)?;
    let mut img = image::load_from_memory(&bytes).map_err(|e| AppError::Image(e.to_string()))?;

    // Resize down if either dimension exceeds 2048px (preserving aspect ratio)
    let (w, h) = (img.width(), img.height());
    if w > 2048 || h > 2048 {
        eprintln!(
            "[WARN] Image resized from {}x{} to fit 2048px limit. Quality may be affected. Use a smaller image to avoid this.",
            w, h
        );
        img = img.resize(2048, 2048, image::imageops::FilterType::Lanczos3);
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
    let mut img = image::load_from_memory(bytes).map_err(|e| AppError::Image(e.to_string()))?;

    // Resize down if either dimension exceeds 2048px (preserving aspect ratio)
    let (w, h) = (img.width(), img.height());
    if w > 2048 || h > 2048 {
        eprintln!(
            "[WARN] Image resized from {}x{} to fit 2048px limit. Quality may be affected. Use a smaller image to avoid this.",
            w, h
        );
        img = img.resize(2048, 2048, image::imageops::FilterType::Lanczos3);
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

#[cfg(test)]
mod tests {
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
