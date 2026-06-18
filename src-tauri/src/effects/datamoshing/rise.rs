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
            parameters: vec![ParameterDef {
                id: "start_drop".to_string(),
                name: "Start Drop Interval".to_string(),
                param_type: ParamType::Slider,
                default: json!(5),
                min: Some(2.0),
                max: Some(60.0),
                step: Some(1.0),
                options: None,
            }],
        }
    }

    fn is_temporal(&self) -> bool {
        true
    }

    fn process_frame(
        &self,
        input: &Frame,
        _m: Option<&Mask>,
        _params: &ParameterValues,
    ) -> Result<Frame> {
        let len = input.data.len();
        let mut out = input.data.clone();
        for i in (0..len).step_by(4) {
            let r = out[i];
            let g = out[i + 1];
            let b = out[i + 2];
            if r <= 15 && g <= 15 && b <= 15 {
                out[i] = 0;
                out[i + 1] = 0;
                out[i + 2] = 0;
            } else if r > 15 && r <= 60 && g > 15 && g <= 60 && b > 15 && b <= 60 {
                out[i] = 0;
                out[i + 1] = 184;
                out[i + 2] = 255;
            } else if r > 60 && r <= 120 && g > 60 && g <= 120 && b > 60 && b <= 120 {
                out[i] = 255;
                out[i + 1] = 0;
                out[i + 2] = 193;
            } else if r > 120 && r <= 180 && g > 120 && g <= 180 && b > 120 && b <= 180 {
                out[i] = 150;
                out[i + 1] = 0;
                out[i + 2] = 255;
            } else if r > 180 && r <= 234 && g > 180 && g <= 234 && b > 180 && b <= 234 {
                out[i] = 0;
                out[i + 1] = 255;
                out[i + 2] = 249;
            } else if r >= 235 && g >= 235 && b >= 235 {
                out[i] = 255;
                out[i + 1] = 255;
                out[i + 2] = 255;
            }
        }
        Ok(Frame {
            width: input.width,
            height: input.height,
            data: out,
        })
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
        let r = e
            .process_video(&seg, None, &serde_json::Map::new())
            .unwrap();
        assert!(r.frames.len() < 20);
    }
}
