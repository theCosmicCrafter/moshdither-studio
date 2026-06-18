use crate::effects::types::*;
use crate::effects::Effect;
use crate::error::Result;
use serde_json::json;

/// Rise — progressively drop more I-frames toward the end.
pub struct RiseDatamosh {
    start_drop: u32,
}

impl RiseDatamosh {
    pub fn new(start_drop: u32) -> Self {
        Self {
            start_drop: start_drop.clamp(2, 60),
        }
    }
}

impl Default for RiseDatamosh {
    fn default() -> Self {
        Self::new(5)
    }
}

impl Effect for RiseDatamosh {
    fn meta(&self) -> EffectMeta {
        EffectMeta {
            id: "datamoshing.rise".to_string(),
            name: "Rise".to_string(),
            category: EffectCategory::Datamoshing,
            media_type: MediaType::Video,
            parameters: vec![
                ParameterDef {
                    id: "start_drop".to_string(),
                    name: "Start Drop Interval".to_string(),
                    param_type: ParamType::Slider,
                    default: json!(5),
                    min: Some(2.0),
                    max: Some(60.0),
                    step: Some(1.0),
                    options: None,
                },
            ],
        }
    }

    fn process_frame(&self, input: &Frame, _m: Option<&Mask>, _p: &ParameterValues) -> Result<Frame> {
        Ok(input.clone())
    }

    fn process_video(
        &self,
        input: &VideoSegment,
        _mask: Option<&Mask>,
        params: &ParameterValues,
    ) -> Result<VideoSegment> {
        let start_drop = params
            .get("start_drop")
            .and_then(|v| v.as_u64())
            .unwrap_or(self.start_drop as u64) as usize;
        let total = input.frames.len();
        let mut frames = Vec::new();

        for (i, frame) in input.frames.iter().enumerate() {
            let t = i as f32 / total.max(1) as f32;
            let interval = (start_drop as f32 * (1.0 - t * 0.8)).max(2.0) as usize;
            if i % interval != 0 {
                frames.push(frame.clone());
            }
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

    fn make_segment(n: usize) -> VideoSegment {
        let frames: Vec<Frame> = (0..n)
            .map(|i| Frame {
                width: 2,
                height: 2,
                data: vec![i as u8; 16],
            })
            .collect();
        VideoSegment { frames, fps: 30.0 }
    }

    #[test]
    fn test_progressive_drop() {
        let e = RiseDatamosh::new(5);
        let seg = make_segment(20);
        let r = e.process_video(&seg, None, &serde_json::Map::new()).unwrap();
        assert!(r.frames.len() < 20);
    }
}