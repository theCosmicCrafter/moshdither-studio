use crate::effects::types::*;
use crate::effects::Effect;
use crate::error::Result;
use serde_json::json;

/// Byte reverse glitch — reverse chunks of the image buffer.
pub struct ByteReverse {
    chunk_size: u32,
}

impl ByteReverse {
    pub fn new(chunk_size: u32) -> Self {
        Self {
            chunk_size: chunk_size.max(2),
        }
    }
}

impl Default for ByteReverse {
    fn default() -> Self {
        Self::new(8)
    }
}

impl Effect for ByteReverse {
    fn meta(&self) -> EffectMeta {
        EffectMeta {
            id: "glitch.byte_reverse".to_string(),
            name: "Byte Reverse".to_string(),
            category: EffectCategory::Glitch,
            media_type: MediaType::Image,
            parameters: vec![ParameterDef {
                id: "chunk_size".to_string(),
                name: "Chunk Size".to_string(),
                param_type: ParamType::Slider,
                default: json!(8),
                min: Some(2.0),
                max: Some(64.0),
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
        let chunk_size = params
            .get("chunk_size")
            .and_then(|v| v.as_u64())
            .unwrap_or(self.chunk_size as u64) as usize;
        let mut data = input.data.clone();
        for chunk in data.chunks_exact_mut(chunk_size) {
            chunk.reverse();
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
    fn test_byte_reverse() {
        let d = vec![1u8, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12];
        let f = Frame {
            width: 3,
            height: 1,
            data: d,
        };
        let e = ByteReverse::new(4);
        let r = e.process_frame(&f, None, &serde_json::Map::new()).unwrap();
        assert_eq!(r.data[0], 4);
        assert_eq!(r.data[1], 3);
        assert_eq!(r.data[4], 8);
    }
}
