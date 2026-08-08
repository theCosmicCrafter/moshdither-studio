use crate::effects::types::*;
use crate::effects::Effect;
use crate::error::Result;
use serde_json::json;

/// Edge Stretch glitch effect.
///
/// Detects edges using a Sobel operator, then displaces pixels
/// horizontally based on edge magnitude. This creates a glitchy
/// stretching/warping effect concentrated around image features.
pub struct EdgeStretch;

impl Default for EdgeStretch {
    fn default() -> Self {
        Self
    }
}

impl Effect for EdgeStretch {
    fn meta(&self) -> EffectMeta {
        EffectMeta {
            id: "glitch.edge_stretch".to_string(),
            name: "Edge Stretch".to_string(),
            category: EffectCategory::Glitch,
            media_type: MediaType::Both,
            parameters: vec![
                ParameterDef {
                    id: "amount".to_string(),
                    name: "Amount".to_string(),
                    param_type: ParamType::Slider,
                    default: json!(0.5),
                    min: Some(0.0),
                    max: Some(1.0),
                    step: Some(0.05),
                    options: None,
                },
                ParameterDef {
                    id: "blur_radius".to_string(),
                    name: "Edge Blur".to_string(),
                    param_type: ParamType::Slider,
                    default: json!(5.0),
                    min: Some(1.0),
                    max: Some(21.0),
                    step: Some(1.0),
                    options: None,
                },
            ],
        }
    }

