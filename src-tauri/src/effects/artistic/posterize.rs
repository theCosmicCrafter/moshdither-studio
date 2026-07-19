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
        let bits = params
            .get("bits")
            .and_then(|v| v.as_u64())
            .unwrap_or(self.bits as u64) as u8;
        let shift = 8 - bits;
        let mut data = input.data.clone();
        for chunk in data.chunks_exact_mut(4) {
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
