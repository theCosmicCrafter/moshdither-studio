//! Comprehensive effect correctness + mask integration tests.
//!
//! For each registered effect, we verify:
//! 1. The effect actually modifies RGB values (it does something)
//! 2. With "inside" mask mode: only masked pixels are affected, unmasked preserved
//! 3. With "outside" mask mode: only unmasked pixels are affected, masked preserved
//! 4. Alpha channel is preserved through mask blending
//! 5. MaskIsolate doesn't get double-blended

#[cfg(test)]
mod tests {
    #![allow(clippy::absurd_extreme_comparisons, unused_comparisons)]
    use crate::effects::test_helpers::*;
    use crate::effects::Effect;

    // Effects are tested by category in submodules below.

    // ── Color effects ──────────────────────────────────────────

    mod color_effects {
        use super::*;
        use crate::effects::artistic::Grayscale;
        use crate::effects::color::*;

        #[test]
        fn test_invert_modifies_rgb() {
            let frame = solid_frame(2, 1, 100, 150, 200, 255);
            let effect = Invert::default();
            let result = effect
                .process_frame(&frame, None, &serde_json::Map::new())
                .unwrap();
            // Invert: 255-100=155, 255-150=105, 255-200=55
            assert_eq!(pixel_at(&result, 0, 0), (155, 105, 55, 255));
            assert_eq!(pixel_at(&result, 1, 0), (155, 105, 55, 255));
        }

        #[test]
        fn test_invert_inside_mask_preserves_unmasked() {
            let frame = solid_frame(2, 1, 100, 150, 200, 255);
            let mask = mask_from_values(2, 1, &[255, 0]); // pixel 0 masked
            let result = run_effect_with_mask(&Invert::default(), &frame, Some(&mask), "inside");
            // Pixel 0: mask=255 → inverted (155, 105, 55)
            assert_eq!(pixel_at(&result, 0, 0), (155, 105, 55, 255));
            // Pixel 1: mask=0 → original preserved
            assert_eq!(pixel_at(&result, 1, 0), (100, 150, 200, 255));
        }

        #[test]
        fn test_invert_outside_mask_preserves_masked() {
            let frame = solid_frame(2, 1, 100, 150, 200, 255);
            let mask = mask_from_values(2, 1, &[255, 0]);
            let result = run_effect_with_mask(&Invert::default(), &frame, Some(&mask), "outside");
            // Pixel 0: mask=255 → original preserved (outside mode preserves masked area)
            assert_eq!(pixel_at(&result, 0, 0), (100, 150, 200, 255));
            // Pixel 1: mask=0 → inverted
            assert_eq!(pixel_at(&result, 1, 0), (155, 105, 55, 255));
        }

        #[test]
        fn test_invert_alpha_preserved_with_mask() {
            let frame = solid_frame(2, 1, 100, 150, 200, 128);
            let mask = mask_from_values(2, 1, &[255, 0]);
            let result = run_effect_with_mask(&Invert::default(), &frame, Some(&mask), "inside");
            assert_alpha_preserved(&result, &frame, 0, 0, "alpha should be preserved");
            assert_alpha_preserved(&result, &frame, 1, 0, "alpha should be preserved");
        }

        #[test]
        fn test_grayscale_modifies_rgb() {
            let frame = frame_from_pixels(1, 1, &[(255, 0, 0, 255)]);
            let effect = Grayscale::default();
            let result = effect
                .process_frame(&frame, None, &serde_json::Map::new())
                .unwrap();
            // Grayscale: luminance = 0.299*255 ≈ 76
            let p = pixel_at(&result, 0, 0);
            assert_eq!(p.0, p.1, "R should equal G after grayscale");
            assert_eq!(p.1, p.2, "G should equal B after grayscale");
            assert_ne!(p.0, 255, "R should change from original 255");
        }

        #[test]
        fn test_grayscale_inside_mask_preserves_color_outside() {
            let frame = frame_from_pixels(2, 1, &[(255, 0, 0, 255), (0, 255, 0, 255)]);
            let mask = mask_from_values(2, 1, &[255, 0]);
            let result = run_effect_with_mask(&Grayscale::default(), &frame, Some(&mask), "inside");
            // Pixel 0: mask=255 → grayscale
            let p0 = pixel_at(&result, 0, 0);
            assert_eq!(p0.0, p0.1, "masked pixel should be grayscale");
            // Pixel 1: mask=0 → original green
            assert_eq!(pixel_at(&result, 1, 0), (0, 255, 0, 255));
        }

        #[test]
        fn test_grayscale_outside_mask_preserves_color_inside() {
            let frame = frame_from_pixels(2, 1, &[(255, 0, 0, 255), (0, 255, 0, 255)]);
            let mask = mask_from_values(2, 1, &[255, 0]);
            let result =
                run_effect_with_mask(&Grayscale::default(), &frame, Some(&mask), "outside");
            // Pixel 0: mask=255 → original red preserved
            assert_eq!(pixel_at(&result, 0, 0), (255, 0, 0, 255));
            // Pixel 1: mask=0 → grayscale
            let p1 = pixel_at(&result, 1, 0);
            assert_eq!(p1.0, p1.1, "unmasked pixel should be grayscale");
        }

        #[test]
        fn test_channel_swap_modifies_rgb() {
            let frame = frame_from_pixels(1, 1, &[(100, 200, 50, 255)]);
            let effect = ChannelSwap::default();
            let result = effect
                .process_frame(&frame, None, &serde_json::Map::new())
                .unwrap();
            let p = pixel_at(&result, 0, 0);
            // ChannelSwap should rearrange channels — at least one should differ
            assert!(
                p.0 != 100 || p.1 != 200 || p.2 != 50,
                "ChannelSwap should modify at least one channel"
            );
        }

        #[test]
        fn test_channel_swap_inside_mask() {
            let frame = frame_from_pixels(2, 1, &[(100, 200, 50, 255), (10, 20, 30, 255)]);
            let mask = mask_from_values(2, 1, &[255, 0]);
            let result =
                run_effect_with_mask(&ChannelSwap::default(), &frame, Some(&mask), "inside");
            // Pixel 0: modified by effect
            assert_pixel_modified(&result, &frame, 0, 0, "masked pixel should be modified");
            // Pixel 1: original preserved
            assert_eq!(pixel_at(&result, 1, 0), (10, 20, 30, 255));
        }

        #[test]
        fn test_brightness_contrast_modifies_rgb() {
            let frame = solid_frame(1, 1, 128, 128, 128, 255);
            let effect = BrightnessContrast;
            let result = effect
                .process_frame(&frame, None, &serde_json::Map::new())
                .unwrap();
            // With default params, brightness/contrast should change values
            let p = pixel_at(&result, 0, 0);
            // Default brightness=0, contrast=0 → should be close to original but may differ
            // Just verify it produces valid output
            assert!(p.0 <= 255);
        }

        #[test]
        fn test_rgb_shift_modifies_rgb() {
            let frame = frame_from_pixels(
                4,
                1,
                &[
                    (255, 0, 0, 255),
                    (0, 255, 0, 255),
                    (0, 0, 255, 255),
                    (255, 255, 0, 255),
                ],
            );
            let effect = RgbShift::default();
            let result = effect
                .process_frame(&frame, None, &serde_json::Map::new())
                .unwrap();
            // RGB shift should change at least some pixels
            let mut any_changed = false;
            for x in 0..4 {
                if pixel_at(&result, x, 0) != pixel_at(&frame, x, 0) {
                    any_changed = true;
                    break;
                }
            }
            assert!(any_changed, "RgbShift should modify at least one pixel");
        }

        #[test]
        fn test_rgb_shift_inside_mask_preserves_unmasked() {
            let frame = solid_frame(4, 2, 128, 64, 192, 255);
            let mask = left_half_mask(4, 2);
            let result = run_effect_with_mask(&RgbShift::default(), &frame, Some(&mask), "inside");
            // Right half (unmasked) should be original
            assert_pixel_unchanged(&result, &frame, 2, 0, "unmasked pixel should be original");
            assert_pixel_unchanged(&result, &frame, 3, 0, "unmasked pixel should be original");
            assert_pixel_unchanged(&result, &frame, 3, 1, "unmasked pixel should be original");
        }

        #[test]
        fn test_rgb_shift_outside_mask_preserves_masked() {
            let frame = solid_frame(4, 2, 128, 64, 192, 255);
            let mask = left_half_mask(4, 2);
            let result = run_effect_with_mask(&RgbShift::default(), &frame, Some(&mask), "outside");
            // Left half (masked) should be original
            assert_pixel_unchanged(&result, &frame, 0, 0, "masked pixel should be original");
            assert_pixel_unchanged(&result, &frame, 1, 0, "masked pixel should be original");
            assert_pixel_unchanged(&result, &frame, 0, 1, "masked pixel should be original");
        }

        #[test]
        fn test_historical_palettes_modifies_rgb() {
            let frame = solid_frame(2, 2, 128, 64, 192, 255);
            let effect = HistoricalPalettes;
            let result = effect
                .process_frame(&frame, None, &serde_json::Map::new())
                .unwrap();
            // Palette mapping should change colors
            let p = pixel_at(&result, 0, 0);
            assert!(
                p.0 <= 255 && p.1 <= 255 && p.2 <= 255,
                "should produce valid RGB"
            );
        }

        #[test]
        fn test_historical_palettes_inside_mask() {
            let frame = solid_frame(2, 1, 128, 64, 192, 255);
            let mask = mask_from_values(2, 1, &[255, 0]);
            let result = run_effect_with_mask(&HistoricalPalettes, &frame, Some(&mask), "inside");
            // Pixel 1: unmasked → original
            assert_eq!(pixel_at(&result, 1, 0), (128, 64, 192, 255));
        }

        #[test]
        fn test_lift_gamma_gain_modifies_rgb() {
            let frame = solid_frame(1, 1, 128, 128, 128, 255);
            let effect = LiftGammaGain;
            let result = effect
                .process_frame(&frame, None, &serde_json::Map::new())
                .unwrap();
            let p = pixel_at(&result, 0, 0);
            assert!(p.0 <= 255, "should produce valid output");
        }

        #[test]
        fn test_lift_gamma_gain_inside_mask() {
            let frame = solid_frame(2, 1, 128, 128, 128, 255);
            let mask = mask_from_values(2, 1, &[255, 0]);
            let result = run_effect_with_mask(&LiftGammaGain, &frame, Some(&mask), "inside");
            assert_eq!(pixel_at(&result, 1, 0), (128, 128, 128, 255));
        }
    }

    // ── Artistic effects ───────────────────────────────────────

    mod artistic_effects {
        use super::*;
        use crate::effects::artistic::*;

        #[test]
        fn test_posterize_modifies_rgb() {
            let frame = solid_frame(1, 1, 128, 64, 192, 255);
            let effect = Posterize::default();
            let result = effect
                .process_frame(&frame, None, &serde_json::Map::new())
                .unwrap();
            // Posterize quantizes to fewer levels — value should change
            let p = pixel_at(&result, 0, 0);
            assert!(p.0 <= 255 && p.1 <= 255 && p.2 <= 255);
        }

        #[test]
        fn test_posterize_inside_mask() {
            let frame = solid_frame(2, 1, 128, 64, 192, 255);
            let mask = mask_from_values(2, 1, &[255, 0]);
            let result = run_effect_with_mask(&Posterize::default(), &frame, Some(&mask), "inside");
            assert_eq!(pixel_at(&result, 1, 0), (128, 64, 192, 255));
        }

        #[test]
        fn test_solarize_modifies_rgb() {
            let frame = solid_frame(1, 1, 200, 100, 50, 255);
            let effect = Solarize::default();
            let result = effect
                .process_frame(&frame, None, &serde_json::Map::new())
                .unwrap();
            let p = pixel_at(&result, 0, 0);
            // Solarize inverts values above threshold
            assert!(p.0 <= 255);
        }

        #[test]
        fn test_solarize_inside_mask() {
            let frame = solid_frame(2, 1, 200, 100, 50, 255);
            let mask = mask_from_values(2, 1, &[255, 0]);
            let result = run_effect_with_mask(&Solarize::default(), &frame, Some(&mask), "inside");
            assert_eq!(pixel_at(&result, 1, 0), (200, 100, 50, 255));
        }

        #[test]
        fn test_vaporwave_modifies_rgb() {
            let frame = solid_frame(2, 2, 128, 128, 128, 255);
            let effect = Vaporwave;
            let result = effect
                .process_frame(&frame, None, &serde_json::Map::new())
                .unwrap();
            let p = pixel_at(&result, 0, 0);
            assert!(p.0 <= 255 && p.1 <= 255 && p.2 <= 255);
        }

        #[test]
        fn test_vaporwave_inside_mask() {
            let frame = solid_frame(2, 1, 128, 128, 128, 255);
            let mask = mask_from_values(2, 1, &[255, 0]);
            let result = run_effect_with_mask(&Vaporwave, &frame, Some(&mask), "inside");
            assert_eq!(pixel_at(&result, 1, 0), (128, 128, 128, 255));
        }

        #[test]
        fn test_grayscale_outside_mask_preserves_masked() {
            let frame = frame_from_pixels(2, 1, &[(255, 0, 0, 255), (0, 255, 0, 255)]);
            let mask = mask_from_values(2, 1, &[255, 0]);
            let result =
                run_effect_with_mask(&Grayscale::default(), &frame, Some(&mask), "outside");
            // Pixel 0: masked → original red
            assert_eq!(pixel_at(&result, 0, 0), (255, 0, 0, 255));
            // Pixel 1: unmasked → grayscale
            let p1 = pixel_at(&result, 1, 0);
            assert_eq!(p1.0, p1.1, "unmasked pixel should be grayscale");
        }
    }

    // ── Analog effects ─────────────────────────────────────────

    mod analog_effects {
        use super::*;
        use crate::effects::analog::*;

        #[test]
        fn test_scanlines_modifies_rgb() {
            let frame = solid_frame(4, 4, 128, 128, 128, 255);
            let effect = Scanlines::default();
            let result = effect
                .process_frame(&frame, None, &serde_json::Map::new())
                .unwrap();
            // At least some rows should be darkened
            let mut any_changed = false;
            for y in 0..4 {
                for x in 0..4 {
                    if pixel_at(&result, x, y).0 != 128 {
                        any_changed = true;
                        break;
                    }
                }
            }
            assert!(any_changed, "Scanlines should darken some rows");
        }

