//! Shared test helpers for effect correctness and mask integration tests.
//!
//! These helpers provide utilities to:
//! - Create test frames with known pixel values
//! - Create masks with specific patterns
//! - Run effects through the full mask blend pipeline
//! - Assert pixel-level correctness for masked vs unmasked regions

use crate::effects::types::{Frame, Mask};
use crate::effects::{blend_mask, Effect};

/// Create a frame with uniform RGBA pixels.
pub fn solid_frame(w: u32, h: u32, r: u8, g: u8, b: u8, a: u8) -> Frame {
    let count = (w * h) as usize;
    let mut data = Vec::with_capacity(count * 4);
    for _ in 0..count {
        data.extend_from_slice(&[r, g, b, a]);
    }
    Frame {
        width: w,
        height: h,
        data,
    }
}

/// Create a frame from a list of RGBA pixels.
pub fn frame_from_pixels(w: u32, h: u32, pixels: &[(u8, u8, u8, u8)]) -> Frame {
    let data: Vec<u8> = pixels
        .iter()
        .flat_map(|(r, g, b, a)| [*r, *g, *b, *a])
        .collect();
    Frame {
        width: w,
        height: h,
        data,
    }
}

/// Create a gradient frame where pixel values vary by x position.
/// Pixel at (x, y) has R = x scaled to 0-255, G = 128, B = 64, A = 255.
pub fn gradient_frame(w: u32, h: u32) -> Frame {
    let mut data = Vec::with_capacity((w * h * 4) as usize);
    for _y in 0..h {
        for x in 0..w {
            let r = ((x as f32 / (w - 1).max(1) as f32) * 255.0) as u8;
            data.extend_from_slice(&[r, 128, 64, 255]);
        }
    }
    Frame {
        width: w,
        height: h,
        data,
    }
}

/// Create a mask with specific per-pixel values.
pub fn mask_from_values(w: u32, h: u32, values: &[u8]) -> Mask {
    Mask {
        width: w,
        height: h,
        data: values.to_vec(),
    }
}

/// Create a binary mask: white (255) in the "inside" region, black (0) outside.
/// `inside_pixels` is a list of pixel indices (row-major) that should be white.
pub fn binary_mask(w: u32, h: u32, inside_pixels: &[usize]) -> Mask {
    let total = (w * h) as usize;
    let mut data = vec![0u8; total];
    for &idx in inside_pixels {
        if idx < total {
            data[idx] = 255;
        }
    }
    Mask {
        width: w,
        height: h,
        data,
    }
}

