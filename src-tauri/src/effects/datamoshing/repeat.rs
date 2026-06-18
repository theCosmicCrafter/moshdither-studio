use crate::effects::types::*;
use crate::effects::Effect;
use crate::error::Result;
use serde_json::json;

/// Repeat — repeat a series of frames N times.
pub struct RepeatDatamosh {
    repeat_count: u32,
    series_size: u32,
}

impl RepeatDatamosh {
    pub fn new(repeat_count: u32, series_size: u32) -> Self {
        Self {
            repeat_count: repeat_count.clamp(2, 10),
            series_size: series_size.clamp(2, 20),
        }
    }
}

impl Default for RepeatDatamosh {
    fn default() -> Self {
        Self::new(3, 5)
    }
}

impl Effect for RepeatDatamosh {
    fn meta(&self) -> EffectMeta {
        EffectMeta {
            id: "datamoshing.repeat".to_string(),
            name: "Repeat".to_string(),
            category: EffectCategory::Datamoshing,
            media_type: MediaType::Video,
            parameters: vec![
                ParameterDef {
                    id: "repeat_count".to_string(),
                    name: "Repeat Count".to_string(),
                    param_type: ParamType::Slider,
                    default: json!(3),
                    min: Some(2.0),
                    max: Some(10.0),
                    step: Some(1.0),
                    options: None,
                },
                ParameterDef {
                    id: "series_size".to_string(),
                    name: "Series Size".to_string(),
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

    fn is_temporal(&self) -> bool {
        true
    }

    fn process_frame(
        &self,
        input: &Frame,
        _m: Option<&Mask>,
        params: &ParameterValues,
    ) -> Result<Frame> {
        let series_size = params
            .get("series_size")
            .and_then(|v| v.as_u64())
            .unwrap_or(5) as usize;
        let w = input.width as usize;
        let h = input.height as usize;
        let mut out = input.data.clone();
        for y in (0..h).step_by(series_size) {
            if y + 1 < h {
                let src_row_start = y * w * 4;
                for yy in (y + 1)..(y + series_size).min(h) {
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
        let repeat_count = params
            .get("repeat_count")
            .and_then(|v| v.as_u64())
            .unwrap_or(self.repeat_count as u64) as usize;
        let series_size = params
            .get("series_size")
            .and_then(|v| v.as_u64())
            .unwrap_or(self.series_size as u64) as usize;

        let mut frames = Vec::new();
        for series in input.frames.chunks(series_size) {
            for _ in 0..repeat_count {
                frames.extend_from_slice(series);
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
    fn test_repeat_series() {
        let e = RepeatDatamosh::new(2, 3);
        let seg = make_segment(6);
        let r = e
            .process_video(&seg, None, &serde_json::Map::new())
            .unwrap();
        assert_eq!(r.frames.len(), 12); // 2 series * 2 repeats * 3 frames
    }
}
