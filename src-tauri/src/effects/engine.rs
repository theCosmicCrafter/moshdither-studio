use super::types::*;

/// Blend an effect-processed frame with the original using a mask.
///
/// - `"inside"`: effect shows where mask is white, original where black.
/// - `"outside"`: original where mask is white, effect where black.
/// - `"alpha"`: effect multiplied by mask value (original discarded).
///
/// Only RGB channels are blended; alpha is left unchanged.
/// If mask dimensions don't match the frame, the mask is nearest-neighbor
/// scaled to the frame dimensions before blending.
pub fn blend_mask(
    working: &mut Frame,
    previous: &Frame,
    mask: &Mask,
    mode: &str,
) -> crate::error::Result<()> {
    if working.width != previous.width || working.height != previous.height {
        return Err(crate::error::AppError::Generic(
            "Cannot blend frames with mismatched dimensions".to_string(),
        ));
    }

    let expected_mask_pixels = (mask.width as u64).saturating_mul(mask.height as u64);
    if mask.data.is_empty() || mask.data.len() as u64 != expected_mask_pixels {
        return Err(crate::error::AppError::Generic(format!(
            "mask dimension mismatch: {}x{} expects {} pixels, got {}",
            mask.width,
            mask.height,
            expected_mask_pixels,
            mask.data.len()
        )));
    }

    let img_w = working.width as usize;
    let img_h = working.height as usize;
    let mask_w = mask.width as usize;
    let mask_h = mask.height as usize;

    for y in 0..img_h {
        // Nearest-neighbor vertical sample
        let my = if mask_h > 1 { (y * mask_h) / img_h } else { 0 };
        for x in 0..img_w {
            let mx = if mask_w > 1 { (x * mask_w) / img_w } else { 0 };
            let mask_val = mask.data[my * mask_w + mx] as f32 / 255.0;
            let idx = (y * img_w + x) * 4;
            for c in 0..3 {
                let old_val = previous.data[idx + c] as f32;
                let new_val = working.data[idx + c] as f32;
                let blended = match mode {
                    "outside" => old_val * mask_val + new_val * (1.0 - mask_val),
                    "alpha" => new_val * mask_val,
                    _ => old_val * (1.0 - mask_val) + new_val * mask_val, // "inside"
                };
                working.data[idx + c] = blended.round().clamp(0.0, 255.0) as u8;
            }
        }
    }

    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    /// Helper: create a 2x1 frame with given RGBA pixels.
    fn make_frame(w: u32, h: u32, pixels: &[(u8, u8, u8, u8)]) -> Frame {
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

    /// Helper: create a grayscale mask of given dimensions.
    fn make_mask(w: u32, h: u32, values: &[u8]) -> Mask {
        Mask {
            width: w,
            height: h,
            data: values.to_vec(),
        }
    }

    // ── blend_mask: "inside" mode ──────────────────────────────

    #[test]
    fn test_blend_mask_inside_white_mask_shows_effect() {
        // previous = red, working = blue, mask = all white (255)
        // "inside" with mask=1.0 → new_val (blue) should win
        let prev = make_frame(1, 1, &[(255, 0, 0, 255)]);
        let mut working = make_frame(1, 1, &[(0, 0, 255, 255)]);
        let mask = make_mask(1, 1, &[255]);
        blend_mask(&mut working, &prev, &mask, "inside").unwrap();
        // mask_val = 1.0, blended = old*(1-1) + new*1 = new
        assert_eq!(working.data[0], 0); // R
        assert_eq!(working.data[1], 0); // G
        assert_eq!(working.data[2], 255); // B
        assert_eq!(working.data[3], 255); // alpha unchanged
    }

    #[test]
    fn test_blend_mask_inside_black_mask_shows_original() {
        // previous = red, working = blue, mask = all black (0)
        // "inside" with mask=0.0 → old_val (red) should win
        let prev = make_frame(1, 1, &[(255, 0, 0, 255)]);
        let mut working = make_frame(1, 1, &[(0, 0, 255, 255)]);
        let mask = make_mask(1, 1, &[0]);
        blend_mask(&mut working, &prev, &mask, "inside").unwrap();
        // mask_val = 0.0, blended = old*(1-0) + new*0 = old
        assert_eq!(working.data[0], 255); // R
        assert_eq!(working.data[1], 0); // G
        assert_eq!(working.data[2], 0); // B
    }

    #[test]
    fn test_blend_mask_inside_half_mask_blends() {
        // previous = 0, working = 255, mask = 128
        // "inside": blended = 0*(1-0.502) + 255*0.502 ≈ 128
        let prev = make_frame(1, 1, &[(0, 0, 0, 255)]);
        let mut working = make_frame(1, 1, &[(255, 255, 255, 255)]);
        let mask = make_mask(1, 1, &[128]);
        blend_mask(&mut working, &prev, &mask, "inside").unwrap();
        let expected = (255.0f32 * (128.0f32 / 255.0f32)).round() as u8;
        assert_eq!(working.data[0], expected);
        assert_eq!(working.data[1], expected);
        assert_eq!(working.data[2], expected);
    }

    #[test]
    fn test_blend_mask_inside_only_masked_pixel_affected() {
        // 2x1 image: pixel 0 masked white (effect shows), pixel 1 masked black (original shows)
        let prev = make_frame(2, 1, &[(100, 100, 100, 255), (200, 200, 200, 255)]);
        let mut working = make_frame(2, 1, &[(50, 50, 50, 255), (10, 10, 10, 255)]);
        let mask = make_mask(2, 1, &[255, 0]);
        blend_mask(&mut working, &prev, &mask, "inside").unwrap();
        // Pixel 0: mask=255 → effect (50)
        assert_eq!(working.data[0], 50);
        // Pixel 1: mask=0 → original (200)
        assert_eq!(working.data[4], 200);
    }

    // ── blend_mask: "outside" mode ─────────────────────────────

    #[test]
    fn test_blend_mask_outside_white_mask_shows_original() {
        // "outside" with mask=1.0 → old_val should win
        let prev = make_frame(1, 1, &[(255, 0, 0, 255)]);
        let mut working = make_frame(1, 1, &[(0, 0, 255, 255)]);
        let mask = make_mask(1, 1, &[255]);
        blend_mask(&mut working, &prev, &mask, "outside").unwrap();
        assert_eq!(working.data[0], 255); // R from original
        assert_eq!(working.data[2], 0); // B from original
    }

    #[test]
    fn test_blend_mask_outside_black_mask_shows_effect() {
        // "outside" with mask=0.0 → new_val should win
        let prev = make_frame(1, 1, &[(255, 0, 0, 255)]);
        let mut working = make_frame(1, 1, &[(0, 0, 255, 255)]);
        let mask = make_mask(1, 1, &[0]);
        blend_mask(&mut working, &prev, &mask, "outside").unwrap();
        assert_eq!(working.data[0], 0); // R from effect
        assert_eq!(working.data[2], 255); // B from effect
    }

    // ── blend_mask: "alpha" mode ───────────────────────────────

    #[test]
    fn test_blend_mask_alpha_white_mask_shows_effect() {
        // "alpha" with mask=1.0 → new_val * 1.0 = new_val
        let prev = make_frame(1, 1, &[(255, 0, 0, 255)]);
        let mut working = make_frame(1, 1, &[(0, 0, 255, 255)]);
        let mask = make_mask(1, 1, &[255]);
        blend_mask(&mut working, &prev, &mask, "alpha").unwrap();
        assert_eq!(working.data[0], 0);
        assert_eq!(working.data[2], 255);
    }

    #[test]
    fn test_blend_mask_alpha_black_mask_zeros_out() {
        // "alpha" with mask=0.0 → new_val * 0.0 = 0
        let prev = make_frame(1, 1, &[(255, 0, 0, 255)]);
        let mut working = make_frame(1, 1, &[(0, 0, 255, 255)]);
        let mask = make_mask(1, 1, &[0]);
        blend_mask(&mut working, &prev, &mask, "alpha").unwrap();
        assert_eq!(working.data[0], 0);
        assert_eq!(working.data[1], 0);
        assert_eq!(working.data[2], 0);
    }

    #[test]
    fn test_blend_mask_alpha_half_mask_scales_effect() {
        // "alpha" with mask=128 → new_val * 0.502
        let prev = make_frame(1, 1, &[(255, 255, 255, 255)]);
        let mut working = make_frame(1, 1, &[(200, 200, 200, 255)]);
        let mask = make_mask(1, 1, &[128]);
        blend_mask(&mut working, &prev, &mask, "alpha").unwrap();
        let expected = (200.0f32 * (128.0f32 / 255.0f32)).round() as u8;
        assert_eq!(working.data[0], expected);
    }

    // ── blend_mask: alpha channel preserved ────────────────────

    #[test]
    fn test_blend_mask_preserves_alpha_channel() {
        let prev = make_frame(1, 1, &[(100, 100, 100, 128)]);
        let mut working = make_frame(1, 1, &[(200, 200, 200, 200)]);
        let mask = make_mask(1, 1, &[255]);
        blend_mask(&mut working, &prev, &mask, "inside").unwrap();
        // Alpha should not be touched
        assert_eq!(working.data[3], 200);
    }

    // ── blend_mask: dimension mismatch (mask scaled to frame) ──

    #[test]
    fn test_blend_mask_smaller_mask_scales_to_frame() {
        // 2x1 frame, 1x1 mask = white(255) → scaled to cover both pixels
        let prev = make_frame(2, 1, &[(100, 100, 100, 255), (100, 100, 100, 255)]);
        let mut working = make_frame(2, 1, &[(50, 50, 50, 255), (50, 50, 50, 255)]);
        let mask = make_mask(1, 1, &[255]);
        blend_mask(&mut working, &prev, &mask, "inside").unwrap();
        // White mask → effect shows (50), not original (100)
        assert_eq!(working.data[0], 50);
        assert_eq!(working.data[4], 50);
    }

    #[test]
    fn test_blend_mask_half_size_mask_scales_correctly() {
        // 4x1 frame: prev=100, working=200, mask 2x1 = [255, 0]
        // Scaled: pixels 0,1 → mask=255 (effect), pixels 2,3 → mask=0 (original)
        let prev = make_frame(
            4,
            1,
            &[
                (100, 100, 100, 255),
                (100, 100, 100, 255),
                (100, 100, 100, 255),
                (100, 100, 100, 255),
            ],
        );
        let mut working = make_frame(
            4,
            1,
            &[
                (200, 200, 200, 255),
                (200, 200, 200, 255),
                (200, 200, 200, 255),
                (200, 200, 200, 255),
            ],
        );
        let mask = make_mask(2, 1, &[255, 0]);
        blend_mask(&mut working, &prev, &mask, "inside").unwrap();
        // Pixels 0,1: mask=255 → effect (200)
        assert_eq!(working.data[0], 200);
        assert_eq!(working.data[4], 200);
        // Pixels 2,3: mask=0 → original (100)
        assert_eq!(working.data[8], 100);
        assert_eq!(working.data[12], 100);
    }

    // ── blend_mask: multi-pixel regional isolation ─────────────

    #[test]
    fn test_blend_mask_inside_regional_isolation_4px() {
        // 4x1 image: mask = [255, 255, 0, 0]
        // Pixels 0,1 should show effect; pixels 2,3 should show original
        let prev = make_frame(
            4,
            1,
            &[
                (100, 100, 100, 255),
                (100, 100, 100, 255),
                (100, 100, 100, 255),
                (100, 100, 100, 255),
            ],
        );
        let mut working = make_frame(
            4,
            1,
            &[
                (0, 0, 0, 255),
                (0, 0, 0, 255),
                (0, 0, 0, 255),
                (0, 0, 0, 255),
            ],
        );
        let mask = make_mask(4, 1, &[255, 255, 0, 0]);
        blend_mask(&mut working, &prev, &mask, "inside").unwrap();

        // Pixels 0,1: mask=255 → effect (0,0,0)
        assert_eq!(working.data[0], 0); // pixel 0 R
        assert_eq!(working.data[4], 0); // pixel 1 R
                                        // Pixels 2,3: mask=0 → original (100,100,100)
        assert_eq!(working.data[8], 100); // pixel 2 R
        assert_eq!(working.data[12], 100); // pixel 3 R
    }

    #[test]
    fn test_blend_mask_outside_regional_isolation_4px() {
        // 4x1 image: mask = [255, 255, 0, 0]
        // "outside": pixels 0,1 should show original; pixels 2,3 should show effect
        let prev = make_frame(
            4,
            1,
            &[
                (100, 100, 100, 255),
                (100, 100, 100, 255),
                (100, 100, 100, 255),
                (100, 100, 100, 255),
            ],
        );
        let mut working = make_frame(
            4,
            1,
            &[
                (0, 0, 0, 255),
                (0, 0, 0, 255),
                (0, 0, 0, 255),
                (0, 0, 0, 255),
            ],
        );
        let mask = make_mask(4, 1, &[255, 255, 0, 0]);
        blend_mask(&mut working, &prev, &mask, "outside").unwrap();

        // Pixels 0,1: mask=255 → original (100)
        assert_eq!(working.data[0], 100);
        assert_eq!(working.data[4], 100);
        // Pixels 2,3: mask=0 → effect (0)
        assert_eq!(working.data[8], 0);
        assert_eq!(working.data[12], 0);
    }

    // ── blend_mask: 2D mask (2x2) ──────────────────────────────

    #[test]
    fn test_blend_mask_2d_inside_partial_mask() {
        // 2x2 image with a mask that only covers the top-left pixel
        let prev = Frame {
            width: 2,
            height: 2,
            data: vec![
                100, 100, 100, 255, 100, 100, 100, 255, 100, 100, 100, 255, 100, 100, 100, 255,
            ],
        };
        let mut working = Frame {
            width: 2,
            height: 2,
            data: vec![0, 0, 0, 255, 0, 0, 0, 255, 0, 0, 0, 255, 0, 0, 0, 255],
        };
        let mask = Mask {
            width: 2,
            height: 2,
            data: vec![255, 0, 0, 0],
        };
        blend_mask(&mut working, &prev, &mask, "inside").unwrap();

        // Top-left (0,0): mask=255 → effect (0)
        assert_eq!(working.data[0], 0);
        // Top-right (0,1): mask=0 → original (100)
        assert_eq!(working.data[4], 100);
        // Bottom-left (1,0): mask=0 → original (100)
        assert_eq!(working.data[8], 100);
        // Bottom-right (1,1): mask=0 → original (100)
        assert_eq!(working.data[12], 100);
    }
}