/// Create a split mask: left half white, right half black.
pub fn left_half_mask(w: u32, h: u32) -> Mask {
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

/// Create a split mask: right half white, left half black.
pub fn right_half_mask(w: u32, h: u32) -> Mask {
    let mut data = vec![0u8; (w * h) as usize];
    for y in 0..h {
        for x in (w / 2)..w {
            data[(y * w + x) as usize] = 255;
        }
    }
    Mask {
        width: w,
        height: h,
        data,
    }
}

/// Run an effect on a frame, then apply mask blending.
/// This simulates the full `apply_effect` pipeline from `commands.rs`.
pub fn run_effect_with_mask(
    effect: &dyn Effect,
    input: &Frame,
    mask: Option<&Mask>,
    mask_mode: &str,
) -> Frame {
    let previous = input.clone();
    let mut working = effect
        .process_frame(input, mask, &serde_json::Map::new())
        .unwrap_or_else(|_| input.clone());

    if !effect.handles_masking() {
        if let Some(m) = mask {
            blend_mask(&mut working, &previous, m, mask_mode).unwrap();
        }
    }

    working
}

/// Get the RGBA pixel at (x, y) from a frame.
pub fn pixel_at(frame: &Frame, x: u32, y: u32) -> (u8, u8, u8, u8) {
    let idx = ((y * frame.width + x) * 4) as usize;
    (
        frame.data[idx],
        frame.data[idx + 1],
        frame.data[idx + 2],
        frame.data[idx + 3],
    )
}

/// Assert that two pixels are equal (within tolerance for floating-point effects).
pub fn assert_pixel_eq(actual: (u8, u8, u8, u8), expected: (u8, u8, u8, u8), msg: &str) {
    assert_eq!(actual.0, expected.0, "R mismatch: {}", msg);
    assert_eq!(actual.1, expected.1, "G mismatch: {}", msg);
    assert_eq!(actual.2, expected.2, "B mismatch: {}", msg);
    assert_eq!(actual.3, expected.3, "A mismatch: {}", msg);
}

/// Assert that a pixel is unchanged from the original frame.
pub fn assert_pixel_unchanged(frame: &Frame, original: &Frame, x: u32, y: u32, msg: &str) {
    let actual = pixel_at(frame, x, y);
    let expected = pixel_at(original, x, y);
    assert_pixel_eq(actual, expected, msg);
}

/// Assert that a pixel differs from the original frame (at least one RGB channel).
pub fn assert_pixel_modified(frame: &Frame, original: &Frame, x: u32, y: u32, msg: &str) {
    let actual = pixel_at(frame, x, y);
    let expected = pixel_at(original, x, y);
    assert!(
        actual.0 != expected.0 || actual.1 != expected.1 || actual.2 != expected.2,
        "Pixel at ({},{}) was not modified but should have been: {}",
        x,
        y,
        msg
    );
}

/// Assert that the alpha channel at (x, y) is preserved from the original.
pub fn assert_alpha_preserved(frame: &Frame, original: &Frame, x: u32, y: u32, msg: &str) {
    let actual = pixel_at(frame, x, y);
    let expected = pixel_at(original, x, y);
    assert_eq!(
        actual.3, expected.3,
        "Alpha channel changed at ({},{}): {}",
        x, y, msg
    );
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_solid_frame_correct_dimensions() {
        let f = solid_frame(4, 3, 100, 150, 200, 255);
        assert_eq!(f.width, 4);
        assert_eq!(f.height, 3);
        assert_eq!(f.data.len(), 4 * 3 * 4);
        assert_eq!(f.data[0], 100);
        assert_eq!(f.data[1], 150);
        assert_eq!(f.data[2], 200);
        assert_eq!(f.data[3], 255);
    }

    #[test]
    fn test_frame_from_pixels() {
        let f = frame_from_pixels(2, 1, &[(10, 20, 30, 40), (50, 60, 70, 80)]);
        assert_eq!(f.data, vec![10, 20, 30, 40, 50, 60, 70, 80]);
    }

    #[test]
    fn test_gradient_frame() {
        let f = gradient_frame(4, 1);
        assert_eq!(f.data[0], 0); // x=0 → R=0
        assert_eq!(f.data[4], 85); // x=1 → R≈85
        assert_eq!(f.data[8], 170); // x=2 → R≈170
        assert_eq!(f.data[12], 255); // x=3 → R=255
    }

    #[test]
    fn test_binary_mask() {
        let m = binary_mask(4, 1, &[0, 2]);
        assert_eq!(m.data, vec![255, 0, 255, 0]);
    }

    #[test]
    fn test_left_half_mask() {
        let m = left_half_mask(4, 1);
        assert_eq!(m.data, vec![255, 255, 0, 0]);
    }

    #[test]
    fn test_right_half_mask() {
        let m = right_half_mask(4, 1);
        assert_eq!(m.data, vec![0, 0, 255, 255]);
    }

    #[test]
    fn test_pixel_at() {
        let f = frame_from_pixels(2, 1, &[(10, 20, 30, 40), (50, 60, 70, 80)]);
        assert_eq!(pixel_at(&f, 0, 0), (10, 20, 30, 40));
        assert_eq!(pixel_at(&f, 1, 0), (50, 60, 70, 80));
    }
}