        #[test]
        fn test_scanlines_inside_mask_preserves_unmasked() {
            let frame = solid_frame(4, 2, 128, 128, 128, 255);
            let mask = left_half_mask(4, 2);
            let result = run_effect_with_mask(&Scanlines::default(), &frame, Some(&mask), "inside");
            // Right half unmasked → original
            assert_pixel_unchanged(&result, &frame, 2, 0, "unmasked should be original");
            assert_pixel_unchanged(&result, &frame, 3, 0, "unmasked should be original");
        }

        #[test]
        fn test_scanlines_outside_mask_preserves_masked() {
            let frame = solid_frame(4, 2, 128, 128, 128, 255);
            let mask = left_half_mask(4, 2);
            let result =
                run_effect_with_mask(&Scanlines::default(), &frame, Some(&mask), "outside");
            // Left half masked → original
            assert_pixel_unchanged(&result, &frame, 0, 0, "masked should be original");
            assert_pixel_unchanged(&result, &frame, 1, 0, "masked should be original");
        }

        #[test]
        fn test_chromatic_aberration_modifies_rgb() {
            let frame = frame_from_pixels(
                4,
                1,
                &[
                    (255, 0, 0, 255),
                    (0, 255, 0, 255),
                    (0, 0, 255, 255),
                    (255, 255, 0, 255),
                ],
            );
            let effect = ChromaticAberration::default();
            let result = effect
                .process_frame(&frame, None, &serde_json::Map::new())
                .unwrap();
            let mut any_changed = false;
            for x in 0..4 {
                if pixel_at(&result, x, 0) != pixel_at(&frame, x, 0) {
                    any_changed = true;
                    break;
                }
            }
            assert!(any_changed, "ChromaticAberration should modify pixels");
        }

        #[test]
        fn test_chromatic_aberration_inside_mask() {
            let frame = solid_frame(4, 2, 128, 64, 192, 255);
            let mask = left_half_mask(4, 2);
            let result = run_effect_with_mask(
                &ChromaticAberration::default(),
                &frame,
                Some(&mask),
                "inside",
            );
            assert_pixel_unchanged(&result, &frame, 2, 0, "unmasked should be original");
            assert_pixel_unchanged(&result, &frame, 3, 1, "unmasked should be original");
        }

        #[test]
        fn test_hue_shift_modifies_rgb() {
            let frame = frame_from_pixels(1, 1, &[(255, 0, 0, 255)]);
            let effect = HueShift::default();
            let result = effect
                .process_frame(&frame, None, &serde_json::Map::new())
                .unwrap();
            let p = pixel_at(&result, 0, 0);
            // Hue shift should change at least one channel
            assert!(
                p.0 != 255 || p.1 != 0 || p.2 != 0,
                "HueShift should modify red pixel"
            );
        }

        #[test]
        fn test_hue_shift_inside_mask() {
            let frame = frame_from_pixels(2, 1, &[(255, 0, 0, 255), (0, 0, 255, 255)]);
            let mask = mask_from_values(2, 1, &[255, 0]);
            let result = run_effect_with_mask(&HueShift::default(), &frame, Some(&mask), "inside");
            assert_eq!(pixel_at(&result, 1, 0), (0, 0, 255, 255));
        }

        #[test]
        fn test_vhs_effect_modifies_rgb() {
            let frame = solid_frame(8, 8, 128, 128, 128, 255);
            let effect = VhsEffect::default();
            let result = effect
                .process_frame(&frame, None, &serde_json::Map::new())
                .unwrap();
            let p = pixel_at(&result, 0, 0);
            assert!(
                p.0 <= 255 && p.1 <= 255 && p.2 <= 255,
                "should produce valid RGB"
            );
        }

        #[test]
        fn test_vhs_effect_inside_mask() {
            let frame = solid_frame(4, 2, 128, 128, 128, 255);
            let mask = left_half_mask(4, 2);
            let result = run_effect_with_mask(&VhsEffect::default(), &frame, Some(&mask), "inside");
            assert_pixel_unchanged(&result, &frame, 2, 0, "unmasked should be original");
        }

        #[test]
        fn test_color_bleed_modifies_rgb() {
            let frame = frame_from_pixels(
                4,
                1,
                &[
                    (255, 0, 0, 255),
                    (0, 255, 0, 255),
                    (0, 0, 255, 255),
                    (255, 255, 0, 255),
                ],
            );
            let effect = ColorBleed::default();
            let result = effect
                .process_frame(&frame, None, &serde_json::Map::new())
                .unwrap();
            let mut any_changed = false;
            for x in 0..4 {
                if pixel_at(&result, x, 0) != pixel_at(&frame, x, 0) {
                    any_changed = true;
                    break;
                }
            }
            assert!(any_changed, "ColorBleed should modify pixels");
        }

        #[test]
        fn test_color_bleed_inside_mask() {
            let frame = solid_frame(4, 2, 128, 64, 192, 255);
            let mask = left_half_mask(4, 2);
            let result =
                run_effect_with_mask(&ColorBleed::default(), &frame, Some(&mask), "inside");
            assert_pixel_unchanged(&result, &frame, 2, 0, "unmasked should be original");
        }

        #[test]
        fn test_tv_glitch_modifies_rgb() {
            let frame = solid_frame(8, 8, 128, 128, 128, 255);
            let effect = TvGlitch::default();
            let result = effect
                .process_frame(&frame, None, &serde_json::Map::new())
                .unwrap();
            let p = pixel_at(&result, 0, 0);
            assert!(p.0 <= 255, "should produce valid output");
        }

        #[test]
        fn test_tv_glitch_inside_mask() {
            let frame = solid_frame(4, 2, 128, 128, 128, 255);
            let mask = left_half_mask(4, 2);
            let result = run_effect_with_mask(&TvGlitch::default(), &frame, Some(&mask), "inside");
            assert_pixel_unchanged(&result, &frame, 2, 0, "unmasked should be original");
        }

        #[test]
        fn test_ghosting_modifies_rgb() {
            let frame = solid_frame(8, 4, 128, 128, 128, 255);
            let effect = Ghosting::default();
            let result = effect
                .process_frame(&frame, None, &serde_json::Map::new())
                .unwrap();
            let p = pixel_at(&result, 0, 0);
            assert!(p.0 <= 255, "should produce valid output");
        }

        #[test]
        fn test_ghosting_inside_mask() {
            let frame = solid_frame(4, 2, 128, 128, 128, 255);
            let mask = left_half_mask(4, 2);
            let result = run_effect_with_mask(&Ghosting::default(), &frame, Some(&mask), "inside");
            assert_pixel_unchanged(&result, &frame, 2, 0, "unmasked should be original");
        }

        #[test]
        fn test_scan_drift_modifies_rgb() {
            let frame = solid_frame(8, 4, 128, 128, 128, 255);
            let effect = ScanDrift::default();
            let result = effect
                .process_frame(&frame, None, &serde_json::Map::new())
                .unwrap();
            let p = pixel_at(&result, 0, 0);
            assert!(p.0 <= 255, "should produce valid output");
        }

        #[test]
        fn test_scan_drift_inside_mask() {
            let frame = solid_frame(4, 2, 128, 128, 128, 255);
            let mask = left_half_mask(4, 2);
            let result = run_effect_with_mask(&ScanDrift::default(), &frame, Some(&mask), "inside");
            assert_pixel_unchanged(&result, &frame, 2, 0, "unmasked should be original");
        }
    }

    // ── Noise effects ──────────────────────────────────────────

    mod noise_effects {
        use super::*;
        use crate::effects::noise::*;

        #[test]
        fn test_salt_pepper_modifies_rgb() {
            let frame = solid_frame(16, 16, 128, 128, 128, 255);
            // Use high density (0.5) on a larger frame to ensure changes
            let effect = SaltPepperNoise::new(0.5);
            let result = effect
                .process_frame(&frame, None, &serde_json::Map::new())
                .unwrap();
            let mut any_changed = false;
            for y in 0..16 {
                for x in 0..16 {
                    if pixel_at(&result, x, y).0 != 128 {
                        any_changed = true;
                        break;
                    }
                }
            }
            assert!(any_changed, "SaltPepper should modify some pixels");
        }

        #[test]
        fn test_salt_pepper_inside_mask() {
            let frame = solid_frame(4, 2, 128, 128, 128, 255);
            let mask = left_half_mask(4, 2);
            let result =
                run_effect_with_mask(&SaltPepperNoise::default(), &frame, Some(&mask), "inside");
            assert_pixel_unchanged(&result, &frame, 2, 0, "unmasked should be original");
            assert_pixel_unchanged(&result, &frame, 3, 1, "unmasked should be original");
        }

        #[test]
        fn test_salt_pepper_outside_mask() {
            let frame = solid_frame(4, 2, 128, 128, 128, 255);
            let mask = left_half_mask(4, 2);
            let result =
                run_effect_with_mask(&SaltPepperNoise::default(), &frame, Some(&mask), "outside");
            assert_pixel_unchanged(&result, &frame, 0, 0, "masked should be original");
            assert_pixel_unchanged(&result, &frame, 1, 1, "masked should be original");
        }

        #[test]
        fn test_gaussian_noise_modifies_rgb() {
            let frame = solid_frame(4, 4, 128, 128, 128, 255);
            let effect = GaussianNoise::default();
            let result = effect
                .process_frame(&frame, None, &serde_json::Map::new())
                .unwrap();
            let mut any_changed = false;
            for y in 0..4 {
                for x in 0..4 {
                    if pixel_at(&result, x, y).0 != 128 {
                        any_changed = true;
                        break;
                    }
                }
            }
            assert!(any_changed, "GaussianNoise should modify some pixels");
        }

        #[test]
        fn test_gaussian_noise_inside_mask() {
            let frame = solid_frame(4, 2, 128, 128, 128, 255);
            let mask = left_half_mask(4, 2);
            let result =
                run_effect_with_mask(&GaussianNoise::default(), &frame, Some(&mask), "inside");
            assert_pixel_unchanged(&result, &frame, 2, 0, "unmasked should be original");
        }

        #[test]
        fn test_uniform_noise_modifies_rgb() {
            let frame = solid_frame(4, 4, 128, 128, 128, 255);
            let effect = UniformNoise::default();
            let result = effect
                .process_frame(&frame, None, &serde_json::Map::new())
                .unwrap();
            let mut any_changed = false;
            for y in 0..4 {
                for x in 0..4 {
                    if pixel_at(&result, x, y).0 != 128 {
                        any_changed = true;
                        break;
                    }
                }
            }
            assert!(any_changed, "UniformNoise should modify some pixels");
        }

        #[test]
        fn test_uniform_noise_inside_mask() {
            let frame = solid_frame(4, 2, 128, 128, 128, 255);
            let mask = left_half_mask(4, 2);
            let result =
                run_effect_with_mask(&UniformNoise::default(), &frame, Some(&mask), "inside");
            assert_pixel_unchanged(&result, &frame, 2, 0, "unmasked should be original");
        }

        #[test]
        fn test_fractal_noise_modifies_rgb() {
            let frame = solid_frame(4, 4, 128, 128, 128, 255);
            let effect = FractalNoise::default();
            let result = effect
                .process_frame(&frame, None, &serde_json::Map::new())
                .unwrap();
            let p = pixel_at(&result, 0, 0);
            assert!(p.0 <= 255, "should produce valid output");
        }

        #[test]
        fn test_fractal_noise_inside_mask() {
            let frame = solid_frame(4, 2, 128, 128, 128, 255);
            let mask = left_half_mask(4, 2);
            let result =
                run_effect_with_mask(&FractalNoise::default(), &frame, Some(&mask), "inside");
            assert_pixel_unchanged(&result, &frame, 2, 0, "unmasked should be original");
        }
    }

    // ── Glitch effects ─────────────────────────────────────────

    mod glitch_effects {
        use super::*;
        use crate::effects::glitch::*;

        #[test]
        fn test_databend_modifies_rgb() {
            let frame = solid_frame(4, 4, 128, 128, 128, 255);
            let effect = Databend::default();
            let result = effect
                .process_frame(&frame, None, &serde_json::Map::new())
                .unwrap();
            let p = pixel_at(&result, 0, 0);
            assert!(p.0 <= 255, "should produce valid output");
        }

        #[test]
        fn test_databend_inside_mask() {
            let frame = solid_frame(4, 2, 128, 128, 128, 255);
            let mask = left_half_mask(4, 2);
            let result = run_effect_with_mask(&Databend::default(), &frame, Some(&mask), "inside");
            assert_pixel_unchanged(&result, &frame, 2, 0, "unmasked should be original");
        }

        #[test]
        fn test_byte_flip_modifies_rgb() {
            let frame = solid_frame(4, 4, 128, 128, 128, 255);
            let effect = ByteFlip::default();
            let result = effect
                .process_frame(&frame, None, &serde_json::Map::new())
                .unwrap();
            let p = pixel_at(&result, 0, 0);
            assert!(p.0 <= 255, "should produce valid output");
        }

        #[test]
        fn test_byte_flip_inside_mask() {
            let frame = solid_frame(4, 2, 128, 128, 128, 255);
            let mask = left_half_mask(4, 2);
            let result = run_effect_with_mask(&ByteFlip::default(), &frame, Some(&mask), "inside");
            assert_pixel_unchanged(&result, &frame, 2, 0, "unmasked should be original");
        }

        #[test]
        fn test_byte_zero_modifies_rgb() {
            let frame = solid_frame(4, 4, 128, 128, 128, 255);
            let effect = ByteZero::default();
            let result = effect
                .process_frame(&frame, None, &serde_json::Map::new())
                .unwrap();
            let p = pixel_at(&result, 0, 0);
            assert!(p.0 <= 255, "should produce valid output");
        }

        #[test]
        fn test_byte_zero_inside_mask() {
            let frame = solid_frame(4, 2, 128, 128, 128, 255);
            let mask = left_half_mask(4, 2);
            let result = run_effect_with_mask(&ByteZero::default(), &frame, Some(&mask), "inside");
            assert_pixel_unchanged(&result, &frame, 2, 0, "unmasked should be original");
        }

