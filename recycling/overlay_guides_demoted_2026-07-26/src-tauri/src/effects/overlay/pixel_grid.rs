use crate::effects::types::*;
use crate::effects::Effect;
use crate::error::Result;
use serde_json::json;

/// Draws a pixel grid overlay on top of the image.
pub struct PixelGridOverlay;

impl Default for PixelGridOverlay {
    fn default() -> Self {
        Self
    }
}

impl Effect for PixelGridOverlay {
    fn meta(&self) -> EffectMeta {
        EffectMeta {
            id: "overlay.pixel_grid".to_string(),
            name: "Pixel Grid Overlay".to_string(),
            category: EffectCategory::Color,
            media_type: MediaType::Both,
            parameters: vec![
                ParameterDef {
                    id: "grid_size".to_string(),
                    name: "Grid Size".to_string(),
                    param_type: ParamType::Slider,
                    default: json!(32.0),
                    min: Some(2.0),
                    max: Some(256.0),
                    step: Some(1.0),
                    options: None,
                },
                ParameterDef {
                    id: "line_width".to_string(),
                    name: "Line Width".to_string(),
                    param_type: ParamType::Slider,
                    default: json!(1.0),
                    min: Some(0.0),
                    max: Some(10.0),
                    step: Some(0.1),
                    options: None,
                },
                ParameterDef {
                    id: "opacity".to_string(),
                    name: "Opacity".to_string(),
                    param_type: ParamType::Slider,
                    default: json!(0.3),
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
        let grid_size = params
            .get("grid_size")
            .and_then(|v| v.as_f64())
            .unwrap_or(32.0) as u32;
        let line_width = params
            .get("line_width")
            .and_then(|v| v.as_f64())
            .unwrap_or(1.0) as u32;
        let opacity = params
            .get("opacity")
            .and_then(|v| v.as_f64())
            .unwrap_or(0.3) as f32;

        if grid_size == 0 || opacity <= 0.0 {
            return Ok(input.clone());
        }

        let iw = input.width;
        let ih = input.height;
        let mut data = input.data.clone();

        let grid_color: [u8; 3] = [0, 255, 255]; // cyan

        for y in 0..ih {
            for x in 0..iw {
                let on_grid_x = x % grid_size < line_width;
                let on_grid_y = y % grid_size < line_width;
                if on_grid_x || on_grid_y {
                    let idx = ((y * iw + x) * 4) as usize;
                    let r = data[idx] as f32;
                    let g = data[idx + 1] as f32;
                    let b = data[idx + 2] as f32;
                    data[idx] = (r * (1.0 - opacity) + grid_color[0] as f32 * opacity) as u8;
                    data[idx + 1] = (g * (1.0 - opacity) + grid_color[1] as f32 * opacity) as u8;
                    data[idx + 2] = (b * (1.0 - opacity) + grid_color[2] as f32 * opacity) as u8;
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
