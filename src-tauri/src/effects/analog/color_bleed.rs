use crate::effects::types::*;
use crate::effects::Effect;
use crate::error::Result;
use serde_json::json;

/// VHS-style color bleed — RGB channels shift independently per row.
pub struct ColorBleed {
    amount: u32,
}

impl ColorBleed {
    pub fn new(amount: u32) -> Self {
        Self { amount }
    }
}

impl Default for ColorBleed {
    fn default() -> Self {
        Self::new(4)
    }
}

impl Effect for ColorBleed {
    fn meta(&self) -> EffectMeta {
        EffectMeta {
            id: "analog.color_bleed".to_string(),
            name: "Color Bleed".to_string(),
            category: EffectCategory::Analog,
            media_type: MediaType::Both,
            parameters: vec![ParameterDef {
                id: "amount".to_string(),
                name: "Amount".to_string(),
                param_type: ParamType::Slider,
                default: json!(4),
                min: Some(0.0),
                max: Some(20.0),
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
        let amount = params
            .get("amount")
            .and_then(|v| v.as_u64())
            .unwrap_or(self.amount as u64) as usize;
        let w = input.width as usize;
        let h = input.height as usize;
        let mut data = vec![0u8; input.data.len()];

        for y in 0..h {
            let r_shift = (y % (amount * 2 + 1)) as isize - amount as isize;
            let b_shift = -(r_shift);
            for x in 0..w {
                let dst_idx = (y * w + x) * 4;
                let rx = ((x as isize + r_shift).clamp(0, w as isize - 1)) as usize;
                let bx = ((x as isize + b_shift).clamp(0, w as isize - 1)) as usize;
                data[dst_idx] = input.data[(y * w + rx) * 4];
                data[dst_idx + 1] = input.data[(y * w + x) * 4 + 1];
                data[dst_idx + 2] = input.data[(y * w + bx) * 4 + 2];
                data[dst_idx + 3] = input.data[(y * w + x) * 4 + 3];
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
    fn test_bleed_shifts() {
        let data = vec![100u8, 150, 200, 255, 50, 100, 250, 255];
        let f = Frame {
            width: 2,
            height: 1,
            data,
        };
        let e = ColorBleed::new(1);
        let r = e.process_frame(&f, None, &serde_json::Map::new()).unwrap();
        assert!(r.data[0] != 100 || r.data[2] != 200);
    }

    /// Regression test: green channel must be read from the input buffer at the
    /// current pixel position, not from the uninitialized destination buffer.
    /// Before the fix, `data[dst_idx + 1]` read zeros, wiping out green.
    #[test]
    fn test_green_channel_preserved() {
        // 4x1 image with distinct green values per pixel
        let data = vec![
            10u8, 11, 12, 255, // pixel 0
            20, 21, 22, 255, // pixel 1
            30, 31, 32, 255, // pixel 2
            40, 41, 42, 255, // pixel 3
        ];
        let f = Frame {
            width: 4,
            height: 1,
            data,
        };
        let e = ColorBleed::new(1);
        let r = e.process_frame(&f, None, &serde_json::Map::new()).unwrap();
        // Green channel at each pixel must equal the input green (no shift on G)
        assert_eq!(r.data[1], 11, "green pixel 0");
        assert_eq!(r.data[5], 21, "green pixel 1");
        assert_eq!(r.data[9], 31, "green pixel 2");
        assert_eq!(r.data[13], 41, "green pixel 3");
        // Alpha must be preserved
        assert_eq!(r.data[3], 255);
        assert_eq!(r.data[7], 255);
        assert_eq!(r.data[11], 255);
        assert_eq!(r.data[15], 255);
    }
}
