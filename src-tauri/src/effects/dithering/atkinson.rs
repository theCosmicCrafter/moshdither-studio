use crate::effects::types::*;
use crate::effects::Effect;
use crate::error::Result;

/// Atkinson dithering (Macintosh-style error diffusion).
/// Distributes only 6/8 of the error, creating a distinctive look.
pub struct AtkinsonDither;

impl AtkinsonDither {
    pub fn new() -> Self {
        Self
    }
}

impl Default for AtkinsonDither {
    fn default() -> Self {
        Self::new()
    }
}

impl Effect for AtkinsonDither {
    fn meta(&self) -> EffectMeta {
        EffectMeta {
            id: "dithering.atkinson".to_string(),
            name: "Atkinson".to_string(),
            category: EffectCategory::Dithering,
            media_type: MediaType::Image,
            parameters: vec![],
        }
    }

    fn process_frame(
        &self,
        input: &Frame,
        _mask: Option<&Mask>,
        _params: &ParameterValues,
    ) -> Result<Frame> {
        let w = input.width as isize;
        let h = input.height as isize;
        let mut buf: Vec<f32> = input.data.iter().map(|&v| v as f32).collect();

        for y in 0..h {
            for x in 0..w {
                let idx = ((y * w + x) * 4) as usize;
                let old_r = buf[idx];
                let old_g = buf[idx + 1];
                let old_b = buf[idx + 2];

                let new_r = if old_r > 127.0 { 255.0 } else { 0.0 };
                let new_g = if old_g > 127.0 { 255.0 } else { 0.0 };
                let new_b = if old_b > 127.0 { 255.0 } else { 0.0 };

                buf[idx] = new_r;
                buf[idx + 1] = new_g;
                buf[idx + 2] = new_b;

                let err_r = (old_r - new_r) / 8.0;
                let err_g = (old_g - new_g) / 8.0;
                let err_b = (old_b - new_b) / 8.0;

                let offsets = [
                    (1, 0), (2, 0),
                    (-1, 1), (0, 1), (1, 1),
                    (0, 2),
                ];

                for (dx, dy) in offsets {
                    let nx = x + dx;
                    let ny = y + dy;
                    if nx >= 0 && nx < w && ny >= 0 && ny < h {
                        let nidx = ((ny * w + nx) * 4) as usize;
                        buf[nidx] += err_r;
                        buf[nidx + 1] += err_g;
                        buf[nidx + 2] += err_b;
                    }
                }
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
        Ok(VideoSegment { frames, fps: input.fps })
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn make_gray_frame(width: u32, height: u32, gray: u8) -> Frame {
        let mut data = Vec::with_capacity((width * height * 4) as usize);
        for _ in 0..(width * height) {
            data.push(gray);
            data.push(gray);
            data.push(gray);
            data.push(255);
        }
        Frame { width, height, data }
    }

    #[test]
    fn test_atkinson_produces_pattern() {
        let dither = AtkinsonDither::new();
        let frame = make_gray_frame(16, 16, 128);
        let result = dither.process_frame(&frame, None, &serde_json::Map::new()).unwrap();

        let mut has_black = false;
        let mut has_white = false;
        for i in 0..result.data.len() / 4 {
            let r = result.data[i * 4];
            if r == 0 { has_black = true; }
            if r == 255 { has_white = true; }
        }
        assert!(has_black && has_white);
    }
}