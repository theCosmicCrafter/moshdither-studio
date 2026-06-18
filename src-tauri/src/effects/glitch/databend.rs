use crate::effects::types::*;
use crate::effects::Effect;
use crate::error::Result;
use serde_json::json;

/// Databend glitch — byte-level corruption within the image buffer.
pub struct Databend {
    amount: f32,
}

impl Databend {
    pub fn new(amount: f32) -> Self {
        Self { amount: amount.clamp(0.0, 1.0) }
    }
}

impl Default for Databend {
    fn default() -> Self {
        Self::new(0.05)
    }
}

impl Effect for Databend {
    fn meta(&self) -> EffectMeta {
        EffectMeta {
            id: "glitch.databend".to_string(),
            name: "Databend".to_string(),
            category: EffectCategory::Glitch,
            media_type: MediaType::Image,
            parameters: vec![
                ParameterDef {
                    id: "amount".to_string(),
                    name: "Amount".to_string(),
                    param_type: ParamType::Slider,
                    default: json!(0.05),
                    min: Some(0.0),
                    max: Some(1.0),
                    step: Some(0.01),
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
        let amount = params.get("amount").and_then(|v| v.as_f64()).unwrap_or(self.amount as f64) as f32;
        let time = params.get("time").and_then(|v| v.as_f64()).unwrap_or(0.0) as u32;
        let mut data = input.data.clone();
        let count = (data.len() as f32 * amount) as usize;

        for i in 0..count {
            let idx = i % data.len();
            let seed = (idx as u32).wrapping_add(time.wrapping_mul(71)).wrapping_mul(374761393).wrapping_add(668265263);
            let op = seed % 4;
            match op {
                0 => data[idx] = data[idx].wrapping_add((seed >> 8) as u8),
                1 => data[idx] = data[idx].rotate_left(seed % 8),
                2 => data[idx] = !data[idx],
                _ => data[idx] = data[idx].wrapping_mul((seed % 3 + 1) as u8),
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
        Ok(VideoSegment { frames, fps: input.fps })
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_databend_changes_data() {
        let data = vec![128u8; 64 * 4];
        let frame = Frame { width: 4, height: 4, data };
        let effect = Databend::new(0.1);
        let result = effect.process_frame(&frame, None, &serde_json::Map::new()).unwrap();

        let mut changed = false;
        for i in 0..result.data.len() {
            if result.data[i] != 128 {
                changed = true;
                break;
            }
        }
        assert!(changed);
    }
}