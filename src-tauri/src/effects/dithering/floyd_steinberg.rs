use crate::effects::types::*;
use crate::effects::Effect;
use crate::error::Result;

/// Floyd-Steinberg error diffusion dithering.
pub struct FloydSteinbergDither;

impl FloydSteinbergDither {
    pub fn new() -> Self {
        Self
    }
}

impl Default for FloydSteinbergDither {
    fn default() -> Self {
        Self::new()
    }
}

impl Effect for FloydSteinbergDither {
    fn meta(&self) -> EffectMeta {
        EffectMeta {
            id: "dithering.floyd_steinberg".to_string(),
            name: "Floyd-Steinberg".to_string(),
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
        let w = input.width as usize;
        let h = input.height as usize;
        let mut data = input.data.clone();
        // Convert to f32 for error accumulation
        let mut buf: Vec<f32> = data.iter().map(|&v| v as f32).collect();

        for y in 0..h {
            let reverse = y % 2 == 1; // Serpentine
            let x_range: Vec<usize> = if reverse {
                (0..w).rev().collect()
            } else {
                (0..w).collect()
            };

            for &x in &x_range {
                let idx = (y * w + x) * 4;
                let old_r = buf[idx];
                let old_g = buf[idx + 1];
                let old_b = buf[idx + 2];

                // Quantize to black/white
                let new_r = if old_r > 127.0 { 255.0 } else { 0.0 };
                let new_g = if old_g > 127.0 { 255.0 } else { 0.0 };
                let new_b = if old_b > 127.0 { 255.0 } else { 0.0 };

                buf[idx] = new_r;
                buf[idx + 1] = new_g;
                buf[idx + 2] = new_b;

                let err_r = old_r - new_r;
                let err_g = old_g - new_g;
                let err_b = old_b - new_b;

                // Distribute error
                let distribute = |buf: &mut [f32], nx: isize, ny: isize, factor: f32| {
                    if nx >= 0 && nx < w as isize && ny >= 0 && ny < h as isize {
                        let nidx = (ny as usize * w + nx as usize) * 4;
                        buf[nidx] += err_r * factor;
                        buf[nidx + 1] += err_g * factor;
                        buf[nidx + 2] += err_b * factor;
                    }
                };

                if reverse {
                    distribute(&mut buf, x as isize - 1, y as isize, 7.0 / 16.0);
                    distribute(&mut buf, x as isize + 1, y as isize + 1, 3.0 / 16.0);
                    distribute(&mut buf, x as isize, y as isize + 1, 5.0 / 16.0);
                    distribute(&mut buf, x as isize - 1, y as isize + 1, 1.0 / 16.0);
                } else {
                    distribute(&mut buf, x as isize + 1, y as isize, 7.0 / 16.0);
                    distribute(&mut buf, x as isize - 1, y as isize + 1, 3.0 / 16.0);
                    distribute(&mut buf, x as isize, y as isize + 1, 5.0 / 16.0);
                    distribute(&mut buf, x as isize + 1, y as isize + 1, 1.0 / 16.0);
                }
            }
        }

        data = buf.iter().map(|&v| v.clamp(0.0, 255.0) as u8).collect();
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

    fn make_gray_frame(width: u32, height: u32, gray: u8) -> Frame {
        let mut data = Vec::with_capacity((width * height * 4) as usize);
        for _ in 0..(width * height) {
            data.push(gray);
            data.push(gray);
            data.push(gray);
            data.push(255);
        }
        Frame {
            width,
            height,
            data,
        }
    }

    #[test]
    fn test_floyd_steinberg_produces_pattern() {
        let dither = FloydSteinbergDither::new();
        let frame = make_gray_frame(16, 16, 128);
        let result = dither
            .process_frame(&frame, None, &serde_json::Map::new())
            .unwrap();

        let mut has_black = false;
        let mut has_white = false;
        for i in 0..result.data.len() / 4 {
            let r = result.data[i * 4];
            if r == 0 {
                has_black = true;
            }
            if r == 255 {
                has_white = true;
            }
        }
        assert!(has_black, "Should have black pixels");
        assert!(has_white, "Should have white pixels");
    }

    #[test]
    fn test_alpha_preserved() {
        let dither = FloydSteinbergDither::new();
        let data = vec![128u8, 128, 128, 128];
        let frame = Frame {
            width: 1,
            height: 1,
            data,
        };
        let result = dither
            .process_frame(&frame, None, &serde_json::Map::new())
            .unwrap();
        assert_eq!(result.data[3], 128);
    }
}
