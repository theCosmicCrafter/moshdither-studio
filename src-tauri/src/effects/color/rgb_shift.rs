use crate::effects::types::*;
use crate::effects::Effect;
use crate::error::Result;
use serde_json::json;

/// Independent RGB channel shifting.
pub struct RgbShift {
    r_shift: i32,
    g_shift: i32,
    b_shift: i32,
}

impl RgbShift {
    pub fn new(r_shift: i32, g_shift: i32, b_shift: i32) -> Self {
        Self { r_shift, g_shift, b_shift }
    }
}

impl Default for RgbShift {
    fn default() -> Self { Self::new(-3, 0, 3) }
}

impl Effect for RgbShift {
    fn meta(&self) -> EffectMeta {
        EffectMeta {
            id: "color.rgb_shift".to_string(),
            name: "RGB Shift".to_string(),
            category: EffectCategory::Color,
            media_type: MediaType::Both,
            parameters: vec![
                ParameterDef {
                    id: "r_shift".to_string(),
                    name: "R Shift".to_string(),
                    param_type: ParamType::Slider,
                    default: json!(-3),
                    min: Some(-20.0),
                    max: Some(20.0),
                    step: Some(1.0),
                    options: None,
                },
                ParameterDef {
                    id: "g_shift".to_string(),
                    name: "G Shift".to_string(),
                    param_type: ParamType::Slider,
                    default: json!(0),
                    min: Some(-20.0),
                    max: Some(20.0),
                    step: Some(1.0),
                    options: None,
                },
                ParameterDef {
                    id: "b_shift".to_string(),
                    name: "B Shift".to_string(),
                    param_type: ParamType::Slider,
                    default: json!(3),
                    min: Some(-20.0),
                    max: Some(20.0),
                    step: Some(1.0),
                    options: None,
                },
            ],
        }
    }

    fn process_frame(&self, input: &Frame, _m: Option<&Mask>, params: &ParameterValues) -> Result<Frame> {
        let r_shift = params.get("r_shift").and_then(|v| v.as_i64()).unwrap_or(self.r_shift as i64) as isize;
        let g_shift = params.get("g_shift").and_then(|v| v.as_i64()).unwrap_or(self.g_shift as i64) as isize;
        let b_shift = params.get("b_shift").and_then(|v| v.as_i64()).unwrap_or(self.b_shift as i64) as isize;
        let w = input.width as usize;
        let h = input.height as usize;
        let mut data = vec![0u8; input.data.len()];

        for y in 0..h {
            for x in 0..w {
                let dst_idx = (y * w + x) * 4;
                let get = |shift: isize, c: usize| {
                    let src_x = ((x as isize + shift).clamp(0, w as isize - 1)) as usize;
                    input.data[(y * w + src_x) * 4 + c]
                };
                data[dst_idx] = get(r_shift, 0);
                data[dst_idx + 1] = get(g_shift, 1);
                data[dst_idx + 2] = get(b_shift, 2);
                data[dst_idx + 3] = input.data[dst_idx + 3];
            }
        }
        Ok(Frame { width: input.width, height: input.height, data })
    }

    fn process_video(&self, input: &VideoSegment, mask: Option<&Mask>, params: &ParameterValues) -> Result<VideoSegment> {
        let mut frames = Vec::with_capacity(input.frames.len());
        for frame in &input.frames { frames.push(self.process_frame(frame, mask, params)?); }
        Ok(VideoSegment { frames, fps: input.fps })
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_rgb_shift() {
        let d = vec![100u8, 150, 200, 255, 50, 100, 150, 255];
        let f = Frame { width: 2, height: 1, data: d };
        let e = RgbShift::new(-1, 0, 1);
        let r = e.process_frame(&f, None, &serde_json::Map::new()).unwrap();
        // At x=1, R comes from x=0 (100), B comes from x=1 clamped (150)
        assert_eq!(r.data[4], 100);
    }
}