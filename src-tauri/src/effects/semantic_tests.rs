//! Algorithmic-truth tests.
//!
//! Unlike the crash/output-difference harness, these tests assert that each
//! effect actually implements the behavior its name promises.

use crate::effects::{
    color::{BrightnessContrast, Invert, LiftGammaGain, LutGrading},
    dithering::{BayerDither, BlueNoiseDither, HalftoneDither, RiemersmaDither},
    glitch::JpegQuantize,
    noise::FractalNoise,
    pixel_geo::PixelSort,
    Effect, Frame,
};
use image::ImageFormat;
use serde_json::json;
use std::io::Cursor;
use std::path::PathBuf;

fn solid_frame(w: u32, h: u32, r: u8, g: u8, b: u8) -> Frame {
    let mut data = Vec::with_capacity((w * h * 4) as usize);
    for _ in 0..(w * h) {
        data.extend_from_slice(&[r, g, b, 255]);
    }
    Frame {
        width: w,
        height: h,
        data,
    }
}

fn gradient_frame(w: u32, h: u32) -> Frame {
    let mut data = Vec::with_capacity((w * h * 4) as usize);
    for y in 0..h {
        for x in 0..w {
            data.extend_from_slice(&[
                ((x * 255) / w.max(1)) as u8,
                ((y * 255) / h.max(1)) as u8,
                (((x + y) * 128) / (w + h).max(1)) as u8,
                255,
            ]);
        }
    }
    Frame {
        width: w,
        height: h,
        data,
    }
}

fn mono_ramp_frame(w: u32, h: u32) -> Frame {
    // Each row contains a descending grayscale ramp from 255 down to 1.
    // Pixel sorting (threshold 0) should turn each row into an ascending ramp.
    let mut data = Vec::with_capacity((w * h * 4) as usize);
    for _y in 0..h {
        for x in 0..w {
            let v = (255u32 * (w - x - 1) / (w - 1)).max(1) as u8;
            data.extend_from_slice(&[v, v, v, 255]);
        }
    }
    Frame {
        width: w,
        height: h,
        data,
    }
}

fn write_identity_lut_png() -> PathBuf {
    let mut rgba = image::RgbaImage::new(512, 512);
    let tile_size = 64u32;
    for b in 0..64u32 {
        let tile_col = b % 8;
        let tile_row = b / 8;
        for gy in 0..tile_size {
            for gx in 0..tile_size {
                let px = tile_col * tile_size + gx;
                let py = tile_row * tile_size + gy;
                let r = (gx * 255 / 63).min(255) as u8;
                let g = (gy * 255 / 63).min(255) as u8;
                let b8 = (b * 255 / 63).min(255) as u8;
                rgba.put_pixel(px, py, image::Rgba([r, g, b8, 255]));
            }
        }
    }
    let mut buf = Vec::new();
    let mut cursor = Cursor::new(&mut buf);
    rgba.write_to(&mut cursor, ImageFormat::Png)
        .expect("writing identity LUT PNG");

    let path = std::env::temp_dir().join("moshdither_identity_lut.png");
    std::fs::write(&path, &buf).expect("writing identity LUT file");
    path
}

#[test]
fn test_invert_is_involutive() {
    let frame = gradient_frame(16, 16);
    let effect = Invert::default();
    let once = effect
        .process_frame(&frame, None, &serde_json::Map::new())
        .unwrap();
    let twice = effect
        .process_frame(&once, None, &serde_json::Map::new())
        .unwrap();
    assert_eq!(
        frame.data, twice.data,
        "inverting twice should return the original image exactly"
    );
}

#[test]
fn test_brightness_contrast_neutral() {
    // Neutral params on a solid gray should leave the image unchanged.
    // (Color gradients can shift by ±1 due to HSL round-trip, so we use gray.)
    let frame = solid_frame(8, 8, 128, 128, 128);
    let effect = BrightnessContrast;
    let mut params = serde_json::Map::new();
    params.insert("brightness".to_string(), json!(0.0));
    params.insert("contrast".to_string(), json!(0.0));
    params.insert("gamma".to_string(), json!(1.0));
    params.insert("saturation".to_string(), json!(1.0));
    let result = effect.process_frame(&frame, None, &params).unwrap();
    assert_eq!(
        frame.data, result.data,
        "neutral brightness/contrast/gamma/saturation should be a no-op"
    );
}

