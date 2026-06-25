use crate::effects::types::*;
use crate::effects::Effect;
use crate::error::Result;
use serde_json::json;

/// Byte zero glitch — null out random bytes at random positions across the image.
pub struct ByteZero {
    amount: f32,
}

impl ByteZero {
    pub fn new(amount: f32) -> Self {
        Self {
            amount: amount.clamp(0.0, 1.0),
        }
    }
}

impl Default for ByteZero {
    fn default() -> Self {
        Self::new(0.15)
    }
}

fn xorshift32(mut state: u32) -> u32 {
    state ^= state << 13;
    state ^= state >> 17;
    state ^= state << 5;
    state
}

impl Effect for ByteZero {
    fn meta(&self) -> EffectMeta {
        EffectMeta {
            id: "glitch.byte_zero".to_string(),
            name: "Byte Zero".to_string(),
            category: EffectCategory::Glitch,
            media_type: MediaType::Image,
            parameters: vec![ParameterDef {
                id: "amount".to_string(),
                name: "Amount".to_string(),
                param_type: ParamType::Slider,
                default: json!(0.15),
                min: Some(0.0),
                max: Some(1.0),
                step: Some(0.01),
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
            .and_then(|v| v.as_f64())
            .unwrap_or(self.amount as f64) as f32;
        let time = params.get("time").and_then(|v| v.as_f64()).unwrap_or(0.0) as u32;
        let mut data = input.data.clone();
        let len = data.len();
        if len == 0 {
            return Ok(Frame {
                width: input.width,
                height: input.height,
                data,
            });
        }
        let count = (len as f32 * amount) as usize;
        let mut state = 0xDEADBEEFu32.wrapping_add(time.wrapping_mul(71));
        for _ in 0..count {
            state = xorshift32(state);
            let idx = (state as usize) % len;
            data[idx] = 0;
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
    fn test_byte_zero() {
        let d = vec![255u8; 64];
        let f = Frame {
            width: 4,
            height: 4,
            data: d,
        };
        let e = ByteZero::new(0.5);
        let r = e.process_frame(&f, None, &serde_json::Map::new()).unwrap();
        assert!(r.data.contains(&0));
    }

    #[test]
    fn test_byte_zero_distributes_across_whole_image() {
        let d = vec![255u8; 1000];
        let f = Frame {
            width: 25,
            height: 10,
            data: d,
        };
        let e = ByteZero::new(0.3);
        let r = e.process_frame(&f, None, &serde_json::Map::new()).unwrap();
        let second_half_zeros = r.data[500..1000].iter().filter(|&&v| v == 0).count();
        assert!(
            second_half_zeros > 0,
            "Byte zero should affect the whole image, not just the start"
        );
    }
}
