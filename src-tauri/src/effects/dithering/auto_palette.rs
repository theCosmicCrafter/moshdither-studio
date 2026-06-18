//! Auto-palette extraction using a simplified Median Cut Color Quantization (MMCQ).
//!
//! Inspired by the dither_pie and ditherista reference projects. This module
//! extracts an optimal color palette from an image frame using the median cut
//! algorithm, then applies ordered or error-diffusion dithering with that palette.

use crate::effects::types::*;
use crate::effects::Effect;
use crate::error::Result;
use serde_json::json;

/// A color in RGB space.
#[derive(Clone, Copy, Debug, Default, PartialEq)]
pub struct RgbColor {
    pub r: u8,
    pub g: u8,
    pub b: u8,
}

/// Extract a color palette from a frame using median cut quantization.
///
/// # Arguments
/// * `frame` - input RGBA frame
/// * `num_colors` - desired palette size (will be rounded to power of 2)
pub fn extract_palette(frame: &Frame, num_colors: usize) -> Vec<RgbColor> {
    let pixels = collect_pixels(frame);
    if pixels.is_empty() {
        return vec![RgbColor::default()];
    }

    let mut buckets: Vec<Vec<RgbColor>> = vec![pixels];
    while buckets.len() < num_colors {
        // Find the bucket with the largest range
        let mut max_range_idx = 0;
        let mut max_range = 0i32;
        for (i, bucket) in buckets.iter().enumerate() {
            let range = color_range(bucket);
            if range > max_range {
                max_range = range;
                max_range_idx = i;
            }
        }
        if buckets[max_range_idx].len() < 2 {
            break;
        }
        // Split the bucket at the median along the longest channel
        let split = split_bucket(buckets.remove(max_range_idx));
        buckets.push(split.0);
        buckets.push(split.1);
    }

    // Average each bucket to get the palette
    buckets.iter().map(|bucket| average_color(bucket)).collect()
}

fn collect_pixels(frame: &Frame) -> Vec<RgbColor> {
    let mut pixels = Vec::with_capacity(frame.data.len() / 4);
    for chunk in frame.data.chunks_exact(4) {
        if chunk[3] > 0 {
            pixels.push(RgbColor {
                r: chunk[0],
                g: chunk[1],
                b: chunk[2],
            });
        }
    }
    // Subsample if too many pixels for performance
    if pixels.len() > 10000 {
        let step = pixels.len() / 10000;
        pixels = pixels.into_iter().step_by(step).collect();
    }
    pixels
}

fn color_range(bucket: &[RgbColor]) -> i32 {
    if bucket.is_empty() {
        return 0;
    }
    let mut min_r = 255u8;
    let mut max_r = 0u8;
    let mut min_g = 255u8;
    let mut max_g = 0u8;
    let mut min_b = 255u8;
    let mut max_b = 0u8;
    for c in bucket {
        min_r = min_r.min(c.r);
        max_r = max_r.max(c.r);
        min_g = min_g.min(c.g);
        max_g = max_g.max(c.g);
        min_b = min_b.min(c.b);
        max_b = max_b.max(c.b);
    }
    let dr = (max_r - min_r) as i32;
    let dg = (max_g - min_g) as i32;
    let db = (max_b - min_b) as i32;
    dr.max(dg).max(db)
}