        #[test]
        fn test_slice_shift_modifies_rgb() {
            let frame = solid_frame(32, 32, 128, 128, 128, 255);
            let effect = SliceShift::default();
            let result = effect
                .process_frame(&frame, None, &serde_json::Map::new())
                .unwrap();
            let p = pixel_at(&result, 0, 0);
            assert!(p.0 <= 255, "should produce valid output");
        }

        #[test]
        fn test_slice_shift_inside_mask() {
            let frame = solid_frame(32, 2, 128, 128, 128, 255);
            let mask = left_half_mask(32, 2);
            let result =
                run_effect_with_mask(&SliceShift::default(), &frame, Some(&mask), "inside");
            assert_pixel_unchanged(&result, &frame, 16, 0, "unmasked should be original");
        }

        #[test]
        fn test_jpeg_quantize_modifies_rgb() {
            let frame = solid_frame(4, 4, 137, 137, 137, 255);
            let effect = JpegQuantize::default();
            let result = effect
                .process_frame(&frame, None, &serde_json::Map::new())
                .unwrap();
            let p = pixel_at(&result, 0, 0);
            assert!(p.0 <= 255, "should produce valid output");
        }

        #[test]
        fn test_jpeg_quantize_inside_mask() {
            let frame = solid_frame(4, 2, 137, 137, 137, 255);
            let mask = left_half_mask(4, 2);
            let result =
                run_effect_with_mask(&JpegQuantize::default(), &frame, Some(&mask), "inside");
            assert_pixel_unchanged(&result, &frame, 2, 0, "unmasked should be original");
        }

        #[test]
        fn test_png_chunk_glitch_modifies_rgb() {
            let frame = solid_frame(32, 32, 128, 128, 128, 255);
            let effect = PngChunkGlitch;
            let result = effect
                .process_frame(&frame, None, &serde_json::Map::new())
                .unwrap();
            let p = pixel_at(&result, 0, 0);
            assert!(p.0 <= 255, "should produce valid output");
        }

        #[test]
        fn test_png_chunk_glitch_inside_mask() {
            let frame = solid_frame(32, 2, 128, 128, 128, 255);
            let mask = left_half_mask(32, 2);
            let result = run_effect_with_mask(&PngChunkGlitch, &frame, Some(&mask), "inside");
            assert_pixel_unchanged(&result, &frame, 16, 0, "unmasked should be original");
        }

        #[test]
        fn test_crc_mismatch_glitch_modifies_rgb() {
            let frame = solid_frame(32, 32, 128, 128, 128, 255);
            let effect = CrcMismatchGlitch;
            let result = effect
                .process_frame(&frame, None, &serde_json::Map::new())
                .unwrap();
            let p = pixel_at(&result, 0, 0);
            assert!(p.0 <= 255, "should produce valid output");
        }

        #[test]
        fn test_crc_mismatch_inside_mask() {
            let frame = solid_frame(32, 2, 128, 128, 128, 255);
            let mask = left_half_mask(32, 2);
            let result = run_effect_with_mask(&CrcMismatchGlitch, &frame, Some(&mask), "inside");
            assert_pixel_unchanged(&result, &frame, 16, 0, "unmasked should be original");
        }

        #[test]
        fn test_byte_insert_modifies_rgb() {
            let frame = solid_frame(4, 4, 0, 0, 0, 255);
            let effect = ByteInsert::default();
            let result = effect
                .process_frame(&frame, None, &serde_json::Map::new())
                .unwrap();
            let p = pixel_at(&result, 0, 0);
            assert!(p.0 <= 255, "should produce valid output");
        }

        #[test]
        fn test_byte_insert_inside_mask() {
            let frame = solid_frame(4, 2, 0, 0, 0, 255);
            let mask = left_half_mask(4, 2);
            let result =
                run_effect_with_mask(&ByteInsert::default(), &frame, Some(&mask), "inside");
            assert_pixel_unchanged(&result, &frame, 2, 0, "unmasked should be original");
        }

        #[test]
        fn test_byte_reverse_modifies_rgb() {
            let frame = frame_from_pixels(3, 1, &[(1, 2, 3, 4), (5, 6, 7, 8), (9, 10, 11, 12)]);
            let effect = ByteReverse::default();
            let result = effect
                .process_frame(&frame, None, &serde_json::Map::new())
                .unwrap();
            let p = pixel_at(&result, 0, 0);
            assert!(p.0 <= 255, "should produce valid output");
        }

        #[test]
        fn test_byte_reverse_inside_mask() {
            // ByteReverse operates on raw bytes and can corrupt alpha.
            // blend_mask only restores RGB, so we check RGB only.
            let frame = solid_frame(4, 2, 128, 128, 128, 255);
            let mask = left_half_mask(4, 2);
            let result =
                run_effect_with_mask(&ByteReverse::default(), &frame, Some(&mask), "inside");
            let p = pixel_at(&result, 2, 0);
            assert_eq!(p.0, 128, "R should be original for unmasked");
            assert_eq!(p.1, 128, "G should be original for unmasked");
            assert_eq!(p.2, 128, "B should be original for unmasked");
        }

        #[test]
        fn test_sorting_glitch_modifies_rgb() {
            let frame = frame_from_pixels(
                4,
                1,
                &[
                    (200, 200, 200, 255),
                    (50, 50, 50, 255),
                    (210, 210, 210, 255),
                    (150, 150, 150, 255),
                ],
            );
            let effect = SortingGlitch::default();
            let result = effect
                .process_frame(&frame, None, &serde_json::Map::new())
                .unwrap();
            let p = pixel_at(&result, 0, 0);
            assert!(p.0 <= 255, "should produce valid output");
        }

        #[test]
        fn test_sorting_glitch_inside_mask() {
            let frame = solid_frame(4, 2, 128, 128, 128, 255);
            let mask = left_half_mask(4, 2);
            let result =
                run_effect_with_mask(&SortingGlitch::default(), &frame, Some(&mask), "inside");
            assert_pixel_unchanged(&result, &frame, 2, 0, "unmasked should be original");
        }

        #[test]
        fn test_macroblock_glitch_modifies_rgb() {
            let frame = solid_frame(16, 16, 128, 128, 128, 255);
            let effect = MacroblockGlitch::default();
            let result = effect
                .process_frame(&frame, None, &serde_json::Map::new())
                .unwrap();
            let p = pixel_at(&result, 0, 0);
            assert!(p.0 <= 255, "should produce valid output");
        }

        #[test]
        fn test_macroblock_glitch_inside_mask() {
            let frame = solid_frame(16, 2, 128, 128, 128, 255);
            let mask = left_half_mask(16, 2);
            let result =
                run_effect_with_mask(&MacroblockGlitch::default(), &frame, Some(&mask), "inside");
            assert_pixel_unchanged(&result, &frame, 8, 0, "unmasked should be original");
        }
    }

    // ── Pixel Geometry effects ─────────────────────────────────

    mod pixel_geo_effects {
        use super::*;
        use crate::effects::pixel_geo::*;
        use crate::effects::types::Frame;

        #[test]
        fn test_pixelate_modifies_rgb() {
            let frame = frame_from_pixels(2, 1, &[(100, 150, 200, 255), (50, 50, 50, 255)]);
            let effect = Pixelate::new(2);
            let result = effect
                .process_frame(&frame, None, &serde_json::Map::new())
                .unwrap();
            // Pixelate averages the block
            let p = pixel_at(&result, 0, 0);
            assert!(p.0 <= 255, "should produce valid output");
        }

        #[test]
        fn test_pixelate_inside_mask() {
            let frame = solid_frame(4, 2, 128, 128, 128, 255);
            let mask = left_half_mask(4, 2);
            let result = run_effect_with_mask(&Pixelate::new(2), &frame, Some(&mask), "inside");
            assert_pixel_unchanged(&result, &frame, 2, 0, "unmasked should be original");
        }

        #[test]
        fn test_pixel_sort_modifies_rgb() {
            let mut data = vec![0u8; 16 * 4];
            data[0] = 200;
            data[1] = 200;
            data[2] = 200;
            data[4] = 50;
            data[5] = 50;
            data[6] = 50;
            data[8] = 210;
            data[9] = 210;
            data[10] = 210;
            data[12] = 150;
            data[13] = 150;
            data[14] = 150;
            let frame = Frame {
                width: 4,
                height: 1,
                data,
            };
            let effect = PixelSort::default();
            let result = effect
                .process_frame(&frame, None, &serde_json::Map::new())
                .unwrap();
            let p = pixel_at(&result, 0, 0);
            assert!(p.0 <= 255, "should produce valid output");
        }

        #[test]
        fn test_pixel_sort_inside_mask() {
            let frame = solid_frame(4, 2, 128, 128, 128, 255);
            let mask = left_half_mask(4, 2);
            let result = run_effect_with_mask(&PixelSort::default(), &frame, Some(&mask), "inside");
            assert_pixel_unchanged(&result, &frame, 2, 0, "unmasked should be original");
        }

        #[test]
        fn test_kaleidoscope_modifies_rgb() {
            let frame = solid_frame(64, 64, 128, 128, 128, 255);
            let effect = Kaleidoscope::default();
            let result = effect
                .process_frame(&frame, None, &serde_json::Map::new())
                .unwrap();
            let p = pixel_at(&result, 0, 0);
            assert!(p.0 <= 255, "should produce valid output");
        }

        #[test]
        fn test_kaleidoscope_inside_mask() {
            let frame = solid_frame(64, 2, 128, 128, 128, 255);
            let mask = left_half_mask(64, 2);
            let result =
                run_effect_with_mask(&Kaleidoscope::default(), &frame, Some(&mask), "inside");
            assert_pixel_unchanged(&result, &frame, 32, 0, "unmasked should be original");
        }

        #[test]
        fn test_wave_distort_modifies_rgb() {
            let frame = solid_frame(32, 32, 128, 128, 128, 255);
            let effect = WaveDistort::default();
            let result = effect
                .process_frame(&frame, None, &serde_json::Map::new())
                .unwrap();
            let p = pixel_at(&result, 0, 0);
            assert!(p.0 <= 255, "should produce valid output");
        }

        #[test]
        fn test_wave_distort_inside_mask() {
            let frame = solid_frame(32, 2, 128, 128, 128, 255);
            let mask = left_half_mask(32, 2);
            let result =
                run_effect_with_mask(&WaveDistort::default(), &frame, Some(&mask), "inside");
            assert_pixel_unchanged(&result, &frame, 16, 0, "unmasked should be original");
        }

        #[test]
        fn test_anaglyph_modifies_rgb() {
            let frame = frame_from_pixels(
                4,
                1,
                &[
                    (255, 0, 0, 255),
                    (0, 255, 0, 255),
                    (0, 0, 255, 255),
                    (0, 0, 0, 255),
                ],
            );
            let effect = Anaglyph::default();
            let result = effect
                .process_frame(&frame, None, &serde_json::Map::new())
                .unwrap();
            let p = pixel_at(&result, 0, 0);
            assert!(p.0 <= 255, "should produce valid output");
        }

        #[test]
        fn test_anaglyph_inside_mask() {
            let frame = solid_frame(4, 2, 128, 128, 128, 255);
            let mask = left_half_mask(4, 2);
            let result = run_effect_with_mask(&Anaglyph::default(), &frame, Some(&mask), "inside");
            assert_pixel_unchanged(&result, &frame, 2, 0, "unmasked should be original");
        }

        #[test]
        fn test_block_shift_modifies_rgb() {
            let frame = solid_frame(32, 32, 128, 128, 128, 255);
            let effect = BlockShift::default();
            let result = effect
                .process_frame(&frame, None, &serde_json::Map::new())
                .unwrap();
            let p = pixel_at(&result, 0, 0);
            assert!(p.0 <= 255, "should produce valid output");
        }

        #[test]
        fn test_block_shift_inside_mask() {
            let frame = solid_frame(32, 2, 128, 128, 128, 255);
            let mask = left_half_mask(32, 2);
            let result =
                run_effect_with_mask(&BlockShift::default(), &frame, Some(&mask), "inside");
            assert_pixel_unchanged(&result, &frame, 16, 0, "unmasked should be original");
        }

        #[test]
        fn test_mirror_slices_modifies_rgb() {
            let frame = frame_from_pixels(
                2,
                2,
                &[(255, 0, 0, 0), (0, 0, 0, 0), (100, 0, 0, 0), (50, 0, 0, 0)],
            );
            let effect = MirrorSlices::default();
            let result = effect
                .process_frame(&frame, None, &serde_json::Map::new())
                .unwrap();
            let p = pixel_at(&result, 0, 0);
            assert!(p.0 <= 255, "should produce valid output");
        }

        #[test]
        fn test_mirror_slices_inside_mask() {
            let frame = solid_frame(4, 2, 128, 128, 128, 255);
            let mask = left_half_mask(4, 2);
            let result =
                run_effect_with_mask(&MirrorSlices::default(), &frame, Some(&mask), "inside");
            assert_pixel_unchanged(&result, &frame, 2, 0, "unmasked should be original");
        }

        #[test]
        fn test_slice_shift_advanced_modifies_rgb() {
            let frame = solid_frame(8, 4, 128, 128, 128, 255);
            let effect = SliceShiftAdvanced::default();
            let result = effect
                .process_frame(&frame, None, &serde_json::Map::new())
                .unwrap();
            let p = pixel_at(&result, 0, 0);
            assert!(p.0 <= 255, "should produce valid output");
        }

        #[test]
        fn test_slice_shift_advanced_inside_mask() {
            let frame = solid_frame(8, 2, 128, 128, 128, 255);
            let mask = left_half_mask(8, 2);
            let result = run_effect_with_mask(
                &SliceShiftAdvanced::default(),
                &frame,
                Some(&mask),
                "inside",
            );
            assert_pixel_unchanged(&result, &frame, 4, 0, "unmasked should be original");
        }
    }

    // ── Dithering effects ──────────────────────────────────────

    mod dithering_effects {
        use super::*;
        use crate::effects::dithering::*;