    fn process_frame(
        &self,
        input: &Frame,
        _mask: Option<&Mask>,
        params: &ParameterValues,
    ) -> Result<Frame> {
        let amount = params.get("amount").and_then(|v| v.as_f64()).unwrap_or(0.5) as f32;
        let blur_radius = params
            .get("blur_radius")
            .and_then(|v| v.as_f64())
            .unwrap_or(5.0) as usize;

        let w = input.width as usize;
        let h = input.height as usize;
        if w == 0 || h == 0 {
            return Ok(input.clone());
        }

        // Step 1: Compute grayscale luminance
        let mut gray = vec![0.0f32; w * h];
        for (i, pixel) in gray.iter_mut().enumerate() {
            let r = input.data[i * 4] as f32;
            let g = input.data[i * 4 + 1] as f32;
            let b = input.data[i * 4 + 2] as f32;
            *pixel = 0.299 * r + 0.587 * g + 0.114 * b;
        }

        // Step 2: Sobel edge detection
        let mut edges = vec![0.0f32; w * h];
        for y in 1..h - 1 {
            for x in 1..w - 1 {
                let idx = y * w + x;
                let gx = -gray[idx - w - 1] - 2.0 * gray[idx - 1] - gray[idx + w - 1]
                    + gray[idx - w + 1]
                    + 2.0 * gray[idx + 1]
                    + gray[idx + w + 1];
                let gy = -gray[idx - w - 1] - 2.0 * gray[idx - w] - gray[idx - w + 1]
                    + gray[idx + w - 1]
                    + 2.0 * gray[idx + w]
                    + gray[idx + w + 1];
                edges[idx] = (gx * gx + gy * gy).sqrt();
            }
        }

        // Normalize edges to [0, 1]
        let max_edge = edges.iter().cloned().fold(0.0f32, f32::max).max(1.0);
        for e in edges.iter_mut() {
            *e /= max_edge;
        }

        // Step 3: Box blur the edge map to create smooth displacement field
        let radius = blur_radius.min(w / 2).min(h / 2).max(1);
        let mut blurred = vec![0.0f32; w * h];
        // Horizontal pass
        for y in 0..h {
            for x in 0..w {
                let mut sum = 0.0;
                let mut count = 0.0;
                for dx in -(radius as isize)..=(radius as isize) {
                    let nx = x as isize + dx;
                    if nx >= 0 && nx < w as isize {
                        sum += edges[y * w + nx as usize];
                        count += 1.0;
                    }
                }
                blurred[y * w + x] = sum / count;
            }
        }
        // Vertical pass (in-place on edges, read from blurred)
        for y in 0..h {
            for x in 0..w {
                let mut sum = 0.0;
                let mut count = 0.0;
                for dy in -(radius as isize)..=(radius as isize) {
                    let ny = y as isize + dy;
                    if ny >= 0 && ny < h as isize {
                        sum += blurred[ny as usize * w + x];
                        count += 1.0;
                    }
                }
                edges[y * w + x] = sum / count;
            }
        }

        // Step 4: Displace pixels horizontally based on blurred edge map
        let max_displacement = (amount * 20.0) as i32;
        let mut data = vec![0u8; w * h * 4];

        for y in 0..h {
            for x in 0..w {
                let idx = y * w + x;
                let displacement = (edges[idx] * max_displacement as f32) as i32;
                let src_x = x as i32 + displacement;
                let src_x_clamped = src_x.clamp(0, w as i32 - 1) as usize;
                let src_idx = (y * w + src_x_clamped) * 4;
                let dst_idx = idx * 4;

                data[dst_idx] = input.data[src_idx];
                data[dst_idx + 1] = input.data[src_idx + 1];
                data[dst_idx + 2] = input.data[src_idx + 2];
                data[dst_idx + 3] = input.data[src_idx + 3];
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

    fn gray(w: u32, h: u32, g: u8) -> Frame {
        let mut d = Vec::with_capacity((w * h * 4) as usize);
        for _ in 0..(w * h) {
            d.extend_from_slice(&[g, g, g, 255]);
        }
        Frame {
            width: w,
            height: h,
            data: d,
        }
    }

    fn gradient(w: u32, h: u32) -> Frame {
        let mut d = Vec::with_capacity((w * h * 4) as usize);
        for y in 0..h {
            for x in 0..w {
                let v = ((x + y) % 64 * 4) as u8;
                d.extend_from_slice(&[v, v, v, 255]);
            }
        }
        Frame {
            width: w,
            height: h,
            data: d,
        }
    }

    #[test]
    fn test_preserves_dimensions() {
        let e = EdgeStretch;
        let r = e
            .process_frame(&gray(32, 24, 128), None, &serde_json::Map::new())
            .unwrap();
        assert_eq!(r.width, 32);
        assert_eq!(r.height, 24);
    }

    #[test]
    fn test_preserves_alpha() {
        let mut d = Vec::new();
        for _ in 0..(8 * 8) {
            d.extend_from_slice(&[100, 100, 100, 200]);
        }
        let f = Frame {
            width: 8,
            height: 8,
            data: d,
        };
        let e = EdgeStretch;
        let r = e.process_frame(&f, None, &serde_json::Map::new()).unwrap();
        for i in 0..(8 * 8) {
            assert_eq!(r.data[i * 4 + 3], 200);
        }
    }

    #[test]
    fn test_flat_image_no_change() {
        // A flat gray image has no edges, so displacement should be zero
        let e = EdgeStretch;
        let input = gray(16, 16, 128);
        let r = e
            .process_frame(&input, None, &serde_json::Map::new())
            .unwrap();
        for i in 0..(16 * 16) {
            assert_eq!(r.data[i * 4], 128);
            assert_eq!(r.data[i * 4 + 1], 128);
            assert_eq!(r.data[i * 4 + 2], 128);
        }
    }

    #[test]
    fn test_gradient_produces_displacement() {
        // A gradient with sharp transitions should produce some displacement
        let e = EdgeStretch;
        let mut params = serde_json::Map::new();
        params.insert("amount".to_string(), json!(1.0));
        let input = gradient(32, 32);
        let r = e.process_frame(&input, None, &params).unwrap();
        // At least some pixels should differ from the original
        let mut has_diff = false;
        for i in 0..(32 * 32) {
            if r.data[i * 4] != input.data[i * 4] {
                has_diff = true;
                break;
            }
        }
        assert!(has_diff);
    }

    #[test]
    fn test_zero_width_frame_does_not_panic() {
        // `1..w-1` underflows in usize arithmetic when w == 0. Not reachable
        // from the shipped UI (decoded media always has positive
        // dimensions), but a malformed/synthetic frame (fuzzed project file,
        // future caller) shouldn't be able to panic the process.
        let e = EdgeStretch;
        let input = Frame {
            width: 0,
            height: 4,
            data: Vec::new(),
        };
        let r = e
            .process_frame(&input, None, &serde_json::Map::new())
            .unwrap();
        assert_eq!(r.width, 0);
        assert_eq!(r.height, 4);
    }

    #[test]
    fn test_zero_height_frame_does_not_panic() {
        // Same underflow risk as above, but for `1..h-1` when h == 0.
        let e = EdgeStretch;
        let input = Frame {
            width: 4,
            height: 0,
            data: Vec::new(),
        };
        let r = e
            .process_frame(&input, None, &serde_json::Map::new())
            .unwrap();
        assert_eq!(r.width, 4);
        assert_eq!(r.height, 0);
    }
}
