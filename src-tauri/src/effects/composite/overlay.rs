use crate::effects::types::*;
use crate::effects::Effect;
use crate::error::Result;
use serde_json::json;
use std::path::Path;

/// Overlay compositing: blend an overlay image on top of the input.
pub struct Overlay {
    opacity: f32,
    blend_mode: u32,
    overlay_path: String,
}

impl Overlay {
    pub fn new(opacity: f32, blend_mode: u32, overlay_path: String) -> Self {
        Self {
            opacity: opacity.clamp(0.0, 1.0),
            blend_mode,
            overlay_path,
        }
    }
}

impl Default for Overlay {
    fn default() -> Self {
        Self::new(0.5, 0, String::new())
    }
}

impl Effect for Overlay {
    fn meta(&self) -> EffectMeta {
        EffectMeta {
            id: "composite.overlay".to_string(),
            name: "Overlay".to_string(),
            category: EffectCategory::Color,
            media_type: MediaType::Both,
            parameters: vec![
                ParameterDef {
                    id: "opacity".to_string(),
                    name: "Opacity".to_string(),
                    param_type: ParamType::Slider,
                    default: json!(0.5),
                    min: Some(0.0),
                    max: Some(1.0),
                    step: Some(0.05),
                    options: None,
                },
                ParameterDef {
                    id: "blend_mode".to_string(),
                    name: "Blend Mode".to_string(),
                    param_type: ParamType::Select,
                    default: json!(0),
                    min: None,
                    max: None,
                    step: None,
                    options: Some(vec![
                        "normal".to_string(),
                        "screen".to_string(),
                        "multiply".to_string(),
                        "overlay".to_string(),
                    ]),
                },
                ParameterDef {
                    id: "overlay_path".to_string(),
                    name: "Overlay File".to_string(),
                    param_type: ParamType::Select,
                    default: json!(""),
                    min: None,
                    max: None,
                    step: None,
                    options: Some(vec![
                        "".to_string(),
                        "overlays/burn.mp4".to_string(),
                        "overlays/dust.mp4".to_string(),
                        "overlays/vhs-static.mp4".to_string(),
                    ]),
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
        let opacity = params
            .get("opacity")
            .and_then(|v| v.as_f64())
            .unwrap_or(self.opacity as f64) as f32;
        let blend_mode = params
            .get("blend_mode")
            .and_then(|v| v.as_u64())
            .unwrap_or(self.blend_mode as u64) as u32;
        let overlay_path = params
            .get("overlay_path")
            .and_then(|v| v.as_str())
            .unwrap_or(&self.overlay_path);

        if overlay_path.is_empty() || !Path::new(overlay_path).exists() {
            return Ok(input.clone());
        }

        let overlay_img = image::open(overlay_path).map_err(|e| {
            crate::error::AppError::Generic(format!("Failed to load overlay: {}", e))
        })?;
        let overlay_rgba = overlay_img.to_rgba8();
        let ow = overlay_rgba.width();
        let oh = overlay_rgba.height();
        let iw = input.width;
        let ih = input.height;

        let mut data = input.data.clone();
        for y in 0..ih {
            for x in 0..iw {
                let src_idx = ((y * iw + x) * 4) as usize;

                // Sample overlay (stretch to fit)
                let ox = (x as f32 / iw as f32 * (ow - 1) as f32) as u32;
                let oy = (y as f32 / ih as f32 * (oh - 1) as f32) as u32;
                let ov = overlay_rgba.get_pixel(ox.min(ow - 1), oy.min(oh - 1));

                let src_r = data[src_idx] as f32 / 255.0;
                let src_g = data[src_idx + 1] as f32 / 255.0;
                let src_b = data[src_idx + 2] as f32 / 255.0;
                let src_a = data[src_idx + 3] as f32 / 255.0;

                let ov_r = ov[0] as f32 / 255.0;
                let ov_g = ov[1] as f32 / 255.0;
                let ov_b = ov[2] as f32 / 255.0;
                let ov_a = ov[3] as f32 / 255.0;

                let (mut r, mut g, mut b) = match blend_mode {
                    1 => {
                        // screen
                        (
                            1.0 - (1.0 - src_r) * (1.0 - ov_r),
                            1.0 - (1.0 - src_g) * (1.0 - ov_g),
                            1.0 - (1.0 - src_b) * (1.0 - ov_b),
                        )
                    }
                    2 => {
                        // multiply
                        (src_r * ov_r, src_g * ov_g, src_b * ov_b)
                    }
                    3 => {
                        // overlay
                        (
                            if src_r < 0.5 {
                                2.0 * src_r * ov_r
                            } else {
                                1.0 - 2.0 * (1.0 - src_r) * (1.0 - ov_r)
                            },
                            if src_g < 0.5 {
                                2.0 * src_g * ov_g
                            } else {
                                1.0 - 2.0 * (1.0 - src_g) * (1.0 - ov_g)
                            },
                            if src_b < 0.5 {
                                2.0 * src_b * ov_b
                            } else {
                                1.0 - 2.0 * (1.0 - src_b) * (1.0 - ov_b)
                            },
                        )
                    }
                    _ => {
                        // normal
                        (
                            src_r * (1.0 - ov_a * opacity) + ov_r * ov_a * opacity,
                            src_g * (1.0 - ov_a * opacity) + ov_g * ov_a * opacity,
                            src_b * (1.0 - ov_a * opacity) + ov_b * ov_a * opacity,
                        )
                    }
                };

                if blend_mode != 0 {
                    r = src_r * (1.0 - opacity) + r * opacity;
                    g = src_g * (1.0 - opacity) + g * opacity;
                    b = src_b * (1.0 - opacity) + b * opacity;
                }

                data[src_idx] = (r * 255.0) as u8;
                data[src_idx + 1] = (g * 255.0) as u8;
                data[src_idx + 2] = (b * 255.0) as u8;
                data[src_idx + 3] = (src_a * 255.0) as u8;
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