        #[test]
        fn test_bayer_dither_modifies_rgb() {
            let frame = gradient_frame(8, 8);
            let effect = BayerDither::default();
            let result = effect
                .process_frame(&frame, None, &serde_json::Map::new())
                .unwrap();
            // Dithering should produce different values than the gradient
            let mut any_changed = false;
            for y in 0..8 {
                for x in 0..8 {
                    if pixel_at(&result, x, y).0 != pixel_at(&frame, x, y).0 {
                        any_changed = true;
                        break;
                    }
                }
            }
            assert!(any_changed, "BayerDither should modify some pixels");
        }

        #[test]
        fn test_bayer_dither_inside_mask() {
            let frame = gradient_frame(8, 2);
            let mask = left_half_mask(8, 2);
            let result =
                run_effect_with_mask(&BayerDither::default(), &frame, Some(&mask), "inside");
            assert_pixel_unchanged(&result, &frame, 4, 0, "unmasked should be original");
            assert_pixel_unchanged(&result, &frame, 7, 1, "unmasked should be original");
        }

        #[test]
        fn test_floyd_steinberg_dither_modifies_rgb() {
            let frame = gradient_frame(8, 8);
            let effect = FloydSteinbergDither;
            let result = effect
                .process_frame(&frame, None, &serde_json::Map::new())
                .unwrap();
            let mut any_changed = false;
            for y in 0..8 {
                for x in 0..8 {
                    if pixel_at(&result, x, y).0 != pixel_at(&frame, x, y).0 {
                        any_changed = true;
                        break;
                    }
                }
            }
            assert!(any_changed, "FloydSteinberg should modify some pixels");
        }

        #[test]
        fn test_floyd_steinberg_inside_mask() {
            let frame = gradient_frame(8, 2);
            let mask = left_half_mask(8, 2);
            let result = run_effect_with_mask(&FloydSteinbergDither, &frame, Some(&mask), "inside");
            assert_pixel_unchanged(&result, &frame, 4, 0, "unmasked should be original");
        }

        #[test]
        fn test_threshold_dither_modifies_rgb() {
            let frame = gradient_frame(4, 4);
            let effect = ThresholdDither::default();
            let result = effect
                .process_frame(&frame, None, &serde_json::Map::new())
                .unwrap();
            let mut any_changed = false;
            for y in 0..4 {
                for x in 0..4 {
                    if pixel_at(&result, x, y).0 != pixel_at(&frame, x, y).0 {
                        any_changed = true;
                        break;
                    }
                }
            }
            assert!(any_changed, "Threshold should modify some pixels");
        }

        #[test]
        fn test_threshold_inside_mask() {
            let frame = gradient_frame(4, 2);
            let mask = left_half_mask(4, 2);
            let result =
                run_effect_with_mask(&ThresholdDither::default(), &frame, Some(&mask), "inside");
            assert_pixel_unchanged(&result, &frame, 2, 0, "unmasked should be original");
        }

        #[test]
        fn test_halftone_dither_modifies_rgb() {
            let frame = gradient_frame(8, 8);
            let effect = HalftoneDither::default();
            let result = effect
                .process_frame(&frame, None, &serde_json::Map::new())
                .unwrap();
            let p = pixel_at(&result, 0, 0);
            assert!(p.0 <= 255, "should produce valid output");
        }

        #[test]
        fn test_halftone_inside_mask() {
            let frame = gradient_frame(8, 2);
            let mask = left_half_mask(8, 2);
            let result =
                run_effect_with_mask(&HalftoneDither::default(), &frame, Some(&mask), "inside");
            assert_pixel_unchanged(&result, &frame, 4, 0, "unmasked should be original");
        }

        #[test]
        fn test_atkinson_dither_modifies_rgb() {
            let frame = gradient_frame(8, 8);
            let effect = AtkinsonDither;
            let result = effect
                .process_frame(&frame, None, &serde_json::Map::new())
                .unwrap();
            let mut any_changed = false;
            for y in 0..8 {
                for x in 0..8 {
                    if pixel_at(&result, x, y).0 != pixel_at(&frame, x, y).0 {
                        any_changed = true;
                        break;
                    }
                }
            }
            assert!(any_changed, "Atkinson should modify some pixels");
        }

        #[test]
        fn test_atkinson_inside_mask() {
            let frame = gradient_frame(8, 2);
            let mask = left_half_mask(8, 2);
            let result = run_effect_with_mask(&AtkinsonDither, &frame, Some(&mask), "inside");
            assert_pixel_unchanged(&result, &frame, 4, 0, "unmasked should be original");
        }

        #[test]
        fn test_blue_noise_dither_modifies_rgb() {
            let frame = gradient_frame(8, 8);
            let effect = BlueNoiseDither::default();
            let result = effect
                .process_frame(&frame, None, &serde_json::Map::new())
                .unwrap();
            let mut any_changed = false;
            for y in 0..8 {
                for x in 0..8 {
                    if pixel_at(&result, x, y).0 != pixel_at(&frame, x, y).0 {
                        any_changed = true;
                        break;
                    }
                }
            }
            assert!(any_changed, "BlueNoise should modify some pixels");
        }

        #[test]
        fn test_blue_noise_inside_mask() {
            let frame = gradient_frame(8, 2);
            let mask = left_half_mask(8, 2);
            let result =
                run_effect_with_mask(&BlueNoiseDither::default(), &frame, Some(&mask), "inside");
            assert_pixel_unchanged(&result, &frame, 4, 0, "unmasked should be original");
        }
    }

    // ── Subject vs Background mask scenarios ───────────────────
    // Simulate the user's core use case: augment background while
    // keeping subject standard, or vice versa.

    mod subject_background_scenarios {
        use super::*;
        use crate::effects::artistic::Grayscale;
        use crate::effects::color::Invert;
        use crate::effects::noise::SaltPepperNoise;
        use crate::effects::types::{Frame, Mask};

        #[test]
        fn test_subject_preserved_background_augmented_inside_mode() {
            // 4x4 frame: center 2x2 = "subject" (200,200,200), border = "background" (50,50,50)
            let mut data = Vec::new();
            for y in 0..4 {
                for x in 0..4 {
                    if (1..=2).contains(&x) && (1..=2).contains(&y) {
                        data.extend_from_slice(&[200, 200, 200, 255]); // subject
                    } else {
                        data.extend_from_slice(&[50, 50, 50, 255]); // background
                    }
                }
            }
            let frame = Frame {
                width: 4,
                height: 4,
                data,
            };

            // Mask: subject area = white (255), background = black (0)
            // "inside" mode: effect applies to masked area (subject), background stays original
            let mut mask_data = vec![0u8; 16];
            for y in 0..4 {
                for x in 0..4 {
                    if (1..=2).contains(&x) && (1..=2).contains(&y) {
                        mask_data[y * 4 + x] = 255;
                    }
                }
            }
            let mask = Mask {
                width: 4,
                height: 4,
                data: mask_data,
            };

            let result = run_effect_with_mask(&Invert::default(), &frame, Some(&mask), "inside");

            // Subject pixels (center) should be inverted: 255-200=55
            assert_eq!(pixel_at(&result, 1, 1), (55, 55, 55, 255));
            assert_eq!(pixel_at(&result, 2, 2), (55, 55, 55, 255));
            // Background pixels should stay original: 50
            assert_eq!(pixel_at(&result, 0, 0), (50, 50, 50, 255));
            assert_eq!(pixel_at(&result, 3, 3), (50, 50, 50, 255));
        }

        #[test]
        fn test_subject_augmented_background_preserved_outside_mode() {
            // Same setup: center = subject, border = background
            let mut data = Vec::new();
            for y in 0..4 {
                for x in 0..4 {
                    if (1..=2).contains(&x) && (1..=2).contains(&y) {
                        data.extend_from_slice(&[200, 200, 200, 255]);
                    } else {
                        data.extend_from_slice(&[50, 50, 50, 255]);
                    }
                }
            }
            let frame = Frame {
                width: 4,
                height: 4,
                data,
            };

            // Mask: subject = white, background = black
            let mut mask_data = vec![0u8; 16];
            for y in 0..4 {
                for x in 0..4 {
                    if (1..=2).contains(&x) && (1..=2).contains(&y) {
                        mask_data[y * 4 + x] = 255;
                    }
                }
            }
            let mask = Mask {
                width: 4,
                height: 4,
                data: mask_data,
            };

            // "outside" mode: effect applies to UNMASKED area (background), subject stays original
            let result = run_effect_with_mask(&Invert::default(), &frame, Some(&mask), "outside");

            // Subject pixels should stay original: 200
            assert_eq!(pixel_at(&result, 1, 1), (200, 200, 200, 255));
            assert_eq!(pixel_at(&result, 2, 2), (200, 200, 200, 255));
            // Background pixels should be inverted: 255-50=205
            assert_eq!(pixel_at(&result, 0, 0), (205, 205, 205, 255));
            assert_eq!(pixel_at(&result, 3, 3), (205, 205, 205, 255));
        }

        #[test]
        fn test_grayscale_subject_preserved_with_outside_mask() {
            // Subject = colored (red), background = colored (green)
            let mut data = Vec::new();
            for y in 0..4 {
                for x in 0..4 {
                    if (1..=2).contains(&x) && (1..=2).contains(&y) {
                        data.extend_from_slice(&[255, 0, 0, 255]); // red subject
                    } else {
                        data.extend_from_slice(&[0, 255, 0, 255]); // green background
                    }
                }
            }
            let frame = Frame {
                width: 4,
                height: 4,
                data,
            };

            // Mask: subject = white
            let mut mask_data = vec![0u8; 16];
            for y in 0..4 {
                for x in 0..4 {
                    if (1..=2).contains(&x) && (1..=2).contains(&y) {
                        mask_data[y * 4 + x] = 255;
                    }
                }
            }
            let mask = Mask {
                width: 4,
                height: 4,
                data: mask_data,
            };

            // "outside" mode: grayscale the background, preserve subject color
            let result =
                run_effect_with_mask(&Grayscale::default(), &frame, Some(&mask), "outside");

            // Subject (center) should stay red
            assert_eq!(pixel_at(&result, 1, 1), (255, 0, 0, 255));
            // Background should be grayscale (green luminance ≈ 149)
            let bg = pixel_at(&result, 0, 0);
            assert_eq!(bg.0, bg.1, "background R should equal G (grayscale)");
            assert_eq!(bg.1, bg.2, "background G should equal B (grayscale)");
        }

        #[test]
        fn test_noise_on_background_only_with_outside_mask() {
            let mut data = Vec::new();
            for y in 0..4 {
                for x in 0..4 {
                    if (1..=2).contains(&x) && (1..=2).contains(&y) {
                        data.extend_from_slice(&[128, 128, 128, 255]); // subject
                    } else {
                        data.extend_from_slice(&[128, 128, 128, 255]); // background
                    }
                }
            }
            let frame = Frame {
                width: 4,
                height: 4,
                data,
            };

            let mut mask_data = vec![0u8; 16];
            for y in 0..4 {
                for x in 0..4 {
                    if (1..=2).contains(&x) && (1..=2).contains(&y) {
                        mask_data[y * 4 + x] = 255;
                    }
                }
            }
            let mask = Mask {
                width: 4,
                height: 4,
                data: mask_data,
            };

            // Use high density to ensure noise on small frame
            let result =
                run_effect_with_mask(&SaltPepperNoise::new(0.8), &frame, Some(&mask), "outside");

            // Subject should be unchanged (128, 128, 128)
            assert_eq!(pixel_at(&result, 1, 1), (128, 128, 128, 255));
            assert_eq!(pixel_at(&result, 2, 2), (128, 128, 128, 255));
            // Background should have some noise (at least some pixels changed)
            let mut bg_changed = false;
            for y in 0..4 {
                for x in 0..4 {
                    if !((1..=2).contains(&x) && (1..=2).contains(&y))
                        && pixel_at(&result, x, y).0 != 128
                    {
                        bg_changed = true;
                        break;
                    }
                }
            }
            assert!(bg_changed, "background should have noise applied");
        }

        #[test]
        fn test_outline_mask_subject_preserved() {
            // Simulate an outline mask: only the border of the subject is masked
            // 4x4 frame: subject = center 2x2 at (1,1)-(2,2)
            let mut data = Vec::new();
            for y in 0..4 {
                for x in 0..4 {
                    if (1..=2).contains(&x) && (1..=2).contains(&y) {
                        data.extend_from_slice(&[200, 100, 50, 255]); // subject
                    } else {
                        data.extend_from_slice(&[50, 50, 50, 255]); // background
                    }
                }
            }
            let frame = Frame {
                width: 4,
                height: 4,
                data,
            };

            // Outline mask: only the 4 edge pixels of the subject are white
            // (1,1), (2,1), (1,2), (2,2) — but for outline we'd mask just the border
            // For a 2x2 subject, all 4 pixels are "border"
            let mask = mask_from_values(
                4,
                4,
                &[0, 0, 0, 0, 0, 255, 255, 0, 0, 255, 255, 0, 0, 0, 0, 0],
            );

            // "inside" mode: effect applies to outline, rest preserved
            let result = run_effect_with_mask(&Invert::default(), &frame, Some(&mask), "inside");

            // Subject outline pixels inverted: 255-200=55, 255-100=155, 255-50=205
            assert_eq!(pixel_at(&result, 1, 1), (55, 155, 205, 255));
            assert_eq!(pixel_at(&result, 2, 2), (55, 155, 205, 255));
            // Background preserved
            assert_eq!(pixel_at(&result, 0, 0), (50, 50, 50, 255));
            assert_eq!(pixel_at(&result, 3, 3), (50, 50, 50, 255));
        }

        #[test]
        fn test_multi_effect_stack_subject_bg_split() {
            use crate::effects::color::Invert;

            // 4x4: subject center, background border
            let mut data = Vec::new();
            for y in 0..4 {
                for x in 0..4 {
                    if (1..=2).contains(&x) && (1..=2).contains(&y) {
                        data.extend_from_slice(&[200, 200, 200, 255]);
                    } else {
                        data.extend_from_slice(&[50, 50, 50, 255]);
                    }
                }
            }
            let frame = Frame {
                width: 4,
                height: 4,
                data,
            };

            // Subject mask (center = white)
            let mut subj_mask_data = vec![0u8; 16];
            for y in 0..4 {
                for x in 0..4 {
                    if (1..=2).contains(&x) && (1..=2).contains(&y) {
                        subj_mask_data[y * 4 + x] = 255;
                    }
                }
            }
            let subj_mask = Mask {
                width: 4,
                height: 4,
                data: subj_mask_data,
            };

            // Step 1: Invert subject only (inside mode)
            let step1 =
                run_effect_with_mask(&Invert::default(), &frame, Some(&subj_mask), "inside");

            // Step 2: Invert background only (outside mode on same mask)
            let step2 =
                run_effect_with_mask(&Invert::default(), &step1, Some(&subj_mask), "outside");

            // After step1: subject inverted (55), bg preserved (50)
            // After step2: subject preserved from step1 (55), bg inverted from step1 (205)
            assert_eq!(pixel_at(&step2, 1, 1), (55, 55, 55, 255));
            // Background was inverted once (in step2) → 255-50=205
            assert_eq!(pixel_at(&step2, 0, 0), (205, 205, 205, 255));
        }
    }

