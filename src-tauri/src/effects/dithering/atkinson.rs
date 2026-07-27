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
            parameters: super::error_diffusion::param_defs(),
        }
    }

    fn process_frame(
        &self,
        input: &Frame,
        _mask: Option<&Mask>,
        params: &ParameterValues,
    ) -> Result<Frame> {
        let kernel = &[
            (1, 0, 1.0 / 8.0),
            (2, 0, 1.0 / 8.0),
            (-1, 1, 1.0 / 8.0),
            (0, 1, 1.0 / 8.0),
            (1, 1, 1.0 / 8.0),
            (0, 2, 1.0 / 8.0),
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
    fn test_atkinson_produces_pattern() {
        let dither = AtkinsonDither::new();
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
        assert!(has_black && has_white);
    }
}
