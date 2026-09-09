//! Optical Flow effect using Horn-Schunck dense flow estimation.
//!
//! Computes dense optical flow between consecutive frames and uses it to
//! create motion-compensated warping effects. Inspired by GlitchNodes PixelFloat
//! and the optical flow concepts from the reference analysis.

use crate::effects::motion::{horn_schunck, warp_by_flow};
use crate::effects::types::*;
use crate::effects::Effect;
use crate::error::Result;
use serde_json::json;

/// Optical Flow — uses Horn-Schunck dense flow to warp frames based on
/// detected motion between consecutive frames.
pub struct OpticalFlow {
    alpha: f32,
    iterations: usize,
}

impl Default for OpticalFlow {
    fn default() -> Self {
        Self {
            alpha: 0.5,
            iterations: 20,
        }
    }
}

impl Effect for OpticalFlow {
    fn meta(&self) -> EffectMeta {
        EffectMeta {
            id: "datamoshing.optical_flow".to_string(),
            name: "Optical Flow".to_string(),
            category: EffectCategory::Datamoshing,
            media_type: MediaType::Video,
            parameters: vec![
                ParameterDef {
                    id: "alpha".to_string(),
                    name: "Smoothness".to_string(),
                    param_type: ParamType::Slider,
                    default: json!(0.5),
                    min: Some(0.01),
                    max: Some(2.0),
                    // 0.01 stepping by 0.05 lands on 1.96 and never reaches the
                    // advertised 2.0, so the top of the range was unreachable
                    // from the input's arrows. 0.01 divides the span exactly.
                    step: Some(0.01),
                    options: None,
                },
                ParameterDef {
                    id: "iterations".to_string(),
                    name: "Iterations".to_string(),
                    param_type: ParamType::Slider,
                    default: json!(20),
                    min: Some(1.0),
                    max: Some(100.0),
                    step: Some(1.0),
                    options: None,
                },
                ParameterDef {
                    id: "warp_strength".to_string(),
                    name: "Warp Strength".to_string(),
                    param_type: ParamType::Slider,
                    default: json!(1.0),
                    min: Some(0.0),
                    max: Some(3.0),
                    step: Some(0.1),
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
        // Single-frame preview: compute flow against a slightly shifted version
        // of itself to produce a visible warping effect.
        let shifted = shift_frame(input, 2, 1);
        let (u, v) = horn_schunck(input, &shifted, self.alpha, self.iterations);
        Ok(warp_by_flow(input, &u, &v))
    }

    fn process_video(
        &self,
        input: &VideoSegment,
        _mask: Option<&Mask>,
        params: &ParameterValues,
    ) -> Result<VideoSegment> {
        let alpha = params
            .get("alpha")
            .and_then(|v| v.as_f64())
            .unwrap_or(self.alpha as f64) as f32;
        let iterations = params
            .get("iterations")
            .and_then(|v| v.as_u64())
            .unwrap_or(self.iterations as u64) as usize;
        let warp_strength = params
            .get("warp_strength")
            .and_then(|v| v.as_f64())
            .unwrap_or(1.0) as f32;

        if input.frames.len() < 2 {
            return Ok(input.clone());
        }

        let mut frames = Vec::with_capacity(input.frames.len());
        frames.push(input.frames[0].clone());

        for i in 1..input.frames.len() {
            let prev = &input.frames[i - 1];
            let curr = &input.frames[i];
            let (u, v) = horn_schunck(prev, curr, alpha, iterations);
            // Scale flow by warp_strength
            let u_scaled: Vec<f32> = u.iter().map(|&val| val * warp_strength).collect();
            let v_scaled: Vec<f32> = v.iter().map(|&val| val * warp_strength).collect();
            frames.push(warp_by_flow(curr, &u_scaled, &v_scaled));
        }

        Ok(VideoSegment {
            frames,
            fps: input.fps,
        })
    }
}

fn shift_frame(input: &Frame, dx: i32, dy: i32) -> Frame {
    let w = input.width as usize;
    let h = input.height as usize;
    let mut out = vec![0u8; input.data.len()];
    for (i, chunk) in out.chunks_exact_mut(4).enumerate() {
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

    #[test]
    fn test_optical_flow_preview() {
        let e = OpticalFlow::default();
        let f = make_frame(16, 16, 128);
        let r = e.process_frame(&f, None, &serde_json::Map::new()).unwrap();
        assert_eq!(r.width, 16);
        assert_eq!(r.height, 16);
    }

    #[test]
    fn test_optical_flow_video() {
        let e = OpticalFlow::default();
        let frames = vec![make_frame(16, 16, 100), make_frame(16, 16, 150)];
        let seg = VideoSegment { frames, fps: 30.0 };
        let r = e
            .process_video(&seg, None, &serde_json::Map::new())
            .unwrap();
        assert_eq!(r.frames.len(), 2);
        // Second frame should be warped
        assert_eq!(r.frames[1].width, 16);
    }
}