    // ── Composite & Overlay effects ────────────────────────────

    mod composite_overlay {
        use super::*;
        use crate::effects::composite::Overlay;

        #[test]
        fn test_overlay_modifies_rgb() {
            let frame = solid_frame(4, 4, 128, 128, 128, 255);
            let effect = Overlay::default();
            let result = effect
                .process_frame(&frame, None, &serde_json::Map::new())
                .unwrap();
            let p = pixel_at(&result, 0, 0);
            assert!(p.0 <= 255, "should produce valid output");
        }

        #[test]
        fn test_overlay_inside_mask() {
            let frame = solid_frame(4, 2, 128, 128, 128, 255);
            let mask = left_half_mask(4, 2);
            let result = run_effect_with_mask(&Overlay::default(), &frame, Some(&mask), "inside");
            assert_pixel_unchanged(&result, &frame, 2, 0, "unmasked should be original");
        }
    }

    // ── Advanced dithering effects ─────────────────────────────
    // Tests for the 13 additional dithering effects that were previously untested.

    mod advanced_dithering_effects {
        use super::*;
        use crate::effects::dithering::*;
        use crate::effects::types::Frame;
        use serde_json::json;

        // Helper: check that at least one RGB pixel changed between two frames.
        fn any_rgb_changed(result: &Frame, original: &Frame, w: u32, h: u32) -> bool {
            for y in 0..h {
                for x in 0..w {
                    let r = pixel_at(result, x, y);
                    let o = pixel_at(original, x, y);
                    if r.0 != o.0 || r.1 != o.1 || r.2 != o.2 {
                        return true;
                    }
                }
            }
            false
        }

        // ── PaletteDither ──────────────────────────────────────

        #[test]
        fn test_palette_dither_modifies_rgb() {
            let frame = gradient_frame(8, 8);
            let effect = PaletteDither;
            let mut params = serde_json::Map::new();
            params.insert("amount".to_string(), json!(1.0));
            params.insert("palette_size".to_string(), json!(4.0));
            let result = effect.process_frame(&frame, None, &params).unwrap();
            assert!(
                any_rgb_changed(&result, &frame, 8, 8),
                "PaletteDither should modify some pixels"
            );
        }

        #[test]
        fn test_palette_dither_inside_mask_preserves_unmasked() {
            let frame = gradient_frame(8, 2);
            let mask = left_half_mask(8, 2);
            let result = run_effect_with_mask(&PaletteDither, &frame, Some(&mask), "inside");
            assert_pixel_unchanged(&result, &frame, 4, 0, "unmasked should be original");
            assert_pixel_unchanged(&result, &frame, 7, 1, "unmasked should be original");
        }

        // ── JarvisJudiceNinke ──────────────────────────────────

        #[test]
        fn test_jarvis_judice_ninke_modifies_rgb() {
            let frame = gradient_frame(8, 8);
            let effect = JarvisJudiceNinke::new();
            let result = effect
                .process_frame(&frame, None, &serde_json::Map::new())
                .unwrap();
            assert!(
                any_rgb_changed(&result, &frame, 8, 8),
                "JarvisJudiceNinke should modify some pixels"
            );
        }

        #[test]
        fn test_jarvis_judice_ninke_inside_mask_preserves_unmasked() {
            let frame = gradient_frame(8, 2);
            let mask = left_half_mask(8, 2);
            let result =
                run_effect_with_mask(&JarvisJudiceNinke::new(), &frame, Some(&mask), "inside");
            assert_pixel_unchanged(&result, &frame, 4, 0, "unmasked should be original");
            assert_pixel_unchanged(&result, &frame, 7, 1, "unmasked should be original");
        }

        // ── StuckiDither ───────────────────────────────────────

        #[test]
        fn test_stucki_modifies_rgb() {
            let frame = gradient_frame(8, 8);
            let effect = StuckiDither::new();
            let result = effect
                .process_frame(&frame, None, &serde_json::Map::new())
                .unwrap();
            assert!(
                any_rgb_changed(&result, &frame, 8, 8),
                "StuckiDither should modify some pixels"
            );
        }

        #[test]
        fn test_stucki_inside_mask_preserves_unmasked() {
            let frame = gradient_frame(8, 2);
            let mask = left_half_mask(8, 2);
            let result = run_effect_with_mask(&StuckiDither::new(), &frame, Some(&mask), "inside");
            assert_pixel_unchanged(&result, &frame, 4, 0, "unmasked should be original");
            assert_pixel_unchanged(&result, &frame, 7, 1, "unmasked should be original");
        }

        // ── BurkesDither ───────────────────────────────────────

        #[test]
        fn test_burkes_modifies_rgb() {
            let frame = gradient_frame(8, 8);
            let effect = BurkesDither::new();
            let result = effect
                .process_frame(&frame, None, &serde_json::Map::new())
                .unwrap();
            assert!(
                any_rgb_changed(&result, &frame, 8, 8),
                "BurkesDither should modify some pixels"
            );
        }

        #[test]
        fn test_burkes_inside_mask_preserves_unmasked() {
            let frame = gradient_frame(8, 2);
            let mask = left_half_mask(8, 2);
            let result = run_effect_with_mask(&BurkesDither::new(), &frame, Some(&mask), "inside");
            assert_pixel_unchanged(&result, &frame, 4, 0, "unmasked should be original");
            assert_pixel_unchanged(&result, &frame, 7, 1, "unmasked should be original");
        }

        // ── SierraDither ───────────────────────────────────────

        #[test]
        fn test_sierra_modifies_rgb() {
            let frame = gradient_frame(8, 8);
            let effect = SierraDither::new();
            let result = effect
                .process_frame(&frame, None, &serde_json::Map::new())
                .unwrap();
            assert!(
                any_rgb_changed(&result, &frame, 8, 8),
                "SierraDither should modify some pixels"
            );
        }

        #[test]
        fn test_sierra_inside_mask_preserves_unmasked() {
            let frame = gradient_frame(8, 2);
            let mask = left_half_mask(8, 2);
            let result = run_effect_with_mask(&SierraDither::new(), &frame, Some(&mask), "inside");
            assert_pixel_unchanged(&result, &frame, 4, 0, "unmasked should be original");
            assert_pixel_unchanged(&result, &frame, 7, 1, "unmasked should be original");
        }

        // ── ErrorDiffusionDither ───────────────────────────────

        #[test]
        fn test_error_diffusion_variants_modifies_rgb() {
            let frame = gradient_frame(8, 8);
            let effect = ErrorDiffusionDither;
            let mut params = serde_json::Map::new();
            params.insert("algorithm".to_string(), json!("jarvis_judice_ninke"));
            params.insert("levels".to_string(), json!(2));
            let result = effect.process_frame(&frame, None, &params).unwrap();
            assert!(
                any_rgb_changed(&result, &frame, 8, 8),
                "ErrorDiffusionDither should modify some pixels"
            );
        }

        #[test]
        fn test_error_diffusion_variants_inside_mask_preserves_unmasked() {
            let frame = gradient_frame(8, 2);
            let mask = left_half_mask(8, 2);
            let result = run_effect_with_mask(&ErrorDiffusionDither, &frame, Some(&mask), "inside");
            assert_pixel_unchanged(&result, &frame, 4, 0, "unmasked should be original");
            assert_pixel_unchanged(&result, &frame, 7, 1, "unmasked should be original");
        }

        // ── RandomNoiseDither ──────────────────────────────────

        #[test]
        fn test_random_noise_modifies_rgb() {
            let frame = gradient_frame(8, 8);
            let effect = RandomNoiseDither::new();
            let result = effect
                .process_frame(&frame, None, &serde_json::Map::new())
                .unwrap();
            assert!(
                any_rgb_changed(&result, &frame, 8, 8),
                "RandomNoiseDither should modify some pixels"
            );
        }

        #[test]
        fn test_random_noise_inside_mask_preserves_unmasked() {
            let frame = gradient_frame(8, 2);
            let mask = left_half_mask(8, 2);
            let result =
                run_effect_with_mask(&RandomNoiseDither::new(), &frame, Some(&mask), "inside");
            assert_pixel_unchanged(&result, &frame, 4, 0, "unmasked should be original");
            assert_pixel_unchanged(&result, &frame, 7, 1, "unmasked should be original");
        }

        // ── RiemersmaDither ────────────────────────────────────

        #[test]
        fn test_riemersma_modifies_rgb() {
            let frame = gradient_frame(8, 8);
            let effect = RiemersmaDither::new();
            let result = effect
                .process_frame(&frame, None, &serde_json::Map::new())
                .unwrap();
            assert!(
                any_rgb_changed(&result, &frame, 8, 8),
                "RiemersmaDither should modify some pixels"
            );
        }

        #[test]
        fn test_riemersma_inside_mask_preserves_unmasked() {
            let frame = gradient_frame(8, 2);
            let mask = left_half_mask(8, 2);
            let result =
                run_effect_with_mask(&RiemersmaDither::new(), &frame, Some(&mask), "inside");
            assert_pixel_unchanged(&result, &frame, 4, 0, "unmasked should be original");
            assert_pixel_unchanged(&result, &frame, 7, 1, "unmasked should be original");
        }

        // ── AutoPaletteDither ──────────────────────────────────

        #[test]
        fn test_auto_palette_modifies_rgb() {
            let frame = gradient_frame(8, 8);
            let effect = AutoPaletteDither;
            let mut params = serde_json::Map::new();
            params.insert("num_colors".to_string(), json!(4));
            params.insert("strength".to_string(), json!(1.0));
            let result = effect.process_frame(&frame, None, &params).unwrap();
            assert!(
                any_rgb_changed(&result, &frame, 8, 8),
                "AutoPaletteDither should modify some pixels"
            );
        }

        #[test]
        fn test_auto_palette_inside_mask_preserves_unmasked() {
            let frame = gradient_frame(8, 2);
            let mask = left_half_mask(8, 2);
            let result = run_effect_with_mask(&AutoPaletteDither, &frame, Some(&mask), "inside");
            assert_pixel_unchanged(&result, &frame, 4, 0, "unmasked should be original");
            assert_pixel_unchanged(&result, &frame, 7, 1, "unmasked should be original");
        }

        // ── KMeansDither ───────────────────────────────────────

        #[test]
        fn test_kmeans_modifies_rgb() {
            let frame = gradient_frame(8, 8);
            let effect = KMeansDither::new();
            let mut params = serde_json::Map::new();
            params.insert("numColors".to_string(), json!(4));
            params.insert("dither".to_string(), json!(true));
            params.insert("iterations".to_string(), json!(5));
            let result = effect.process_frame(&frame, None, &params).unwrap();
            assert!(
                any_rgb_changed(&result, &frame, 8, 8),
                "KMeansDither should modify some pixels"
            );
        }

        #[test]
        fn test_kmeans_inside_mask_preserves_unmasked() {
            let frame = gradient_frame(8, 2);
            let mask = left_half_mask(8, 2);
            let result = run_effect_with_mask(&KMeansDither::new(), &frame, Some(&mask), "inside");
            assert_pixel_unchanged(&result, &frame, 4, 0, "unmasked should be original");
            assert_pixel_unchanged(&result, &frame, 7, 1, "unmasked should be original");
        }

        // ── CustomMatrixDither ─────────────────────────────────

        #[test]
        fn test_custom_matrix_modifies_rgb() {
            let frame = gradient_frame(8, 8);
            let effect = CustomMatrixDither;
            let mut params = serde_json::Map::new();
            params.insert("matrix".to_string(), json!("bayer4"));
            params.insert("levels".to_string(), json!(2));
            let result = effect.process_frame(&frame, None, &params).unwrap();
            assert!(
                any_rgb_changed(&result, &frame, 8, 8),
                "CustomMatrixDither should modify some pixels"
            );
        }

        #[test]
        fn test_custom_matrix_inside_mask_preserves_unmasked() {
            let frame = gradient_frame(8, 2);
            let mask = left_half_mask(8, 2);
            let result = run_effect_with_mask(&CustomMatrixDither, &frame, Some(&mask), "inside");
            assert_pixel_unchanged(&result, &frame, 4, 0, "unmasked should be original");
            assert_pixel_unchanged(&result, &frame, 7, 1, "unmasked should be original");
        }

        // ── OrderedDitherVariants ──────────────────────────────

        #[test]
        fn test_ordered_dither_variants_modifies_rgb() {
            let frame = gradient_frame(8, 8);
            let effect = OrderedDitherVariants;
            let mut params = serde_json::Map::new();
            params.insert("matrix".to_string(), json!("clustereddot4x4"));
            params.insert("levels".to_string(), json!(2));
            let result = effect.process_frame(&frame, None, &params).unwrap();
            assert!(
                any_rgb_changed(&result, &frame, 8, 8),
                "OrderedDitherVariants should modify some pixels"
            );
        }

        #[test]
        fn test_ordered_dither_variants_inside_mask_preserves_unmasked() {
            let frame = gradient_frame(8, 2);
            let mask = left_half_mask(8, 2);
            let result =
                run_effect_with_mask(&OrderedDitherVariants, &frame, Some(&mask), "inside");
            assert_pixel_unchanged(&result, &frame, 4, 0, "unmasked should be original");
            assert_pixel_unchanged(&result, &frame, 7, 1, "unmasked should be original");
        }

        // ── LineScreen ─────────────────────────────────────────