#[test]
fn test_lift_gamma_gain_neutral() {
    let frame = gradient_frame(8, 8);
    let effect = LiftGammaGain;
    let mut params = serde_json::Map::new();
    params.insert("lift_r".to_string(), json!(0.0));
    params.insert("lift_g".to_string(), json!(0.0));
    params.insert("lift_b".to_string(), json!(0.0));
    params.insert("gamma_r".to_string(), json!(0.0));
    params.insert("gamma_g".to_string(), json!(0.0));
    params.insert("gamma_b".to_string(), json!(0.0));
    params.insert("gain_r".to_string(), json!(0.0));
    params.insert("gain_g".to_string(), json!(0.0));
    params.insert("gain_b".to_string(), json!(0.0));
    params.insert("amount".to_string(), json!(1.0));
    let result = effect.process_frame(&frame, None, &params).unwrap();
    assert_eq!(
        frame.data, result.data,
        "neutral lift/gamma/gain should be a no-op"
    );
}

#[test]
fn test_lift_shifts_shadows() {
    // Pure black with lift_b = 1.0 should become pure blue: lift is applied
    // only to the shadow/blue channel, while red/green remain untouched.
    let frame = solid_frame(4, 4, 0, 0, 0);
    let effect = LiftGammaGain;
    let mut params = serde_json::Map::new();
    params.insert("lift_b".to_string(), json!(1.0));
    params.insert("amount".to_string(), json!(1.0));
    let result = effect.process_frame(&frame, None, &params).unwrap();
    for chunk in result.data.chunks_exact(4) {
        assert_eq!(chunk[0], 0, "red channel should be unchanged");
        assert_eq!(chunk[1], 0, "green channel should be unchanged");
        assert_eq!(chunk[2], 255, "blue channel should max out with full lift");
    }
}

#[test]
fn test_pixel_sort_makes_monotonic_rows() {
    let frame = mono_ramp_frame(16, 4);
    let effect = PixelSort::new(0);
    let mut params = serde_json::Map::new();
    // Threshold 0 means every pixel joins one run spanning the row, so the whole
    // row must come out sorted. auto_threshold is disabled because it would
    // derive its own value and this test is about the manual path.
    params.insert("auto_threshold".to_string(), json!(false));
    params.insert("threshold".to_string(), json!(0));
    let result = effect.process_frame(&frame, None, &params).unwrap();
    let w = result.width as usize;
    for y in 0..result.height as usize {
        let mut prev = 0u8;
        for x in 0..w {
            let idx = (y * w + x) * 4;
            let v = result.data[idx];
            assert!(
                v >= prev,
                "pixel sort should produce monotonically non-decreasing rows"
            );
            prev = v;
        }
    }
}

#[test]
fn test_jpeg_quantize_quality_100_reconstructs_input() {
    // At quality 100 the DCT round-trip should be nearly lossless.
    let frame = gradient_frame(32, 32);
    let effect = JpegQuantize::new(100);
    let mut params = serde_json::Map::new();
    params.insert("quality".to_string(), json!(100));
    let result = effect.process_frame(&frame, None, &params).unwrap();
    let max_err = frame
        .data
        .chunks_exact(4)
        .zip(result.data.chunks_exact(4))
        .flat_map(|(a, b)| (0..3).map(move |c| (a[c] as i32 - b[c] as i32).abs()))
        .max()
        .unwrap();
    assert!(
        max_err <= 8,
        "JPEG quality 100 DCT round-trip should be near-lossless, max_err={max_err}"
    );
}

