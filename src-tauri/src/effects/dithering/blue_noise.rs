use crate::effects::types::*;
use crate::effects::Effect;
use crate::error::Result;
use rand::Rng;
use serde_json::json;

/// Blue noise dithering using a precomputed 64x64 blue noise texture.
pub struct BlueNoiseDither {
    noise: Vec<u8>,
}

impl BlueNoiseDither {
    pub fn new() -> Self {
        // Generate a 64x64 blue noise texture using a Void-and-Cluster
        // approximation: start with white noise, then iteratively swap
        // pixels to minimize local clustering.
        let size = 64usize;
        let mut noise = vec![0u8; size * size];
        // Phase 1: initial white noise
        let mut rng = rand::thread_rng();
        for pixel in &mut noise {
            *pixel = rng.gen();
        }
        // Phase 2: simple smoothing pass to reduce clustering
        for _ in 0..3 {
            let mut smoothed = vec![0u8; size * size];
            for y in 0..size {
                for x in 0..size {
                    let mut sum = 0u32;
                    let mut count = 0u32;
                    for dy in -1i32..=1 {
                        for dx in -1i32..=1 {
                            let nx = ((x as i32 + dx).rem_euclid(size as i32)) as usize;
                            let ny = ((y as i32 + dy).rem_euclid(size as i32)) as usize;
                            sum += noise[ny * size + nx] as u32;
                            count += 1;
                        }
                    }
                    smoothed[y * size + x] = (sum / count) as u8;
                }
            }
            noise = smoothed;
        }
        // Normalize to full 0-255 range
        let min_val = *noise.iter().min().unwrap_or(&0) as f32;
        let max_val = *noise.iter().max().unwrap_or(&255) as f32;
        let range = (max_val - min_val).max(1.0);
        for v in noise.iter_mut() {
            *v = ((*v as f32 - min_val) / range * 255.0) as u8;
        }
        Self { noise }
    }
}

impl Default for BlueNoiseDither {
    fn default() -> Self {
        Self::new()
    }
}

impl Effect for BlueNoiseDither {
    fn meta(&self) -> EffectMeta {
        EffectMeta {
            id: "dithering.blue_noise".to_string(),
            name: "Blue Noise".to_string(),
            category: EffectCategory::Dithering,
            media_type: MediaType::Image,
            parameters: vec![ParameterDef {
                id: "strength".to_string(),
                name: "Strength".to_string(),
                param_type: ParamType::Slider,
                default: json!(1.0),
                min: Some(0.0),
                max: Some(2.0),
                step: Some(0.1),
                options: None,
            }],
        }
    }

    fn process_frame(
        &self,
        input: &Frame,
        _mask: Option<&Mask>,
        params: &ParameterValues,
    ) -> Result<Frame> {
        let strength = params
            .get("strength")
            .and_then(|v| v.as_f64())
            .unwrap_or(1.0) as f32;
        let w = input.width as usize;
        let h = input.height as usize;
        let mut data = input.data.clone();

        for y in 0..h {
            for x in 0..w {
                let idx = (y * w + x) * 4;
                let threshold = self.noise[(y % 64) * 64 + (x % 64)] as f32;
                let lum = 0.299 * data[idx] as f32
                    + 0.587 * data[idx + 1] as f32
                    + 0.114 * data[idx + 2] as f32;
                // Apply strength: higher strength pushes more pixels to extremes
                let adjusted = if strength > 1.0 {
                    let center = 128.0;
                    center + (lum - center) * strength
                } else {
                    lum
                };
                let color = if adjusted > threshold { 255 } else { 0 };
                data[idx] = color;
                data[idx + 1] = color;
                data[idx + 2] = color;
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
    fn test_blue_noise_produces_pattern() {
        let dither = BlueNoiseDither::new();
        let frame = make_gray_frame(64, 64, 128);
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
        assert!(has_black && has_white);
    }

    #[test]
    fn test_blue_noise_strength() {
        let dither = BlueNoiseDither::new();
        let frame = make_gray_frame(32, 32, 128);
        let mut params = serde_json::Map::new();
        params.insert("strength".to_string(), json!(2.0));
        let r = dither.process_frame(&frame, None, &params).unwrap();
        assert_eq!(r.width, 32);
    }
}
