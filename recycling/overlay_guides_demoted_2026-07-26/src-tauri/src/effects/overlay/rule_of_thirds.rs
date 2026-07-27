use crate::effects::types::*;
use crate::effects::Effect;
use crate::error::Result;
use serde_json::json;

/// Draws rule-of-thirds grid lines on top of the image.
pub struct RuleOfThirds;

impl Default for RuleOfThirds {
    fn default() -> Self {
        Self
    }
}

impl Effect for RuleOfThirds {
    fn meta(&self) -> EffectMeta {
        EffectMeta {
            id: "overlay.rule_of_thirds".to_string(),
            name: "Rule of Thirds Grid".to_string(),
            category: EffectCategory::Color,
            media_type: MediaType::Both,
            parameters: vec![
                ParameterDef {
                    id: "line_width".to_string(),
                    name: "Line Width".to_string(),
                    param_type: ParamType::Slider,
                    default: json!(2.0),
                    min: Some(0.0),
                    max: Some(10.0),
                    step: Some(0.1),
                    options: None,
                },
                ParameterDef {
                    id: "opacity".to_string(),
                    name: "Opacity".to_string(),
                    param_type: ParamType::Slider,
                    default: json!(0.4),
                    min: Some(0.0),
                    max: Some(1.0),
                    step: Some(0.01),
                    options: None,
                },
            ],
        }
    }

    fn process_frame(
        &self,
        input: &Frame,
        _mask: Option<&Mask>,
        params: &ParameterValues,
    ) -> Result<Frame> {
        let line_width = params
            .get("line_width")
            .and_then(|v| v.as_f64())
            .unwrap_or(2.0) as u32;
        let opacity = params
            .get("opacity")
            .and_then(|v| v.as_f64())
            .unwrap_or(0.4) as f32;

        if opacity <= 0.0 {
            return Ok(input.clone());
        }

        let iw = input.width;
        let ih = input.height;
        let mut data = input.data.clone();

        let grid_color: [u8; 3] = [255, 255, 255]; // white

        // Vertical lines at 1/3 and 2/3
        let x1 = iw / 3;
        let x2 = (iw * 2) / 3;
        // Horizontal lines at 1/3 and 2/3
        let y1 = ih / 3;
        let y2 = (ih * 2) / 3;

        let mut blend = |idx: usize| {
            let r = data[idx] as f32;
            let g = data[idx + 1] as f32;
            let b = data[idx + 2] as f32;
            data[idx] = (r * (1.0 - opacity) + grid_color[0] as f32 * opacity) as u8;
            data[idx + 1] = (g * (1.0 - opacity) + grid_color[1] as f32 * opacity) as u8;
            data[idx + 2] = (b * (1.0 - opacity) + grid_color[2] as f32 * opacity) as u8;
        };

        for y in 0..ih {
            for x in 0..iw {
                let on_v = (x >= x1.saturating_sub(line_width) && x < x1 + line_width)
                    || (x >= x2.saturating_sub(line_width) && x < x2 + line_width);
                let on_h = (y >= y1.saturating_sub(line_width) && y < y1 + line_width)
                    || (y >= y2.saturating_sub(line_width) && y < y2 + line_width);
                if on_v || on_h {
                    let idx = ((y * iw + x) * 4) as usize;
                    blend(idx);
                }
            }
        }

        Ok(Frame {
            width: iw,
            height: ih,
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
