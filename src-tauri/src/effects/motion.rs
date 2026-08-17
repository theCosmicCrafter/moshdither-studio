//! Motion estimation utilities for datamoshing and optical-flow effects.
//!
//! Provides block-matching motion estimation (similar to eternal-mess / supermosh)
//! and dense optical flow helpers (Horn-Schunck). All functions work on RGBA
//! `Frame` buffers and are designed to be called from effect implementations.

#![allow(clippy::too_many_arguments)]

use crate::effects::types::Frame;

/// A 2D motion vector.
#[derive(Debug, Clone, Copy, Default, PartialEq)]
pub struct MotionVector {
    pub x: i32,
    pub y: i32,
}

/// Grid of motion vectors, one per block.
pub struct MotionField {
    pub width: usize,
    pub height: usize,
    pub block_size: usize,
    pub vectors: Vec<MotionVector>,
}

impl MotionField {
    pub fn get(&self, bx: usize, by: usize) -> Option<&MotionVector> {
        if bx >= self.width || by >= self.height {
            return None;
        }
        self.vectors.get(by * self.width + bx)
    }

    /// Sample the vector at pixel coordinates (nearest block).
    pub fn at_pixel(&self, x: usize, y: usize) -> MotionVector {
        let bx = (x / self.block_size).min(self.width.saturating_sub(1));
        let by = (y / self.block_size).min(self.height.saturating_sub(1));
        *self.get(bx, by).unwrap_or(&MotionVector::default())
    }
}

/// Block-matching motion estimation with a limited set of candidate shifts.
///
/// This is the algorithm used by eternal-mess: for each block, try a small set
/// of integer shifts and pick the one that minimises the absolute RGB difference.
/// The search is intentionally small so it is fast enough for real-time preview.
///
/// # Arguments
/// * `prev` - previous frame
/// * `curr` - current frame
/// * `block_size` - size of square blocks (e.g. 16)
/// * `shift_options` - candidate shifts to evaluate (e.g. `[0, 1, -1, 2, -2, 4, -4, 8, -8]`)
pub fn block_match_motion_field(
    prev: &Frame,
    curr: &Frame,
    block_size: usize,
    shift_options: &[i32],
) -> MotionField {
    let w = prev.width as usize;
    let h = prev.height as usize;
    let bw = w.div_ceil(block_size);
    let bh = h.div_ceil(block_size);
    let mut vectors = Vec::with_capacity(bw * bh);

    for by in 0..bh {
        for bx in 0..bw {
            let x0 = bx * block_size;
            let y0 = by * block_size;
            let x1 = (x0 + block_size).min(w);
            let y1 = (y0 + block_size).min(h);

            let mut best = MotionVector { x: 0, y: 0 };
            let mut best_diff = u64::MAX;

            for &sx in shift_options {
                for &sy in shift_options {
                    let diff = block_diff(prev, curr, x0, y0, x1, y1, sx, sy, w, h);
                    if diff < best_diff {
                        best_diff = diff;
                        best = MotionVector { x: sx, y: sy };
                    }
                }
            }

            vectors.push(best);
        }
    }

    MotionField {
        width: bw,
        height: bh,
        block_size,
        vectors,
    }
}

fn block_diff(
    prev: &Frame,
    curr: &Frame,
    x0: usize,
    y0: usize,
    x1: usize,
    y1: usize,
    sx: i32,
    sy: i32,
    w: usize,
    h: usize,
) -> u64 {
    let mut diff: u64 = 0;
    for y in y0..y1 {
        for x in x0..x1 {
            let sx_coord = (x as i32 + sx).rem_euclid(w as i32) as usize;
            let sy_coord = (y as i32 + sy).rem_euclid(h as i32) as usize;
            let sidx = (sy_coord * w + sx_coord) * 4;
            let didx = (y * w + x) * 4;
            diff += (prev.data[sidx] as i32 - curr.data[didx] as i32).unsigned_abs() as u64;
            diff += (prev.data[sidx + 1] as i32 - curr.data[didx + 1] as i32).unsigned_abs() as u64;
            diff += (prev.data[sidx + 2] as i32 - curr.data[didx + 2] as i32).unsigned_abs() as u64;
        }
    }
    diff
}

