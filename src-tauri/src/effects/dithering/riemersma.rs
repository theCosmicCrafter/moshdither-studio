use crate::effects::types::*;
use crate::effects::Effect;
use crate::error::Result;

/// Riemersma dithering — Hilbert curve-based error diffusion.
pub struct RiemersmaDither;

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
        let mut buf: Vec<f32> = input.data.iter().map(|&v| v as f32).collect();
        let mut err_r = 0.0f32;
        let mut err_g = 0.0f32;
        let mut err_b = 0.0f32;

        // Simple approximation: walk pixels in Hilbert-like order
        for i in 0..(n * n) {
            let (hx, hy) = hilbert_xy(i, n);
            if hx >= w || hy >= h {
                continue;
            }
            let idx = (hy * w + hx) * 4;
            for (c, err) in [(0, &mut err_r), (1, &mut err_g), (2, &mut err_b)] {
                let old = buf[idx + c] + *err * 0.5;
                let new = if old > 127.0 { 255.0 } else { 0.0 };
                *err = old - new;
                buf[idx + c] = new;
            }
        }

        let data = buf.iter().map(|&v| v.clamp(0.0, 255.0) as u8).collect();
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
