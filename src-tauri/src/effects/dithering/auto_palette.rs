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
    for chunk in frame.data.as_chunks::<4>().0.iter() {
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
        // A still image has no "clip" to be consistent across, so
        // process_frame extracts its own palette from its own pixels -- that
        // is correct for preview/image use. But `commands.rs`'s video export
        // path runs any non-temporal effect through an independent-per-frame
        // `par_iter()` branch, and median-cut over each frame's own content
        // gives a different palette per frame -- visible flicker between
        // palettes across an exported clip. Declaring this effect temporal
        // routes export through `process_video` below, which derives ONE
        // palette for the whole segment instead.
        true
    }

    fn process_frame(
        &self,
        input: &Frame,
        _m: Option<&Mask>,
        params: &ParameterValues,
    ) -> Result<Frame> {
        let (num_colors, strength) = Self::read_params(params);
        let palette = extract_palette(input, num_colors);
        Ok(Self::dither_with_palette(input, &palette, strength))
    }

    fn process_video(
        &self,
        input: &VideoSegment,
        _mask: Option<&Mask>,
        params: &ParameterValues,
    ) -> Result<VideoSegment> {
        if input.frames.is_empty() {
            return Ok(VideoSegment {
                frames: Vec::new(),
                fps: input.fps,
            });
        }

        let (num_colors, strength) = Self::read_params(params);

        // Derive ONE palette from a representative sample of the whole
        // segment, computed once -- never re-derived per frame, which is
        // exactly what caused the flicker this method exists to fix.
        let sample = Self::sample_segment(input);
        let palette = extract_palette(&sample, num_colors);

        let frames = input
            .frames
            .iter()
            .map(|frame| Self::dither_with_palette(frame, &palette, strength))
            .collect();

        Ok(VideoSegment {
            frames,
            fps: input.fps,
        })
    }
}

impl AutoPaletteDither {
    /// Read `num_colors` and `strength`, honouring the read-after-clamp path.
    ///
    /// `num_colors` must be read with `as_f64`, not `as_u64`: a JSON float
    /// (whether hand-supplied or produced by `clamp_params` rewriting an
    /// out-of-range value) would otherwise be silently dropped and the
    /// effect would fall back to its hardcoded default of 8.
    fn read_params(params: &ParameterValues) -> (usize, f32) {
        let num_colors = params
            .get("num_colors")
            .and_then(|v| v.as_f64())
            .filter(|v| v.is_finite())
            .map(|v| v.round().clamp(2.0, 64.0) as usize)
            .unwrap_or(8);
        let strength = params
            .get("strength")
            .and_then(|v| v.as_f64())
            .unwrap_or(1.0) as f32;
        (num_colors, strength)
    }

    /// Merge pixel data from a representative sample of frames spread across
    /// the whole segment, so the palette reflects the clip as a whole rather
    /// than any single frame. `extract_palette` only reads `frame.data`
    /// (via `collect_pixels`), so the synthetic frame's width/height need
    /// only be large enough to hold the merged bytes -- they are never used
    /// to index into it.
    fn sample_segment(input: &VideoSegment) -> Frame {
        const MAX_SAMPLES: usize = 5;
        let n = input.frames.len();
        let count = n.clamp(1, MAX_SAMPLES);

        let mut data = Vec::new();
        for i in 0..count {
            let idx = if count == 1 {
                0
            } else {
                i * (n - 1) / (count - 1)
            };
            data.extend_from_slice(&input.frames[idx].data);
        }

        let width = input.frames[0].width.max(1);
        let height = ((data.len() as u32) / 4 / width).max(1);
        Frame {
            width,
            height,
            data,
        }
    }

