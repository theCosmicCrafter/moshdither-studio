use crate::effects::types::*;
use crate::effects::Effect;
use crate::error::Result;
use serde_json::json;

/// Solarize — invert colors above a threshold.
pub struct Solarize {
    threshold: u8,
}

impl Solarize {
    pub fn new(threshold: u8) -> Self {
        Self { threshold }
    }
}

impl Default for Solarize {
    fn default() -> Self {
        Self::new(128)
    }
}

impl Effect for Solarize {
    fn meta(&self) -> EffectMeta {
        EffectMeta {
            id: "artistic.solarize".to_string(),
            name: "Solarize".to_string(),
            category: EffectCategory::Artistic,
            media_type: MediaType::Both,
            parameters: vec![ParameterDef {
                id: "threshold".to_string(),
                name: "Threshold".to_string(),
                param_type: ParamType::Slider,
                default: json!(128),
                min: Some(0.0),
                max: Some(255.0),
                step: Some(1.0),
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
        let threshold = params
            .get("threshold")
            .and_then(|v| v.as_u64())
            .unwrap_or(self.threshold as u64) as u8;
        let mut data = input.data.clone();
        for chunk in data.chunks_exact_mut(4) {
            for c in &mut chunk[..3] {
                if *c > threshold {
                    *c = 255 - *c;
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
    fn test_solarize() {
        let d = vec![200u8, 100, 150, 255];
        let f = Frame {
            width: 1,
            height: 1,
            data: d,
        };
        let e = Solarize::new(128);
        let r = e.process_frame(&f, None, &serde_json::Map::new()).unwrap();
        assert_eq!(r.data[0], 55); // 255 - 200
        assert_eq!(r.data[1], 100); // unchanged (100 < 128)
        assert_eq!(r.data[2], 105); // 255 - 150
    }
}
