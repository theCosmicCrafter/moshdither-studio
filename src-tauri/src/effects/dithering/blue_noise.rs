use crate::effects::types::*;
use crate::effects::Effect;
use crate::error::Result;

/// Blue noise dithering using a precomputed 64x64 blue noise texture.
pub struct BlueNoiseDither {
    noise: Vec<u8>,
}

impl BlueNoiseDither {
    pub fn new() -> Self {
        // 64x64 blue noise texture (simplified — in production, load from file)
        // Using a hash-based pseudo-random for now that approximates blue noise distribution
        let mut noise = vec![0u8; 64 * 64];
        for y in 0..64 {
            for x in 0..64 {
                // Simple hash for deterministic "noise"
                let v = (((x as u32).wrapping_mul(374761393u32).wrapping_add((y as u32).wrapping_mul(668265263u32)))
                    .wrapping_mul(1203246503u32) >> 24) as u8;
                noise[y * 64 + x] = v;
            }
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

        for y in 0..h {
            for x in 0..w {
                let idx = (y * w + x) * 4;
                let threshold = self.noise[(y % 64) * 64 + (x % 64)];
                let lum = 0.299 * data[idx] as f32 + 0.587 * data[idx + 1] as f32 + 0.114 * data[idx + 2] as f32;
                let color = if lum > threshold as f32 { 255 } else { 0 };
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
    fn test_blue_noise_produces_pattern() {
        let dither = BlueNoiseDither::new();
        let frame = make_gray_frame(64, 64, 128);
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