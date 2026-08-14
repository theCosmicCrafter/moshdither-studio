use crate::effects::types::*;
use crate::effects::Effect;
use crate::error::Result;
use serde_json::json;

/// Palette-based dithering: quantize pixels to nearest colors from a custom palette.
pub struct PaletteDither;

/// Normalizes `bayer_tables::BAYER_4` by dividing by 16.0 (one past the max
/// cell value), landing in `[0, 15/16]`. `custom_matrix.rs` shares the same
/// raw table but divides by the matrix's actual max value instead, landing
/// in `[0, 1]` inclusive -- that's a real behavioral difference, kept as-is.
fn bayer4(x: usize, y: usize) -> f32 {
    super::bayer_tables::BAYER_4[y % 4][x % 4] as f32 / 16.0
}

/// Map a rotated coordinate to a Bayer-matrix block index in `[0, 4)`.
///
/// `(coord / scale).floor()` is a block index that is negative on one side
/// of the rotation origin -- at `angle == 90°`, for instance, the rotated x
/// coordinate is `-y`, negative for every `y > 0`. Rust's float-to-uint cast
/// SATURATES negative values to 0 rather than wrapping, so casting the block
/// index directly to `usize` collapsed every negative block onto index 0,
/// always selecting column/row 0 of the Bayer matrix regardless of the true
/// coordinate and losing the periodic screen pattern for roughly half the
/// image at any nonzero rotation angle. `rem_euclid` wraps negative values
/// into `[0, 4)` instead of saturating, preserving the period.
fn bayer_block_index(coord: f32, scale: f32) -> usize {
    ((coord / scale).floor() as i64).rem_euclid(4) as usize
}

fn dist_sq(a: [u8; 3], b: [u8; 3]) -> u32 {
    let dr = (a[0] as i32 - b[0] as i32).pow(2) as u32;
    let dg = (a[1] as i32 - b[1] as i32).pow(2) as u32;
    let db = (a[2] as i32 - b[2] as i32).pow(2) as u32;
    dr + dg + db
}

fn luma(c: [u8; 3]) -> f32 {
    crate::effects::luminance_f32(c[0], c[1], c[2])
}

impl Effect for PaletteDither {
    fn meta(&self) -> EffectMeta {
        EffectMeta {
            id: "dithering.palette".to_string(),
            name: "Palette Dither".to_string(),
            category: EffectCategory::Dithering,
            media_type: MediaType::Image,
            parameters: vec![
                ParameterDef {
                    id: "scale".to_string(),
                    name: "Scale".to_string(),
                    param_type: ParamType::Slider,
                    default: json!(4.0),
                    min: Some(1.0),
                    max: Some(32.0),
                    step: Some(1.0),
                    options: None,
                },
                ParameterDef {
                    id: "angle".to_string(),
                    name: "Angle".to_string(),
                    param_type: ParamType::Slider,
                    default: json!(0.0),
                    min: Some(-std::f64::consts::PI),
                    max: Some(std::f64::consts::PI),
                    step: Some(0.1),
                    options: None,
                },
                ParameterDef {
                    id: "palette_size".to_string(),
                    name: "Palette Size".to_string(),
                    param_type: ParamType::Slider,
                    default: json!(4.0),
                    min: Some(2.0),
                    max: Some(8.0),
                    step: Some(1.0),
                    options: None,
                },
                ParameterDef {
                    id: "amount".to_string(),
                    name: "Amount".to_string(),
                    param_type: ParamType::Slider,
                    default: json!(1.0),
                    min: Some(0.0),
                    max: Some(1.0),
                    step: Some(0.01),
                    options: None,
                },
            ],
        }
    }

