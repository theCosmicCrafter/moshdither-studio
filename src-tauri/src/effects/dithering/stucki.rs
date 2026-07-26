use crate::effects::types::*;
use crate::effects::Effect;
use crate::error::Result;

/// Stucki error diffusion.
pub struct StuckiDither;

impl StuckiDither {
    pub fn new() -> Self {
        Self
    }
}

impl Default for StuckiDither {
    fn default() -> Self {
        Self::new()
    }
}

impl Effect for StuckiDither {
    fn meta(&self) -> EffectMeta {
        EffectMeta {
            id: "dithering.stucki".to_string(),
            name: "Stucki".to_string(),
            category: EffectCategory::Dithering,
            media_type: MediaType::Image,
            parameters: super::error_diffusion::param_defs(),
        }
    }

    fn process_frame(
        &self,
        input: &Frame,
        _m: Option<&Mask>,
        params: &ParameterValues,
    ) -> Result<Frame> {
        let kernel = &[
            (1, 0, 8.0 / 42.0),
            (2, 0, 4.0 / 42.0),
            (-2, 1, 2.0 / 42.0),
            (-1, 1, 4.0 / 42.0),
            (0, 1, 8.0 / 42.0),
            (1, 1, 4.0 / 42.0),
            (2, 1, 2.0 / 42.0),
            (-2, 2, 1.0 / 42.0),
            (-1, 2, 2.0 / 42.0),
            (0, 2, 4.0 / 42.0),
            (1, 2, 2.0 / 42.0),
            (2, 2, 1.0 / 42.0),
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
        let e = StuckiDither::new();
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
