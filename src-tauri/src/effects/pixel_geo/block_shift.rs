use crate::effects::types::*;
use crate::effects::Effect;
use crate::error::Result;
use serde_json::json;

/// Block shift — shift pixel blocks with random offsets.
pub struct BlockShift {
    block_size: u32,
    max_shift: u32,
}

impl BlockShift {
    pub fn new(block_size: u32, max_shift: u32) -> Self {
        Self {
            block_size: block_size.max(2),
            max_shift,
        }
    }
}

impl Default for BlockShift {
    fn default() -> Self {
        Self::new(16, 8)
    }
}

impl Effect for BlockShift {
    fn meta(&self) -> EffectMeta {
        EffectMeta {
            id: "pixel_geo.block_shift".to_string(),
            name: "Block Shift".to_string(),
            category: EffectCategory::PixelGeometry,
            media_type: MediaType::Both,
            parameters: vec![
                ParameterDef {
                    id: "block_size".to_string(),
                    name: "Block Size".to_string(),
                    param_type: ParamType::Slider,
                    default: json!(16),
                    min: Some(2.0),
                    max: Some(64.0),
                    step: Some(2.0),
                    options: None,
                },
                ParameterDef {
                    id: "max_shift".to_string(),
                    name: "Max Shift".to_string(),
                    param_type: ParamType::Slider,
                    default: json!(8),
                    min: Some(0.0),
                    max: Some(32.0),
                    step: Some(1.0),
                    options: None,
                },
            ],
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
        let max_shift = params
            .get("max_shift")
            .and_then(|v| v.as_u64())
            .unwrap_or(self.max_shift as u64) as usize;
        let time = params.get("time").and_then(|v| v.as_f64()).unwrap_or(0.0) as usize;
        let w = input.width as usize;
        let h = input.height as usize;
        let mut data = vec![0u8; input.data.len()];

        for by in (0..h).step_by(bs) {
            for bx in (0..w).step_by(bs) {
                let seed = bx
                    .wrapping_mul(374761393)
                    .wrapping_add(by.wrapping_mul(668265263))
                    .wrapping_add(time.wrapping_mul(982451653));
                let sx = ((seed >> 16) % (max_shift * 2 + 1)) as isize - max_shift as isize;
                let sy = ((seed >> 24) % (max_shift * 2 + 1)) as isize - max_shift as isize;

                for y in by..(by + bs).min(h) {
                    for x in bx..(bx + bs).min(w) {
                        let src_x = ((x as isize + sx).clamp(0, w as isize - 1)) as usize;
                        let src_y = ((y as isize + sy).clamp(0, h as isize - 1)) as usize;
                        let src = (src_y * w + src_x) * 4;
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
    fn test_block_shift() {
        let d = vec![128u8; 32 * 32 * 4];
        let f = Frame {
            width: 32,
            height: 32,
            data: d,
        };
        let e = BlockShift::new(8, 4);
        let r = e.process_frame(&f, None, &serde_json::Map::new()).unwrap();
        assert_eq!(r.width, 32);
    }
}