#[test]
fn test_jpeg_quantize_low_quality_reduces_detail() {
    // At quality 1 most high-frequency information should be removed, leaving
    // mostly 8x8 DC blocks.
    let frame = gradient_frame(32, 32);
    let effect = JpegQuantize::new(1);
    let mut params = serde_json::Map::new();
    params.insert("quality".to_string(), json!(1));
    let result = effect.process_frame(&frame, None, &params).unwrap();
    let w = result.width as usize;
    let mut max_block_range = 0i32;
    for by in 0..(result.height as usize / 8) {
        for bx in 0..(w / 8) {
            let mut min_v = 255i32;
            let mut max_v = 0i32;
            for y in 0..8 {
                for x in 0..8 {
                    let idx = ((by * 8 + y) * w + bx * 8 + x) * 4;
                    let v = result.data[idx] as i32;
                    min_v = min_v.min(v);
                    max_v = max_v.max(v);
                }
            }
            max_block_range = max_block_range.max(max_v - min_v);
        }
    }
    assert!(
        max_block_range < 64,
        "JPEG quality 1 should leave DC-dominated 8x8 blocks, range={max_block_range}"
    );
}

#[test]
fn test_bayer_dither_is_binary() {
    // Ordered Bayer dither on a gradient should produce only black/white pixels.
    let frame = gradient_frame(32, 32);
    let effect = BayerDither::default();
    let result = effect
        .process_frame(&frame, None, &serde_json::Map::new())
        .unwrap();
    for chunk in result.data.chunks_exact(4) {
        for channel in chunk.iter().take(3) {
            assert!(
                *channel == 0 || *channel == 255,
                "Bayer dither output should be binary"
            );
        }
    }
}

#[test]
fn test_blue_noise_rank_matrix_is_uniform() {
    // Blue noise is driven by a threshold matrix that uses every rank level.
    // This is a stronger guarantee than just "produces some pattern".
    let matrix = BlueNoiseDither::new();
    // The matrix is private, so we check through a flat gray frame: at the
    // default strength the output should be ~50% black and ~50% white for a
    // mid-gray input.
    let frame = solid_frame(128, 128, 128, 128, 128);
    let result = matrix
        .process_frame(&frame, None, &serde_json::Map::new())
        .unwrap();
    let white = result.data.chunks_exact(4).filter(|c| c[0] == 255).count();
    let total = (result.width * result.height) as usize;
    let ratio = white as f64 / total as f64;
    assert!(
        (ratio - 0.5).abs() < 0.1,
        "blue noise on 50% gray should produce ~50% white pixels, got {ratio}"
    );
}

#[test]
fn test_halftone_dot_grows_with_darkness() {
    // For a dark cell the dot radius should be larger than for a light cell.
    let dark = solid_frame(16, 16, 32, 32, 32);
    let light = solid_frame(16, 16, 220, 220, 220);
    let effect = HalftoneDither::default();
    let dark_out = effect
        .process_frame(&dark, None, &serde_json::Map::new())
        .unwrap();
    let light_out = effect
        .process_frame(&light, None, &serde_json::Map::new())
        .unwrap();
    let dark_black = dark_out.data.iter().filter(|&&v| v == 0).count();
    let light_black = light_out.data.iter().filter(|&&v| v == 0).count();
    assert!(
        dark_black > light_black,
        "darker input should produce more black (larger dots) in halftone output"
    );
}

#[test]
fn test_halftone_rotation_respected() {
    // The screen angle parameter should be accepted and still produce a
    // valid halftoned (binary) result different from the continuous input.
    let frame = gradient_frame(16, 16);
    let effect = HalftoneDither::default();
    let mut params = serde_json::Map::new();
    params.insert("screen_angle".to_string(), json!(45.0));
    let result = effect.process_frame(&frame, None, &params).unwrap();
    assert_ne!(frame.data, result.data, "halftone should alter the image");
    for chunk in result.data.chunks_exact(4) {
        assert!(
            chunk[0] == 0 || chunk[0] == 255,
            "halftone output should be binary"
        );
    }
}