    /// Floyd-Steinberg error diffusion against a fixed, already-extracted
    /// palette. Factored out of `process_frame` so `process_video` can apply
    /// the SAME palette to every frame instead of re-deriving one per frame.
    fn dither_with_palette(input: &Frame, palette: &[RgbColor], strength: f32) -> Frame {
        let w = input.width as usize;
        let h = input.height as usize;

        let mut errors = vec![(0f32, 0f32, 0f32); w * h];
        let mut data = input.data.clone();

        for y in 0..h {
            for x in 0..w {
                let idx = (y * w + x) * 4;
                let r = (data[idx] as f32 + errors[y * w + x].0).clamp(0.0, 255.0);
                let g = (data[idx + 1] as f32 + errors[y * w + x].1).clamp(0.0, 255.0);
                let b = (data[idx + 2] as f32 + errors[y * w + x].2).clamp(0.0, 255.0);

                let nearest = nearest_palette_color(r as u8, g as u8, b as u8, palette);
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

        Frame {
            width: input.width,
            height: input.height,
            data,
        }
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
        Frame {
            width: w,
            height: h,
            data,
        }
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
            RgbColor {
                r: 255,
                g: 255,
                b: 255,
            },
        ];
        let c = nearest_palette_color(10, 10, 10, &palette);
        assert_eq!(c, RgbColor { r: 0, g: 0, b: 0 });
        let c = nearest_palette_color(200, 200, 200, &palette);
        assert_eq!(
            c,
            RgbColor {
                r: 255,
                g: 255,
                b: 255
            }
        );
    }

    /// `num_colors` must be read with `as_f64`, not `as_u64`: a JSON float
    /// (whether hand-supplied or produced by `clamp_params` rewriting an
    /// out-of-range value) would otherwise be silently dropped and the
    /// effect would fall back to its hardcoded default of 8.
    #[test]
    fn num_colors_accepts_a_float_tagged_value_instead_of_falling_back_to_default() {
        let frame = make_gradient_frame(48, 48);
        let e = AutoPaletteDither;

        let mut float_params = serde_json::Map::new();
        float_params.insert("num_colors".into(), json!(4.0));
        let mut int_params = serde_json::Map::new();
        int_params.insert("num_colors".into(), json!(4));

        let default_out = e
            .process_frame(&frame, None, &serde_json::Map::new())
            .unwrap();
        let float_out = e.process_frame(&frame, None, &float_params).unwrap();
        let int_out = e.process_frame(&frame, None, &int_params).unwrap();

        assert_eq!(
            float_out.data, int_out.data,
            "num_colors 4 and 4.0 must resolve identically"
        );
        assert_ne!(
            float_out.data, default_out.data,
            "a float-tagged num_colors must not silently fall back to the default"
        );
    }

    #[test]
    fn num_colors_honours_a_clamp_then_read_round_trip() {
        let frame = make_gradient_frame(48, 48);
        let e = AutoPaletteDither;

        // Out of range (declared max is 64); clamp_params rewrites this to
        // the float-tagged representation that as_u64() cannot read.
        let mut raw = serde_json::Map::new();
        raw.insert("num_colors".into(), json!(9999));
        let clamped = crate::effects::clamp_params("dithering.auto_palette", &raw);
        assert!(
            clamped["num_colors"].is_f64(),
            "clamp_params should have rewritten the out-of-range value to a float"
        );

        let mut direct_max = serde_json::Map::new();
        direct_max.insert("num_colors".into(), json!(64));

        let via_clamp = e.process_frame(&frame, None, &clamped).unwrap();
        let via_direct = e.process_frame(&frame, None, &direct_max).unwrap();
        let default_out = e
            .process_frame(&frame, None, &serde_json::Map::new())
            .unwrap();

        assert_eq!(
            via_clamp.data, via_direct.data,
            "a value clamped to 64 must behave exactly like num_colors=64"
        );
        assert_ne!(
            via_clamp.data, default_out.data,
            "clamped num_colors must not silently fall back to the default"
        );
    }

    /// The defining fix for the flicker bug (#5): a video-export segment
    /// must be quantized against ONE shared palette, not a palette re-derived
    /// per frame from each frame's own content.
    ///
    /// An earlier version of this test used four SOLID, well-separated
    /// colors, one per frame. That fixture cannot actually distinguish a
    /// correct shared-palette implementation from a silently-reverted
    /// per-frame-independent one: a solid frame's true color is exactly
    /// recoverable from ANY palette containing it, whether derived from just
    /// that frame or from every frame merged, so both implementations
    /// produced byte-identical output and the assertions passed either way
    /// (the same defect independently confirmed for kmeans.rs's identical
    /// test -- see that file's version of this test for the full derivation).
    ///
    /// This fixture uses two BIMODAL frames instead: frame A is {10, 60} (a
    /// tight, dark pair), frame B is {190, 245} (a tight, light pair).
    /// Median-cut splits its widest box at the median of the sorted sample;
    /// for the four values {10,60,190,245} the median falls between 60 and
    /// 190, so a MERGED sample groups the close dark pair into one box and
    /// the close light pair into the other -- the same split a shared
    /// palette must produce, and different from what each frame's own
    /// (already only two colors) extraction trivially returns on its own.
    /// `strength: 0.0` disables error-diffusion so quantization is pure
    /// nearest-palette-color lookup with no accumulated-error noise.
    #[test]
    fn process_video_uses_one_shared_palette_for_the_whole_segment() {
        fn bimodal_frame(w: u32, h: u32, low: u8, high: u8) -> Frame {
            let mut data = Vec::with_capacity((w * h * 4) as usize);
            for i in 0..(w * h) {
                let v = if i % 2 == 0 { low } else { high };
                data.extend_from_slice(&[v, v, v, 255]);
            }
            Frame {
                width: w,
                height: h,
                data,
            }
        }

        let frame_a = bimodal_frame(16, 16, 10, 60);
        let frame_b = bimodal_frame(16, 16, 190, 245);
        let frames = vec![frame_a.clone(), frame_b.clone()];
        let segment = VideoSegment {
            frames: frames.clone(),
            fps: 24.0,
        };

        let e = AutoPaletteDither;
        assert!(
            e.is_temporal(),
            "must be temporal so commands.rs routes export through process_video"
        );

        let mut params = serde_json::Map::new();
        params.insert("num_colors".to_string(), json!(2));
        params.insert("strength".to_string(), json!(0.0));

        let out = e.process_video(&segment, None, &params).unwrap();

        let mut shared_colors = std::collections::HashSet::new();
        for f in &out.frames {
            for px in f.data.as_chunks::<4>().0.iter() {
                shared_colors.insert(px[0]);
            }
        }
        assert!(
            shared_colors.len() <= 2,
            "process_video must quantize every frame against ONE shared palette; \
             got {} distinct grey levels across the segment, expected at most 2: {:?}",
            shared_colors.len(),
            shared_colors
        );

        // The decisive assertion: frame A's shared-palette output must differ
        // from what frame A produces on its own. If process_video silently
        // fell back to calling process_frame per frame internally, these
        // would be byte-identical.
        let independent_a = e.process_frame(&frame_a, None, &params).unwrap();
        assert_ne!(
            out.frames[0].data, independent_a.data,
            "frame A processed through process_video must reflect the segment's \
             SHARED palette, not the palette its own content alone would produce -- \
             identical output means process_video is not actually sharing a palette"
        );

        // Pin the actual shared value: frame A's two native tones (10, 60)
        // must have collapsed onto the same merged dark-cluster palette entry.
        let frame_a_shared_values: std::collections::HashSet<u8> = out.frames[0]
            .data
            .as_chunks::<4>()
            .0
            .iter()
            .map(|px| px[0])
            .collect();
        assert_eq!(
            frame_a_shared_values.len(),
            1,
            "frame A's two native tones (10 and 60) must both map to the single \
             merged dark-cluster palette entry under the shared palette, not \
             remain distinct as they would under independent per-frame \
             extraction: got {:?}",
            frame_a_shared_values
        );

        // Sanity check on the independent path: run on its own, frame A's
        // native bimodal structure is exactly what a 2-color extraction
        // recovers, demonstrating what the shared-palette fix avoids.
        let mut independent_a_values = std::collections::HashSet::new();
        for px in independent_a.data.as_chunks::<4>().0.iter() {
            independent_a_values.insert(px[0]);
        }
        assert_eq!(
            independent_a_values.len(),
            2,
            "sanity check: frame A processed independently should recover its own \
             two native tones"
        );
    }
}
