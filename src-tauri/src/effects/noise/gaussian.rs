use crate::effects::types::*;
use crate::effects::Effect;
use crate::error::Result;
use serde_json::json;

/// Gaussian noise using Box-Muller transform.
pub struct GaussianNoise {
    std_dev: f32,
}

impl GaussianNoise {
    pub fn new(std_dev: f32) -> Self { Self { std_dev: std_dev.max(0.0) } }
}

impl Default for GaussianNoise {
    fn default() -> Self { Self::new(15.0) }
}

impl Effect for GaussianNoise {
    fn meta(&self) -> EffectMeta {
        EffectMeta {
            id: "noise.gaussian".to_string(),
            name: "Gaussian Noise".to_string(),
            category: EffectCategory::Noise,
            media_type: MediaType::Both,
            parameters: vec![
                ParameterDef {
                    id: "std_dev".to_string(),
                    name: "Std Dev".to_string(),
                    param_type: ParamType::Slider,
                    default: json!(15.0),
                    min: Some(0.0),
                    max: Some(100.0),
                    step: Some(1.0),
                    options: None,
                },
            ],
        }
    }

    fn process_frame(&self, input: &Frame, _m: Option<&Mask>, params: &ParameterValues) -> Result<Frame> {
        let std_dev = params.get("std_dev").and_then(|v| v.as_f64()).unwrap_or(self.std_dev as f64) as f32;
        let time = params.get("time").and_then(|v| v.as_f64()).unwrap_or(0.0) as u32;
        let mut data = input.data.clone();
        let mut i = 0usize;
        while i < data.len() {
            let seed1 = (i as u32).wrapping_add(time.wrapping_mul(101)).wrapping_mul(374761393u32);
            let seed2 = (i as u32).wrapping_add(time.wrapping_mul(127)).wrapping_mul(668265263u32);
            let u1 = ((seed1 >> 16) as f32 / 65535.0).max(1e-10);
            let u2 = (seed2 >> 16) as f32 / 65535.0;
            let mag = std_dev * (-2.0 * u1.ln()).sqrt();
            let z0 = mag * (2.0 * std::f32::consts::PI * u2).cos();
            let z1 = mag * (2.0 * std::f32::consts::PI * u2).sin();
            for c in 0..3 {
                if i + c < data.len() {
                    let noise = if c == 0 || c == 2 { z0 } else { z1 };
                    data[i + c] = (data[i + c] as f32 + noise).clamp(0.0, 255.0) as u8;
                }
            }
            i += 4;
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
    fn test_gaussian_noise() {
        let d = vec![128u8; 16 * 4];
        let f = Frame { width: 4, height: 4, data: d };
        let e = GaussianNoise::new(30.0);
        let r = e.process_frame(&f, None, &serde_json::Map::new()).unwrap();
        assert!(r.data.iter().any(|&v| v != 128));
    }
}