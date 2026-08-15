use crate::effects::types::*;
use crate::effects::Effect;
use crate::error::Result;
use serde_json::json;

/// Uniform noise — random values in [-range, +range].
pub struct UniformNoise {
    range: u8,
}

impl UniformNoise {
    pub fn new(range: u8) -> Self {
        Self { range }
    }
}

impl Default for UniformNoise {
    fn default() -> Self {
        Self::new(20)
    }
}

impl Effect for UniformNoise {
    fn meta(&self) -> EffectMeta {
        EffectMeta {
            id: "noise.uniform".to_string(),
            name: "Uniform Noise".to_string(),
            category: EffectCategory::Noise,
            media_type: MediaType::Both,
            parameters: vec![ParameterDef {
                id: "range".to_string(),
                name: "Range".to_string(),
                param_type: ParamType::Slider,
                default: json!(20),
                min: Some(0.0),
                max: Some(128.0),
                step: Some(1.0),
                options: None,
            }],
        }
    }

    fn uses_time_param(&self) -> bool {
        true
    }

    fn process_frame(
        &self,
        input: &Frame,
        _m: Option<&Mask>,
        params: &ParameterValues,
    ) -> Result<Frame> {
        let range = params
            .get("range")
            .and_then(|v| v.as_u64())
            .unwrap_or(self.range as u64) as i16;
        let time = params.get("time").and_then(|v| v.as_f64()).unwrap_or(0.0) as u32;
        let mut data = input.data.clone();
        for (i, chunk) in data.chunks_exact_mut(4).enumerate() {
            let seed = (i as u32)
                .wrapping_add(time.wrapping_mul(101))
                .wrapping_mul(374761393u32);
            for (c, val) in chunk.iter_mut().enumerate().take(3) {
                let noise = ((seed >> (c * 8)) & 0xFF) as i16 - 128;
                let scaled = noise * range / 128;
                let v = *val as i16 + scaled;
                *val = v.clamp(0, 255) as u8;
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
    fn test_uniform_noise() {
        let d = vec![128u8; 16 * 4];
        let f = Frame {
            width: 4,
            height: 4,
            data: d,
        };
        let e = UniformNoise::new(30);
        let r = e.process_frame(&f, None, &serde_json::Map::new()).unwrap();
        assert!(r.data.iter().any(|&v| v != 128));
    }
}
