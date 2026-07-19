use crate::effects::types::*;
use crate::effects::Effect;
use crate::error::Result;
use serde_json::json;

/// 3D anaglyph — red/cyan channel separation.
pub struct Anaglyph {
    shift: u32,
}

impl Anaglyph {
    pub fn new(shift: u32) -> Self {
        Self { shift }
    }
}

impl Default for Anaglyph {
    fn default() -> Self {
        Self::new(6)
    }
}

impl Effect for Anaglyph {
    fn meta(&self) -> EffectMeta {
        EffectMeta {
            id: "pixel_geo.anaglyph".to_string(),
            name: "Anaglyph".to_string(),
            category: EffectCategory::PixelGeometry,
            media_type: MediaType::Both,
            parameters: vec![ParameterDef {
                id: "shift".to_string(),
                name: "Shift".to_string(),
                param_type: ParamType::Slider,
                default: json!(6),
                min: Some(0.0),
                max: Some(50.0),
                step: Some(1.0),
                options: None,
            }],
        }
    }

    fn process_frame(
        &self,
        input: &Frame,
        _m: Option<&Mask>,
        params: &ParameterValues,
    ) -> Result<Frame> {
        let shift = params
            .get("shift")
            .and_then(|v| v.as_u64())
            .unwrap_or(self.shift as u64) as usize;
        let w = input.width as usize;
        let h = input.height as usize;
        let mut data = input.data.clone();

        for y in 0..h {
            for x in 0..w {
                let dst_idx = (y * w + x) * 4;
                let rx = x.saturating_sub(shift).min(w - 1);
                let bx = (x + shift).min(w - 1);
                data[dst_idx] = input.data[(y * w + rx) * 4];
                data[dst_idx + 1] = input.data[dst_idx + 1];
                data[dst_idx + 2] = input.data[(y * w + bx) * 4 + 2];
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

    #[test]
    fn test_anaglyph() {
        let d = vec![
            255u8, 0, 0, 255, 0, 255, 0, 255, 0, 0, 255, 255, 0, 0, 0, 255,
        ];
        let f = Frame {
            width: 4,
            height: 1,
            data: d,
        };
        let e = Anaglyph::new(1);
        let r = e.process_frame(&f, None, &serde_json::Map::new()).unwrap();
        // At x=1, red from x=0 (255), blue from x=2 (255)
        assert_eq!(r.data[4], 255);
        assert_eq!(r.data[6], 255);
    }
}
