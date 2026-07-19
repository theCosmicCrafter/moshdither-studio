use crate::effects::types::*;
use crate::effects::Effect;
use crate::error::Result;
use serde_json::json;

/// Ghosting — multi-path signal echo effect.
pub struct Ghosting {
    intensity: f32,
    offset: u32,
}

impl Ghosting {
    pub fn new(intensity: f32, offset: u32) -> Self {
        Self {
            intensity: intensity.clamp(0.0, 1.0),
            offset,
        }
    }
}

impl Default for Ghosting {
    fn default() -> Self {
        Self::new(0.3, 4)
    }
}

impl Effect for Ghosting {
    fn meta(&self) -> EffectMeta {
        EffectMeta {
            id: "analog.ghosting".to_string(),
            name: "Ghosting".to_string(),
            category: EffectCategory::Analog,
            media_type: MediaType::Both,
            parameters: vec![
                ParameterDef {
                    id: "intensity".to_string(),
                    name: "Intensity".to_string(),
                    param_type: ParamType::Slider,
                    default: json!(0.3),
                    min: Some(0.0),
                    max: Some(1.0),
                    step: Some(0.05),
                    options: None,
                },
                ParameterDef {
                    id: "offset".to_string(),
                    name: "Offset".to_string(),
                    param_type: ParamType::Slider,
                    default: json!(4),
                    min: Some(1.0),
                    max: Some(20.0),
                    step: Some(1.0),
                    options: None,
                },
            ],
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
        let offset = params
            .get("offset")
            .and_then(|v| v.as_u64())
            .unwrap_or(self.offset as u64) as usize;
        let w = input.width as usize;
        let h = input.height as usize;
        let mut data = input.data.clone();

        for y in 0..h {
            for x in offset..w {
                let idx = (y * w + x) * 4;
                let ghost_idx = (y * w + x - offset) * 4;
                for c in 0..3 {
                    let v = data[idx + c] as f32 * (1.0 - intensity)
                        + input.data[ghost_idx + c] as f32 * intensity;
                    data[idx + c] = v.clamp(0.0, 255.0) as u8;
                }
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
    fn test_ghosting() {
        let mut d = vec![0u8; 32 * 4];
        d[0] = 255; // bright pixel at x=0
        let f = Frame {
            width: 8,
            height: 4,
            data: d,
        };
        let e = Ghosting::new(1.0, 2);
        let r = e.process_frame(&f, None, &serde_json::Map::new()).unwrap();
        assert_eq!(r.data[8], 255); // ghost at x=2
    }
}
