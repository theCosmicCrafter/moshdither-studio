use crate::effects::types::*;
use crate::effects::Effect;
use crate::error::Result;
use serde_json::json;

/// Classic datamosh — repeat random frame chunks to create smearing.
pub struct ClassicDatamosh {
    chunk_size: u32,
    repeats: u32,
}

impl ClassicDatamosh {
    pub fn new(chunk_size: u32, repeats: u32) -> Self {
        Self {
            chunk_size: chunk_size.clamp(2, 30),
            repeats: repeats.clamp(1, 10),
        }
    }
}

impl Default for ClassicDatamosh {
    fn default() -> Self {
        Self::new(5, 3)
    }
}

impl Effect for ClassicDatamosh {
    fn meta(&self) -> EffectMeta {
        EffectMeta {
            id: "datamoshing.classic".to_string(),
            name: "Classic".to_string(),
            category: EffectCategory::Datamoshing,
            media_type: MediaType::Video,
            parameters: vec![
                ParameterDef {
                    id: "chunk_size".to_string(),
                    name: "Chunk Size".to_string(),
                    param_type: ParamType::Slider,
                    default: json!(5),
                    min: Some(2.0),
                    max: Some(30.0),
                    step: Some(1.0),
                    options: None,
                },
                ParameterDef {
                    id: "repeats".to_string(),
                    name: "Repeats".to_string(),
                    param_type: ParamType::Slider,
                    default: json!(3),
                    min: Some(1.0),
                    max: Some(10.0),
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
        let chunk_size = params
            .get("chunk_size")
            .and_then(|v| v.as_u64())
            .unwrap_or(self.chunk_size as u64) as usize;
        let repeats = params
            .get("repeats")
            .and_then(|v| v.as_u64())
            .unwrap_or(self.repeats as u64) as usize;

        let mut frames = Vec::new();
        for chunk in input.frames.chunks(chunk_size) {
            for _ in 0..repeats {
                frames.extend_from_slice(chunk);
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
    fn test_repeats_chunks() {
        let e = ClassicDatamosh::new(2, 3);
        let seg = make_segment(4);
        let r = e.process_video(&seg, None, &serde_json::Map::new()).unwrap();
        assert_eq!(r.frames.len(), 12); // 2 chunks * 2 frames * 3 repeats = 12
    }
}