/// Warp a frame using a motion field. For each pixel sample the source location
/// indicated by the nearest block vector.
pub fn warp_by_motion_field(src: &Frame, field: &MotionField) -> Frame {
    let w = src.width as usize;
    let h = src.height as usize;
    let mut out = vec![0u8; src.data.len()];
    for (i, chunk) in out.chunks_exact_mut(4).enumerate() {
        let x = i % w;
        let y = i / w;
        let mv = field.at_pixel(x, y);
        let sx = (x as i32 + mv.x).rem_euclid(w as i32) as usize;
        let sy = (y as i32 + mv.y).rem_euclid(h as i32) as usize;
        let sidx = (sy * w + sx) * 4;
        chunk[0] = src.data[sidx];
        chunk[1] = src.data[sidx + 1];
        chunk[2] = src.data[sidx + 2];
        chunk[3] = src.data[sidx + 3];
    }
    Frame {
        width: src.width,
        height: src.height,
        data: out,
    }
}

/// Apply a motion field to `src` but blend the result with `src` for a ghosting look.
pub fn warp_and_blend(src: &Frame, field: &MotionField, alpha: f32) -> Frame {
    let warped = warp_by_motion_field(src, field);
    let mut out = src.data.clone();
    let a = alpha.clamp(0.0, 1.0);
    for i in (0..out.len()).step_by(4) {
        for c in 0..3 {
            let v = (src.data[i + c] as f32 * (1.0 - a) + warped.data[i + c] as f32 * a) as u8;
            out[i + c] = v;
        }
    }
    Frame {
        width: src.width,
        height: src.height,
        data: out,
    }
}

/// Convert RGBA frame to a single-channel grayscale f32 image (luminance).
fn to_luma(frame: &Frame) -> Vec<f32> {
    let w = frame.width as usize;
    let h = frame.height as usize;
    let mut luma = vec![0.0f32; w * h];
    for i in (0..frame.data.len()).step_by(4) {
        let idx = i / 4;
        luma[idx] =
            crate::effects::luminance_f32(frame.data[i], frame.data[i + 1], frame.data[i + 2]);
    }
    luma
}

/// Compute Horn-Schunck dense optical flow between two frames.
///
/// Returns two Vec<f32> of the same size as the frames: u (horizontal) and v (vertical).
///
/// # Arguments
/// * `alpha` - smoothness weight (typical 0.1 - 1.0)
/// * `iterations` - number of iterations (typical 10 - 100)
/// * `blur_sigma` - optional pre-blur sigma for noise reduction (0.0 = disabled)
pub fn horn_schunck(
    prev: &Frame,
    curr: &Frame,
    alpha: f32,
    iterations: usize,
) -> (Vec<f32>, Vec<f32>) {
    let w = prev.width as usize;
    let h = prev.height as usize;
    let n = w * h;
    let luma_prev = to_luma(prev);
    let luma_curr = to_luma(curr);

    // Spatial gradients (central differences), averaged across both frames
    // for better accuracy per the Horn-Schunck formulation.
    let mut ex = vec![0.0f32; n];
    let mut ey = vec![0.0f32; n];
    for y in 0..h {
        for x in 0..w {
            let idx = y * w + x;
            let xp = (x + 1).min(w - 1);
            let xm = x.saturating_sub(1);
            let yp = (y + 1).min(h - 1);
            let ym = y.saturating_sub(1);
            // ex = ∂I/∂x (horizontal gradient)
            ex[idx] = ((luma_curr[y * w + xp] - luma_curr[y * w + xm])
                + (luma_prev[y * w + xp] - luma_prev[y * w + xm]))
                * 0.25;
            // ey = ∂I/∂y (vertical gradient)
            ey[idx] = ((luma_curr[yp * w + x] - luma_curr[ym * w + x])
                + (luma_prev[yp * w + x] - luma_prev[ym * w + x]))
                * 0.25;
        }
    }

    // Temporal gradient (∂I/∂t)
    let mut et = vec![0.0f32; n];
    for i in 0..n {
        et[i] = (luma_curr[i] - luma_prev[i]) * 0.5;
    }

    let mut u = vec![0.0f32; n];
    let mut v = vec![0.0f32; n];
    let alpha_sq = alpha * alpha;

    for _ in 0..iterations {
        let mut u_new = vec![0.0f32; n];
        let mut v_new = vec![0.0f32; n];
        for y in 0..h {
            for x in 0..w {
                let idx = y * w + x;
                let (u_avg, v_avg) = neighborhood_average(&u, &v, x, y, w, h);
                let denom = alpha_sq + ex[idx] * ex[idx] + ey[idx] * ey[idx];
                let p = (ex[idx] * u_avg + ey[idx] * v_avg + et[idx]) / denom;
                u_new[idx] = u_avg - ex[idx] * p;
                v_new[idx] = v_avg - ey[idx] * p;
            }
        }
        u = u_new;
        v = v_new;
    }

    (u, v)
}

