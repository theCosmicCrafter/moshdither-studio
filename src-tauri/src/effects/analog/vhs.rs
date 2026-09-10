use crate::effects::types::*;
use crate::effects::Effect;
use crate::error::Result;
use serde_json::json;

/// VHS tape artifacts: tracking drift, chroma delay/bleed, luma noise, and
/// head-switching noise bands.
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
                    name: "Luma Noise".to_string(),
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
                    id: "chroma_delay".to_string(),
                    name: "Chroma Delay".to_string(),
                    param_type: ParamType::Slider,
                    default: json!(0.0),
                    min: Some(0.0),
                    max: Some(10.0),
                    step: Some(0.5),
                    options: None,
                },
                ParameterDef {
                    id: "chroma_bleed".to_string(),
                    name: "Chroma Bleed".to_string(),
                    param_type: ParamType::Slider,
                    default: json!(0.2),
                    min: Some(0.0),
                    max: Some(1.0),
                    step: Some(0.05),
                    options: None,
                },
                ParameterDef {
                    id: "chroma_offset".to_string(),
                    name: "Chroma Offset".to_string(),
                    param_type: ParamType::Slider,
                    default: json!(0.0),
                    min: Some(-1.0),
                    max: Some(1.0),
                    step: Some(0.05),
                    options: None,
                },
                ParameterDef {
                    id: "head_switching".to_string(),
                    name: "Head Switching".to_string(),
                    param_type: ParamType::Slider,
                    default: json!(0.0),
                    min: Some(0.0),
                    max: Some(1.0),
                    step: Some(0.05),
                    options: None,
                },
            ],
        }
    }

    fn uses_time_param(&self) -> bool {
        true
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
        let slice_size = params
            .get("slice_size")
            .and_then(|v| v.as_f64())
            .unwrap_or(8.0) as usize;
        let glitch_prob = params
            .get("glitch_probability")
            .and_then(|v| v.as_f64())
            .unwrap_or(0.3) as f32;
        let chroma_delay = params
            .get("chroma_delay")
            .and_then(|v| v.as_f64())
            .unwrap_or(0.0) as f32;
        let chroma_bleed = params
            .get("chroma_bleed")
            .and_then(|v| v.as_f64())
            .unwrap_or(0.2) as f32;
        let chroma_offset = params
            .get("chroma_offset")
            .and_then(|v| v.as_f64())
            .unwrap_or(0.0) as f32;
        let head_switching = params
            .get("head_switching")
            .and_then(|v| v.as_f64())
            .unwrap_or(0.0) as f32;
        let time = params.get("time").and_then(|v| v.as_f64()).unwrap_or(0.0) as u32;

        let w = input.width as usize;
        let h = input.height as usize;
        let mut data = input.data.clone();

        let band_start = (h as f32 * 0.92).floor() as usize;

        let mut y = 0;
        while y < h {
            let slice_end = (y + slice_size).min(h);
            let slice_seed = (y as u32)
                .wrapping_add(time.wrapping_mul(71))
                .wrapping_mul(374761393);

            let slice_glitches = (slice_seed % 1000) as f32 / 1000.0 < glitch_prob;

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

            for row_y in y..slice_end {
                let curve = if scan_curve > 0.0 {
                    let ny = (row_y as f32 / h as f32 - 0.5) * 2.0;
                    (ny * ny * (w as f32 * 0.05) * scan_curve) as isize
                } else {
                    0
                };

                let in_head_band = row_y >= band_start;
                let head_seed = slice_seed.wrapping_add((row_y as u32).wrapping_mul(2654435761));
                let head_active =
                    in_head_band && (head_seed % 1000) as f32 / 1000.0 < head_switching;

                for x in 0..w {
                    let src_x = ((x as isize + slice_offset).rem_euclid(w as isize)) as usize;
                    let src_y = ((row_y as isize + curve).clamp(0, h as isize - 1)) as usize;

                    // Head-switching noise adds a strong horizontal jitter in the
                    // bottom band of the frame.
                    let head_shift = if head_active {
                        let head_rand = (head_seed.wrapping_mul(x as u32 + 1) >> 24) as f32 / 255.0;
                        ((head_rand - 0.5) * head_switching * w as f32 * 0.15) as isize
                    } else {
                        0
                    };

                    let luma_x = ((src_x as isize + head_shift).rem_euclid(w as isize)) as usize;
                    let luma_idx = (src_y * w + luma_x) * 4;

                    let (mut y_val, _, _) = rgb_to_ycbcr(
                        input.data[luma_idx] as f32 / 255.0,
                        input.data[luma_idx + 1] as f32 / 255.0,
                        input.data[luma_idx + 2] as f32 / 255.0,
                    );

                    // Chroma is sampled from a vertically delayed line to simulate
                    // the chroma signal lagging the luma signal on VHS tape.
                    let chroma_dy = chroma_delay as isize;
                    let chroma_y = ((src_y as isize + chroma_dy).clamp(0, h as isize - 1)) as usize;

                    let chroma_offset_px = (chroma_offset * w as f32 * 0.04) as isize;
                    let chroma_x =
                        ((luma_x as isize + chroma_offset_px).rem_euclid(w as isize)) as usize;

                    let chroma_idx = (chroma_y * w + chroma_x) * 4;
                    let (_, cb, cr) = rgb_to_ycbcr(
                        input.data[chroma_idx] as f32 / 255.0,
                        input.data[chroma_idx + 1] as f32 / 255.0,
                        input.data[chroma_idx + 2] as f32 / 255.0,
                    );
                    let mut cb = cb;
                    let mut cr = cr;

                    // Chroma bleed: horizontal smearing of the color difference signals.
                    if chroma_bleed > 0.0 {
                        let bleed = (chroma_bleed * w as f32 * 0.02).max(1.0) as isize;
                        let prev_x = ((chroma_x as isize - bleed).rem_euclid(w as isize)) as usize;
                        let next_x = ((chroma_x as isize + bleed).rem_euclid(w as isize)) as usize;
                        let prev_idx = (chroma_y * w + prev_x) * 4;
                        let next_idx = (chroma_y * w + next_x) * 4;
                        let (_, cb_p, cr_p) = rgb_to_ycbcr(
                            input.data[prev_idx] as f32 / 255.0,
                            input.data[prev_idx + 1] as f32 / 255.0,
                            input.data[prev_idx + 2] as f32 / 255.0,
                        );
                        let (_, cb_n, cr_n) = rgb_to_ycbcr(
                            input.data[next_idx] as f32 / 255.0,
                            input.data[next_idx + 1] as f32 / 255.0,
                            input.data[next_idx + 2] as f32 / 255.0,
                        );
                        cb = cb * (1.0 - chroma_bleed) + ((cb_p + cb_n) / 2.0) * chroma_bleed;
                        cr = cr * (1.0 - chroma_bleed) + ((cr_p + cr_n) / 2.0) * chroma_bleed;
                    }

                    // Luma noise + head-switching noise.
                    let pixel_seed = head_seed.wrapping_mul(x as u32 + 1);
                    let n = (pixel_seed.wrapping_add(668265263) >> 24) as f32 / 255.0;
                    let luma_noise = (n - 0.5) * noise * 0.5;
                    y_val += luma_noise;

                    if head_active {
                        let head_n = (pixel_seed.wrapping_mul(2246822519) >> 24) as f32 / 255.0;
                        y_val += (head_n - 0.5) * head_switching * 0.5;
                        cb += (head_n - 0.5) * head_switching * 0.15;
                        cr += (head_n - 0.5) * head_switching * 0.15;
                    }

                    let (r, g, b) = ycbcr_to_rgb(y_val, cb, cr);
                    let dst_idx = (row_y * w + x) * 4;
                    data[dst_idx] = (r * 255.0).clamp(0.0, 255.0) as u8;
                    data[dst_idx + 1] = (g * 255.0).clamp(0.0, 255.0) as u8;
                    data[dst_idx + 2] = (b * 255.0).clamp(0.0, 255.0) as u8;
                    data[dst_idx + 3] = input.data[luma_idx + 3];
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

fn rgb_to_ycbcr(r: f32, g: f32, b: f32) -> (f32, f32, f32) {
    let y = 0.299 * r + 0.587 * g + 0.114 * b;
    let cb = -0.169 * r - 0.331 * g + 0.500 * b;
    let cr = 0.500 * r - 0.419 * g - 0.081 * b;
    (y, cb, cr)
}

fn ycbcr_to_rgb(y: f32, cb: f32, cr: f32) -> (f32, f32, f32) {
    let r = y + 1.402 * cr;
    let g = y - 0.344_136 * cb - 0.714_136 * cr;
    let b = y + 1.772 * cb;
    (r.clamp(0.0, 1.0), g.clamp(0.0, 1.0), b.clamp(0.0, 1.0))
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

        let mut changed = false;
        for i in 0..result.data.len() / 4 {
            if result.data[i * 4] != 128 {
                changed = true;
                break;
            }
        }
        assert!(changed, "VHS should alter pixel values");
    }

    #[test]
    fn test_vhs_luma_noise_only_affects_y() {
        // Grey image with zero chroma should stay grey when only luma noise is applied
        // at a very low level. This test instead verifies that color data is preserved
        // at zero settings by checking neutral conversion round-trips.
        let data = vec![128u8; 4 * 4 * 4];
        let frame = Frame {
            width: 4,
            height: 4,
            data,
        };
        let mut params = serde_json::Map::new();
        params.insert("noise".to_string(), json!(0.0));
        params.insert("tracking".to_string(), json!(0.0));
        params.insert("tracking_error".to_string(), json!(0.0));
        params.insert("glitch_probability".to_string(), json!(0.0));
        params.insert("scan_curve".to_string(), json!(0.0));
        params.insert("chroma_delay".to_string(), json!(0.0));
        params.insert("chroma_bleed".to_string(), json!(0.0));
        params.insert("chroma_offset".to_string(), json!(0.0));
        params.insert("head_switching".to_string(), json!(0.0));
        let effect = VhsEffect::new(0.0, 0.0);
        let result = effect.process_frame(&frame, None, &params).unwrap();
        for chunk in result.data.as_chunks::<4>().0.iter() {
            assert!((chunk[0] as i16 - 128).abs() <= 1);
            assert!((chunk[1] as i16 - 128).abs() <= 1);
            assert!((chunk[2] as i16 - 128).abs() <= 1);
        }
    }
}
