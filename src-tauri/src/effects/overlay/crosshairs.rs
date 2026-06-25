use crate::effects::types::*;
use crate::effects::Effect;
use crate::error::Result;
use serde_json::json;

/// Draws corner crosshair brackets on top of the image.
pub struct Crosshairs;

impl Default for Crosshairs {
    fn default() -> Self {
        Self
    }
}

impl Effect for Crosshairs {
    fn meta(&self) -> EffectMeta {
        EffectMeta {
            id: "overlay.crosshairs".to_string(),
            name: "Corner Crosshairs".to_string(),
            category: EffectCategory::Color,
            media_type: MediaType::Both,
            parameters: vec![
                ParameterDef {
                    id: "size".to_string(),
                    name: "Size %".to_string(),
                    param_type: ParamType::Slider,
                    default: json!(10.0),
                    min: Some(1.0),
                    max: Some(50.0),
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
                    default: json!(0.6),
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
        let size_pct = params.get("size").and_then(|v| v.as_f64()).unwrap_or(10.0) as f32;
        let line_width = params
            .get("line_width")
            .and_then(|v| v.as_f64())
            .unwrap_or(2.0) as u32;
        let opacity = params
            .get("opacity")
            .and_then(|v| v.as_f64())
            .unwrap_or(0.6) as f32;

        if opacity <= 0.0 || size_pct <= 0.0 {
            return Ok(input.clone());
        }

        let iw = input.width;
        let ih = input.height;
        let mut data = input.data.clone();

        let bracket_w = ((iw as f32 * size_pct / 100.0).round() as u32).min(iw / 2);
        let bracket_h = ((ih as f32 * size_pct / 100.0).round() as u32).min(ih / 2);
        let cross_color: [u8; 3] = [0, 255, 255]; // cyan

        let mut blend = |idx: usize| {
            let r = data[idx] as f32;
            let g = data[idx + 1] as f32;
            let b = data[idx + 2] as f32;
            data[idx] = (r * (1.0 - opacity) + cross_color[0] as f32 * opacity) as u8;
            data[idx + 1] = (g * (1.0 - opacity) + cross_color[1] as f32 * opacity) as u8;
            data[idx + 2] = (b * (1.0 - opacity) + cross_color[2] as f32 * opacity) as u8;
        };

        // Draw L-shaped brackets at each corner
        for y in 0..ih {
            for x in 0..iw {
                let in_corner_tl = x < bracket_w + line_width && y < line_width;
                let in_corner_tl_v = x < line_width && y < bracket_h + line_width;
                let in_corner_tr = x >= iw - bracket_w - line_width && y < line_width;
                let in_corner_tr_v = x >= iw - line_width && y < bracket_h + line_width;
                let in_corner_bl = x < bracket_w + line_width && y >= ih - line_width;
                let in_corner_bl_v = x < line_width && y >= ih - bracket_h - line_width;
                let in_corner_br = x >= iw - bracket_w - line_width && y >= ih - line_width;
                let in_corner_br_v = x >= iw - line_width && y >= ih - bracket_h - line_width;

                if in_corner_tl
                    || in_corner_tl_v
                    || in_corner_tr
                    || in_corner_tr_v
                    || in_corner_bl
                    || in_corner_bl_v
                    || in_corner_br
                    || in_corner_br_v
                {
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