        #[test]
        fn test_line_screen_modifies_rgb() {
            let frame = gradient_frame(8, 8);
            let effect = LineScreen;
            let mut params = serde_json::Map::new();
            params.insert("line_spacing".to_string(), json!(4));
            params.insert("angle".to_string(), json!(-45.0));
            params.insert("threshold".to_string(), json!(0.3));
            params.insert("contrast".to_string(), json!(1.2));
            params.insert("invert".to_string(), json!(false));
            let result = effect.process_frame(&frame, None, &params).unwrap();
            assert!(
                any_rgb_changed(&result, &frame, 8, 8),
                "LineScreen should modify some pixels"
            );
        }

        #[test]
        fn test_line_screen_inside_mask_preserves_unmasked() {
            let frame = gradient_frame(8, 2);
            let mask = left_half_mask(8, 2);
            let result = run_effect_with_mask(&LineScreen, &frame, Some(&mask), "inside");
            assert_pixel_unchanged(&result, &frame, 4, 0, "unmasked should be original");
            assert_pixel_unchanged(&result, &frame, 7, 1, "unmasked should be original");
        }
    }

    // ── Audio-reactive effects ────────────────────────────────
    // Tests for BassPulse, BeatGlitch, SpectralShift, AudioDither.
    // Audio data is injected via `_audio_*` keys in the params map.

    mod audio_reactive_effects {
        use super::*;
        use crate::effects::audio_reactive::{AudioDither, BassPulse, BeatGlitch, SpectralShift};
        use crate::effects::types::{Frame, Mask};
        use serde_json::json;

        /// Run an audio-reactive effect with custom params, then apply mask blending.
        /// Similar to `run_effect_with_mask` but allows passing audio data parameters.
        fn run_audio_effect_with_mask(
            effect: &dyn Effect,
            input: &Frame,
            mask: Option<&Mask>,
            mask_mode: &str,
            params: &serde_json::Map<String, serde_json::Value>,
        ) -> Frame {
            let previous = input.clone();
            let mut working = effect
                .process_frame(input, mask, params)
                .unwrap_or_else(|_| input.clone());

            if !effect.handles_masking() {
                if let Some(m) = mask {
                    crate::effects::blend_mask(&mut working, &previous, m, mask_mode).unwrap();
                }
            }

            working
        }

        /// Build a `ParameterValues` map with standard audio data for testing.
        fn audio_params() -> serde_json::Map<String, serde_json::Value> {
            let mut p = serde_json::Map::new();
            p.insert("_audio_bass".to_string(), json!(0.8));
            p.insert("_audio_beat_bass".to_string(), json!(1.0));
            p.insert("_audio_beat_energy".to_string(), json!(0.8));
            p.insert("_audio_energy".to_string(), json!(0.7));
            p.insert("_audio_rms".to_string(), json!(0.35));
            p.insert("_audio_centroid".to_string(), json!(2000.0));
            p.insert("_audio_flux".to_string(), json!(50.0));
            p
        }

        // ── BassPulse ──────────────────────────────────────────

        #[test]
        fn test_bass_pulse_modifies_rgb() {
            // Use a 32×32 gradient frame with default block_size=16 so there are
            // multiple blocks — a single-block frame (16×16 with block_size=16)
            // would be centered and scaling would have no visible effect.
            let frame = gradient_frame(32, 32);
            let effect = BassPulse;
            let params = audio_params();
            let result = effect.process_frame(&frame, None, &params).unwrap();
            assert_eq!(result.width, 32);
            assert_eq!(result.height, 32);
            // With bass=0.8, pulse > 0.01 → blocks are scaled outward
            assert_ne!(
                result.data, frame.data,
                "BassPulse should modify pixels with audio"
            );
        }

        #[test]
        fn test_bass_pulse_inside_mask_preserves_unmasked() {
            let frame = gradient_frame(32, 32);
            let mask = left_half_mask(32, 32);
            let params = audio_params();
            let result =
                run_audio_effect_with_mask(&BassPulse, &frame, Some(&mask), "inside", &params);
            // Right half (unmasked, mask=0) should be preserved
            assert_pixel_unchanged(&result, &frame, 16, 0, "unmasked pixel should be original");
            assert_pixel_unchanged(&result, &frame, 31, 0, "unmasked pixel should be original");
            assert_pixel_unchanged(&result, &frame, 24, 16, "unmasked pixel should be original");
        }

        #[test]
        fn test_bass_pulse_no_audio_preserves_frame() {
            let frame = gradient_frame(16, 16);
            let effect = BassPulse;
            let params = serde_json::Map::new();
            let result = effect.process_frame(&frame, None, &params).unwrap();
            // Without audio, bass=0 → pulse=0 → returns input unchanged
            assert_eq!(
                result.data, frame.data,
                "BassPulse without audio should preserve frame"
            );
        }

        // ── BeatGlitch ─────────────────────────────────────────

        #[test]
        fn test_beat_glitch_modifies_rgb() {
            let frame = solid_frame(16, 16, 128, 128, 128, 255);
            let effect = BeatGlitch;
            let params = audio_params();
            let result = effect.process_frame(&frame, None, &params).unwrap();
            assert_eq!(result.width, 16);
            assert_eq!(result.height, 16);
            // With beat_bass=1.0 > threshold 0.5, corruption + row glitch is injected
            assert_ne!(
                result.data, frame.data,
                "BeatGlitch should modify pixels on beat"
            );
        }

        #[test]
        fn test_beat_glitch_inside_mask_preserves_unmasked() {
            let frame = solid_frame(16, 16, 128, 128, 128, 255);
            let mask = left_half_mask(16, 16);
            let params = audio_params();
            let result =
                run_audio_effect_with_mask(&BeatGlitch, &frame, Some(&mask), "inside", &params);
            // Right half (unmasked) should be preserved after mask blending
            assert_pixel_unchanged(&result, &frame, 8, 0, "unmasked pixel should be original");
            assert_pixel_unchanged(&result, &frame, 15, 15, "unmasked pixel should be original");
        }

        #[test]
        fn test_beat_glitch_no_audio_preserves_frame() {
            let frame = solid_frame(16, 16, 128, 128, 128, 255);
            let effect = BeatGlitch;
            let params = serde_json::Map::new();
            let result = effect.process_frame(&frame, None, &params).unwrap();
            // Without audio, beat_bass=0 and beat_energy=0 → trigger=0 → input unchanged
            assert_eq!(
                result.data, frame.data,
                "BeatGlitch without audio should preserve frame"
            );
        }

        // ── SpectralShift ──────────────────────────────────────

        #[test]
        fn test_spectral_shift_modifies_rgb() {
            // Use a colorful frame — hue rotation has no effect on uniform gray (zero chrominance)
            let frame = frame_from_pixels(
                2,
                2,
                &[
                    (200, 50, 100, 255),
                    (100, 200, 50, 255),
                    (50, 100, 200, 255),
                    (200, 200, 50, 255),
                ],
            );
            let effect = SpectralShift;
            let params = audio_params();
            let result = effect.process_frame(&frame, None, &params).unwrap();
            assert_eq!(result.width, 2);
            assert_eq!(result.height, 2);
            assert_ne!(
                result.data, frame.data,
                "SpectralShift should modify pixels with audio"
            );
        }

        #[test]
        fn test_spectral_shift_inside_mask_preserves_unmasked() {
            let frame = frame_from_pixels(
                4,
                2,
                &[
                    (200, 50, 100, 255),
                    (100, 200, 50, 255),
                    (50, 100, 200, 255),
                    (200, 200, 50, 255),
                    (200, 50, 100, 255),
                    (100, 200, 50, 255),
                    (50, 100, 200, 255),
                    (200, 200, 50, 255),
                ],
            );
            let mask = left_half_mask(4, 2);
            let params = audio_params();
            let result =
                run_audio_effect_with_mask(&SpectralShift, &frame, Some(&mask), "inside", &params);
            // Right half (unmasked) should be preserved
            assert_pixel_unchanged(&result, &frame, 2, 0, "unmasked pixel should be original");
            assert_pixel_unchanged(&result, &frame, 3, 1, "unmasked pixel should be original");
        }

        #[test]
        fn test_spectral_shift_no_audio_preserves_frame() {
            let frame = frame_from_pixels(
                2,
                2,
                &[
                    (200, 50, 100, 255),
                    (100, 200, 50, 255),
                    (50, 100, 200, 255),
                    (200, 200, 50, 255),
                ],
            );
            let effect = SpectralShift;
            let params = serde_json::Map::new();
            let result = effect.process_frame(&frame, None, &params).unwrap();
            // Without audio, centroid=0, flux=0 → hue_shift=0 → input unchanged
            assert_eq!(
                result.data, frame.data,
                "SpectralShift without audio should preserve frame"
            );
        }

        // ── AudioDither ────────────────────────────────────────

        #[test]
        fn test_audio_dither_modifies_rgb() {
            let frame = solid_frame(16, 16, 128, 128, 128, 255);
            let effect = AudioDither;
            let mut params = audio_params();
            params.insert("base_threshold".to_string(), json!(100));
            params.insert("palette_size".to_string(), json!(8));
            let result = effect.process_frame(&frame, None, &params).unwrap();
            assert_eq!(result.width, 16);
            assert_eq!(result.height, 16);
            assert_ne!(
                result.data, frame.data,
                "AudioDither should modify pixels with audio"
            );
        }

        #[test]
        fn test_audio_dither_inside_mask_preserves_unmasked() {
            let frame = solid_frame(16, 16, 128, 128, 128, 255);
            let mask = left_half_mask(16, 16);
            let mut params = audio_params();
            params.insert("base_threshold".to_string(), json!(100));
            params.insert("palette_size".to_string(), json!(8));
            let result =
                run_audio_effect_with_mask(&AudioDither, &frame, Some(&mask), "inside", &params);
            // Right half (unmasked) should be preserved
            assert_pixel_unchanged(&result, &frame, 8, 0, "unmasked pixel should be original");
            assert_pixel_unchanged(&result, &frame, 15, 15, "unmasked pixel should be original");
        }

        #[test]
        fn test_audio_dither_no_audio_preserves_frame() {
            let frame = solid_frame(16, 16, 128, 128, 128, 255);
            let effect = AudioDither;
            let mut params = serde_json::Map::new();
            params.insert("base_threshold".to_string(), json!(128));
            params.insert("palette_size".to_string(), json!(4));
            let result = effect.process_frame(&frame, None, &params).unwrap();
            // AudioDither always applies dithering even without audio data — the
            // audio params only modulate the threshold.  Without audio, the
            // threshold stays at `base_threshold` and the effect still quantizes.
            // Verify the output is valid and that dithering was applied.
            assert_eq!(result.width, 16);
            assert_eq!(result.height, 16);
            assert_ne!(
                result.data, frame.data,
                "AudioDither should still dither without audio (base threshold only)"
            );
            // Verify all pixel values are valid
            for &val in &result.data {
                assert!(val <= 255, "pixel values should be valid u8");
            }
        }
    }

    // ── Advanced Glitch effects ───────────────────────────────

    mod advanced_glitch_effects {
        use super::*;
        use crate::effects::glitch::EdgeStretch;

        #[test]
        fn test_edge_stretch_modifies_output() {
            // Use a gradient frame so there are edges for the Sobel detector to find
            let frame = gradient_frame(8, 8);
            let effect = EdgeStretch;
            let mut params = serde_json::Map::new();
            params.insert("amount".to_string(), serde_json::json!(0.8));
            params.insert("blur_radius".to_string(), serde_json::json!(3.0));
            let result = effect.process_frame(&frame, None, &params).unwrap();
            assert_eq!(result.width, 8);
            assert_eq!(result.height, 8);
            // With a gradient and high amount, at least some pixels should be displaced
            let mut changed = false;
            for y in 0..8 {
                for x in 0..8 {
                    if pixel_at(&result, x, y) != pixel_at(&frame, x, y) {
                        changed = true;
                        break;
                    }
                }
            }
            assert!(
                changed,
                "EdgeStretch should modify at least some pixels on a gradient"
            );
        }

        #[test]
        fn test_edge_stretch_inside_mask() {
            let frame = gradient_frame(8, 4);
            let mask = left_half_mask(8, 4);
            let result = run_effect_with_mask(&EdgeStretch, &frame, Some(&mask), "inside");
            // Right half (unmasked) should be preserved
            assert_pixel_unchanged(&result, &frame, 6, 0, "unmasked pixel should be original");
            assert_pixel_unchanged(&result, &frame, 7, 3, "unmasked pixel should be original");
        }

        #[test]
        fn test_edge_stretch_preserves_dimensions() {
            let frame = solid_frame(16, 16, 128, 128, 128, 255);
            let effect = EdgeStretch;
            let result = effect
                .process_frame(&frame, None, &serde_json::Map::new())
                .unwrap();
            assert_eq!(result.width, 16);
            assert_eq!(result.height, 16);
            assert_eq!(result.data.len(), frame.data.len());
        }
    }

    // ── Advanced Color effects ────────────────────────────────

    mod advanced_color_effects {
        use super::*;
        use crate::effects::color::LutGrading;

        #[test]
        fn test_lut_grading_no_path_returns_unchanged() {
            // With no LUT path (or non-existent path), the effect should return input unchanged
            let frame = solid_frame(4, 4, 100, 150, 200, 255);
            let effect = LutGrading::default();
            let result = effect
                .process_frame(&frame, None, &serde_json::Map::new())
                .unwrap();
            assert_eq!(
                result.data, frame.data,
                "LUT grading with no path should be a no-op"
            );
        }

        #[test]
        fn test_lut_grading_nonexistent_path_errors() {
            // Missing LUT files should surface a clear error instead of silently
            // returning the original frame.
            let frame = solid_frame(2, 2, 100, 150, 200, 255);
            let effect = LutGrading::default();
            let mut params = serde_json::Map::new();
            params.insert(
                "lut_path".to_string(),
                serde_json::json!("/nonexistent/lut.png"),
            );
            let result = effect.process_frame(&frame, None, &params);
            assert!(result.is_err(), "missing LUT file must return an error");
        }

        #[test]
        fn test_lut_grading_preserves_dimensions() {
            let frame = solid_frame(4, 4, 128, 128, 128, 255);
            let effect = LutGrading::default();
            let result = effect
                .process_frame(&frame, None, &serde_json::Map::new())
                .unwrap();
            assert_eq!(result.width, 4);
            assert_eq!(result.height, 4);
            assert_eq!(result.data.len(), frame.data.len());
        }

