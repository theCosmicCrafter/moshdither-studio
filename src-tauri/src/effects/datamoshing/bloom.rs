use crate::effects::types::*;
use crate::effects::Effect;
use crate::error::Result;
use serde_json::json;

/// Bloom — duplicate keyframes to create smearing.
pub struct BloomDatamosh {
    bloom_size: u32,
}

impl BloomDatamosh {
    pub fn new(bloom_size: u32) -> Self {
        Self { bloom_size: bloom_size.clamp(2, 20) }
    }
}

impl Default for BloomDatamosh {
    fn default() -> Self {
        Self::new(5)
    }
}

impl Effect for BloomDatamosh {
    fn meta(&self) -> EffectMeta {
        EffectMeta {
            id: "datamoshing.bloom".to_string(),
            name: "Bloom".to_string(),
            category: EffectCategory::Datamoshing,
            media_type: MediaType::Video,
            parameters: vec![
                ParameterDef {
                    id: "bloom_size".to_string(),
                    name: "Bloom Size".to_string(),
                    param_type: ParamType::Slider,
                    default: json!(5),
                    min: Some(2.0),
                    max: Some(20.0),
                    step: Some(1.0),
                    options: None,
                },
            ],
        }
    }

    fn process_frame(&self, input: &Frame, _m: Option<&Mask>, _p: &ParameterValues) -> Result<Frame> {
        Ok(input.clone())
    }

    fn process_video(
        &self,
        input: &VideoSegment,
        _mask: Option<&Mask>,
        params: &ParameterValues,
    ) -> Result<VideoSegment> {
        let bloom_size = params
            .get("bloom_size")
            .and_then(|v| v.as_u64())
            .unwrap_or(self.bloom_size as u64) as usize;
        let mut frames = Vec::new();

        for chunk in input.frames.chunks(bloom_size) {
            if let Some(key) = chunk.first() {
                for _ in 0..bloom_size {
                    frames.push(key.clone());
                }
            }
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

    fn make_segment(n: usize) -> VideoSegment {
        let frames: Vec<Frame> = (0..n)
            .map(|i| Frame {
                width: 2,
                height: 2,
                data: vec![i as u8; 16],
            })
            .collect();
        VideoSegment { frames, fps: 30.0 }
    }

    #[test]
    fn test_bloom_duplicates() {
        let e = BloomDatamosh::new(3);
        let seg = make_segment(6);
        let r = e.process_video(&seg, None, &serde_json::Map::new()).unwrap();
        assert_eq!(r.frames.len(), 6);
        // First 3 frames should all be frame 0
        assert_eq!(r.frames[0].data[0], 0);
        assert_eq!(r.frames[1].data[0], 0);
        assert_eq!(r.frames[2].data[0], 0);
    }
}