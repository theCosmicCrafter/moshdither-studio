use crate::effects::types::*;
use crate::effects::Effect;
use crate::error::Result;
use serde_json::json;

/// Advanced slice shifting with variable size, repeat, and direction.
pub struct SliceShiftAdvanced {
    min_slice_size: u32,
    max_slice_size: u32,
}

impl SliceShiftAdvanced {
    pub fn new(min_slice_size: u32, max_slice_size: u32) -> Self {
        Self {
            min_slice_size: min_slice_size.max(1),
            max_slice_size: max_slice_size.max(min_slice_size.max(1)),
        }
    }
}

impl Default for SliceShiftAdvanced {
    fn default() -> Self {
        Self::new(4, 16)
    }
}

impl Effect for SliceShiftAdvanced {
    fn meta(&self) -> EffectMeta {
        EffectMeta {
            id: "pixel_geo.slice_shift_advanced".to_string(),
            name: "Slice Shift Advanced".to_string(),
            category: EffectCategory::PixelGeometry,
            media_type: MediaType::Both,
            parameters: vec![
                ParameterDef {
                    id: "min_slice_size".to_string(),
                    name: "Min Slice Size".to_string(),
                    param_type: ParamType::Slider,
                    default: json!(4),
                    min: Some(1.0),
                    max: Some(64.0),
                    step: Some(1.0),
                    options: None,
                },
                ParameterDef {
                    id: "max_slice_size".to_string(),
                    name: "Max Slice Size".to_string(),
                    param_type: ParamType::Slider,
                    default: json!(16),
                    min: Some(1.0),
                    max: Some(64.0),
                    step: Some(1.0),
                    options: None,
                },
                ParameterDef {
                    id: "shift_amount".to_string(),
                    name: "Shift Amount".to_string(),
                    param_type: ParamType::Slider,
                    default: json!(8),
                    min: Some(-64.0),
                    max: Some(64.0),
                    step: Some(1.0),
                    options: None,
                },
                ParameterDef {
                    id: "direction".to_string(),
                    name: "Direction".to_string(),
                    param_type: ParamType::Select,
                    default: json!("horizontal"),
                    min: None,
                    max: None,
                    step: None,
                    options: Some(vec![
                        "horizontal".to_string(),
                        "vertical".to_string(),
                        "both".to_string(),
                    ]),
                },
                ParameterDef {
                    id: "repeat".to_string(),
                    name: "Repeat Every N Slices".to_string(),
                    param_type: ParamType::Slider,
                    default: json!(0),
                    min: Some(0.0),
                    max: Some(8.0),
                    step: Some(1.0),
                    options: None,
                },
                ParameterDef {
                    id: "mirror".to_string(),
                    name: "Mirror Odd Slices".to_string(),
                    param_type: ParamType::Toggle,
                    default: json!(false),
                    min: None,
                    max: None,
                    step: None,
                    options: None,
                },
            ],
        }
    }

    fn process_frame(
        &self,
        input: &Frame,
        _m: Option<&Mask>,
        params: &ParameterValues,
    ) -> Result<Frame> {
        let min_slice_size = params
            .get("min_slice_size")
            .and_then(|v| v.as_u64())
            .unwrap_or(self.min_slice_size as u64) as usize;
        let max_slice_size = params
            .get("max_slice_size")
            .and_then(|v| v.as_u64())
            .unwrap_or(self.max_slice_size as u64) as usize;
        let min_slice_size = min_slice_size.max(1);
        let max_slice_size = max_slice_size.max(min_slice_size);
        let shift_amount = params
            .get("shift_amount")
            .and_then(|v| v.as_i64())
            .unwrap_or(8) as isize;
        let direction = params
            .get("direction")
            .and_then(|v| v.as_str())
            .unwrap_or("horizontal");
        let repeat = params.get("repeat").and_then(|v| v.as_u64()).unwrap_or(0) as usize;
        let mirror = params
            .get("mirror")
            .and_then(|v| v.as_bool())
            .unwrap_or(false);

        let w = input.width as usize;
        let h = input.height as usize;
        let mut data = input.data.clone();

        let mut slice_idx = 0usize;
        let mut y = 0usize;

        while y < h {
            // Variable slice size based on index
            let variability = slice_idx % 3;
            let slice_size =
                (min_slice_size + (variability * (max_slice_size - min_slice_size) / 3)).max(1);
            let slice_height = slice_size.min(h - y);
            let should_modify = repeat == 0 || slice_idx % repeat == 0;

            if should_modify {
                for row in y..(y + slice_height) {
                    for x in 0..w {
                        if direction == "horizontal" || direction == "both" {
                            let src_x =
                                ((x as isize + shift_amount).rem_euclid(w as isize)) as usize;
                            let src = (row * w + src_x) * 4;
                            let dst = (row * w + x) * 4;
                            data[dst..(4 + dst)].copy_from_slice(&input.data[src..(4 + src)]);
                        }
                        if direction == "vertical" || direction == "both" {
                            let src_y =
                                ((row as isize + shift_amount).rem_euclid(h as isize)) as usize;
                            let src = (src_y * w + x) * 4;
                            let dst = (row * w + x) * 4;
                            data[dst..(4 + dst)].copy_from_slice(&input.data[src..(4 + src)]);
                        }
                    }
                    if mirror && slice_idx % 2 == 1 {
                        // Mirror the row horizontally
                        let row_start = row * w * 4;
                        for x in 0..w / 2 {
                            let left = row_start + x * 4;
                            let right = row_start + (w - 1 - x) * 4;
                            for c in 0..4 {
                                data.swap(left + c, right + c);
                            }
                        }
                    }
                }
            }

            y += slice_height;
            slice_idx += 1;
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
    fn test_slice_shift_advanced() {
        let d = vec![
            255, 0, 0, 0, 0, 0, 0, 0, 100, 0, 0, 0, 50, 0, 0, 0, 255, 0, 0, 0, 0, 0, 0, 0, 100, 0,
            0, 0, 50, 0, 0, 0,
        ];
        let f = Frame {
            width: 4,
            height: 2,
            data: d,
        };
        let e = SliceShiftAdvanced::default();
        let mut params = serde_json::Map::new();
        params.insert("shift_amount".to_string(), json!(1));
        params.insert("direction".to_string(), json!("horizontal"));
        let r = e.process_frame(&f, None, &params).unwrap();
        // Output should be shifted horizontally by 1
        assert_eq!(r.data[0], f.data[4]);
        assert_eq!(r.data[4], f.data[8]);
    }
}
