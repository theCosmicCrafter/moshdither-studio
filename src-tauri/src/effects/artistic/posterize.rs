use crate::effects::types::*;
use crate::effects::Effect;
use crate::error::Result;
use serde_json::json;

/// Posterize — reduce bit depth per channel.
pub struct Posterize {
    bits: u8,
}

impl Posterize {
    pub fn new(bits: u8) -> Self {
        Self {
            bits: bits.clamp(1, 8),
        }
    }
}

impl Default for Posterize {
    fn default() -> Self {
        Self::new(3)
    }
}

impl Effect for Posterize {
    fn meta(&self) -> EffectMeta {
        EffectMeta {
            id: "artistic.posterize".to_string(),
            name: "Posterize".to_string(),
            category: EffectCategory::Artistic,
            media_type: MediaType::Both,
            parameters: vec![ParameterDef {
                id: "bits".to_string(),
                name: "Bits".to_string(),
                param_type: ParamType::Slider,
                default: json!(3),
                min: Some(1.0),
                max: Some(8.0),
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
        let bits = crate::effects::params::u64_param(params, "bits", self.bits as u64) as u8;
        let shift = 8 - bits.min(8);
        let mut data = input.data.clone();
        for chunk in data.as_chunks_mut::<4>().0.iter_mut() {
            for c in &mut chunk[..3] {
                *c = (*c >> shift) << shift;
            }
        }
        Ok(Frame {
            width: input.width,
            height: input.height,
            data,
        })
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_posterize() {
        let d = vec![137u8, 200, 50, 255];
        let f = Frame {
            width: 1,
            height: 1,
            data: d,
        };
        let e = Posterize::new(3);
        let r = e.process_frame(&f, None, &serde_json::Map::new()).unwrap();
        assert_eq!(r.data[0], 128); // 137 >> 5 << 5 = 128
        assert_eq!(r.data[1], 192); // 200 >> 5 << 5 = 192
        assert_eq!(r.data[2], 32); // 50 >> 5 << 5 = 32
    }
}
