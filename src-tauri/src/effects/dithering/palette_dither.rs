use crate::effects::types::*;
use crate::effects::Effect;
use crate::error::Result;
use serde_json::json;

/// Palette-based dithering: quantize pixels to nearest colors from a custom palette.
pub struct PaletteDither;

fn bayer4(x: usize, y: usize) -> f32 {
    let p = [
        [0.0, 8.0, 2.0, 10.0],
        [12.0, 4.0, 14.0, 6.0],
        [3.0, 11.0, 1.0, 9.0],
        [15.0, 7.0, 13.0, 5.0],
    ];
    p[y % 4][x % 4] / 16.0
}

fn dist_sq(a: [u8; 3], b: [u8; 3]) -> u32 {
    let dr = (a[0] as i32 - b[0] as i32).pow(2) as u32;
    let dg = (a[1] as i32 - b[1] as i32).pow(2) as u32;
    let db = (a[2] as i32 - b[2] as i32).pow(2) as u32;
    dr + dg + db
}

fn luma(c: [u8; 3]) -> f32 {
    0.299 * c[0] as f32 + 0.587 * c[1] as f32 + 0.114 * c[2] as f32
}

impl Effect for PaletteDither {
    fn meta(&self) -> EffectMeta {
        EffectMeta {
            id: "dithering.palette".to_string(),
            name: "Palette Dither".to_string(),
            category: EffectCategory::Dithering,
            media_type: MediaType::Image,
            parameters: vec![
                ParameterDef {
                    id: "scale".to_string(),
                    name: "Scale".to_string(),
                    param_type: ParamType::Slider,
                    default: json!(4.0),
                    min: Some(1.0),
                    max: Some(32.0),
                    step: Some(1.0),
                    options: None,
                },
                ParameterDef {
                    id: "angle".to_string(),
                    name: "Angle".to_string(),
                    param_type: ParamType::Slider,
                    default: json!(0.0),
                    min: Some(-std::f64::consts::PI),
                    max: Some(std::f64::consts::PI),
                    step: Some(0.1),
                    options: None,
                },
                ParameterDef {
                    id: "palette_size".to_string(),
                    name: "Palette Size".to_string(),
                    param_type: ParamType::Slider,
                    default: json!(4.0),
                    min: Some(2.0),
                    max: Some(8.0),
                    step: Some(1.0),
                    options: None,
                },
                ParameterDef {
                    id: "amount".to_string(),
                    name: "Amount".to_string(),
                    param_type: ParamType::Slider,
                    default: json!(1.0),
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
        let mut output = input.clone();
        let w = input.width as usize;
        let h = input.height as usize;

        let scale = params.get("scale").and_then(|v| v.as_f64()).unwrap_or(4.0) as f32;
        let angle = params.get("angle").and_then(|v| v.as_f64()).unwrap_or(0.0) as f32;
        let palette_size = params
            .get("palette_size")
            .and_then(|v| v.as_f64())
            .unwrap_or(4.0) as usize;
        let amount = params.get("amount").and_then(|v| v.as_f64()).unwrap_or(1.0) as f32;

        // Default palette (same as shader defaults)
        let palette: Vec<[u8; 3]> = vec![
            [0, 0, 0],
            [255, 255, 255],
            [204, 51, 51],
            [51, 153, 204],
            [51, 204, 77],
            [230, 204, 51],
            [128, 77, 179],
            [230, 128, 51],
        ];
        let psize = palette_size.clamp(2, palette.len());

        let cos_a = angle.cos();
        let sin_a = angle.sin();

        for y in 0..h {
            for x in 0..w {
                let idx = (y * w + x) * 4;
                let r = input.data[idx];
                let g = input.data[idx + 1];
                let b = input.data[idx + 2];
                let px = [r, g, b];

                // Rotate coordinates for pattern
                let rx = x as f32 * cos_a - y as f32 * sin_a;
                let ry = x as f32 * sin_a + y as f32 * cos_a;
                let bx = (rx / scale).floor() * scale;
                let by = (ry / scale).floor() * scale;
                let threshold = bayer4(bx as usize, by as usize) - 0.5;

                // Find best and second-best palette colors
                let mut best_idx = 0usize;
                let mut best_dist = u32::MAX;
                let mut second_idx = 1usize;
                let mut second_dist = u32::MAX;

                for (i, &color) in palette.iter().enumerate().take(psize) {
                    let d = dist_sq(px, color);
                    if d < best_dist {
                        second_dist = best_dist;
                        second_idx = best_idx;
                        best_dist = d;
                        best_idx = i;
                    } else if d < second_dist {
                        second_dist = d;
                        second_idx = i;
                    }
                }

                let chosen = if second_dist < u32::MAX {
                    let lum = luma(px);
                    let lum_best = luma(palette[best_idx]);
                    let lum_second = luma(palette[second_idx]);
                    let dl = (lum_second - lum_best).abs() * 2.0;
                    let dithered_lum = lum + threshold * dl;
                    if dithered_lum > lum {
                        palette[second_idx]
                    } else {
                        palette[best_idx]
                    }
                } else {
                    palette[best_idx]
                };

                let fr = chosen[0] as f32 / 255.0;
                let fg = chosen[1] as f32 / 255.0;
                let fb = chosen[2] as f32 / 255.0;
                let orig_r = r as f32 / 255.0;
                let orig_g = g as f32 / 255.0;
                let orig_b = b as f32 / 255.0;

                output.data[idx] = ((orig_r * (1.0 - amount) + fr * amount) * 255.0) as u8;
                output.data[idx + 1] = ((orig_g * (1.0 - amount) + fg * amount) * 255.0) as u8;
                output.data[idx + 2] = ((orig_b * (1.0 - amount) + fb * amount) * 255.0) as u8;
                // Alpha preserved
            }
        }

        Ok(output)
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