fn split_bucket(bucket: Vec<RgbColor>) -> (Vec<RgbColor>, Vec<RgbColor>) {
    // Find the channel with the largest range
    let mut min_r = 255u8;
    let mut max_r = 0u8;
    let mut min_g = 255u8;
    let mut max_g = 0u8;
    let mut min_b = 255u8;
    let mut max_b = 0u8;
    for c in &bucket {
        min_r = min_r.min(c.r);
        max_r = max_r.max(c.r);
        min_g = min_g.min(c.g);
        max_g = max_g.max(c.g);
        min_b = min_b.min(c.b);
        max_b = max_b.max(c.b);
    }
    let dr = (max_r - min_r) as i32;
    let dg = (max_g - min_g) as i32;
    let db = (max_b - min_b) as i32;
    let channel = if dr >= dg && dr >= db {
        0
    } else if dg >= db {
        1
    } else {
        2
    };

    // Sort by the longest channel
    let mut sorted = bucket;
    sorted.sort_by(|a, b| {
        let va = match channel {
            0 => a.r,
            1 => a.g,
            _ => a.b,
        };
        let vb = match channel {
            0 => b.r,
            1 => b.g,
            _ => b.b,
        };
        va.cmp(&vb)
    });

    let mid = sorted.len() / 2;
    let right = sorted.split_off(mid);
    (sorted, right)
}

fn average_color(bucket: &[RgbColor]) -> RgbColor {
    if bucket.is_empty() {
        return RgbColor::default();
    }
    let n = bucket.len() as u32;
    let r: u32 = bucket.iter().map(|c| c.r as u32).sum::<u32>() / n;
    let g: u32 = bucket.iter().map(|c| c.g as u32).sum::<u32>() / n;
    let b: u32 = bucket.iter().map(|c| c.b as u32).sum::<u32>() / n;
    RgbColor {
        r: r as u8,
        g: g as u8,
        b: b as u8,
    }
}

/// Find the nearest palette color to a given RGB value.
fn nearest_palette_color(r: u8, g: u8, b: u8, palette: &[RgbColor]) -> RgbColor {
    let mut best = palette[0];
    let mut best_dist = u32::MAX;
    for c in palette {
        let dr = r as i32 - c.r as i32;
        let dg = g as i32 - c.g as i32;
        let db = b as i32 - c.b as i32;
        let dist = (dr * dr + dg * dg + db * db) as u32;
        if dist < best_dist {
            best_dist = dist;
            best = *c;
        }
    }
    best
}

/// Auto-palette dithering effect — extracts a palette from the frame using
/// median cut quantization, then applies Floyd-Steinberg error diffusion
/// dithering with that palette.
pub struct AutoPaletteDither;

impl Default for AutoPaletteDither {
    fn default() -> Self {
        Self
    }
}

impl Effect for AutoPaletteDither {
    fn meta(&self) -> EffectMeta {
        EffectMeta {
            id: "dithering.auto_palette".to_string(),
            name: "Auto-Palette Dither".to_string(),
            category: EffectCategory::Dithering,
            media_type: MediaType::Image,
            parameters: vec![
                ParameterDef {
                    id: "num_colors".to_string(),
                    name: "Colors".to_string(),
                    param_type: ParamType::Slider,
                    default: json!(8),
                    min: Some(2.0),
                    max: Some(64.0),
                    step: Some(1.0),
                    options: None,
                },
                ParameterDef {
                    id: "strength".to_string(),
                    name: "Strength".to_string(),
                    param_type: ParamType::Slider,
                    default: json!(1.0),
                    min: Some(0.0),
                    max: Some(2.0),
                    step: Some(0.1),
                    options: None,
                },
            ],
        }
    }

    fn is_temporal(&self) -> bool {
        false
    }

