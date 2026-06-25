//! FFglitch-inspired motion vector manipulation effects.
//!
//! These effects operate on block-matching motion fields (simulating motion vector
//! manipulation at the codec level) to produce glitch patterns like zoom, shear,
//! vibrate, stop, buffer, delay, and mirror — all inspired by the JavaScript
//! scripts from Datamosher-Pro's FFG_effects/jscripts directory.

use crate::effects::motion::{
    block_match_motion_field, warp_by_motion_field, MotionField, MotionVector,
};
use crate::effects::types::*;
use crate::effects::Effect;
use crate::error::Result;
use rand::Rng;
use serde_json::json;

const SHIFT_OPTIONS: &[i32] = &[0, 1, -1, 2, -2, 4, -4, 8, -8];

// ─── Zoom ───────────────────────────────────────────────────────────────

/// Adds a radial zoom component to all motion vectors, pulling blocks
/// toward or away from the center. Inspired by Zoom.js.
pub struct ZoomGlitch;

impl Default for ZoomGlitch {
    fn default() -> Self {
        Self
    }
}

impl Effect for ZoomGlitch {
    fn meta(&self) -> EffectMeta {
        EffectMeta {
            id: "datamoshing.zoom".to_string(),
            name: "Zoom Glitch".to_string(),
            category: EffectCategory::Datamoshing,
            media_type: MediaType::Video,
            parameters: vec![ParameterDef {
                id: "intensity".to_string(),
                name: "Intensity".to_string(),
                param_type: ParamType::Slider,
                default: json!(0.5),
                min: Some(0.0),
                max: Some(2.0),
                step: Some(0.05),
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
        params: &ParameterValues,
    ) -> Result<Frame> {
        let intensity = params
            .get("intensity")
            .and_then(|v| v.as_f64())
            .unwrap_or(0.5) as f32;
        let w = input.width as usize;
        let h = input.height as usize;
        let cx = w as f32 / 2.0;
        let cy = h as f32 / 2.0;
        let block_size = 16usize;
        let bw = w.div_ceil(block_size);
        let bh = h.div_ceil(block_size);
        let mut vectors = Vec::with_capacity(bw * bh);
        for by in 0..bh {
            for bx in 0..bw {
                let px = (bx * block_size + block_size / 2) as f32;
                let py = (by * block_size + block_size / 2) as f32;
                let dx = (px - cx) * intensity * 0.1;
                let dy = (py - cy) * intensity * 0.1;
                vectors.push(MotionVector {
                    x: dx.round() as i32,
                    y: dy.round() as i32,
                });
            }
        }
        let field = MotionField {
            width: bw,
            height: bh,
            block_size,
            vectors,
        };
        Ok(warp_by_motion_field(input, &field))
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

// ─── Shear ──────────────────────────────────────────────────────────────

/// Adds a shear component to motion vectors based on cross-axis distance.
/// Inspired by Shear.js.
pub struct ShearGlitch;

impl Default for ShearGlitch {
    fn default() -> Self {
        Self
    }
}

impl Effect for ShearGlitch {
    fn meta(&self) -> EffectMeta {
        EffectMeta {
            id: "datamoshing.shear".to_string(),
            name: "Shear Glitch".to_string(),
            category: EffectCategory::Datamoshing,
            media_type: MediaType::Video,
            parameters: vec![ParameterDef {
                id: "intensity".to_string(),
                name: "Intensity".to_string(),
                param_type: ParamType::Slider,
                default: json!(0.5),
                min: Some(0.0),
                max: Some(2.0),
                step: Some(0.05),
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
        params: &ParameterValues,
    ) -> Result<Frame> {
        let intensity = params
            .get("intensity")
            .and_then(|v| v.as_f64())
            .unwrap_or(0.5) as f32;
        let w = input.width as usize;
        let h = input.height as usize;
        let cx = w as f32 / 2.0;
        let cy = h as f32 / 2.0;
        let block_size = 16usize;
        let bw = w.div_ceil(block_size);
        let bh = h.div_ceil(block_size);
        let mut vectors = Vec::with_capacity(bw * bh);
        for by in 0..bh {
            for bx in 0..bw {
                let px = (bx * block_size + block_size / 2) as f32;
                let py = (by * block_size + block_size / 2) as f32;
                // Shear: x influenced by y-distance, y influenced by x-distance
                let dx = (py - cy) * intensity * 0.1;
                let dy = (px - cx) * intensity * 0.1;
                vectors.push(MotionVector {
                    x: dx.round() as i32,
                    y: dy.round() as i32,
                });
            }
        }
        let field = MotionField {
            width: bw,
            height: bh,
            block_size,
            vectors,
        };
        Ok(warp_by_motion_field(input, &field))
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

// ─── Vibrate ────────────────────────────────────────────────────────────

/// Adds random jitter to all motion vectors. Inspired by Vibrate.js.
pub struct VibrateGlitch;

impl Default for VibrateGlitch {
    fn default() -> Self {
        Self
    }
}

impl Effect for VibrateGlitch {
    fn meta(&self) -> EffectMeta {
        EffectMeta {
            id: "datamoshing.vibrate".to_string(),
            name: "Vibrate Glitch".to_string(),
            category: EffectCategory::Datamoshing,
            media_type: MediaType::Video,
            parameters: vec![ParameterDef {
                id: "randomness".to_string(),
                name: "Randomness".to_string(),
                param_type: ParamType::Slider,
                default: json!(10),
                min: Some(1.0),
                max: Some(50.0),
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
        params: &ParameterValues,
    ) -> Result<Frame> {
        let randomness = params
            .get("randomness")
            .and_then(|v| v.as_u64())
            .unwrap_or(10) as i32;
        let bias = randomness / 2;
        let mut rng = rand::thread_rng();
        let w = input.width as usize;
        let h = input.height as usize;
        let block_size = 16usize;
        let bw = w.div_ceil(block_size);
        let bh = h.div_ceil(block_size);
        let mut vectors = Vec::with_capacity(bw * bh);
        for _ in 0..(bw * bh) {
            vectors.push(MotionVector {
                x: rng.gen_range(0..randomness) - bias,
                y: rng.gen_range(0..randomness) - bias,
            });
        }
        let field = MotionField {
            width: bw,
            height: bh,
            block_size,
            vectors,
        };
        Ok(warp_by_motion_field(input, &field))
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

// ─── Stop ───────────────────────────────────────────────────────────────

/// Zeroes all motion vectors for N frames when triggered randomly,
/// creating intermittent freeze-frame effects. Inspired by Stop.js.
pub struct StopGlitch {
    threshold: f64,
    n_frames: u32,
}

impl Default for StopGlitch {
    fn default() -> Self {
        Self {
            threshold: 95.0,
            n_frames: 10,
        }
    }
}

impl Effect for StopGlitch {
    fn meta(&self) -> EffectMeta {
        EffectMeta {
            id: "datamoshing.stop".to_string(),
            name: "Stop Glitch".to_string(),
            category: EffectCategory::Datamoshing,
            media_type: MediaType::Video,
            parameters: vec![
                ParameterDef {
                    id: "threshold".to_string(),
                    name: "Trigger Threshold".to_string(),
                    param_type: ParamType::Slider,
                    default: json!(95),
                    min: Some(50.0),
                    max: Some(100.0),
                    step: Some(1.0),
                    options: None,
                },
                ParameterDef {
                    id: "n_frames".to_string(),
                    name: "Freeze Frames".to_string(),
                    param_type: ParamType::Slider,
                    default: json!(10),
                    min: Some(1.0),
                    max: Some(60.0),
                    step: Some(1.0),
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
        _params: &ParameterValues,
    ) -> Result<Frame> {
        // Preview: return input unchanged (freeze effect is temporal)
        Ok(input.clone())
    }

    fn process_video(
        &self,
        input: &VideoSegment,
        _mask: Option<&Mask>,
        params: &ParameterValues,
    ) -> Result<VideoSegment> {
        let threshold = params
            .get("threshold")
            .and_then(|v| v.as_f64())
            .unwrap_or(self.threshold);
        let n_frames = params
            .get("n_frames")
            .and_then(|v| v.as_u64())
            .unwrap_or(self.n_frames as u64) as usize;
        let mut rng = rand::thread_rng();

        if input.frames.is_empty() {
            return Ok(input.clone());
        }

        let mut frames = Vec::with_capacity(input.frames.len());
        let mut frozen: Option<usize> = None; // index of frame to repeat
        let mut freeze_count = 0usize;

        for i in 0..input.frames.len() {
            if let Some(freeze_idx) = frozen {
                frames.push(input.frames[freeze_idx].clone());
                freeze_count += 1;
                if freeze_count >= n_frames {
                    frozen = None;
                    freeze_count = 0;
                }
            } else {
                let roll: f64 = rng.gen_range(0.0..1.0) * 100.0;
                if roll > threshold {
                    frozen = Some(i);
                    freeze_count = 0;
                    frames.push(input.frames[i].clone());
                } else {
                    frames.push(input.frames[i].clone());
                }
            }
        }

        Ok(VideoSegment {
            frames,
            fps: input.fps,
        })
    }
}

// ─── Buffer ─────────────────────────────────────────────────────────────

/// Audio-delay-style buffering of motion vectors with feedback. Inspired by Buffer.js.
pub struct BufferGlitch;

impl Default for BufferGlitch {
    fn default() -> Self {
        Self
    }
}

impl Effect for BufferGlitch {
    fn meta(&self) -> EffectMeta {
        EffectMeta {
            id: "datamoshing.buffer".to_string(),
            name: "Buffer Glitch".to_string(),
            category: EffectCategory::Datamoshing,
            media_type: MediaType::Video,
            parameters: vec![
                ParameterDef {
                    id: "buffer_size".to_string(),
                    name: "Buffer Size".to_string(),
                    param_type: ParamType::Slider,
                    default: json!(3),
                    min: Some(1.0),
                    max: Some(20.0),
                    step: Some(1.0),
                    options: None,
                },
                ParameterDef {
                    id: "feedback".to_string(),
                    name: "Feedback".to_string(),
                    param_type: ParamType::Slider,
                    default: json!(0.5),
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
        _params: &ParameterValues,
    ) -> Result<Frame> {
        // Preview: apply a slight horizontal displacement to simulate buffer delay
        let w = input.width as usize;
        let h = input.height as usize;
        let block_size = 16usize;
        let bw = w.div_ceil(block_size);
        let bh = h.div_ceil(block_size);
        let vectors = vec![MotionVector { x: 4, y: 0 }; bw * bh];
        let field = MotionField {
            width: bw,
            height: bh,
            block_size,
            vectors,
        };
        Ok(warp_by_motion_field(input, &field))
    }

    fn process_video(
        &self,
        input: &VideoSegment,
        _mask: Option<&Mask>,
        params: &ParameterValues,
    ) -> Result<VideoSegment> {
        let buffer_size = params
            .get("buffer_size")
            .and_then(|v| v.as_u64())
            .unwrap_or(3) as usize;
        let feedback = params
            .get("feedback")
            .and_then(|v| v.as_f64())
            .unwrap_or(0.5) as f32;

        if input.frames.len() < 2 {
            return Ok(input.clone());
        }

        let mut frames = Vec::with_capacity(input.frames.len());
        frames.push(input.frames[0].clone());

        // Ring buffer of motion fields
        let mut mv_buffer: Vec<MotionField> = Vec::new();

        for i in 1..input.frames.len() {
            let prev = &input.frames[i - 1];
            let curr = &input.frames[i];
            let current_field = block_match_motion_field(prev, curr, 16, SHIFT_OPTIONS);

            // Blend with the oldest buffered field for delay-style feedback
            if !mv_buffer.is_empty() {
                let blended = blend_motion_fields(&current_field, &mv_buffer[0], feedback);
                let warped = warp_by_motion_field(curr, &blended);
                frames.push(warped);
            } else {
                frames.push(curr.clone());
            }

            mv_buffer.push(current_field);
            if mv_buffer.len() > buffer_size {
                mv_buffer.remove(0);
            }
        }

        Ok(VideoSegment {
            frames,
            fps: input.fps,
        })
    }
}

fn blend_motion_fields(a: &MotionField, b: &MotionField, feedback: f32) -> MotionField {
    let n = a.vectors.len().min(b.vectors.len());
    let mut vectors = Vec::with_capacity(n);
    for i in 0..n {
        let av = a.vectors[i];
        let bv = b.vectors[i];
        vectors.push(MotionVector {
            x: ((av.x as f32 * (1.0 - feedback)) + (bv.x as f32 * feedback)).round() as i32,
            y: ((av.y as f32 * (1.0 - feedback)) + (bv.y as f32 * feedback)).round() as i32,
        });
    }
    MotionField {
        width: a.width,
        height: a.height,
        block_size: a.block_size,
        vectors,
    }
}

// ─── Delay ──────────────────────────────────────────────────────────────

/// Stores old motion vectors and swaps them in with feedback. Inspired by Delay.js.
pub struct DelayGlitch;

impl Default for DelayGlitch {
    fn default() -> Self {
        Self
    }
}

impl Effect for DelayGlitch {
    fn meta(&self) -> EffectMeta {
        EffectMeta {
            id: "datamoshing.delay".to_string(),
            name: "Delay Glitch".to_string(),
            category: EffectCategory::Datamoshing,
            media_type: MediaType::Video,
            parameters: vec![ParameterDef {
                id: "delay_frames".to_string(),
                name: "Delay Frames".to_string(),
                param_type: ParamType::Slider,
                default: json!(5),
                min: Some(1.0),
                max: Some(30.0),
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
        // Preview: slight vertical displacement
        let w = input.width as usize;
        let h = input.height as usize;
        let block_size = 16usize;
        let bw = w.div_ceil(block_size);
        let bh = h.div_ceil(block_size);
        let vectors = vec![MotionVector { x: 0, y: 3 }; bw * bh];
        let field = MotionField {
            width: bw,
            height: bh,
            block_size,
            vectors,
        };
        Ok(warp_by_motion_field(input, &field))
    }

    fn process_video(
        &self,
        input: &VideoSegment,
        _mask: Option<&Mask>,
        params: &ParameterValues,
    ) -> Result<VideoSegment> {
        let delay = params
            .get("delay_frames")
            .and_then(|v| v.as_u64())
            .unwrap_or(5) as usize;

        if input.frames.len() < 2 {
            return Ok(input.clone());
        }

        let mut frames = Vec::with_capacity(input.frames.len());
        frames.push(input.frames[0].clone());

        let mut mv_history: Vec<MotionField> = Vec::new();

        for i in 1..input.frames.len() {
            let prev = &input.frames[i - 1];
            let curr = &input.frames[i];
            let current_field = block_match_motion_field(prev, curr, 16, SHIFT_OPTIONS);

            if mv_history.len() >= delay {
                // Use the delayed field instead of the current one
                let delayed = &mv_history[mv_history.len() - delay];
                let warped = warp_by_motion_field(curr, delayed);
                frames.push(warped);
            } else {
                frames.push(curr.clone());
            }

            mv_history.push(current_field);
        }

        Ok(VideoSegment {
            frames,
            fps: input.fps,
        })
    }
}

// ─── Mirror ─────────────────────────────────────────────────────────────

/// Mirrors motion vectors horizontally. Inspired by Mirror.js.
pub struct MirrorGlitch;

impl Default for MirrorGlitch {
    fn default() -> Self {
        Self
    }
}

impl Effect for MirrorGlitch {
    fn meta(&self) -> EffectMeta {
        EffectMeta {
            id: "datamoshing.mirror".to_string(),
            name: "Mirror Glitch".to_string(),
            category: EffectCategory::Datamoshing,
            media_type: MediaType::Video,
            parameters: vec![],
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
        let w = input.width as usize;
        let h = input.height as usize;
        let block_size = 16usize;
        let bw = w.div_ceil(block_size);
        let bh = h.div_ceil(block_size);
        let mut vectors = Vec::with_capacity(bw * bh);
        for _ in 0..(bw * bh) {
            // Mirror: x vector is negated
            vectors.push(MotionVector { x: -4, y: 0 });
        }
        let field = MotionField {
            width: bw,
            height: bh,
            block_size,
            vectors,
        };
        Ok(warp_by_motion_field(input, &field))
    }

    fn process_video(
        &self,
        input: &VideoSegment,
        _mask: Option<&Mask>,
        _params: &ParameterValues,
    ) -> Result<VideoSegment> {
        if input.frames.len() < 2 {
            return Ok(input.clone());
        }

        let mut frames = Vec::with_capacity(input.frames.len());
        frames.push(input.frames[0].clone());

        for i in 1..input.frames.len() {
            let prev = &input.frames[i - 1];
            let curr = &input.frames[i];
            let mut field = block_match_motion_field(prev, curr, 16, SHIFT_OPTIONS);
            // Negate all x components
            for mv in &mut field.vectors {
                mv.x = -mv.x;
            }
            frames.push(warp_by_motion_field(curr, &field));
        }

        Ok(VideoSegment {
            frames,
            fps: input.fps,
        })
    }
}

// ─── Tests ──────────────────────────────────────────────────────────────

#[cfg(test)]
mod tests {
    use super::*;

    fn make_frame(w: u32, h: u32, v: u8) -> Frame {
        let mut data = Vec::with_capacity((w * h * 4) as usize);
        for _ in 0..w * h {
            data.extend_from_slice(&[v, v, v, 255]);
        }
        Frame {
            width: w,
            height: h,
            data,
        }
    }

    fn make_segment(n: usize) -> VideoSegment {
        let frames: Vec<Frame> = (0..n).map(|i| make_frame(32, 32, (i * 30) as u8)).collect();
        VideoSegment { frames, fps: 30.0 }
    }

    #[test]
    fn test_zoom_preview() {
        let e = ZoomGlitch;
        let f = make_frame(32, 32, 128);
        let r = e.process_frame(&f, None, &serde_json::Map::new()).unwrap();
        assert_eq!(r.width, 32);
    }

    #[test]
    fn test_shear_preview() {
        let e = ShearGlitch;
        let f = make_frame(32, 32, 128);
        let r = e.process_frame(&f, None, &serde_json::Map::new()).unwrap();
        assert_eq!(r.width, 32);
    }

    #[test]
    fn test_vibrate_preview() {
        let e = VibrateGlitch;
        let f = make_frame(32, 32, 128);
        let r = e.process_frame(&f, None, &serde_json::Map::new()).unwrap();
        assert_eq!(r.width, 32);
    }

    #[test]
    fn test_stop_video() {
        let e = StopGlitch::default();
        let seg = make_segment(20);
        let r = e
            .process_video(&seg, None, &serde_json::Map::new())
            .unwrap();
        assert_eq!(r.frames.len(), 20);
    }

    #[test]
    fn test_buffer_video() {
        let e = BufferGlitch;
        let seg = make_segment(10);
        let r = e
            .process_video(&seg, None, &serde_json::Map::new())
            .unwrap();
        assert_eq!(r.frames.len(), 10);
    }

    #[test]
    fn test_delay_video() {
        let e = DelayGlitch;
        let seg = make_segment(10);
        let r = e
            .process_video(&seg, None, &serde_json::Map::new())
            .unwrap();
        assert_eq!(r.frames.len(), 10);
    }

    #[test]
    fn test_mirror_video() {
        let e = MirrorGlitch;
        let seg = make_segment(5);
        let r = e
            .process_video(&seg, None, &serde_json::Map::new())
            .unwrap();
        assert_eq!(r.frames.len(), 5);
    }
}
