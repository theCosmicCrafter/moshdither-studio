use crate::effects::types::*;
use crate::effects::Effect;
use crate::error::Result;

/// Motion Transfer — simulate by applying frame difference blending.
pub struct MotionTransfer;

impl MotionTransfer {
    pub fn new() -> Self { Self }
}

impl Default for MotionTransfer {
    fn default() -> Self { Self::new() }
}

impl Effect for MotionTransfer {
    fn meta(&self) -> EffectMeta {
        EffectMeta {
            id: "datamoshing.motion_transfer".to_string(),
            name: "Motion Transfer".to_string(),
            category: EffectCategory::Datamoshing,
            media_type: MediaType::Video,
            parameters: vec![],
        }
    }

    fn process_frame(&self, input: &Frame, _m: Option<&Mask>, _p: &ParameterValues) -> Result<Frame> {
        Ok(input.clone())
    }

    fn process_video(
        &self,
        input: &VideoSegment,
        _mask: Option<&Mask>,
        _params: &ParameterValues,
    ) -> Result<VideoSegment> {
        let mut frames = Vec::with_capacity(input.frames.len());
        if input.frames.is_empty() {
            return Ok(input.clone());
        }
        frames.push(input.frames[0].clone());

        for i in 1..input.frames.len() {
            let prev = &input.frames[i - 1];
            let curr = &input.frames[i];
            let blended = blend_frames(prev, curr, 0.5);
            frames.push(blended);
        }

        Ok(VideoSegment {
            frames,
            fps: input.fps,
        })
    }
}

fn blend_frames(a: &Frame, b: &Frame, t: f32) -> Frame {
    let data: Vec<u8> = a
        .data
        .iter()
        .zip(b.data.iter())
        .map(|(x, y)| {
            let v = *x as f32 * (1.0 - t) + *y as f32 * t;
            v.clamp(0.0, 255.0) as u8
        })
        .collect();
    Frame {
        width: a.width,
        height: a.height,
        data,
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
    fn test_motion_transfer() {
        let e = MotionTransfer;
        let seg = make_segment(4);
        let r = e.process_video(&seg, None, &serde_json::Map::new()).unwrap();
        assert_eq!(r.frames.len(), 4);
        assert_eq!(r.frames[0].data[0], 0);
        assert_eq!(r.frames[1].data[0], 0); // blended
    }
}