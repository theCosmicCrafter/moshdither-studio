use crate::effects::types::*;
use crate::effects::Effect;
use crate::error::Result;
use serde_json::json;

/// Grayscale with configurable intensity.
pub struct Grayscale {
    intensity: f32,
}

impl Grayscale {
    pub fn new(intensity: f32) -> Self {
        Self {
            intensity: intensity.clamp(0.0, 1.0),
        }
    }
}

impl Default for Grayscale {
    fn default() -> Self {
        Self::new(1.0)
    }
}

impl Effect for Grayscale {
    fn meta(&self) -> EffectMeta {
        EffectMeta {
            id: "artistic.grayscale".to_string(),
            name: "Grayscale".to_string(),
            category: EffectCategory::Artistic,
            media_type: MediaType::Both,
            parameters: vec![ParameterDef {
                id: "intensity".to_string(),
                name: "Intensity".to_string(),
                param_type: ParamType::Slider,
                default: json!(1.0),
                min: Some(0.0),
                max: Some(1.0),
                step: Some(0.05),
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
        let intensity = params
            .get("intensity")
            .and_then(|v| v.as_f64())
            .unwrap_or(self.intensity as f64) as f32;
        let mut data = input.data.clone();
        for chunk in data.chunks_exact_mut(4) {
            let lum = 0.299 * chunk[0] as f32 + 0.587 * chunk[1] as f32 + 0.114 * chunk[2] as f32;
            for c in &mut chunk[..3] {
                *c = (*c as f32 * (1.0 - intensity) + lum * intensity) as u8;
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
    fn test_grayscale_full() {
        let d = vec![255u8, 0, 0, 255];
        let f = Frame {
            width: 1,
            height: 1,
            data: d,
        };
        let e = Grayscale::new(1.0);
        let r = e.process_frame(&f, None, &serde_json::Map::new()).unwrap();
        assert_eq!(r.data[0], 76); // 0.299 * 255
    }

    #[test]
    fn test_grayscale_none() {
        let d = vec![255u8, 0, 0, 255];
        let f = Frame {
            width: 1,
            height: 1,
            data: d,
        };
        let e = Grayscale::new(0.0);
        let r = e.process_frame(&f, None, &serde_json::Map::new()).unwrap();
        assert_eq!(r.data[0], 255);
        assert_eq!(r.data[1], 0);
    }
}