    fn process_frame(
        &self,
        input: &Frame,
        _mask: Option<&Mask>,
        params: &ParameterValues,
    ) -> Result<Frame> {
        let mut output = input.clone();
        let w = input.width as usize;
        let h = input.height as usize;

        let scale = params.get("scale").and_then(|v| v.as_f64()).unwrap_or(4.0) as f32;
        let angle = params.get("angle").and_then(|v| v.as_f64()).unwrap_or(0.0) as f32;
        let palette_size = params
            .get("palette_size")
            .and_then(|v| v.as_f64())
            .unwrap_or(4.0) as usize;
        let amount = params.get("amount").and_then(|v| v.as_f64()).unwrap_or(1.0) as f32;

        // Default palette (same as shader defaults)
        let palette: Vec<[u8; 3]> = vec![
            [0, 0, 0],
            [255, 255, 255],
            [204, 51, 51],
            [51, 153, 204],
            [51, 204, 77],
            [230, 204, 51],
            [128, 77, 179],
            [230, 128, 51],
        ];
        let psize = palette_size.clamp(2, palette.len());

        let cos_a = angle.cos();
        let sin_a = angle.sin();

        for y in 0..h {
            for x in 0..w {
                let idx = (y * w + x) * 4;
                let r = input.data[idx];
                let g = input.data[idx + 1];
                let b = input.data[idx + 2];
                let px = [r, g, b];

                // Rotate coordinates for pattern
                let rx = x as f32 * cos_a - y as f32 * sin_a;
                let ry = x as f32 * sin_a + y as f32 * cos_a;
                let bx = bayer_block_index(rx, scale);
                let by = bayer_block_index(ry, scale);
                let threshold = bayer4(bx, by) - 0.5;

                // Find best and second-best palette colors
                let mut best_idx = 0usize;
                let mut best_dist = u32::MAX;
                let mut second_idx = 1usize;
                let mut second_dist = u32::MAX;

                for (i, &color) in palette.iter().enumerate().take(psize) {
                    let d = dist_sq(px, color);
                    if d < best_dist {
                        second_dist = best_dist;
                        second_idx = best_idx;
                        best_dist = d;
                        best_idx = i;
                    } else if d < second_dist {
                        second_dist = d;
                        second_idx = i;
                    }
                }

                let chosen = if second_dist < u32::MAX {
                    let lum = luma(px);
                    let lum_best = luma(palette[best_idx]);
                    let lum_second = luma(palette[second_idx]);
                    let dl = (lum_second - lum_best).abs() * 2.0;
                    let dithered_lum = lum + threshold * dl;
                    if dithered_lum > lum {
                        palette[second_idx]
                    } else {
                        palette[best_idx]
                    }
                } else {
                    palette[best_idx]
                };

                let fr = chosen[0] as f32 / 255.0;
                let fg = chosen[1] as f32 / 255.0;
                let fb = chosen[2] as f32 / 255.0;
                let orig_r = r as f32 / 255.0;
                let orig_g = g as f32 / 255.0;
                let orig_b = b as f32 / 255.0;

                output.data[idx] = ((orig_r * (1.0 - amount) + fr * amount) * 255.0) as u8;
                output.data[idx + 1] = ((orig_g * (1.0 - amount) + fg * amount) * 255.0) as u8;
                output.data[idx + 2] = ((orig_b * (1.0 - amount) + fb * amount) * 255.0) as u8;
                // Alpha preserved
            }
        }

        Ok(output)
    }

