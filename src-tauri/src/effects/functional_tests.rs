//! Comprehensive functional test suite for all MoshDither Studio operations.
//!
//! Tests every major pipeline function end-to-end:
//! - Image loading and encoding
//! - Single effect application
//! - Effect stack chaining
//! - Mask blending (inside/outside/alpha)
//! - Animation (time parameter produces different output)
//! - File I/O (save/read)
//! - FFmpeg availability
//! - FFglitch environment check
//! - SAM3 availability check
//! - Environment status
//!
//! This module is used by both the CLI `test-all` command and the
//! `test_all_functions` Tauri command for agent-driven verification.

use crate::effects::{blend_mask, EffectRegistry, Frame, Mask};
use crate::ffmpeg::{ffedit_binary, ffgac_binary, ffmpeg_binary, probe_metadata};
use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct FunctionTestResult {
    pub test_name: String,
    pub category: String,
    pub passed: bool,
    pub error_message: Option<String>,
    pub duration_ms: u64,
    pub details: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct FunctionTestReport {
    pub total_tests: usize,
    pub passed: usize,
    pub failed: usize,
    pub results: Vec<FunctionTestResult>,
    pub summary: String,
    pub timestamp: String,
}

/// Create a test frame with a gradient pattern.
fn make_test_frame() -> Frame {
    let w = 128u32;
    let h = 128u32;
    let mut data = Vec::with_capacity((w * h * 4) as usize);
    for y in 0..h {
        for x in 0..w {
            let r = ((x as f32 / (w - 1) as f32) * 255.0) as u8;
            let g = ((y as f32 / (h - 1) as f32) * 255.0) as u8;
            let b = ((x + y) as f32 / ((w + h - 2) as f32) * 255.0) as u8;
            data.extend_from_slice(&[r, g, b, 255]);
        }
    }
    Frame {
        width: w,
        height: h,
        data,
    }
}

/// Create a half-mask: left half white, right half black.
fn make_half_mask(w: u32, h: u32) -> Mask {
    let mut data = vec![0u8; (w * h) as usize];
    for y in 0..h {
        for x in 0..(w / 2) {
            data[(y * w + x) as usize] = 255;
        }
    }
    Mask {
        width: w,
        height: h,
        data,
    }
}

/// Run a single test and capture the result.
fn run_test(
    test_name: &str,
    category: &str,
    f: impl FnOnce() -> std::result::Result<String, String>,
) -> FunctionTestResult {
    let start = std::time::Instant::now();
    let result = std::panic::catch_unwind(std::panic::AssertUnwindSafe(f));
    let duration_ms = start.elapsed().as_millis() as u64;

    match result {
        Ok(Ok(details)) => FunctionTestResult {
            test_name: test_name.to_string(),
            category: category.to_string(),
            passed: true,
            error_message: None,
            duration_ms,
            details: Some(details),
        },
        Ok(Err(e)) => FunctionTestResult {
            test_name: test_name.to_string(),
            category: category.to_string(),
            passed: false,
            error_message: Some(e),
            duration_ms,
            details: None,
        },
        Err(_) => FunctionTestResult {
            test_name: test_name.to_string(),
            category: category.to_string(),
            passed: false,
            error_message: Some("PANIC".to_string()),
            duration_ms,
            details: None,
        },
    }
}

/// Run the full functional test suite.
pub fn run_all_function_tests() -> FunctionTestReport {
    let registry = EffectRegistry::new();
    let test_frame = make_test_frame();
    let half_mask = make_half_mask(test_frame.width, test_frame.height);
    let mut results = Vec::new();

    // ── 1. Image Loading & Encoding ──────────────────────────

    results.push(run_test("image_encode_png", "io", || {
        let img = image::RgbaImage::from_raw(
            test_frame.width,
            test_frame.height,
            test_frame.data.clone(),
        )
        .ok_or("Failed to create image")?;
        let mut buf = std::io::Cursor::new(Vec::new());
        img.write_to(&mut buf, image::ImageFormat::Png)
            .map_err(|e| e.to_string())?;
        Ok(format!(
            "Encoded {}x{} PNG, {} bytes",
            test_frame.width,
            test_frame.height,
            buf.into_inner().len()
        ))
    }));

    results.push(run_test("image_encode_jpeg", "io", || {
        let img = image::RgbaImage::from_raw(
            test_frame.width,
            test_frame.height,
            test_frame.data.clone(),
        )
        .ok_or("Failed to create image")?;
        let rgb = image::DynamicImage::from(img).to_rgb8();
        let mut buf = std::io::Cursor::new(Vec::new());
        image::codecs::jpeg::JpegEncoder::new_with_quality(&mut buf, 80)
            .encode(
                &rgb,
                rgb.width(),
                rgb.height(),
                image::ExtendedColorType::Rgb8,
            )
            .map_err(|e| e.to_string())?;
        Ok(format!("Encoded JPEG, {} bytes", buf.into_inner().len()))
    }));

    results.push(run_test("image_decode_from_memory", "io", || {
        let img = image::RgbaImage::from_raw(
            test_frame.width,
            test_frame.height,
            test_frame.data.clone(),
        )
        .ok_or("Failed to create image")?;
        let mut buf = std::io::Cursor::new(Vec::new());
        img.write_to(&mut buf, image::ImageFormat::Png)
            .map_err(|e| e.to_string())?;
        let png_bytes = buf.into_inner();
        let decoded = image::load_from_memory_with_format(&png_bytes, image::ImageFormat::Png)
            .map_err(|e| e.to_string())?;
        Ok(format!(
            "Decoded {}x{} from {} bytes",
            decoded.width(),
            decoded.height(),
            png_bytes.len()
        ))
    }));

    // ── 2. Effect Registry ───────────────────────────────────

    results.push(run_test("registry_list_effects", "registry", || {
        let metas = registry.list();
        if metas.is_empty() {
            return Err("Registry is empty".to_string());
        }
        Ok(format!("{} effects registered", metas.len()))
    }));

    results.push(run_test("registry_list_by_category", "registry", || {
        let dithering = registry.list_by_category(crate::effects::EffectCategory::Dithering);
        let glitch = registry.list_by_category(crate::effects::EffectCategory::Glitch);
        let analog = registry.list_by_category(crate::effects::EffectCategory::Analog);
        Ok(format!(
            "Dithering: {}, Glitch: {}, Analog: {}",
            dithering.len(),
            glitch.len(),
            analog.len()
        ))
    }));

    results.push(run_test("registry_get_known_effect", "registry", || {
        let effect = registry
            .get("color.invert")
            .ok_or("color.invert not found")?;
        Ok(format!(
            "Found: {} ({})",
            effect.meta().name,
            effect.meta().id
        ))
    }));

    results.push(run_test(
        "registry_get_unknown_returns_none",
        "registry",
        || {
            if registry.get("nonexistent.effect").is_some() {
                Err("Should return None for unknown effect".to_string())
            } else {
                Ok("Correctly returned None".to_string())
            }
        },
    ));

    // ── 3. Single Effect Application ─────────────────────────

    let test_effects = [
        ("color.invert", "color"),
        ("dithering.bayer", "dithering"),
        ("dithering.floyd_steinberg", "dithering"),
        ("glitch.databend", "glitch"),
        ("glitch.byte_flip", "glitch"),
        ("analog.scanlines", "analog"),
        ("analog.vhs", "analog"),
        ("noise.uniform", "noise"),
        ("noise.gaussian", "noise"),
        ("pixel_geo.pixelate", "pixel_geo"),
        ("pixel_geo.wave_distort", "pixel_geo"),
        ("artistic.solarize", "artistic"),
        ("artistic.grayscale", "artistic"),
    ];

    for (effect_id, category) in &test_effects {
        let frame = test_frame.clone();
        let id = effect_id.to_string();
        let cat = category.to_string();
        results.push(run_test(
            &format!("apply_{}", id),
            &format!("effect:{}", cat),
            || {
                let effect = registry.get(&id).ok_or(format!("{} not found", id))?;
                let params = serde_json::Map::new();
                let output = effect
                    .process_frame(&frame, None, &params)
                    .map_err(|e| e.to_string())?;
                if output.data.is_empty() {
                    return Err("Output is empty".to_string());
                }
                if output.width == 0 || output.height == 0 {
                    return Err("Output has zero dimensions".to_string());
                }
                Ok(format!(
                    "{}x{} output, {} bytes",
                    output.width,
                    output.height,
                    output.data.len()
                ))
            },
        ));
    }

    // ── 4. Effect Stack Chaining ─────────────────────────────

    results.push(run_test("stack_chain_3_effects", "stack", || {
        let mut working = test_frame.clone();
        let effects_to_chain = ["color.invert", "analog.scanlines", "pixel_geo.pixelate"];
        for id in &effects_to_chain {
            let effect = registry.get(id).ok_or(format!("{} not found", id))?;
            let params = serde_json::Map::new();
            working = effect
                .process_frame(&working, None, &params)
                .map_err(|e| e.to_string())?;
        }
        Ok(format!(
            "Chained {} effects, final {}x{}",
            effects_to_chain.len(),
            working.width,
            working.height
        ))
    }));

    results.push(run_test("stack_chain_all_dithering", "stack", || {
        let mut working = test_frame.clone();
        let dithering_effects =
            registry.list_by_category(crate::effects::EffectCategory::Dithering);
        let mut count = 0;
        for meta in dithering_effects.iter().take(5) {
            let effect = registry
                .get(&meta.id)
                .ok_or(format!("{} not found", meta.id))?;
            let params = serde_json::Map::new();
            working = effect
                .process_frame(&working, None, &params)
                .map_err(|e| e.to_string())?;
            count += 1;
        }
        Ok(format!("Chained {} dithering effects", count))
    }));

    // ── 5. Mask Blending ─────────────────────────────────────

    results.push(run_test("mask_blend_inside", "mask", || {
        let original = test_frame.clone();
        let mut processed = test_frame.clone();
        // Modify processed (invert)
        for i in 0..processed.data.len() {
            if i % 4 < 3 {
                processed.data[i] = 255 - processed.data[i];
            }
        }
        let mut working = processed.clone();
        blend_mask(&mut working, &original, &half_mask, "inside");
        // Left half should be modified (inverted), right half should be original
        let left_pixel = &working.data[0..3];
        let right_pixel = &working.data[(working.width as usize - 1) * 4..][..3];
        let orig_left = &original.data[0..3];
        let orig_right = &original.data[(original.width as usize - 1) * 4..][..3];
        if left_pixel == orig_left {
            return Err("Left half (mask=255) should be modified in inside mode".to_string());
        }
        if right_pixel != orig_right {
            return Err("Right half (mask=0) should be preserved in inside mode".to_string());
        }
        Ok("Inside mask blend correct".to_string())
    }));

    results.push(run_test("mask_blend_outside", "mask", || {
        let original = test_frame.clone();
        let mut processed = test_frame.clone();
        for i in 0..processed.data.len() {
            if i % 4 < 3 {
                processed.data[i] = 255 - processed.data[i];
            }
        }
        let mut working = processed.clone();
        blend_mask(&mut working, &original, &half_mask, "outside");
        let left_pixel = &working.data[0..3];
        let right_pixel = &working.data[(working.width as usize - 1) * 4..][..3];
        let orig_left = &original.data[0..3];
        let orig_right = &original.data[(original.width as usize - 1) * 4..][..3];
        if left_pixel != orig_left {
            return Err("Left half (mask=255) should be preserved in outside mode".to_string());
        }
        if right_pixel == orig_right {
            return Err("Right half (mask=0) should be modified in outside mode".to_string());
        }
        Ok("Outside mask blend correct".to_string())
    }));

    results.push(run_test("mask_blend_alpha", "mask", || {
        let original = test_frame.clone();
        let mut processed = test_frame.clone();
        for i in 0..processed.data.len() {
            if i % 4 < 3 {
                processed.data[i] = 255 - processed.data[i];
            }
        }
        let mut working = processed.clone();
        blend_mask(&mut working, &original, &half_mask, "alpha");
        // Alpha mode should produce a blend — just check it doesn't crash and produces valid output
        if working.data.len() != original.data.len() {
            return Err("Output size mismatch".to_string());
        }
        Ok("Alpha mask blend completed".to_string())
    }));

    // ── 6. Animation (Time Parameter) ────────────────────────

    let animated_effects = [
        "noise.uniform",
        "noise.gaussian",
        "noise.fractal",
        "glitch.databend",
        "glitch.byte_flip",
        "glitch.byte_zero",
        "glitch.byte_insert",
        "analog.tv_glitch",
        "analog.vhs",
        "analog.scan_drift",
        "pixel_geo.wave_distort",
        "pixel_geo.block_shift",
        "glitch.macroblock_glitch",
        "dithering.random_noise",
    ];

    for effect_id in &animated_effects {
        let frame = test_frame.clone();
        let id = effect_id.to_string();
        results.push(run_test(&format!("animate_{}", id), "animation", || {
            let effect = registry.get(&id).ok_or(format!("{} not found", id))?;
            let mut p0 = serde_json::Map::new();
            p0.insert("time".to_string(), serde_json::json!(0.0));
            let mut p1 = serde_json::Map::new();
            p1.insert("time".to_string(), serde_json::json!(1.0));
            let o0 = effect
                .process_frame(&frame, None, &p0)
                .map_err(|e| e.to_string())?;
            let o1 = effect
                .process_frame(&frame, None, &p1)
                .map_err(|e| e.to_string())?;
            if o0.data == o1.data {
                return Err(
                    "Output identical at time=0 and time=1 — effect does not animate".to_string(),
                );
            }
            Ok("Output differs between time=0 and time=1".to_string())
        }));
    }

    // ── 7. FFmpeg / FFglitch Environment ─────────────────────

    results.push(run_test("ffmpeg_binary_available", "environment", || {
        let path = ffmpeg_binary().map_err(|e| e.to_string())?;
        if !std::path::Path::new(&path).exists() {
            return Err(format!("ffmpeg binary not found at: {}", path));
        }
        Ok(format!("ffmpeg found at: {}", path))
    }));

    results.push(run_test(
        "ffgac_binary_available",
        "environment",
        || match ffgac_binary() {
            Ok(path) => {
                if std::path::Path::new(&path).exists() {
                    Ok(format!("ffgac found at: {}", path))
                } else {
                    Err(format!("ffgac binary not found at: {}", path))
                }
            }
            Err(_) => Ok("ffgac not available (optional)".to_string()),
        },
    ));

    results.push(run_test(
        "ffedit_binary_available",
        "environment",
        || match ffedit_binary() {
            Ok(path) => {
                if std::path::Path::new(&path).exists() {
                    Ok(format!("ffedit found at: {}", path))
                } else {
                    Err(format!("ffedit binary not found at: {}", path))
                }
            }
            Err(_) => Ok("ffedit not available (optional)".to_string()),
        },
    ));

    // ── 8. File I/O ──────────────────────────────────────────

    results.push(run_test("file_write_read_roundtrip", "io", || {
        let test_path = std::env::temp_dir().join("mosh_test_roundtrip.txt");
        let test_content = "MoshDither Studio test content";
        std::fs::write(&test_path, test_content).map_err(|e| e.to_string())?;
        let read_content = std::fs::read_to_string(&test_path).map_err(|e| e.to_string())?;
        let _ = std::fs::remove_file(&test_path);
        if read_content != test_content {
            return Err("Content mismatch".to_string());
        }
        Ok("File write/read roundtrip successful".to_string())
    }));

    results.push(run_test("file_save_png_load", "io", || {
        let img = image::RgbaImage::from_raw(
            test_frame.width,
            test_frame.height,
            test_frame.data.clone(),
        )
        .ok_or("Failed to create image")?;
        let test_path = std::env::temp_dir().join("mosh_test_frame.png");
        img.save(&test_path).map_err(|e| e.to_string())?;
        let loaded = image::open(&test_path).map_err(|e| e.to_string())?;
        let _ = std::fs::remove_file(&test_path);
        Ok(format!(
            "Saved and loaded PNG: {}x{}",
            loaded.width(),
            loaded.height()
        ))
    }));

    // ── 9. Video Probe (if ffmpeg available) ─────────────────

    results.push(run_test("video_probe_metadata", "video", || {
        let ffmpeg = match ffmpeg_binary() {
            Ok(p) if std::path::Path::new(&p).exists() => p,
            _ => return Ok("Skipped: ffmpeg not available".to_string()),
        };
        // Create a tiny test video
        let test_video = std::env::temp_dir().join("mosh_test_probe.mp4");
        let status = std::process::Command::new(&ffmpeg)
            .args([
                "-y",
                "-f",
                "lavfi",
                "-i",
                "testsrc=duration=1:size=64x64:rate=10",
                "-c:v",
                "libx264",
                "-pix_fmt",
                "yuv420p",
            ])
            .arg(&test_video)
            .stdout(std::process::Stdio::null())
            .stderr(std::process::Stdio::null())
            .status()
            .map_err(|e| e.to_string())?;
        if !status.success() {
            return Ok("Skipped: could not create test video".to_string());
        }
        let meta = probe_metadata(&test_video.to_string_lossy()).map_err(|e| e.to_string())?;
        let _ = std::fs::remove_file(&test_video);
        Ok(format!(
            "Probed video: {:?}x{:?}, duration: {:?}s, fps: {:?}",
            meta.width, meta.height, meta.duration, meta.fps
        ))
    }));

    results.push(run_test("video_decode_first_frame", "video", || {
        let ffmpeg = match ffmpeg_binary() {
            Ok(p) if std::path::Path::new(&p).exists() => p,
            _ => return Ok("Skipped: ffmpeg not available".to_string()),
        };
        let test_video = std::env::temp_dir().join("mosh_test_decode.mp4");
        let status = std::process::Command::new(&ffmpeg)
            .args([
                "-y",
                "-f",
                "lavfi",
                "-i",
                "testsrc=duration=1:size=64x64:rate=10",
                "-c:v",
                "libx264",
                "-pix_fmt",
                "yuv420p",
            ])
            .arg(&test_video)
            .stdout(std::process::Stdio::null())
            .stderr(std::process::Stdio::null())
            .status()
            .map_err(|e| e.to_string())?;
        if !status.success() {
            return Ok("Skipped: could not create test video".to_string());
        }
        let segment = crate::ffmpeg::decode_video(&test_video.to_string_lossy(), Some(1))
            .map_err(|e| e.to_string())?;
        let _ = std::fs::remove_file(&test_video);
        let frame = segment.frames.first().ok_or("No frames decoded")?;
        Ok(format!(
            "Decoded first frame: {}x{}, {} bytes",
            frame.width,
            frame.height,
            frame.data.len()
        ))
    }));

    // ── 10. SAM3 Availability ────────────────────────────────

    results.push(run_test("sam3_availability_check", "sam3", || {
        // Check if ONNX runtime is available (SAM3 requires it)
        // We don't actually initialize SAM3 (it's heavy), just check if the model exists
        let base_dir = std::path::Path::new("..").join("..").join("assets");
        let model_path = base_dir.join("models").join("sam3");
        if model_path.exists() {
            Ok(format!(
                "SAM3 model directory exists at: {}",
                model_path.display()
            ))
        } else {
            Ok("SAM3 model not found (optional — segmentation won't be available)".to_string())
        }
    }));

    // ── 11. Python/FFglitch Bridge ───────────────────────────

    results.push(run_test("python_bridge_check", "ffglitch", || {
        // Check if Python is available
        let result = std::process::Command::new("python")
            .arg("--version")
            .output();
        match result {
            Ok(output) if output.status.success() => {
                let version = String::from_utf8_lossy(&output.stdout).trim().to_string();
                Ok(format!("Python available: {}", version))
            }
            _ => Ok("Python not on PATH (FFglitch bridge will not work)".to_string()),
        }
    }));

    results.push(run_test("mosh_cli_check", "ffglitch", || {
        // Check if mosh_cli.py exists
        let candidates = [
            std::path::Path::new("..")
                .join("..")
                .join("packages")
                .join("python-backend")
                .join("mosh_cli.py"),
            std::path::Path::new("..")
                .join("packages")
                .join("python-backend")
                .join("mosh_cli.py"),
        ];
        for c in &candidates {
            if c.exists() {
                return Ok(format!("mosh_cli.py found at: {}", c.display()));
            }
        }
        Ok("mosh_cli.py not found (FFglitch export will not work)".to_string())
    }));

    // ── Summary ──────────────────────────────────────────────

    let total = results.len();
    let passed = results.iter().filter(|r| r.passed).count();
    let failed = total - passed;

    FunctionTestReport {
        total_tests: total,
        passed,
        failed,
        results,
        summary: format!(
            "{}/{} functional tests passed ({} failed)",
            passed, total, failed
        ),
        timestamp: std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .map(|d| d.as_secs().to_string())
            .unwrap_or_else(|_| "unknown".to_string()),
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_functional_suite_runs() {
        let report = run_all_function_tests();
        println!("\n=== FUNCTIONAL TEST REPORT ===");
        println!(
            "Total: {} | Passed: {} | Failed: {}",
            report.total_tests, report.passed, report.failed
        );
        for r in &report.results {
            let status = if r.passed { "PASS" } else { "FAIL" };
            println!(
                "  {} [{}] {} — {}",
                status,
                r.category,
                r.test_name,
                r.details
                    .as_deref()
                    .or(r.error_message.as_deref())
                    .unwrap_or("")
            );
        }
        println!("=== END REPORT ===\n");
        // At least 90% should pass
        let pass_rate = report.passed as f64 / report.total_tests as f64;
        assert!(
            pass_rate > 0.9,
            "Pass rate too low: {:.1}%",
            pass_rate * 100.0
        );
    }
}
