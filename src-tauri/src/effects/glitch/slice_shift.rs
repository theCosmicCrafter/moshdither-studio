use crate::effects::types::*;
use crate::effects::Effect;
use crate::error::Result;
use serde_json::json;

/// Horizontal slice displacement glitch.
pub struct SliceShift {
    slice_height: u32,
    max_shift: u32,
}

impl SliceShift {
    pub fn new(slice_height: u32, max_shift: u32) -> Self {
        Self {
            slice_height: slice_height.max(1),
            max_shift,
        }
    }
}

impl Default for SliceShift {
    fn default() -> Self {
        Self::new(4, 20)
    }
}

impl Effect for SliceShift {
    fn meta(&self) -> EffectMeta {
        EffectMeta {
            id: "glitch.slice_shift".to_string(),
            name: "Slice Shift".to_string(),
            category: EffectCategory::Glitch,
            media_type: MediaType::Image,
            parameters: vec![
                ParameterDef {
                    id: "slice_height".to_string(),
                    name: "Slice Height".to_string(),
                    param_type: ParamType::Slider,
                    default: json!(4),
                    min: Some(1.0),
                    max: Some(32.0),
                    step: Some(1.0),
                    options: None,
                },
                ParameterDef {
                    id: "max_shift".to_string(),
                    name: "Max Shift".to_string(),
                    param_type: ParamType::Slider,
                    default: json!(20),
                    min: Some(0.0),
                    max: Some(100.0),
                    step: Some(1.0),
                    options: None,
                },
            ],
        }
    }

    fn process_frame(
        &self,
        input: &Frame,
        _mask: Option<&Mask>,
        params: &ParameterValues,
    ) -> Result<Frame> {
        let slice_height = params
            .get("slice_height")
            .and_then(|v| v.as_u64())
            .unwrap_or(self.slice_height as u64) as u32;
        let max_shift = params
            .get("max_shift")
            .and_then(|v| v.as_u64())
            .unwrap_or(self.max_shift as u64) as u32;
        let time = params.get("time").and_then(|v| v.as_f64()).unwrap_or(0.0) as u32;

        let w = input.width as usize;
        let h = input.height as usize;
        let mut data = vec![0u8; input.data.len()];

        for y in 0..h {
            let slice = y / slice_height as usize;
            let seed = (slice as u32)
                .wrapping_add(time.wrapping_mul(101))
                .wrapping_mul(374761393u32);
            let shift = ((seed >> 24) % (max_shift * 2 + 1)) as isize - max_shift as isize;

            for x in 0..w {
                let src_x = ((x as isize + shift).clamp(0, w as isize - 1)) as usize;
                let src_idx = (y * w + src_x) * 4;
                let dst_idx = (y * w + x) * 4;
                data[dst_idx..dst_idx + 4].copy_from_slice(&input.data[src_idx..src_idx + 4]);
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
    fn test_slice_shift_creates_output() {
        let data = vec![128u8; 32 * 32 * 4];
        let frame = Frame {
            width: 32,
            height: 32,
            data,
        };
        let effect = SliceShift::new(4, 10);
        let result = effect
            .process_frame(&frame, None, &serde_json::Map::new())
            .unwrap();
        assert_eq!(result.width, 32);
        assert_eq!(result.height, 32);
    }
}