fn neighborhood_average(
    u: &[f32],
    v: &[f32],
    x: usize,
    y: usize,
    w: usize,
    h: usize,
) -> (f32, f32) {
    let mut sum_u = 0.0f32;
    let mut sum_v = 0.0f32;
    let mut count = 0u32;
    for dy in -1i32..=1 {
        for dx in -1i32..=1 {
            if dx == 0 && dy == 0 {
                continue;
            }
            let nx = (x as i32 + dx).clamp(0, w as i32 - 1) as usize;
            let ny = (y as i32 + dy).clamp(0, h as i32 - 1) as usize;
            let nidx = ny * w + nx;
            sum_u += u[nidx];
            sum_v += v[nidx];
            count += 1;
        }
    }
    (sum_u / count as f32, sum_v / count as f32)
}

/// Warp a frame by a dense optical flow field (u, v).
pub fn warp_by_flow(src: &Frame, u: &[f32], v: &[f32]) -> Frame {
    let w = src.width as usize;
    let h = src.height as usize;
    let mut out = vec![0u8; src.data.len()];
    for (i, chunk) in out.chunks_exact_mut(4).enumerate() {
        let x = (i % w) as i32;
        let y = (i / w) as i32;
        let sx = (x + u[i].round() as i32).rem_euclid(w as i32) as usize;
        let sy = (y + v[i].round() as i32).rem_euclid(h as i32) as usize;
        let sidx = (sy * w + sx) * 4;
        chunk[0] = src.data[sidx];
        chunk[1] = src.data[sidx + 1];
        chunk[2] = src.data[sidx + 2];
        chunk[3] = src.data[sidx + 3];
    }
    Frame {
        width: src.width,
        height: src.height,
        data: out,
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn gray_frame(width: u32, height: u32, value: u8) -> Frame {
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

    #[test]
    fn block_match_zero_motion() {
        let f = gray_frame(32, 32, 128);
        let field = block_match_motion_field(&f, &f, 16, &[0, 1, -1]);
        assert_eq!(field.width, 2);
        assert_eq!(field.height, 2);
        for mv in &field.vectors {
            assert_eq!(mv.x, 0);
            assert_eq!(mv.y, 0);
        }
    }

    #[test]
    fn block_match_detects_shift() {
        let mut prev = gray_frame(32, 32, 128);
        let mut curr = prev.clone();
        // Shift a bright block 4 pixels right
        for y in 4..12 {
            for x in 8..16 {
                let idx = (y * 32 + x) * 4;
                prev.data[idx] = 255;
                prev.data[idx + 1] = 255;
                prev.data[idx + 2] = 255;
            }
        }
        for y in 4..12 {
            for x in 12..20 {
                let idx = (y * 32 + x) * 4;
                curr.data[idx] = 255;
                curr.data[idx + 1] = 255;
                curr.data[idx + 2] = 255;
            }
        }
        let field = block_match_motion_field(&prev, &curr, 16, &[0, 1, -1, 2, -2, 4, -4]);
        let mv = field.at_pixel(12, 8);
        // block_diff measures prev[shifted] vs curr[original], so a block that
        // moved right by 4 in curr will best match prev at sx = -4
        assert_eq!(mv.x, -4);
        assert_eq!(mv.y, 0);
    }

    #[test]
    fn horn_schunck_zero_motion() {
        let f = gray_frame(16, 16, 128);
        let (u, v) = horn_schunck(&f, &f, 0.5, 10);
        for i in 0..u.len() {
            assert!(u[i].abs() < 0.01, "u[{}] = {}", i, u[i]);
            assert!(v[i].abs() < 0.01, "v[{}] = {}", i, v[i]);
        }
    }
}
