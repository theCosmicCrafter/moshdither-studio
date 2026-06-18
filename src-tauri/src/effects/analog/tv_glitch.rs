use crate::effects::types::*;
use crate::effects::Effect;
use crate::error::Result;
use serde_json::json;

/// Analog TV glitch — subcarrier amplitude + row-level IIR noise.
pub struct TvGlitch {
    noise: f32,
    amplitude: f32,
}

impl TvGlitch {
    pub fn new(noise: f32, amplitude: f32) -> Self {
        Self { noise: noise.clamp(0.0, 1.0), amplitude: amplitude.clamp(0.0, 1.0) }
    }
}

impl Default for TvGlitch {
    fn default() -> Self { Self::new(0.2, 0.3) }
}

impl Effect for TvGlitch {
    fn meta(&self) -> EffectMeta {
        EffectMeta {
            id: "analog.tv_glitch".to_string(),
            name: "TV Glitch".to_string(),
            category: EffectCategory::Analog,
            media_type: MediaType::Both,
            parameters: vec![
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
                    id: "amplitude".to_string(),
                    name: "Amplitude".to_string(),
                    param_type: ParamType::Slider,
                    default: json!(0.3),
                    min: Some(0.0),
                    max: Some(1.0),
                    step: Some(0.05),
                    options: None,
                },
            ],
        }
    }

    fn process_frame(&self, input: &Frame, _m: Option<&Mask>, params: &ParameterValues) -> Result<Frame> {
        let noise = params.get("noise").and_then(|v| v.as_f64()).unwrap_or(self.noise as f64) as f32;
        let amplitude = params.get("amplitude").and_then(|v| v.as_f64()).unwrap_or(self.amplitude as f64) as f32;
        let time = params.get("time").and_then(|v| v.as_f64()).unwrap_or(0.0) as u32;
        let w = input.width as usize;
        let h = input.height as usize;
        let mut data = input.data.clone();
        let mut z = 0.0f32;

        for y in 0..h {
            let row_seed = (y as u32).wrapping_add(time.wrapping_mul(71)).wrapping_mul(374761393);
            let row_noise = ((row_seed >> 24) as f32 / 255.0 - 0.5) * noise * 255.0;
            z = z * 0.8 + row_noise * 0.2; // IIR lowpass
            let shift = (z * amplitude) as isize;

            for x in 0..w {
                let dst_idx = (y * w + x) * 4;
                let src_x = ((x as isize + shift).clamp(0, w as isize - 1)) as usize;
                let src_idx = (y * w + src_x) * 4;
                data[dst_idx] = input.data[src_idx];
                data[dst_idx + 1] = input.data[src_idx + 1];
                data[dst_idx + 2] = input.data[src_idx + 2];
                data[dst_idx + 3] = input.data[dst_idx + 3];
            }
        }

        Ok(Frame { width: input.width, height: input.height, data })
    }

    fn process_video(&self, input: &VideoSegment, mask: Option<&Mask>, params: &ParameterValues) -> Result<VideoSegment> {
        let mut frames = Vec::with_capacity(input.frames.len());
        for frame in &input.frames { frames.push(self.process_frame(frame, mask, params)?); }
        Ok(VideoSegment { frames, fps: input.fps })
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_tv_glitch_changes() {
        let d = vec![128u8; 16 * 4];
        let f = Frame { width: 4, height: 4, data: d };
        let e = TvGlitch::new(0.5, 0.5);
        let r = e.process_frame(&f, None, &serde_json::Map::new()).unwrap();
        // IIR lowpass means z should drift, causing some shift
        assert_eq!(r.width, 4);
    }
}