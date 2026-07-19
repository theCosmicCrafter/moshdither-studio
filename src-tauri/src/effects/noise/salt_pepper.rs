use crate::effects::types::*;
use crate::effects::Effect;
use crate::error::Result;
use serde_json::json;

/// Salt & pepper noise — random black/white pixels.
pub struct SaltPepperNoise {
    density: f32,
}

impl SaltPepperNoise {
    pub fn new(density: f32) -> Self {
        Self {
            density: density.clamp(0.0, 1.0),
        }
    }
}

impl Default for SaltPepperNoise {
    fn default() -> Self {
        Self::new(0.05)
    }
}

impl Effect for SaltPepperNoise {
    fn meta(&self) -> EffectMeta {
        EffectMeta {
            id: "noise.salt_pepper".to_string(),
            name: "Salt & Pepper".to_string(),
            category: EffectCategory::Noise,
            media_type: MediaType::Both,
            parameters: vec![ParameterDef {
                id: "density".to_string(),
                name: "Density".to_string(),
                param_type: ParamType::Slider,
                default: json!(0.05),
                min: Some(0.0),
                max: Some(1.0),
                step: Some(0.01),
                options: None,
            }],
        }
    }

    fn process_frame(
        &self,
        input: &Frame,
        _m: Option<&Mask>,
        params: &ParameterValues,
    ) -> Result<Frame> {
        let density = params
            .get("density")
            .and_then(|v| v.as_f64())
            .unwrap_or(self.density as f64) as f32;
        let time = params.get("time").and_then(|v| v.as_f64()).unwrap_or(0.0) as u32;
        let mut data = input.data.clone();
        let count = (data.len() as f32 / 4.0 * density) as usize;
        for i in 0..count {
            let seed = (i as u32)
                .wrapping_add(time.wrapping_mul(127))
                .wrapping_mul(374761393)
                .wrapping_add(668265263);
            let idx = ((seed as usize) % (data.len() / 4)) * 4;
            let is_salt = (seed >> 16).is_multiple_of(2);
            data[idx] = if is_salt { 255 } else { 0 };
            data[idx + 1] = if is_salt { 255 } else { 0 };
            data[idx + 2] = if is_salt { 255 } else { 0 };
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
    fn test_salt_pepper() {
        let d = vec![128u8; 16 * 4];
        let f = Frame {
            width: 4,
            height: 4,
            data: d,
        };
        let e = SaltPepperNoise::new(0.5);
        let r = e.process_frame(&f, None, &serde_json::Map::new()).unwrap();
        let mut changed = false;
        for i in 0..r.data.len() / 4 {
            if r.data[i * 4] != 128 {
                changed = true;
                break;
            }
        }
        assert!(changed);
    }
}
