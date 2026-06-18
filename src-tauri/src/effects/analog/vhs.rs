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
        Self { tracking: tracking.clamp(0.0, 1.0), noise: noise.clamp(0.0, 1.0) }
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
            ],
        }
    }

    fn process_frame(
        &self,
        input: &Frame,
        _mask: Option<&Mask>,
        params: &ParameterValues,
    ) -> Result<Frame> {
        let tracking = params.get("tracking").and_then(|v| v.as_f64()).unwrap_or(self.tracking as f64) as f32;
        let noise = params.get("noise").and_then(|v| v.as_f64()).unwrap_or(self.noise as f64) as f32;
        let time = params.get("time").and_then(|v| v.as_f64()).unwrap_or(0.0) as u32;

        let w = input.width as usize;
        let h = input.height as usize;
        let mut data = input.data.clone();

        for y in 0..h {
            // Time-varying horizontal offset based on row and a simple hash
            let row_seed = (y as u32).wrapping_add(time.wrapping_mul(71)).wrapping_mul(374761393);
            let drift = ((row_seed >> 24) as f32 / 255.0) * tracking * (w as f32 * 0.05);
            let offset = drift as isize;

            for x in 0..w {
                let src_x = ((x as isize + offset).clamp(0, w as isize - 1)) as usize;
                let src_idx = (y * w + src_x) * 4;
                let dst_idx = (y * w + x) * 4;

                // Add noise
                let n = ((row_seed.wrapping_mul(x as u32).wrapping_add(time.wrapping_mul(131)).wrapping_add(668265263)) >> 24) as f32 / 255.0;
                let noise_val = (n - 0.5) * noise * 255.0;

                data[dst_idx] = (input.data[src_idx] as f32 + noise_val).clamp(0.0, 255.0) as u8;
                data[dst_idx + 1] = (input.data[src_idx + 1] as f32 + noise_val).clamp(0.0, 255.0) as u8;
                data[dst_idx + 2] = (input.data[src_idx + 2] as f32 + noise_val).clamp(0.0, 255.0) as u8;
                data[dst_idx + 3] = input.data[src_idx + 3];
            }
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
        Ok(VideoSegment { frames, fps: input.fps })
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_vhs_changes_pixels() {
        let data = vec![128u8; 16 * 4];
        let frame = Frame { width: 4, height: 4, data };
        let effect = VhsEffect::new(0.5, 0.5);
        let result = effect.process_frame(&frame, None, &serde_json::Map::new()).unwrap();

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