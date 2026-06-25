use crate::effects::types::*;
use crate::effects::Effect;
use crate::error::Result;
use serde_json::json;

/// Databend glitch — byte-level corruption at random positions across the image buffer.
/// Applies one of four random operations per byte: add, rotate, invert, or multiply.
pub struct Databend {
    amount: f32,
}

impl Databend {
    pub fn new(amount: f32) -> Self {
        Self {
            amount: amount.clamp(0.0, 1.0),
        }
    }
}

impl Default for Databend {
    fn default() -> Self {
        Self::new(0.2)
    }
}

fn xorshift32(mut state: u32) -> u32 {
    state ^= state << 13;
    state ^= state >> 17;
    state ^= state << 5;
    state
}

impl Effect for Databend {
    fn meta(&self) -> EffectMeta {
        EffectMeta {
            id: "glitch.databend".to_string(),
            name: "Databend".to_string(),
            category: EffectCategory::Glitch,
            media_type: MediaType::Image,
            parameters: vec![ParameterDef {
                id: "amount".to_string(),
                name: "Amount".to_string(),
                param_type: ParamType::Slider,
                default: json!(0.2),
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
        _mask: Option<&Mask>,
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
        let mut state = 0x1BADB002u32.wrapping_add(time.wrapping_mul(71));

        for _ in 0..count {
            state = xorshift32(state);
            let idx = (state as usize) % len;
            state = xorshift32(state);
            let op = state % 4;
            match op {
                0 => data[idx] = data[idx].wrapping_add((state >> 8) as u8),
                1 => data[idx] = data[idx].rotate_left(state % 8),
                2 => data[idx] = !data[idx],
                _ => data[idx] = data[idx].wrapping_mul((state % 3 + 1) as u8),
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
    fn test_databend_changes_data() {
        let data = vec![128u8; 64 * 4];
        let frame = Frame {
            width: 4,
            height: 4,
            data,
        };
        let effect = Databend::new(0.5);
        let result = effect
            .process_frame(&frame, None, &serde_json::Map::new())
            .unwrap();

        let mut changed = false;
        for i in 0..result.data.len() {
            if result.data[i] != 128 {
                changed = true;
                break;
            }
        }
        assert!(changed);
    }

    #[test]
    fn test_databend_distributes_across_whole_image() {
        let data = vec![128u8; 1000];
        let frame = Frame {
            width: 25,
            height: 10,
            data,
        };
        let effect = Databend::new(0.3);
        let result = effect
            .process_frame(&frame, None, &serde_json::Map::new())
            .unwrap();
        let second_half_changes = result.data[500..1000].iter().filter(|&&v| v != 128).count();
        assert!(
            second_half_changes > 0,
            "Databend should affect the whole image, not just the start"
        );
    }
}
