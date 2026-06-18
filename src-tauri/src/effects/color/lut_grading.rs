use crate::effects::types::*;
use crate::effects::Effect;
use crate::error::Result;
use serde_json::json;
use std::path::Path;

/// 3D LUT color grading using a 512x512 LUT PNG.
/// LUT layout: 8x8 grid of 64x64 tiles. Each tile = one blue slice.
/// Within tile: x=red, y=green.
pub struct LutGrading {
    amount: f32,
    lut_path: String,
}

impl LutGrading {
    pub fn new(amount: f32, lut_path: String) -> Self {
        Self {
            amount: amount.clamp(0.0, 1.0),
            lut_path,
        }
    }
}

impl Default for LutGrading {
    fn default() -> Self {
        Self::new(1.0, String::new())
    }
}

impl Effect for LutGrading {
    fn meta(&self) -> EffectMeta {
        EffectMeta {
            id: "color.lut_grading".to_string(),
            name: "LUT Color Grading".to_string(),
            category: EffectCategory::Color,
            media_type: MediaType::Both,
            parameters: vec![
                ParameterDef {
                    id: "amount".to_string(),
                    name: "Amount".to_string(),
                    param_type: ParamType::Slider,
                    default: json!(1.0),
                    min: Some(0.0),
                    max: Some(1.0),
                    step: Some(0.05),
                    options: None,
                },
                ParameterDef {
                    id: "lut_path".to_string(),
                    name: "LUT File".to_string(),
                    param_type: ParamType::Select,
                    default: json!(""),
                    min: None,
                    max: None,
                    step: None,
                    options: Some(vec![
                        "".to_string(),
                        // Instagram-style presets (existing)
                        "lut/amatorka.png".to_string(),
                        "lut/brannan.png".to_string(),
                        "lut/earlybird.png".to_string(),
                        "lut/etikate.png".to_string(),
                        "lut/gotham.png".to_string(),
                        "lut/hefe.png".to_string(),
                        "lut/inkwell.png".to_string(),
                        "lut/kelvin.png".to_string(),
                        "lut/lofi.png".to_string(),
                        "lut/lookup.png".to_string(),
                        "lut/nashville.png".to_string(),
                        "lut/sutro.png".to_string(),
                        "lut/toaster.png".to_string(),
                        "lut/walden.png".to_string(),
                        "lut/xpro.png".to_string(),
                        // Film / Movie looks
                        "lut/analog_film_01.png".to_string(),
                        "lut/dramatic_01.png".to_string(),
                        "lut/motion_picture_01.png".to_string(),
                        "lut/high_contrast_01.png".to_string(),
                        "lut/cineprint_160t.png".to_string(),
                        "lut/cineprint_250d.png".to_string(),
                        "lut/cineprint_500t.png".to_string(),
                        "lut/kodak_250d.png".to_string(),
                        "lut/movie_28_days.png".to_string(),
                        "lut/movie_300.png".to_string(),
                        "lut/movie_yuma.png".to_string(),
                        // Cinematic / Creative
                        "lut/cinematica_01.png".to_string(),
                        "lut/hollywood_tones.png".to_string(),
                        "lut/back_to_future.png".to_string(),
                        "lut/futuristic_01.png".to_string(),
                        "lut/sci_fi_01.png".to_string(),
                        "lut/midnight.png".to_string(),
                        "lut/cyber_night.png".to_string(),
                        "lut/vintage_action.png".to_string(),
                        "lut/vintage_blockbuster.png".to_string(),
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
        let amount = params
            .get("amount")
            .and_then(|v| v.as_f64())
            .unwrap_or(self.amount as f64) as f32;
        let lut_path = params
            .get("lut_path")
            .and_then(|v| v.as_str())
            .unwrap_or(&self.lut_path);

        if lut_path.is_empty() || !Path::new(lut_path).exists() {
            return Ok(input.clone());
        }

        let lut_img = image::open(lut_path)
            .map_err(|e| crate::error::AppError::Generic(format!("Failed to load LUT: {}", e)))?;
        let lut_rgba = lut_img.to_rgba8();
        let lut_w = lut_rgba.width();
        let lut_h = lut_rgba.height();

        if lut_w != 512 || lut_h != 512 {
            return Err(crate::error::AppError::Generic(
                "LUT must be 512x512 pixels".to_string(),
            ));
        }

        let tile_count = 8;
        let tile_size = 64; // 512 / 8

        let mut data = input.data.clone();
        for chunk in data.chunks_exact_mut(4) {
            let r = chunk[0] as f32 / 255.0;
            let g = chunk[1] as f32 / 255.0;
            let b = chunk[2] as f32 / 255.0;

            let b_slice = b * 63.0;
            let b_slice_floor = b_slice.floor().clamp(0.0, 63.0) as u32;
            let b_slice_fract = b_slice - b_slice_floor as f32;

            let tile_col = b_slice_floor % tile_count;
            let tile_row = b_slice_floor / tile_count;

            let lut_x = (tile_col * tile_size as u32) as f32 + r * (tile_size - 1) as f32;
            let lut_y = (tile_row * tile_size as u32) as f32 + g * (tile_size - 1) as f32;

            let sample = sample_bilinear(&lut_rgba, lut_w, lut_h, lut_x, lut_y);

            // Next blue slice
            let b_slice_floor2 = (b_slice_floor + 1).min(63);
            let tile_col2 = b_slice_floor2 % tile_count;
            let tile_row2 = b_slice_floor2 / tile_count;
            let lut_x2 = (tile_col2 * tile_size as u32) as f32 + r * (tile_size - 1) as f32;
            let lut_y2 = (tile_row2 * tile_size as u32) as f32 + g * (tile_size - 1) as f32;
            let sample2 = sample_bilinear(&lut_rgba, lut_w, lut_h, lut_x2, lut_y2);

            let final_color = [
                sample[0] * (1.0 - b_slice_fract) + sample2[0] * b_slice_fract,
                sample[1] * (1.0 - b_slice_fract) + sample2[1] * b_slice_fract,
                sample[2] * (1.0 - b_slice_fract) + sample2[2] * b_slice_fract,
            ];

            chunk[0] = ((r * (1.0 - amount) + final_color[0] * amount) * 255.0) as u8;
            chunk[1] = ((g * (1.0 - amount) + final_color[1] * amount) * 255.0) as u8;
            chunk[2] = ((b * (1.0 - amount) + final_color[2] * amount) * 255.0) as u8;
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

fn sample_bilinear(lut: &image::RgbaImage, w: u32, h: u32, x: f32, y: f32) -> [f32; 3] {
    let x0 = x.floor().clamp(0.0, (w - 1) as f32) as u32;
    let y0 = y.floor().clamp(0.0, (h - 1) as f32) as u32;
    let x1 = (x0 + 1).min(w - 1);
    let y1 = (y0 + 1).min(h - 1);

    let fx = x - x0 as f32;
    let fy = y - y0 as f32;

    let p00 = lut.get_pixel(x0, y0);
    let p10 = lut.get_pixel(x1, y0);
    let p01 = lut.get_pixel(x0, y1);
    let p11 = lut.get_pixel(x1, y1);

    let mut out = [0.0f32; 3];
    for c in 0..3 {
        let v00 = p00[c] as f32 / 255.0;
        let v10 = p10[c] as f32 / 255.0;
        let v01 = p01[c] as f32 / 255.0;
        let v11 = p11[c] as f32 / 255.0;
        out[c] = v00 * (1.0 - fx) * (1.0 - fy)
            + v10 * fx * (1.0 - fy)
            + v01 * (1.0 - fx) * fy
            + v11 * fx * fy;
    }
    out
}
