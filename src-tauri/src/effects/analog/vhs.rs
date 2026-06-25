use crate::effects::types::*;
use crate::effects::Effect;
use crate::error::Result;
use serde_json::json;

/// VHS tape tracking distortion + noise.
pub struct VhsEffect {
    tracking: f32,
    noise: f32,
}

impl VhsEffect {
    pub fn new(tracking: f32, noise: f32) -> Self {
        Self {
            tracking: tracking.clamp(0.0, 1.0),
            noise: noise.clamp(0.0, 1.0),
        }
    }
}

impl Default for VhsEffect {
    fn default() -> Self {
        Self::new(0.3, 0.2)
    }
}

impl Effect for VhsEffect {
    fn meta(&self) -> EffectMeta {
        EffectMeta {
            id: "analog.vhs".to_string(),
            name: "VHS".to_string(),
            category: EffectCategory::Analog,
            media_type: MediaType::Both,
            parameters: vec![
                ParameterDef {
                    id: "tracking".to_string(),
                    name: "Tracking Drift".to_string(),
                    param_type: ParamType::Slider,
                    default: json!(0.3),
                    min: Some(0.0),
                    max: Some(1.0),
                    step: Some(0.05),
                    options: None,
                },
                ParameterDef {
                    id: "noise".to_string(),
                    name: "Noise".to_string(),
                    param_type: ParamType::Slider,
                    default: json!(0.2),
                    min: Some(0.0),
                    max: Some(1.0),
                    step: Some(0.05),
                    options: None,
                },
                ParameterDef {
                    id: "slice_size".to_string(),
                    name: "Slice Size".to_string(),
                    param_type: ParamType::Slider,
                    default: json!(8.0),
                    min: Some(1.0),
                    max: Some(64.0),
                    step: Some(1.0),
                    options: None,
                },
                ParameterDef {
                    id: "glitch_probability".to_string(),
                    name: "Glitch Probability".to_string(),
                    param_type: ParamType::Slider,
                    default: json!(0.3),
                    min: Some(0.0),
                    max: Some(1.0),
                    step: Some(0.05),
                    options: None,
                },
                ParameterDef {
                    id: "tracking_error".to_string(),
                    name: "Tracking Error".to_string(),
                    param_type: ParamType::Slider,
                    default: json!(0.1),
                    min: Some(0.0),
                    max: Some(1.0),
                    step: Some(0.05),
                    options: None,
                },
                ParameterDef {
                    id: "scan_curve".to_string(),
                    name: "Scan Curve".to_string(),
                    param_type: ParamType::Slider,
                    default: json!(0.0),
                    min: Some(0.0),
                    max: Some(1.0),
                    step: Some(0.05),
                    options: None,
                },
                ParameterDef {
                    id: "chromatic".to_string(),
                    name: "Chromatic Aberration".to_string(),
                    param_type: ParamType::Slider,
                    default: json!(0.1),
                    min: Some(0.0),
                    max: Some(1.0),
                    step: Some(0.05),
                    options: None,
                },
                ParameterDef {
                    id: "color_bleed".to_string(),
                    name: "Color Bleed".to_string(),
                    param_type: ParamType::Slider,
                    default: json!(0.2),
                    min: Some(0.0),
                    max: Some(1.0),
                    step: Some(0.05),
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
        let tracking = params
            .get("tracking")
            .and_then(|v| v.as_f64())
            .unwrap_or(self.tracking as f64) as f32;
        let noise = params
            .get("noise")
            .and_then(|v| v.as_f64())
            .unwrap_or(self.noise as f64) as f32;
        let tracking_error = params
            .get("tracking_error")
            .and_then(|v| v.as_f64())
            .unwrap_or(0.1) as f32;
        let scan_curve = params
            .get("scan_curve")
            .and_then(|v| v.as_f64())
            .unwrap_or(0.0) as f32;
        let chromatic = params
            .get("chromatic")
            .and_then(|v| v.as_f64())
            .unwrap_or(0.1) as f32;
        let color_bleed = params
            .get("color_bleed")
            .and_then(|v| v.as_f64())
            .unwrap_or(0.2) as f32;
        let time = params.get("time").and_then(|v| v.as_f64()).unwrap_or(0.0) as u32;

        let w = input.width as usize;
        let h = input.height as usize;
        let mut data = input.data.clone();

        // Slice-based displacement: group rows into slices and shift together
        // This creates visible tracking bands like real VHS
        let slice_size = params
            .get("slice_size")
            .and_then(|v| v.as_f64())
            .unwrap_or(8.0) as usize;
        let glitch_prob = params
            .get("glitch_probability")
            .and_then(|v| v.as_f64())
            .unwrap_or(0.3) as f32;

        // Process in slices of slice_size rows
        let mut y = 0;
        while y < h {
            let slice_end = (y + slice_size).min(h);
            let slice_seed = (y as u32)
                .wrapping_add(time.wrapping_mul(71))
                .wrapping_mul(374761393);

            // Determine if this slice glitches
            let slice_glitches = (slice_seed % 1000) as f32 / 1000.0 < glitch_prob;

            // Per-slice horizontal offset
            let drift = ((slice_seed >> 24) as f32 / 255.0) * tracking * (w as f32 * 0.05);
            let error = if tracking_error > 0.0
                && (slice_seed % 997) as f32 / 997.0 < tracking_error * 0.3
            {
                (w as f32 * 0.1) as isize
            } else {
                0
            };
            let slice_offset = if slice_glitches {
                (drift as isize + error).wrapping_rem_euclid(w as isize)
            } else {
                drift as isize
            };

            // RGB channel roll offsets (wraparound, like np.roll)
            let roll_seed = slice_seed.wrapping_mul(2246822519);
            let r_roll = if slice_glitches {
                ((roll_seed >> 16) as isize % (w as isize / 4).max(1)) - (w as isize / 8)
            } else {
                0
            };
            let b_roll = if slice_glitches {
                ((roll_seed >> 8) as isize % (w as isize / 4).max(1)) - (w as isize / 8)
            } else {
                0
            };

            for row_y in y..slice_end {
                // Scan curve: bend row vertically near edges
                let curve = if scan_curve > 0.0 {
                    let ny = (row_y as f32 / h as f32 - 0.5) * 2.0;
                    (ny * ny * (w as f32 * 0.05) * scan_curve) as isize
                } else {
                    0
                };

                for x in 0..w {
                    // Wraparound horizontal shift (modular arithmetic, not clamp)
                    let src_x = ((x as isize + slice_offset).rem_euclid(w as isize)) as usize;
                    let src_y = ((row_y as isize + curve).clamp(0, h as isize - 1)) as usize;
                    let src_idx = (src_y * w + src_x) * 4;
                    let dst_idx = (row_y * w + x) * 4;

                    // Add noise
                    let n = ((slice_seed
                        .wrapping_mul(x as u32)
                        .wrapping_add(time.wrapping_mul(131))
                        .wrapping_add(668265263))
                        >> 24) as f32
                        / 255.0;
                    let noise_val = (n - 0.5) * noise * 255.0;

                    // Chromatic aberration with wraparound (np.roll style)
                    let chromatic_offset = (chromatic * w as f32 * 0.04) as isize;
                    let r_x =
                        ((x as isize - chromatic_offset + r_roll).rem_euclid(w as isize)) as usize;
                    let b_x =
                        ((x as isize + chromatic_offset + b_roll).rem_euclid(w as isize)) as usize;
                    let r_idx = (src_y * w + r_x) * 4;
                    let b_idx = (src_y * w + b_x) * 4;

                    // Color bleed: average neighbors horizontally
                    let bleed = (color_bleed * w as f32 * 0.02) as isize;
                    let prev = ((x as isize - bleed).rem_euclid(w as isize)) as usize;
                    let next = ((x as isize + bleed).rem_euclid(w as isize)) as usize;
                    let prev_idx = (src_y * w + prev) * 4;
                    let next_idx = (src_y * w + next) * 4;

                    let sample = |c: usize| {
                        let base = input.data[src_idx + c] as f32;
                        let bleed_val = (input.data[prev_idx + c] as f32
                            + input.data[next_idx + c] as f32)
                            / 2.0;
                        (base * (1.0 - color_bleed) + bleed_val * color_bleed + noise_val)
                            .clamp(0.0, 255.0)
                    };

                    data[dst_idx] = if chromatic > 0.0 || slice_glitches {
                        (input.data[r_idx] as f32 + noise_val).clamp(0.0, 255.0)
                    } else {
                        sample(0)
                    } as u8;
                    data[dst_idx + 1] = sample(1) as u8;
                    data[dst_idx + 2] = if chromatic > 0.0 || slice_glitches {
                        (input.data[b_idx] as f32 + noise_val).clamp(0.0, 255.0)
                    } else {
                        sample(2)
                    } as u8;
                    data[dst_idx + 3] = input.data[src_idx + 3];
                }
            }

            y = slice_end;
        }

        Ok(Frame {
            width: input.width,
            height: input.height,
            data,
        })
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

    #[test]
    fn test_vhs_changes_pixels() {
        let data = vec![128u8; 16 * 4];
        let frame = Frame {
            width: 4,
            height: 4,
            data,
        };
        let effect = VhsEffect::new(0.5, 0.5);
        let result = effect
            .process_frame(&frame, None, &serde_json::Map::new())
            .unwrap();

        // VHS should change some pixels due to drift + noise
        let mut changed = false;
        for i in 0..result.data.len() / 4 {
            if result.data[i * 4] != 128 {
                changed = true;
                break;
            }
        }
        assert!(changed, "VHS should alter pixel values");
    }
}
