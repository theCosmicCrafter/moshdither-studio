use crate::effects::types::*;
use crate::effects::Effect;
use crate::error::Result;
use serde_json::json;

/// Invert colors.
pub struct Invert {
    intensity: f32,
}

impl Invert {
    pub fn new(intensity: f32) -> Self {
        Self {
            intensity: intensity.clamp(0.0, 1.0),
        }
    }
}

impl Default for Invert {
    fn default() -> Self {
        Self::new(1.0)
    }
}

impl Effect for Invert {
    fn meta(&self) -> EffectMeta {
        EffectMeta {
            id: "color.invert".to_string(),
            name: "Invert".to_string(),
            category: EffectCategory::Color,
            media_type: MediaType::Both,
            parameters: vec![ParameterDef {
                id: "intensity".to_string(),
                name: "Intensity".to_string(),
                param_type: ParamType::Slider,
                default: json!(1.0),
                min: Some(0.0),
                max: Some(1.0),
                step: Some(0.05),
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
        let intensity = crate::effects::params::f32_param(params, "intensity", self.intensity);
        let mut data = input.data.clone();
        for chunk in data.as_chunks_mut::<4>().0.iter_mut() {
            for c in &mut chunk[..3] {
                *c = (*c as f32 * (1.0 - intensity) + (255.0 - *c as f32) * intensity) as u8;
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
    fn test_invert_full() {
        let d = vec![255u8, 128, 64, 255];
        let f = Frame {
            width: 1,
            height: 1,
            data: d,
        };
        let e = Invert::new(1.0);
        let r = e.process_frame(&f, None, &serde_json::Map::new()).unwrap();
        assert_eq!(r.data[0], 0);
        assert_eq!(r.data[1], 127);
        assert_eq!(r.data[2], 191);
    }

    #[test]
    fn test_invert_none() {
        let d = vec![255u8, 128, 64, 255];
        let f = Frame {
            width: 1,
            height: 1,
            data: d,
        };
        let e = Invert::new(0.0);
        let r = e.process_frame(&f, None, &serde_json::Map::new()).unwrap();
        assert_eq!(r.data[0], 255);
        assert_eq!(r.data[1], 128);
        assert_eq!(r.data[2], 64);
    }
}
