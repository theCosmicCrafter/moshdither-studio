use crate::effects::types::*;
use crate::effects::Effect;
use crate::error::Result;
use serde_json::json;

/// Shuffle — randomly shuffle chunks of frames.
pub struct ShuffleDatamosh {
    chunk_size: u32,
}

impl ShuffleDatamosh {
    pub fn new(chunk_size: u32) -> Self {
        Self {
            chunk_size: chunk_size.max(2),
        }
    }
}

impl Default for ShuffleDatamosh {
    fn default() -> Self {
        Self::new(5)
    }
}

impl Effect for ShuffleDatamosh {
    fn meta(&self) -> EffectMeta {
        EffectMeta {
            id: "datamoshing.shuffle".to_string(),
            name: "Shuffle".to_string(),
            category: EffectCategory::Datamoshing,
            media_type: MediaType::Video,
            parameters: vec![ParameterDef {
                id: "chunk_size".to_string(),
                name: "Chunk Size".to_string(),
                param_type: ParamType::Slider,
                default: json!(5),
                min: Some(2.0),
                max: Some(30.0),
                step: Some(1.0),
                options: None,
            }],
        }
    }

    fn is_temporal(&self) -> bool {
        true
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
        let data = &input.data;
        let mut chunks: Vec<Vec<u8>> = data.chunks(chunk_size * 4).map(|c| c.to_vec()).collect();
        let n = chunks.len();
        for i in 0..n {
            let seed = i.wrapping_mul(374761393);
            let j = (seed % (n - i).max(1)) + i;
            chunks.swap(i, j);
        }
        let mut out = Vec::with_capacity(data.len());
        for chunk in chunks {
            out.extend_from_slice(&chunk);
        }
        out.truncate(data.len());
        Ok(Frame {
            width: input.width,
            height: input.height,
            data: out,
        })
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

        let mut chunks: Vec<Vec<Frame>> = input
            .frames
            .chunks(chunk_size)
            .map(|c| c.to_vec())
            .collect();

        // Deterministic shuffle using a simple hash-based shuffle
        let n = chunks.len();
        for i in 0..n {
            let seed = i.wrapping_mul(374761393);
            let j = (seed % (n - i)) + i;
            chunks.swap(i, j);
        }

        let frames = chunks.into_iter().flatten().collect();
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
    fn test_shuffles() {
        let e = ShuffleDatamosh::new(2);
        let seg = make_segment(6);
        let r = e
            .process_video(&seg, None, &serde_json::Map::new())
            .unwrap();
        assert_eq!(r.frames.len(), 6);
        // Deterministic shuffle should produce different order
        let mut changed = false;
        for i in 0..6 {
            if r.frames[i].data[0] != i as u8 {
                changed = true;
                break;
            }
        }
        assert!(changed);
    }
}