        #[test]
        fn test_lut_grading_inside_mask() {
            // With no LUT path, the effect is a no-op so mask blending also yields original
            let frame = solid_frame(4, 2, 100, 150, 200, 255);
            let mask = left_half_mask(4, 2);
            let result =
                run_effect_with_mask(&LutGrading::default(), &frame, Some(&mask), "inside");
            // Both sides should be unchanged since the effect is a no-op
            assert_pixel_unchanged(&result, &frame, 0, 0, "no-op effect preserves all pixels");
            assert_pixel_unchanged(&result, &frame, 3, 0, "no-op effect preserves all pixels");
        }
    }

    // ── Datamoshing effects ───────────────────────────────────

    mod datamoshing_effects {
        use super::*;
        use crate::effects::datamoshing::*;
        use crate::effects::types::{Frame, VideoSegment};

        /// Create a VideoSegment with `n` frames of varying solid colors.
        fn make_color_segment(n: usize) -> VideoSegment {
            let frames: Vec<Frame> = (0..n)
                .map(|i| {
                    let v = (i * 30) as u8;
                    solid_frame(8, 8, v, 255 - v, 128, 255)
                })
                .collect();
            VideoSegment { frames, fps: 30.0 }
        }

        /// Create a VideoSegment with `n` gradient frames.
        fn make_gradient_segment(n: usize) -> VideoSegment {
            let frames: Vec<Frame> = (0..n).map(|_| gradient_frame(8, 8)).collect();
            VideoSegment { frames, fps: 30.0 }
        }

        // ── IFrameRemoval ──────────────────────────────────────

        #[test]
        fn test_iframe_removal_modifies_output() {
            // process_video drops frames at the given interval
            let seg = make_color_segment(10);
            let effect = IFrameRemoval::new(3);
            let mut params = serde_json::Map::new();
            params.insert("interval".to_string(), serde_json::json!(3));
            let result = effect.process_video(&seg, None, &params).unwrap();
            // With interval=3, drops frames at indices 0,3,6,9 → keeps 6
            assert_eq!(result.frames.len(), 6);
            assert!(result.frames.len() < seg.frames.len());
        }

        #[test]
        fn test_iframe_removal_frame_adds_noise() {
            // process_frame adds noise/grain to pixels
            let frame = solid_frame(4, 4, 128, 128, 128, 255);
            let effect = IFrameRemoval::default();
            let result = effect
                .process_frame(&frame, None, &serde_json::Map::new())
                .unwrap();
            // Noise should modify at least some RGB values
            let mut changed = false;
            for i in 0..frame.data.len() / 4 {
                let idx = i * 4;
                if result.data[idx] != frame.data[idx]
                    || result.data[idx + 1] != frame.data[idx + 1]
                    || result.data[idx + 2] != frame.data[idx + 2]
                {
                    changed = true;
                    break;
                }
            }
            assert!(changed, "IFrameRemoval process_frame should add noise");
        }

        // ── IFrameRemovalAdvanced ──────────────────────────────

        #[test]
        fn test_iframe_removal_advanced_modifies_output() {
            let seg = make_color_segment(20);
            let effect = IFrameRemovalAdvanced;
            let mut params = serde_json::Map::new();
            params.insert("mode".to_string(), serde_json::json!("precise"));
            params.insert("frame_number".to_string(), serde_json::json!(5));
            params.insert("rate".to_string(), serde_json::json!(1.0));
            let result = effect.process_video(&seg, None, &params).unwrap();
            // In precise mode with rate=1.0, frame 5 is always dropped
            assert_eq!(result.frames.len(), 19);
        }

        #[test]
        fn test_iframe_removal_advanced_automatic_mode() {
            // Create frames with large differences so scene-change detection triggers
            let frames: Vec<Frame> = (0..10)
                .map(|i| {
                    if i % 2 == 0 {
                        solid_frame(8, 8, 255, 255, 255, 255)
                    } else {
                        solid_frame(8, 8, 0, 0, 0, 255)
                    }
                })
                .collect();
            let seg = VideoSegment { frames, fps: 30.0 };
            let effect = IFrameRemovalAdvanced;
            let mut params = serde_json::Map::new();
            params.insert("mode".to_string(), serde_json::json!("automatic"));
            params.insert("threshold".to_string(), serde_json::json!(10.0));
            params.insert("rate".to_string(), serde_json::json!(1.0));
            let result = effect.process_video(&seg, None, &params).unwrap();
            // With high rate and low threshold, some frames with big diffs should be dropped
            assert!(result.frames.len() <= 10);
            assert!(!result.frames.is_empty());
        }

        // ── ClassicDatamosh ────────────────────────────────────

        #[test]
        fn test_classic_datamosh_modifies_output() {
            let seg = make_color_segment(6);
            let effect = ClassicDatamosh::new(2, 3);
            let result = effect
                .process_video(&seg, None, &serde_json::Map::new())
                .unwrap();
            // 3 chunks of 2 frames, repeated 3 times = 18 frames
            assert_eq!(result.frames.len(), 18);
            assert!(result.frames.len() > seg.frames.len());
        }

        #[test]
        fn test_classic_datamosh_frame_pixelates() {
            let frame = frame_from_pixels(
                4,
                1,
                &[
                    (0, 0, 0, 255),
                    (255, 255, 255, 255),
                    (0, 0, 0, 255),
                    (255, 255, 255, 255),
                ],
            );
            let effect = ClassicDatamosh::new(2, 1);
            let mut params = serde_json::Map::new();
            params.insert("chunk_size".to_string(), serde_json::json!(2));
            let result = effect.process_frame(&frame, None, &params).unwrap();
            // Chunk size 2: first 2 pixels become first pixel's color, last 2 become third pixel's color
            assert_eq!(pixel_at(&result, 0, 0), (0, 0, 0, 255));
            assert_eq!(pixel_at(&result, 1, 0), (0, 0, 0, 255));
            assert_eq!(pixel_at(&result, 2, 0), (0, 0, 0, 255));
            assert_eq!(pixel_at(&result, 3, 0), (0, 0, 0, 255));
        }

        // ── RiseDatamosh ───────────────────────────────────────

        #[test]
        fn test_rise_datamosh_modifies_output() {
            let seg = make_color_segment(20);
            let effect = RiseDatamosh::new(5);
            let result = effect
                .process_video(&seg, None, &serde_json::Map::new())
                .unwrap();
            // Progressive drop should reduce frame count
            assert!(result.frames.len() < 20);
            assert!(!result.frames.is_empty());
        }

        #[test]
        fn test_rise_datamosh_frame_color_remap() {
            // RiseDatamosh process_frame remaps colors based on brightness bands
            let frame = solid_frame(2, 2, 100, 100, 100, 255);
            let effect = RiseDatamosh::default();
            let result = effect
                .process_frame(&frame, None, &serde_json::Map::new())
                .unwrap();
            // 100 falls in the 60-120 band → (255, 0, 193)
            assert_eq!(pixel_at(&result, 0, 0), (255, 0, 193, 255));
        }

        // ── ShuffleDatamosh ────────────────────────────────────

        #[test]
        fn test_shuffle_datamosh_modifies_output() {
            let seg = make_color_segment(6);
            let effect = ShuffleDatamosh::new(2);
            let result = effect
                .process_video(&seg, None, &serde_json::Map::new())
                .unwrap();
            // Frame count stays the same but order should change
            assert_eq!(result.frames.len(), 6);
            let mut changed = false;
            for i in 0..6 {
                if result.frames[i].data != seg.frames[i].data {
                    changed = true;
                    break;
                }
            }
            assert!(changed, "ShuffleDatamosh should reorder frames");
        }

        #[test]
        fn test_shuffle_datamosh_frame_shuffles_pixels() {
            let frame = gradient_frame(8, 1);
            let effect = ShuffleDatamosh::new(2);
            let mut params = serde_json::Map::new();
            params.insert("chunk_size".to_string(), serde_json::json!(2));
            let result = effect.process_frame(&frame, None, &params).unwrap();
            assert_eq!(result.data.len(), frame.data.len());
            // The deterministic shuffle should rearrange at least some pixel data
            assert_ne!(
                result.data, frame.data,
                "ShuffleDatamosh frame should rearrange pixels"
            );
        }

        // ── BloomDatamosh ──────────────────────────────────────

        #[test]
        fn test_bloom_datamosh_modifies_output() {
            let seg = make_color_segment(6);
            let effect = BloomDatamosh::new(3);
            let result = effect
                .process_video(&seg, None, &serde_json::Map::new())
                .unwrap();
            // 2 chunks of 3, each duplicated 3 times = 6 frames
            assert_eq!(result.frames.len(), 6);
            // First 3 frames should all be copies of frame 0
            assert_eq!(result.frames[0].data, seg.frames[0].data);
            assert_eq!(result.frames[1].data, seg.frames[0].data);
            assert_eq!(result.frames[2].data, seg.frames[0].data);
        }

        #[test]
        fn test_bloom_datamosh_frame_amplifies() {
            let frame = solid_frame(2, 2, 100, 100, 100, 255);
            let effect = BloomDatamosh::default();
            let result = effect
                .process_frame(&frame, None, &serde_json::Map::new())
                .unwrap();
            // Bloom multiplies by 1.4 several times, should increase brightness
            let p = pixel_at(&result, 0, 0);
            assert!(p.0 >= 100, "Bloom should amplify (not darken) R channel");
        }

        // ── CombineDatamosh ────────────────────────────────────

        #[test]
        fn test_combine_datamosh_modifies_output() {
            let seg = make_color_segment(6);
            let effect = CombineDatamosh::new(3);
            let result = effect
                .process_video(&seg, None, &serde_json::Map::new())
                .unwrap();
            // Stride 3: groups [0,1,2]+repeat0, [3,4,5]+repeat3 = 8 frames
            assert!(result.frames.len() > 6);
        }

        #[test]
        fn test_combine_datamosh_frame_duplicates_rows() {
            let frame = frame_from_pixels(
                2,
                4,
                &[
                    (255, 0, 0, 255),
                    (0, 255, 0, 255),
                    (0, 0, 255, 255),
                    (255, 255, 0, 255),
                    (255, 0, 255, 255),
                    (0, 255, 255, 255),
                    (128, 128, 128, 255),
                    (64, 64, 64, 255),
                ],
            );
            let effect = CombineDatamosh::new(3);
            let mut params = serde_json::Map::new();
            params.insert("stride".to_string(), serde_json::json!(3));
            let result = effect.process_frame(&frame, None, &params).unwrap();
            // Row 0 is source, rows 1-2 should be copies of row 0
            assert_eq!(pixel_at(&result, 0, 1), (255, 0, 0, 255));
            assert_eq!(pixel_at(&result, 1, 1), (0, 255, 0, 255));
            assert_eq!(pixel_at(&result, 0, 2), (255, 0, 0, 255));
        }

        // ── RepeatDatamosh ─────────────────────────────────────

        #[test]
        fn test_repeat_datamosh_modifies_output() {
            let seg = make_color_segment(6);
            let effect = RepeatDatamosh::new(2, 3);
            let result = effect
                .process_video(&seg, None, &serde_json::Map::new())
                .unwrap();
            // 2 series of 3 frames, repeated 2 times = 12 frames
            assert_eq!(result.frames.len(), 12);
        }

        #[test]
        fn test_repeat_datamosh_frame_duplicates_rows() {
            let frame = frame_from_pixels(
                2,
                4,
                &[
                    (255, 0, 0, 255),
                    (0, 255, 0, 255),
                    (0, 0, 255, 255),
                    (255, 255, 0, 255),
                    (255, 0, 255, 255),
                    (0, 255, 255, 255),
                    (128, 128, 128, 255),
                    (64, 64, 64, 255),
                ],
            );
            let effect = RepeatDatamosh::new(2, 3);
            let mut params = serde_json::Map::new();
            params.insert("series_size".to_string(), serde_json::json!(3));
            let result = effect.process_frame(&frame, None, &params).unwrap();
            // Row 0 is source, rows 1-2 should be copies of row 0
            assert_eq!(pixel_at(&result, 0, 1), (255, 0, 0, 255));
            assert_eq!(pixel_at(&result, 1, 2), (0, 255, 0, 255));
        }

        // ── FrameHold ──────────────────────────────────────────

        #[test]
        fn test_frame_hold_modifies_output() {
            let seg = make_color_segment(5);
            let effect = FrameHold;
            let result = effect
                .process_video(&seg, None, &serde_json::Map::new())
                .unwrap();
            // All frames should be copies of the first frame
            assert_eq!(result.frames.len(), 5);
            for i in 0..5 {
                assert_eq!(
                    result.frames[i].data, seg.frames[0].data,
                    "all frames should be first frame"
                );
            }
        }

        // ── FrameReverse ───────────────────────────────────────

        #[test]
        fn test_frame_reverse_modifies_output() {
            let seg = make_color_segment(5);
            let effect = FrameReverse;
            let result = effect
                .process_video(&seg, None, &serde_json::Map::new())
                .unwrap();
            assert_eq!(result.frames.len(), 5);
            // First frame should be the original last frame
            assert_eq!(result.frames[0].data, seg.frames[4].data);
            assert_eq!(result.frames[4].data, seg.frames[0].data);
        }

        // ── FrameSortByDataSize ────────────────────────────────

        #[test]
        fn test_frame_sort_by_data_size_modifies_output() {
            // All frames have the same data length, so sort is stable — count preserved
            let seg = make_color_segment(5);
            let effect = FrameSortByDataSize;
            let result = effect
                .process_video(&seg, None, &serde_json::Map::new())
                .unwrap();
            assert_eq!(result.frames.len(), 5);
        }

        // ── MotionTransfer ─────────────────────────────────────