    fn process_frame(&self, input: &Frame, _m: Option<&Mask>, params: &ParameterValues) -> Result<Frame> {
        let num_colors = params.get("num_colors").and_then(|v| v.as_u64()).unwrap_or(8) as usize;
        let strength = params.get("strength").and_then(|v| v.as_f64()).unwrap_or(1.0) as f32;

        let palette = extract_palette(input, num_colors);
        let w = input.width as usize;
        let h = input.height as usize;

        // Floyd-Steinberg error diffusion with extracted palette
        let mut errors = vec![(0f32, 0f32, 0f32); w * h];
        let mut data = input.data.clone();

        for y in 0..h {
            for x in 0..w {
                let idx = (y * w + x) * 4;
                let r = (data[idx] as f32 + errors[y * w + x].0).clamp(0.0, 255.0);
                let g = (data[idx + 1] as f32 + errors[y * w + x].1).clamp(0.0, 255.0);
                let b = (data[idx + 2] as f32 + errors[y * w + x].2).clamp(0.0, 255.0);

                let nearest = nearest_palette_color(r as u8, g as u8, b as u8, &palette);
                data[idx] = nearest.r;
                data[idx + 1] = nearest.g;
                data[idx + 2] = nearest.b;
                data[idx + 3] = input.data[idx + 3];

                // Distribute error
                let er = (r - nearest.r as f32) * strength;
                let eg = (g - nearest.g as f32) * strength;
                let eb = (b - nearest.b as f32) * strength;

                if x + 1 < w {
                    errors[y * w + x + 1].0 += er * 7.0 / 16.0;
                    errors[y * w + x + 1].1 += eg * 7.0 / 16.0;
                    errors[y * w + x + 1].2 += eb * 7.0 / 16.0;
                }
                if y + 1 < h {
                    if x > 0 {
                        errors[(y + 1) * w + x - 1].0 += er * 3.0 / 16.0;
                        errors[(y + 1) * w + x - 1].1 += eg * 3.0 / 16.0;
                        errors[(y + 1) * w + x - 1].2 += eb * 3.0 / 16.0;
                    }
                    errors[(y + 1) * w + x].0 += er * 5.0 / 16.0;
                    errors[(y + 1) * w + x].1 += eg * 5.0 / 16.0;
                    errors[(y + 1) * w + x].2 += eb * 5.0 / 16.0;
                    if x + 1 < w {
                        errors[(y + 1) * w + x + 1].0 += er * 1.0 / 16.0;
                        errors[(y + 1) * w + x + 1].1 += eg * 1.0 / 16.0;
                        errors[(y + 1) * w + x + 1].2 += eb * 1.0 / 16.0;
                    }
                }
            }
        }

        Ok(Frame {
            width: input.width,
            height: input.height,
            data,
        })
    }

    fn process_video(&self, input: &VideoSegment, mask: Option<&Mask>, params: &ParameterValues) -> Result<VideoSegment> {
        let mut frames = Vec::with_capacity(input.frames.len());
        for frame in &input.frames {
            frames.push(self.process_frame(frame, mask, params)?);
        }
        Ok(VideoSegment { frames, fps: input.fps })
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn make_gradient_frame(w: u32, h: u32) -> Frame {
        let mut data = Vec::with_capacity((w * h * 4) as usize);
        for y in 0..h {
            for x in 0..w {
                data.extend_from_slice(&[(x * 255 / w) as u8, (y * 255 / h) as u8, 128, 255]);
            }
        }
        Frame { width: w, height: h, data }
    }

    #[test]
    fn test_extract_palette() {
        let f = make_gradient_frame(32, 32);
        let palette = extract_palette(&f, 8);
        assert!(palette.len() >= 2);
        assert!(palette.len() <= 8);
    }

    #[test]
    fn test_auto_palette_dither() {
        let e = AutoPaletteDither;
        let f = make_gradient_frame(16, 16);
        let r = e.process_frame(&f, None, &serde_json::Map::new()).unwrap();
        assert_eq!(r.width, 16);
        assert_eq!(r.height, 16);
        // Result should differ from input
        assert_ne!(r.data, f.data);
    }

    #[test]
    fn test_nearest_color() {
        let palette = vec![
            RgbColor { r: 0, g: 0, b: 0 },
            RgbColor { r: 255, g: 255, b: 255 },
        ];
        let c = nearest_palette_color(10, 10, 10, &palette);
        assert_eq!(c, RgbColor { r: 0, g: 0, b: 0 });
        let c = nearest_palette_color(200, 200, 200, &palette);
        assert_eq!(c, RgbColor { r: 255, g: 255, b: 255 });
    }
}
