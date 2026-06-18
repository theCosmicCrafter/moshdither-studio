use crate::effects::types::*;
use crate::effects::Effect;
use crate::error::Result;
use rand::Rng;
use serde_json::json;

/// Simulated I-frame removal by dropping every Nth frame.
pub struct IFrameRemoval {
    interval: u32,
}

impl IFrameRemoval {
    pub fn new(interval: u32) -> Self {
        Self {
            interval: interval.max(2),
        }
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
            parameters: vec![ParameterDef {
                id: "interval".to_string(),
                name: "Drop Interval".to_string(),
                param_type: ParamType::Slider,
                default: json!(15),
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
        const NOISE_THRESHOLD: f32 = 0.2;
        const GRAIN_THRESHOLD: f32 = 0.4;
        let mut rng = rand::thread_rng();
        let mut out = input.data.clone();
        let len = out.len();
        for i in (0..len).step_by(4) {
            let use_noise = rng.gen::<f32>() < NOISE_THRESHOLD;
            let use_grain = if rng.gen::<f32>() < GRAIN_THRESHOLD {
                rng.gen_range(0..50)
            } else {
                0
            };
            for c in 0..3 {
                // Void: subtract random amount
                let sub = rng.gen_range(1..15);
                out[i + c] = out[i + c].saturating_sub(sub);
                // Noise: add random amount
                if use_noise {
                    let add = rng.gen_range(1..if c == 0 { 15 } else { 10 });
                    out[i + c] = out[i + c].saturating_add(add);
                }
                // Darken
                let darken = rng.gen_range(0..40);
                out[i + c] = out[i + c].saturating_sub(darken);
                // Grain
                if use_grain > 0 {
                    out[i + c] = out[i + c].saturating_add(use_grain);
                }
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
        let r = e
            .process_video(&seg, None, &serde_json::Map::new())
            .unwrap();
        assert_eq!(r.frames.len(), 6); // drops indices 0,3,6,9; keeps 1,2,4,5,7,8
    }
}