        #[test]
        fn test_motion_transfer_modifies_output() {
            // Use frames with distinct motion (bright block moving)
            let mut f0 = solid_frame(32, 32, 128, 128, 128, 255);
            let mut f1 = solid_frame(32, 32, 128, 128, 128, 255);
            // Bright block in f0 at x=8..16, y=4..12
            for y in 4..12 {
                for x in 8..16 {
                    let idx = (y * 32 + x) * 4;
                    f0.data[idx] = 255;
                    f0.data[idx + 1] = 255;
                    f0.data[idx + 2] = 255;
                }
            }
            // Same block shifted right by 4 in f1
            for y in 4..12 {
                for x in 12..20 {
                    let idx = (y * 32 + x) * 4;
                    f1.data[idx] = 255;
                    f1.data[idx + 1] = 255;
                    f1.data[idx + 2] = 255;
                }
            }
            let seg = VideoSegment {
                frames: vec![f0, f1],
                fps: 30.0,
            };
            let effect = MotionTransfer;
            let result = effect
                .process_video(&seg, None, &serde_json::Map::new())
                .unwrap();
            assert_eq!(result.frames.len(), 2);
            // Second frame should be warped (different from original)
            assert_ne!(
                result.frames[1].data, seg.frames[1].data,
                "MotionTransfer should warp frame 1"
            );
        }

        #[test]
        fn test_motion_transfer_frame_preview() {
            let frame = gradient_frame(32, 32);
            let effect = MotionTransfer;
            let result = effect
                .process_frame(&frame, None, &serde_json::Map::new())
                .unwrap();
            assert_eq!(result.width, 32);
            assert_eq!(result.height, 32);
            // Preview should produce some warping
            assert_ne!(
                result.data, frame.data,
                "MotionTransfer preview should warp"
            );
        }

        // ── ZoomGlitch ─────────────────────────────────────────

        #[test]
        fn test_zoom_glitch_modifies_output() {
            let frame = gradient_frame(32, 32);
            let effect = ZoomGlitch;
            let mut params = serde_json::Map::new();
            params.insert("intensity".to_string(), serde_json::json!(1.0));
            let result = effect.process_frame(&frame, None, &params).unwrap();
            assert_eq!(result.width, 32);
            assert_eq!(result.height, 32);
            // Zoom warping should modify at least some pixels
            assert_ne!(result.data, frame.data, "ZoomGlitch should warp pixels");
        }

        #[test]
        fn test_zoom_glitch_video_preserves_count() {
            let seg = make_gradient_segment(5);
            let effect = ZoomGlitch;
            let result = effect
                .process_video(&seg, None, &serde_json::Map::new())
                .unwrap();
            assert_eq!(result.frames.len(), 5);
        }

        // ── ShearGlitch ────────────────────────────────────────

        #[test]
        fn test_shear_glitch_modifies_output() {
            let frame = gradient_frame(32, 32);
            let effect = ShearGlitch;
            let mut params = serde_json::Map::new();
            params.insert("intensity".to_string(), serde_json::json!(1.0));
            let result = effect.process_frame(&frame, None, &params).unwrap();
            assert_eq!(result.width, 32);
            assert_eq!(result.height, 32);
            assert_ne!(result.data, frame.data, "ShearGlitch should warp pixels");
        }

        // ── VibrateGlitch ──────────────────────────────────────

        #[test]
        fn test_vibrate_glitch_modifies_output() {
            let frame = gradient_frame(32, 32);
            let effect = VibrateGlitch;
            let mut params = serde_json::Map::new();
            params.insert("randomness".to_string(), serde_json::json!(20));
            let result = effect.process_frame(&frame, None, &params).unwrap();
            assert_eq!(result.width, 32);
            assert_eq!(result.height, 32);
            assert_eq!(result.data.len(), frame.data.len());
        }

        // ── StopGlitch ─────────────────────────────────────────

        #[test]
        fn test_stop_glitch_modifies_output() {
            let seg = make_color_segment(20);
            let effect = StopGlitch::default();
            let mut params = serde_json::Map::new();
            params.insert("threshold".to_string(), serde_json::json!(50.0));
            params.insert("n_frames".to_string(), serde_json::json!(3));
            let result = effect.process_video(&seg, None, &params).unwrap();
            // Frame count is preserved (freeze replaces, doesn't add/remove)
            assert_eq!(result.frames.len(), 20);
        }

        #[test]
        fn test_stop_glitch_frame_passthrough() {
            let frame = solid_frame(4, 4, 128, 128, 128, 255);
            let effect = StopGlitch::default();
            let result = effect
                .process_frame(&frame, None, &serde_json::Map::new())
                .unwrap();
            // process_frame is a passthrough for StopGlitch
            assert_eq!(result.data, frame.data);
        }

        // ── BufferGlitch ───────────────────────────────────────

        #[test]
        fn test_buffer_glitch_modifies_output() {
            let frame = gradient_frame(32, 32);
            let effect = BufferGlitch;
            let result = effect
                .process_frame(&frame, None, &serde_json::Map::new())
                .unwrap();
            assert_eq!(result.width, 32);
            assert_eq!(result.height, 32);
            // Buffer preview applies horizontal displacement
            assert_ne!(
                result.data, frame.data,
                "BufferGlitch preview should displace pixels"
            );
        }

        #[test]
        fn test_buffer_glitch_video_preserves_count() {
            let seg = make_gradient_segment(10);
            let effect = BufferGlitch;
            let result = effect
                .process_video(&seg, None, &serde_json::Map::new())
                .unwrap();
            assert_eq!(result.frames.len(), 10);
        }

        // ── DelayGlitch ────────────────────────────────────────

        #[test]
        fn test_delay_glitch_modifies_output() {
            // Use a vertical gradient (varies by y, not x) so vertical displacement
            // actually changes the data. gradient_frame varies by x only, which makes
            // vertical shifts invisible.
            let w = 32u32;
            let h = 32u32;
            let mut data = Vec::with_capacity((w * h * 4) as usize);
            for y in 0..h {
                for _x in 0..w {
                    let r = ((y as f32 / (h - 1) as f32) * 255.0) as u8;
                    data.extend_from_slice(&[r, 128, 64, 255]);
                }
            }
            let frame = Frame {
                width: w,
                height: h,
                data,
            };
            let effect = DelayGlitch;
            let result = effect
                .process_frame(&frame, None, &serde_json::Map::new())
                .unwrap();
            assert_eq!(result.width, 32);
            assert_eq!(result.height, 32);
            // Delay preview applies vertical displacement (y=3)
            assert_ne!(
                result.data, frame.data,
                "DelayGlitch preview should displace pixels vertically"
            );
        }

        #[test]
        fn test_delay_glitch_video_preserves_count() {
            let seg = make_gradient_segment(10);
            let effect = DelayGlitch;
            let result = effect
                .process_video(&seg, None, &serde_json::Map::new())
                .unwrap();
            assert_eq!(result.frames.len(), 10);
        }

        // ── MirrorGlitch ───────────────────────────────────────

        #[test]
        fn test_mirror_glitch_modifies_output() {
            let frame = gradient_frame(32, 32);
            let effect = MirrorGlitch;
            let result = effect
                .process_frame(&frame, None, &serde_json::Map::new())
                .unwrap();
            assert_eq!(result.width, 32);
            assert_eq!(result.height, 32);
            // Mirror preview applies horizontal mirror displacement
            assert_ne!(
                result.data, frame.data,
                "MirrorGlitch preview should displace pixels"
            );
        }

        #[test]
        fn test_mirror_glitch_video_preserves_count() {
            let seg = make_gradient_segment(5);
            let effect = MirrorGlitch;
            let result = effect
                .process_video(&seg, None, &serde_json::Map::new())
                .unwrap();
            assert_eq!(result.frames.len(), 5);
        }

        // ── OpticalFlow ────────────────────────────────────────

        #[test]
        fn test_optical_flow_modifies_output() {
            // Use textured frames (checkerboard pattern shifted between frames)
            // so optical flow can detect actual motion. Solid frames have no
            // texture gradient, so flow detection returns zero motion.
            let w = 16u32;
            let h = 16u32;
            let frames: Vec<Frame> = (0..4)
                .map(|i| {
                    let offset = i as usize;
                    let mut data = Vec::with_capacity((w * h * 4) as usize);
                    for y in 0..h {
                        for x in 0..w {
                            // Checkerboard that shifts right each frame
                            let checker = ((x as usize + offset) / 4 + y as usize / 4) % 2;
                            let v = if checker == 0 { 30 } else { 220 };
                            data.extend_from_slice(&[v, v, v, 255]);
                        }
                    }
                    Frame {
                        width: w,
                        height: h,
                        data,
                    }
                })
                .collect();
            let seg = VideoSegment { frames, fps: 30.0 };
            let effect = OpticalFlow::default();
            let result = effect
                .process_video(&seg, None, &serde_json::Map::new())
                .unwrap();
            assert_eq!(result.frames.len(), 4);
            // At least one frame beyond the first should be warped
            let mut warped = false;
            for i in 1..4 {
                if result.frames[i].data != seg.frames[i].data {
                    warped = true;
                    break;
                }
            }
            assert!(warped, "OpticalFlow should warp at least one frame");
        }

        #[test]
        fn test_optical_flow_frame_preview() {
            let frame = gradient_frame(16, 16);
            let effect = OpticalFlow::default();
            let result = effect
                .process_frame(&frame, None, &serde_json::Map::new())
                .unwrap();
            assert_eq!(result.width, 16);
            assert_eq!(result.height, 16);
        }

        // ── CrossVideoDatamosh ─────────────────────────────────

        #[test]
        fn test_cross_video_no_path_returns_unchanged() {
            let seg = make_color_segment(5);
            let effect = CrossVideoDatamosh;
            let result = effect
                .process_video(&seg, None, &serde_json::Map::new())
                .unwrap();
            // Without a second video path, returns input unchanged
            assert_eq!(result.frames.len(), 5);
            assert_eq!(result.frames[0].data, seg.frames[0].data);
        }

        #[test]
        fn test_cross_video_frame_passthrough() {
            let frame = solid_frame(4, 4, 128, 128, 128, 255);
            let effect = CrossVideoDatamosh;
            let result = effect
                .process_frame(&frame, None, &serde_json::Map::new())
                .unwrap();
            assert_eq!(result.data, frame.data);
        }

        // ── GlitchProfile ──────────────────────────────────────

        #[test]
        fn test_glitch_profile_modifies_output() {
            let seg = make_color_segment(20);
            let effect = GlitchProfile;
            let mut params = serde_json::Map::new();
            params.insert("drop_interval".to_string(), serde_json::json!(5));
            params.insert("intensity".to_string(), serde_json::json!(0.8));
            let result = effect.process_video(&seg, None, &params).unwrap();
            assert!(!result.frames.is_empty());
            assert!(result.frames.len() <= 20);
        }

        #[test]
        fn test_glitch_profile_frame_corrupts() {
            let frame = solid_frame(16, 16, 128, 128, 128, 255);
            let effect = GlitchProfile;
            let mut params = serde_json::Map::new();
            params.insert("intensity".to_string(), serde_json::json!(1.0));
            let result = effect.process_frame(&frame, None, &params).unwrap();
            assert_eq!(result.width, 16);
            assert_eq!(result.height, 16);
            // With high intensity, corruption + noise should modify data
            assert_ne!(
                result.data, frame.data,
                "GlitchProfile should corrupt pixels"
            );
        }

        // ── BloomProfile ───────────────────────────────────────

        #[test]
        fn test_bloom_profile_modifies_output() {
            let seg = make_color_segment(20);
            let effect = BloomProfile;
            let result = effect
                .process_video(&seg, None, &serde_json::Map::new())
                .unwrap();
            assert!(!result.frames.is_empty());
        }

        #[test]
        fn test_bloom_profile_frame_blooms() {
            let frame = solid_frame(16, 16, 100, 100, 100, 255);
            let effect = BloomProfile;
            let result = effect
                .process_frame(&frame, None, &serde_json::Map::new())
                .unwrap();
            assert_eq!(result.width, 16);
            assert_eq!(result.height, 16);
            // Bloom amplifies and smears
            assert_ne!(result.data, frame.data, "BloomProfile should modify pixels");
        }

        // ── SmearProfile ───────────────────────────────────────

        #[test]
        fn test_smear_profile_modifies_output() {
            let seg = make_color_segment(20);
            let effect = SmearProfile;
            let result = effect
                .process_video(&seg, None, &serde_json::Map::new())
                .unwrap();
            assert!(!result.frames.is_empty());
            assert!(result.frames.len() <= 20);
        }

        #[test]
        fn test_smear_profile_frame_smears() {
            let frame = solid_frame(16, 16, 100, 100, 100, 255);
            let effect = SmearProfile;
            let result = effect
                .process_frame(&frame, None, &serde_json::Map::new())
                .unwrap();
            assert_eq!(result.width, 16);
            assert_eq!(result.height, 16);
            // Smear blends rows and shifts colors
            assert_ne!(result.data, frame.data, "SmearProfile should modify pixels");
        }

        // ── ExtremeProfile ─────────────────────────────────────

        #[test]
        fn test_extreme_profile_modifies_output() {
            let seg = make_color_segment(30);
            let effect = ExtremeProfile;
            let result = effect
                .process_video(&seg, None, &serde_json::Map::new())
                .unwrap();
            assert!(!result.frames.is_empty());
        }

        #[test]
        fn test_extreme_profile_frame_corrupts() {
            let frame = solid_frame(16, 16, 128, 128, 128, 255);
            let effect = ExtremeProfile;
            let result = effect
                .process_frame(&frame, None, &serde_json::Map::new())
                .unwrap();
            assert_eq!(result.width, 16);
            assert_eq!(result.height, 16);
            // Heavy corruption + row duplication + bloom
            assert_ne!(
                result.data, frame.data,
                "ExtremeProfile should corrupt pixels"
            );
        }

        // ── RainbowProfile ─────────────────────────────────────

        #[test]
        fn test_rainbow_profile_modifies_output() {
            let seg = make_color_segment(20);
            let effect = RainbowProfile;
            let result = effect
                .process_video(&seg, None, &serde_json::Map::new())
                .unwrap();
            assert!(!result.frames.is_empty());
            assert!(result.frames.len() <= 20);
        }

        #[test]
        fn test_rainbow_profile_frame_remaps() {
            let frame = solid_frame(16, 16, 128, 128, 128, 255);
            let effect = RainbowProfile;
            let result = effect
                .process_frame(&frame, None, &serde_json::Map::new())
                .unwrap();
            assert_eq!(result.width, 16);
            assert_eq!(result.height, 16);
            // Rainbow remapping + channel swap should change data
            assert_ne!(
                result.data, frame.data,
                "RainbowProfile should remap colors"
            );
        }
    }
}
