use crate::effects::types::*;
use crate::effects::Effect;
use crate::error::Result;
use serde_json::json;

/// Draws safe area guide borders (action-safe and title-safe margins).
pub struct SafeArea;

impl Default for SafeArea {
    fn default() -> Self {
        Self
    }
}

impl Effect for SafeArea {
    fn meta(&self) -> EffectMeta {
        EffectMeta {
            id: "overlay.safe_area".to_string(),
            name: "Safe Area Guides".to_string(),
            category: EffectCategory::Color,
            media_type: MediaType::Both,
            parameters: vec![
                ParameterDef {
                    id: "margin".to_string(),
                    name: "Margin %".to_string(),
                    param_type: ParamType::Slider,
                    default: json!(5.0),
                    min: Some(0.0),
                    max: Some(25.0),
                    step: Some(0.5),
                    options: None,
                },
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
                    default: json!(0.5),
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
        let margin_pct = params.get("margin").and_then(|v| v.as_f64()).unwrap_or(5.0) as f32;
        let line_width = params
            .get("line_width")
            .and_then(|v| v.as_f64())
            .unwrap_or(2.0) as u32;
        let opacity = params
            .get("opacity")
            .and_then(|v| v.as_f64())
            .unwrap_or(0.5) as f32;

        if margin_pct <= 0.0 || opacity <= 0.0 {
            return Ok(input.clone());
        }

        let iw = input.width;
        let ih = input.height;
        let mut data = input.data.clone();

        let mx = ((iw as f32 * margin_pct / 100.0).round() as u32).min(iw / 2);
        let my = ((ih as f32 * margin_pct / 100.0).round() as u32).min(ih / 2);
        let guide_color: [u8; 3] = [255, 255, 0]; // yellow

        let mut blend = |idx: usize| {
            let r = data[idx] as f32;
            let g = data[idx + 1] as f32;
            let b = data[idx + 2] as f32;
            data[idx] = (r * (1.0 - opacity) + guide_color[0] as f32 * opacity) as u8;
            data[idx + 1] = (g * (1.0 - opacity) + guide_color[1] as f32 * opacity) as u8;
            data[idx + 2] = (b * (1.0 - opacity) + guide_color[2] as f32 * opacity) as u8;
        };

        // Draw border rectangles
        for y in 0..ih {
            for x in 0..iw {
                let on_border = (x < mx + line_width && x >= mx.saturating_sub(line_width))
                    || (x >= iw.saturating_sub(mx + line_width)
                        && x < iw.saturating_sub(mx.saturating_sub(line_width)))
                    || (y < my + line_width && y >= my.saturating_sub(line_width))
                    || (y >= ih.saturating_sub(my + line_width)
                        && y < ih.saturating_sub(my.saturating_sub(line_width)));
                if on_border {
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
