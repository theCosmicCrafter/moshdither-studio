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
        params: &ParameterValues,
    ) -> Result<Frame> {
        let kernel = &[
            (1, 0, 7.0 / 16.0),
            (-1, 1, 3.0 / 16.0),
            (0, 1, 5.0 / 16.0),
            (1, 1, 1.0 / 16.0),
        ];
        super::error_diffusion::apply(input, kernel, 2, true, params)
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
