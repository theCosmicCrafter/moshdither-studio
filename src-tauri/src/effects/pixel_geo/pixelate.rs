use crate::effects::types::*;
use crate::effects::Effect;
use crate::error::Result;
use serde_json::json;

/// Nearest-neighbor pixelation effect.
pub struct Pixelate {
    block_size: u32,
}

impl Pixelate {
    pub fn new(block_size: u32) -> Self {
        Self {
            block_size: block_size.max(1),
        }
    }
}

impl Default for Pixelate {
    fn default() -> Self {
        Self::new(8)
    }
}

impl Effect for Pixelate {
    fn meta(&self) -> EffectMeta {
        EffectMeta {
            id: "pixel_geo.pixelate".to_string(),
            name: "Pixelate".to_string(),
            category: EffectCategory::PixelGeometry,
            media_type: MediaType::Both,
            parameters: vec![ParameterDef {
                id: "block_size".to_string(),
                name: "Block Size".to_string(),
                param_type: ParamType::Slider,
                default: json!(8),
                min: Some(1.0),
                max: Some(64.0),
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
        let bs = params
            .get("block_size")
            .and_then(|v| v.as_u64())
            .unwrap_or(self.block_size as u64) as usize;
        let w = input.width as usize;
        let h = input.height as usize;
        let mut data = input.data.clone();

        for by in (0..h).step_by(bs) {
            for bx in (0..w).step_by(bs) {
                // Sample center pixel of block
                let cx = (bx + bs / 2).min(w - 1);
                let cy = (by + bs / 2).min(h - 1);
                let src = (cy * w + cx) * 4;
                for y in by..(by + bs).min(h) {
                    for x in bx..(bx + bs).min(w) {
                        let dst = (y * w + x) * 4;
                        data[dst..dst + 4].copy_from_slice(&input.data[src..src + 4]);
                    }
                }
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
    fn test_pixelate() {
        let d = vec![100u8, 150, 200, 255, 50, 50, 50, 255];
        let f = Frame {
            width: 2,
            height: 1,
            data: d,
        };
        let e = Pixelate::new(2);
        let r = e.process_frame(&f, None, &serde_json::Map::new()).unwrap();
        // Block size 2, center is at x=1, so both pixels sample from x=1
        assert_eq!(r.data[0], 50);
        assert_eq!(r.data[4], 50);
    }
}
