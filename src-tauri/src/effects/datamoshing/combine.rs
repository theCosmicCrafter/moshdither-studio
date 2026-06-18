use crate::effects::types::*;
use crate::effects::Effect;
use crate::error::Result;
use serde_json::json;

/// Combine — interleave frames from multiple video segments.
/// This effect works on a single segment by duplicating and offsetting.
pub struct CombineDatamosh {
    stride: u32,
}

impl CombineDatamosh {
    pub fn new(stride: u32) -> Self {
        Self {
            stride: stride.max(2),
        }
    }
}

impl Default for CombineDatamosh {
    fn default() -> Self {
        Self::new(3)
    }
}

impl Effect for CombineDatamosh {
    fn meta(&self) -> EffectMeta {
        EffectMeta {
            id: "datamoshing.combine".to_string(),
            name: "Combine".to_string(),
            category: EffectCategory::Datamoshing,
            media_type: MediaType::Video,
            parameters: vec![ParameterDef {
                id: "stride".to_string(),
                name: "Stride".to_string(),
                param_type: ParamType::Slider,
                default: json!(3),
                min: Some(2.0),
                max: Some(10.0),
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
        let stride = params
            .get("stride")
            .and_then(|v| v.as_u64())
            .unwrap_or(self.stride as u64) as usize;
        let w = input.width as usize;
        let h = input.height as usize;
        let mut out = input.data.clone();
        for y in (0..h).step_by(stride) {
            if y + 1 < h {
                let src_row_start = y * w * 4;
                for yy in (y + 1)..(y + stride).min(h) {
                    let dst_row_start = yy * w * 4;
                    out[dst_row_start..dst_row_start + w * 4]
                        .copy_from_slice(&input.data[src_row_start..src_row_start + w * 4]);
                }
            }
        }
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
        let stride = params
            .get("stride")
            .and_then(|v| v.as_u64())
            .unwrap_or(self.stride as u64) as usize;
        let mut frames = Vec::new();
        let n = input.frames.len();

        for i in (0..n).step_by(stride) {
            for j in 0..stride {
                if i + j < n {
                    frames.push(input.frames[i + j].clone());
                }
            }
            // Repeat the first frame of the stride group
            if i < n {
                frames.push(input.frames[i].clone());
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
    fn test_combine() {
        let e = CombineDatamosh::new(3);
        let seg = make_segment(6);
        let r = e
            .process_video(&seg, None, &serde_json::Map::new())
            .unwrap();
        assert!(r.frames.len() > 6);
    }
}