    fn process_video(
        &self,
        input: &VideoSegment,
        mask: Option<&Mask>,
        params: &ParameterValues,
    ) -> Result<VideoSegment> {
        let mut frames = Vec::with_capacity(input.frames.len());
        for frame in &input.frames {
            frames.push(self.process_frame(frame, mask, params)?);
        }
        Ok(VideoSegment {
            frames,
            fps: input.fps,
        })
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    /// Pins `bayer4`'s output against the literal table it was hardcoding,
    /// before extracting that table into `bayer_tables::BAYER_4`. If the
    /// extraction ever transcribes a value wrong, this fails immediately
    /// instead of silently shifting every dithered pixel's threshold.
    #[test]
    fn bayer4_matches_the_known_reference_table() {
        let expected = [
            [0.0, 8.0, 2.0, 10.0],
            [12.0, 4.0, 14.0, 6.0],
            [3.0, 11.0, 1.0, 9.0],
            [15.0, 7.0, 13.0, 5.0],
        ];
        for (y, row) in expected.iter().enumerate() {
            for (x, &value) in row.iter().enumerate() {
                assert_eq!(bayer4(x, y), value / 16.0, "bayer4({x}, {y}) mismatch");
            }
        }
    }

    /// The bug fixed here: `bayer_block_index` used to saturate every
    /// negative coordinate to 0 instead of wrapping, so this would return 0
    /// for every input below zero instead of cycling through the matrix.
    #[test]
    fn bayer_block_index_wraps_negative_coordinates_instead_of_saturating() {
        let scale = 1.0f32;
        let indices: Vec<usize> = (0..8)
            .map(|y| bayer_block_index(-(y as f32), scale))
            .collect();
        let distinct: std::collections::HashSet<_> = indices.iter().collect();
        assert!(
            distinct.len() > 1,
            "negative coordinates must cycle through the Bayer matrix, not \
             collapse to a single index: {indices:?}"
        );
        assert!(
            indices.iter().all(|&i| i < 4),
            "rem_euclid(4) must always land in [0, 4): {indices:?}"
        );
        // The period is 4*scale, so index 0 must recur every 4 steps.
        assert_eq!(
            indices[0], indices[4],
            "the block index must repeat with period 4"
        );
    }

    fn gray_frame(w: u32, h: u32, gray: u8) -> Frame {
        let mut data = Vec::with_capacity((w * h * 4) as usize);
        for _ in 0..(w * h) {
            data.extend_from_slice(&[gray, gray, gray, 255]);
        }
        Frame {
            width: w,
            height: h,
            data,
        }
    }

    /// At `angle = 90°` (`PI/2` radians), the rotated x coordinate is `-y`,
    /// negative for every `y > 0` -- exactly the half of the image the
    /// saturating cast used to collapse onto a single Bayer column.
    ///
    /// A UNIFORM field is used deliberately, unlike halftone.rs's
    /// gradient-based screen-angle tests: halftone's bug needed a gradient
    /// because a uniform field gave every cell the same radius regardless of
    /// rotation, hiding the bug. Here the opposite is true -- a uniform
    /// luminance isolates the Bayer threshold as the ONLY thing that can
    /// still vary down a column, so if the threshold is (buggily) constant,
    /// the chosen palette color is provably constant too. A gradient source
    /// would let genuine luminance variation drive the color choice and
    /// could mask a constant threshold.
    #[test]
    fn screen_pattern_survives_a_ninety_degree_rotation() {
        let frame = gray_frame(1, 16, 128);
        let e = PaletteDither;
        let mut params = serde_json::Map::new();
        params.insert("angle".to_string(), json!(std::f64::consts::FRAC_PI_2));
        params.insert("scale".to_string(), json!(1.0));
        params.insert("amount".to_string(), json!(1.0));
        params.insert("palette_size".to_string(), json!(4));

        let out = e.process_frame(&frame, None, &params).unwrap();

        let colors: std::collections::HashSet<(u8, u8, u8)> = out
            .data
            .chunks_exact(4)
            .map(|px| (px[0], px[1], px[2]))
            .collect();
        assert!(
            colors.len() > 1,
            "the screen pattern collapsed to a single color down a column of \
             negative rotated coordinates -- the periodic Bayer pattern was lost"
        );
    }

    /// Regression guard mirroring halftone.rs's pairwise-distinctness checks:
    /// a genuine rotation must change the output on non-trivial content.
    #[test]
    fn rotated_and_unrotated_screens_differ_on_a_gradient() {
        fn gradient_frame(w: u32, h: u32) -> Frame {
            let mut data = Vec::with_capacity((w * h * 4) as usize);
            for y in 0..h {
                for x in 0..w {
                    let v = (((x * 5 + y * 3) % 256) as u8).saturating_add(20);
                    data.extend_from_slice(&[v, v / 2, 255 - v, 255]);
                }
            }
            Frame {
                width: w,
                height: h,
                data,
            }
        }

        let frame = gradient_frame(24, 24);
        let e = PaletteDither;
        let run = |angle: f64| {
            let mut params = serde_json::Map::new();
            params.insert("angle".to_string(), json!(angle));
            params.insert("scale".to_string(), json!(2.0));
            params.insert("amount".to_string(), json!(1.0));
            e.process_frame(&frame, None, &params).unwrap().data
        };

        assert_ne!(
            run(0.0),
            run(std::f64::consts::FRAC_PI_2),
            "a 90-degree rotation must change the dithered output"
        );
    }
}
