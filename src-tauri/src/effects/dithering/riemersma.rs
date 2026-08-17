use crate::effects::types::*;
use crate::effects::Effect;
use crate::error::Result;

/// Riemersma dithering — Hilbert curve traversal with an exponentially
/// decaying error history, per Thiadmer Riemersma's "A Balanced Dithering
/// Technique" (C/C++ Users Journal, 1998).
pub struct RiemersmaDither;

/// Number of past errors remembered along the Hilbert path.
const HIST_LEN: usize = 16;
/// Ratio between the largest (most recent) and smallest (oldest) weight.
const HIST_RATIO: f32 = 16.0;

/// Exponentially increasing weights: index 0 = oldest (1/ratio), last = newest (1.0).
fn history_weights() -> [f32; HIST_LEN] {
    let mut w = [0.0f32; HIST_LEN];
    for (i, v) in w.iter_mut().enumerate() {
        *v = HIST_RATIO.powf((i as f32 - (HIST_LEN as f32 - 1.0)) / (HIST_LEN as f32 - 1.0));
    }
    w
}

impl RiemersmaDither {
    pub fn new() -> Self {
        Self
    }
}

impl Default for RiemersmaDither {
    fn default() -> Self {
        Self::new()
    }
}

impl Effect for RiemersmaDither {
    fn meta(&self) -> EffectMeta {
        EffectMeta {
            id: "dithering.riemersma".to_string(),
            name: "Riemersma".to_string(),
            category: EffectCategory::Dithering,
            media_type: MediaType::Image,
            parameters: vec![],
        }
    }

    fn process_frame(
        &self,
        input: &Frame,
        _m: Option<&Mask>,
        _p: &ParameterValues,
    ) -> Result<Frame> {
        let w = input.width as usize;
        let h = input.height as usize;
        let n = w.max(h).next_power_of_two();

        // Compute per-pixel luminance
        let mut lum: Vec<f32> = vec![0.0; w * h];
        for y in 0..h {
            for x in 0..w {
                let idx = (y * w + x) * 4;
                lum[y * w + x] = crate::effects::luminance_f32(
                    input.data[idx],
                    input.data[idx + 1],
                    input.data[idx + 2],
                );
            }
        }

        // Walk pixels in Hilbert order carrying a ring buffer of the last
        // HIST_LEN quantization errors. The correction applied to each pixel
        // is the weighted sum of that history, with recent errors weighing
        // exponentially more than old ones.
        let weights = history_weights();
        let mut history = [0.0f32; HIST_LEN];
        let mut head = 0usize; // index of the oldest entry (next overwrite target)

        for i in 0..(n * n) {
            let (hx, hy) = hilbert_xy(i, n);
            if hx >= w || hy >= h {
                continue;
            }
            let pi = hy * w + hx;

            let mut correction = 0.0f32;
            for (j, wgt) in weights.iter().enumerate() {
                correction += history[(head + j) % HIST_LEN] * wgt;
            }

            let original = lum[pi];
            let corrected = original + correction;
            let new = if corrected > 127.0 { 255.0 } else { 0.0 };

            // Store the raw quantization error (original minus output), as in
            // the original algorithm — this keeps the history bounded.
            history[head] = original - new;
            head = (head + 1) % HIST_LEN;

            lum[pi] = new;
        }

        let mut data = input.data.clone();
        for y in 0..h {
            for x in 0..w {
                let idx = (y * w + x) * 4;
                let v = lum[y * w + x].clamp(0.0, 255.0) as u8;
                data[idx] = v;
                data[idx + 1] = v;
                data[idx + 2] = v;
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

/// Map Hilbert index to (x, y) coordinates for curve order n.
fn hilbert_xy(index: usize, n: usize) -> (usize, usize) {
    let mut x = 0usize;
    let mut y = 0usize;
    let mut t = index;
    for s in (0..n.trailing_zeros()).step_by(1) {
        let rx = 1 & (t / 2);
        let ry = 1 & (t ^ rx);
        if ry == 0 {
            if rx == 1 {
                x = (1 << s) - 1 - x;
                y = (1 << s) - 1 - y;
            }
            std::mem::swap(&mut x, &mut y);
        }
        x += rx << s;
        y += ry << s;
        t /= 4;
    }
    (x, y)
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

    #[test]
    fn test_produces_pattern() {
        let e = RiemersmaDither::new();
        let r = e
            .process_frame(&gray(16, 16, 128), None, &serde_json::Map::new())
            .unwrap();
        let mut hb = false;
        let mut hw = false;
        for i in 0..r.data.len() / 4 {
            if r.data[i * 4] == 0 {
                hb = true;
            }
            if r.data[i * 4] == 255 {
                hw = true;
            }
        }
        assert!(hb && hw);
    }
}
