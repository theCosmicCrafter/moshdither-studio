use crate::effects::motion::{block_match_motion_field, warp_and_blend};
use crate::effects::types::*;
use crate::effects::Effect;
use crate::error::Result;
use serde_json::json;

const SHIFT_OPTIONS: &[i32] = &[0, 1, -1, 2, -2, 4, -4, 8, -8];

/// Motion Transfer — applies block-matching motion vectors from one frame to
/// another to simulate datamoshing motion transfer. Inspired by eternal-mess.
pub struct MotionTransfer;

impl MotionTransfer {
    pub fn new() -> Self {
        Self
    }
}

impl Default for MotionTransfer {
    fn default() -> Self {
        Self::new()
    }
}

impl Effect for MotionTransfer {
    fn meta(&self) -> EffectMeta {
        EffectMeta {
            id: "datamoshing.motion_transfer".to_string(),
            name: "Motion Transfer".to_string(),
            category: EffectCategory::Datamoshing,
            media_type: MediaType::Video,
            parameters: vec![
                ParameterDef {
                    id: "block_size".to_string(),
                    name: "Block Size".to_string(),
                    param_type: ParamType::Slider,
                    default: json!(16),
                    min: Some(4.0),
                    max: Some(64.0),
                    step: Some(4.0),
                    options: None,
                },
                ParameterDef {
                    id: "strength".to_string(),
                    name: "Strength".to_string(),
                    param_type: ParamType::Slider,
                    default: json!(0.7),
                    min: Some(0.0),
                    max: Some(1.0),
                    step: Some(0.05),
                    options: None,
                },
            ],
        }
    }

    fn is_temporal(&self) -> bool {
        true
    }

    fn process_frame(
        &self,
        input: &Frame,
        _m: Option<&Mask>,
        params: &ParameterValues,
    ) -> Result<Frame> {
        let block_size = params
            .get("block_size")
            .and_then(|v| v.as_u64())
            .unwrap_or(16) as usize;
        let strength = params
            .get("strength")
            .and_then(|v| v.as_f64())
            .unwrap_or(0.7) as f32;

        // Single-frame preview: estimate a self-motion field from the frame
        // to a slightly shifted copy, then warp. This creates a smearing look
        // even when no previous frame is available.
        let shifted = shifted_frame(input, 2, 0);
        let field = block_match_motion_field(input, &shifted, block_size, SHIFT_OPTIONS);
        Ok(warp_and_blend(input, &field, strength))
    }

    fn process_video(
        &self,
        input: &VideoSegment,
        _mask: Option<&Mask>,
        params: &ParameterValues,
    ) -> Result<VideoSegment> {
        let block_size = params
            .get("block_size")
            .and_then(|v| v.as_u64())
            .unwrap_or(16) as usize;
        let strength = params
            .get("strength")
            .and_then(|v| v.as_f64())
            .unwrap_or(0.7) as f32;

        if input.frames.len() < 2 {
            return Ok(input.clone());
        }

        let mut frames = Vec::with_capacity(input.frames.len());
        frames.push(input.frames[0].clone());

        for i in 1..input.frames.len() {
            let prev = &input.frames[i - 1];
            let curr = &input.frames[i];
            let field = block_match_motion_field(prev, curr, block_size, SHIFT_OPTIONS);
            // Apply prev->curr motion vectors to curr, smearing pixels along motion
            let warped = warp_and_blend(curr, &field, strength);
            frames.push(warped);
        }

        Ok(VideoSegment {
            frames,
            fps: input.fps,
        })
    }
}

/// Create a copy of a frame shifted by (dx, dy) pixels, wrapping around edges.
fn shifted_frame(input: &Frame, dx: i32, dy: i32) -> Frame {
    let w = input.width as usize;
    let h = input.height as usize;
    let mut out = vec![0u8; input.data.len()];
    for (i, chunk) in out.as_chunks_mut::<4>().0.iter_mut().enumerate() {
        let x = (i % w) as i32;
        let y = (i / w) as i32;
        let sx = (x - dx).rem_euclid(w as i32) as usize;
        let sy = (y - dy).rem_euclid(h as i32) as usize;
        let sidx = (sy * w + sx) * 4;
        chunk[0] = input.data[sidx];
        chunk[1] = input.data[sidx + 1];
        chunk[2] = input.data[sidx + 2];
        chunk[3] = input.data[sidx + 3];
    }
    Frame {
        width: input.width,
        height: input.height,
        data: out,
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn make_frame(width: u32, height: u32, value: u8) -> Frame {
        let mut data = Vec::with_capacity((width * height * 4) as usize);
        for _ in 0..width * height {
            data.extend_from_slice(&[value, value, value, 255]);
        }
        Frame {
            width,
            height,
            data,
        }
    }

    fn make_shifted_segment() -> VideoSegment {
        let mut f0 = make_frame(32, 32, 128);
        let mut f1 = make_frame(32, 32, 128);
        // Bright block in f0 at x=8..16
        for y in 4..12 {
            for x in 8..16 {
                let idx = (y * 32 + x) * 4;
                f0.data[idx] = 255;
                f0.data[idx + 1] = 255;
                f0.data[idx + 2] = 255;
            }
        }
        // Same bright block in f1 shifted right by 4
        for y in 4..12 {
            for x in 12..20 {
                let idx = (y * 32 + x) * 4;
                f1.data[idx] = 255;
                f1.data[idx + 1] = 255;
                f1.data[idx + 2] = 255;
            }
        }
        VideoSegment {
            frames: vec![f0, f1],
            fps: 30.0,
        }
    }

    #[test]
    fn test_motion_transfer_preview() {
        let e = MotionTransfer;
        let f = make_frame(32, 32, 128);
        let r = e.process_frame(&f, None, &serde_json::Map::new()).unwrap();
        assert_eq!(r.width, 32);
        assert_eq!(r.height, 32);
        assert!(!r.data.iter().all(|&v| v == f.data[0]));
    }

    #[test]
    fn test_motion_transfer_video() {
        let e = MotionTransfer;
        let seg = make_shifted_segment();
        let r = e
            .process_video(&seg, None, &serde_json::Map::new())
            .unwrap();
        assert_eq!(r.frames.len(), 2);
        // The second frame should have been warped by the detected motion
        assert_ne!(r.frames[1].data, seg.frames[1].data);
    }
}
