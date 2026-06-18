use crate::effects::types::*;
use crate::effects::Effect;
use crate::error::Result;
use serde_json::json;

/// Simulated I-frame removal by dropping every Nth frame.
pub struct IFrameRemoval {
    interval: u32,
}

impl IFrameRemoval {
    pub fn new(interval: u32) -> Self {
        Self { interval: interval.max(2) }
    }
}

impl Default for IFrameRemoval {
    fn default() -> Self {
        Self::new(15)
    }
}

impl Effect for IFrameRemoval {
    fn meta(&self) -> EffectMeta {
        EffectMeta {
            id: "datamoshing.iframe_removal".to_string(),
            name: "I-Frame Removal".to_string(),
            category: EffectCategory::Datamoshing,
            media_type: MediaType::Video,
            parameters: vec![
                ParameterDef {
                    id: "interval".to_string(),
                    name: "Drop Interval".to_string(),
                    param_type: ParamType::Slider,
                    default: json!(15),
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
        let interval = params
            .get("interval")
            .and_then(|v| v.as_u64())
            .unwrap_or(self.interval as u64) as usize;
        let mut frames = Vec::new();
        for (i, frame) in input.frames.iter().enumerate() {
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
    fn test_drops_frames() {
        let e = IFrameRemoval::new(3);
        let seg = make_segment(10);
        let r = e.process_video(&seg, None, &serde_json::Map::new()).unwrap();
        assert_eq!(r.frames.len(), 6); // drops indices 0,3,6,9; keeps 1,2,4,5,7,8
    }
}