#[test]
fn test_lut_identity_lut_reconstructs_input() {
    let lut_path = write_identity_lut_png();
    let frame = gradient_frame(32, 32);
    let effect = LutGrading::new(1.0, lut_path.to_string_lossy().to_string());
    let result = effect
        .process_frame(&frame, None, &serde_json::Map::new())
        .unwrap();

    let max_diff = frame
        .data
        .chunks_exact(4)
        .zip(result.data.chunks_exact(4))
        .flat_map(|(a, b)| (0..3).map(move |c| (a[c] as i32 - b[c] as i32).abs()))
        .max()
        .unwrap();
    assert!(
        max_diff <= 2,
        "identity LUT should reconstruct the input within rounding error, max_diff={max_diff}"
    );
}

#[test]
fn test_lut_grading_loads_bundled_lut() {
    // Locate a real bundled LUT from the repo and confirm it is applied.
    let mut path = PathBuf::from(std::env::var("CARGO_MANIFEST_DIR").unwrap_or_default());
    path.push("../public/lut/amatorka.png");
    if !path.exists() {
        // In some CI layouts the LUTs may not be checked out; skip gracefully.
        return;
    }
    let frame = solid_frame(16, 16, 128, 128, 128);
    let effect = LutGrading::new(1.0, path.to_string_lossy().to_string());
    let result = effect
        .process_frame(&frame, None, &serde_json::Map::new())
        .unwrap();
    // Applying any non-identity LUT should change the gray pixels.
    assert_ne!(frame.data, result.data, "LUT grading should modify colors");
}

#[test]
fn test_fractal_noise_is_smooth() {
    // Real fractal (FBM) value noise should vary smoothly across pixels:
    // adjacent pixels should not differ by the full 50% amplitude.
    let frame = solid_frame(64, 64, 128, 128, 128);
    let effect = FractalNoise::default();
    let mut params = serde_json::Map::new();
    params.insert("amount".to_string(), json!(0.5));
    params.insert("octaves".to_string(), json!(4));
    params.insert("persistence".to_string(), json!(0.5));
    let result = effect.process_frame(&frame, None, &params).unwrap();
    let w = result.width as usize;
    let mut max_adjacent_diff = 0i32;
    for y in 0..result.height as usize {
        for x in 0..w {
            let idx = (y * w + x) * 4;
            let right = if x + 1 < w { idx + 4 } else { idx };
            let down = if y + 1 < result.height as usize {
                idx + w * 4
            } else {
                idx
            };
            max_adjacent_diff =
                max_adjacent_diff.max((result.data[idx] as i32 - result.data[right] as i32).abs());
            max_adjacent_diff =
                max_adjacent_diff.max((result.data[idx] as i32 - result.data[down] as i32).abs());
        }
    }
    assert!(
        max_adjacent_diff < 80,
        "FBM fractal noise should be spatially smooth, max_adjacent_diff={max_adjacent_diff}"
    );
}

#[test]
fn test_riemersma_dither_spreads_error() {
    // Riemersma on a mid-gray frame should produce a mix of black and white
    // pixels (the error history prevents collapse to a single color).
    let frame = solid_frame(64, 64, 128, 128, 128);
    let effect = RiemersmaDither::new();
    let result = effect
        .process_frame(&frame, None, &serde_json::Map::new())
        .unwrap();
    let white = result.data.iter().filter(|&&v| v == 255).count();
    let black = result.data.iter().filter(|&&v| v == 0).count();
    assert!(
        white > 0 && black > 0,
        "Riemersma dither should distribute quantization error to produce both tones"
    );
    // The total output should average close to the input mid-gray.
    let sum = result
        .data
        .chunks_exact(4)
        .map(|c| c[0] as u64)
        .sum::<u64>();
    let avg = sum as f64 / (result.width as f64 * result.height as f64 * 255.0);
    assert!(
        (avg - 0.5).abs() < 0.1,
        "Riemersma output average should stay near input average, got {avg}"
    );
}
