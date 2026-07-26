//! Shared error-diffusion logic for dithering.
//!
//! Error diffusion quantises each pixel in scan order and pushes the resulting
//! quantisation error into neighbouring pixels that have not been visited yet.
//! That sequential dependency is why this family has no WebGL preview — see
//! `src/utils/effectConverter.ts`, where every effect built on this module is
//! marked `accurate: false` so its preview is rendered here instead.

use serde_json::json;

use crate::effects::types::{Frame, ParamType, ParameterDef, ParameterValues};
use crate::error::Result;

/// Colour handling for error diffusion.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
enum ColorMode {
    /// Collapse to luminance and diffuse a single channel. Output is neutral
    /// grey. This is the historical behaviour and remains the default.
    Grayscale,
    /// Diffuse R, G and B independently, keeping colour. Produces the classic
    /// saturated error-diffusion look rather than a monochrome one.
    Rgb,
}

impl ColorMode {
    fn from_params(params: &ParameterValues) -> Self {
        match params.get("color_mode").and_then(|v| v.as_str()) {
            Some("rgb") => ColorMode::Rgb,
            _ => ColorMode::Grayscale,
        }
    }

    fn channels(self) -> usize {
        match self {
            ColorMode::Grayscale => 1,
            ColorMode::Rgb => 3,
        }
    }
}

/// Parameter definitions shared by every error-diffusion effect.
///
/// Kept here rather than duplicated across the eight call sites so the ranges
/// and defaults cannot drift apart. The defaults reproduce the behaviour these
/// effects had when the values were hardcoded, so existing projects and presets
/// that store no parameters render exactly as before.
pub fn param_defs() -> Vec<ParameterDef> {
    vec![
        ParameterDef {
            id: "levels".to_string(),
            name: "Levels".to_string(),
            param_type: ParamType::Slider,
            default: json!(2),
            min: Some(2.0),
            max: Some(16.0),
            step: Some(1.0),
            options: None,
        },
        ParameterDef {
            id: "color_mode".to_string(),
            name: "Color Mode".to_string(),
            param_type: ParamType::Select,
            default: json!("grayscale"),
            min: None,
            max: None,
            step: None,
            options: Some(vec!["grayscale".to_string(), "rgb".to_string()]),
        },
        ParameterDef {
            id: "serpentine".to_string(),
            name: "Serpentine".to_string(),
            param_type: ParamType::Toggle,
            default: json!(true),
            min: None,
            max: None,
            step: None,
            options: None,
        },
    ]
}

/// Apply error diffusion to `input` using `kernel`.
///
/// * `kernel` is a list of `(dx, dy, factor)` offsets relative to the current
///   pixel in the forward-scan direction. For serpentine passes the kernel is
///   mirrored horizontally automatically.
/// * `default_levels` is the number of output levels per channel (minimum 2)
///   used when the caller supplies no `levels` parameter.
/// * `default_serpentine` likewise backs the `serpentine` parameter.
///
/// `params` overrides both, and selects the colour mode. Alpha is preserved
/// from the input.
pub fn apply(
    input: &Frame,
    kernel: &[(isize, isize, f32)],
    default_levels: u32,
    default_serpentine: bool,
    params: &ParameterValues,
) -> Result<Frame> {
    let w = input.width as usize;
    let h = input.height as usize;

    // Read as f64, not as_u64: a slider with step 1.0 may still serialise as
    // `8.0`, and as_u64() returns None for a JSON float — which would silently
    // drop the parameter and fall back to the default.
    let levels = params
        .get("levels")
        .and_then(|v| v.as_f64())
        .filter(|v| v.is_finite())
        .map(|v| v.clamp(2.0, u32::MAX as f64) as u32)
        .unwrap_or(default_levels)
        .max(2);
    let serpentine = params
        .get("serpentine")
        .and_then(|v| v.as_bool())
        .unwrap_or(default_serpentine);
    let mode = ColorMode::from_params(params);
    let nc = mode.channels();

    let step = 255.0 / (levels - 1) as f32;

    // Working buffer holds `nc` interleaved f32 channels per pixel: a single
    // luminance channel in grayscale mode, or R/G/B in colour mode. Keeping the
    // channel count dynamic means grayscale still does exactly one channel of
    // work, so adding colour support costs nothing when it is not used.
    let mut buf = vec![0.0f32; w * h * nc];
    for y in 0..h {
        for x in 0..w {
            let idx = (y * w + x) * 4;
            let base = (y * w + x) * nc;
            match mode {
                ColorMode::Grayscale => {
                    buf[base] = 0.299 * input.data[idx] as f32
                        + 0.587 * input.data[idx + 1] as f32
                        + 0.114 * input.data[idx + 2] as f32;
                }
                ColorMode::Rgb => {
                    buf[base] = input.data[idx] as f32;
                    buf[base + 1] = input.data[idx + 1] as f32;
                    buf[base + 2] = input.data[idx + 2] as f32;
                }
            }
        }
    }

    let mut data = input.data.clone();

    for y in 0..h {
        let reverse = serpentine && y % 2 == 1;
        let x_range: Vec<usize> = if reverse {
            (0..w).rev().collect()
        } else {
            (0..w).collect()
        };

        for x in x_range {
            let base = (y * w + x) * nc;
            for c in 0..nc {
                let old = buf[base + c];
                let q = (old / step).round().clamp(0.0, (levels - 1) as f32) as u32;
                let new = q as f32 * step;
                let err = old - new;
                buf[base + c] = new;

                for (dx, dy, factor) in kernel {
                    let nx = if reverse {
                        x as isize - dx
                    } else {
                        x as isize + dx
                    };
                    let ny = y as isize + dy;
                    if nx >= 0 && nx < w as isize && ny >= 0 && ny < h as isize {
                        buf[(ny as usize * w + nx as usize) * nc + c] += err * factor;
                    }
                }
            }
        }
    }

    for y in 0..h {
        for x in 0..w {
            let idx = (y * w + x) * 4;
            let base = (y * w + x) * nc;
            match mode {
                ColorMode::Grayscale => {
                    let v = buf[base].clamp(0.0, 255.0) as u8;
                    data[idx] = v;
                    data[idx + 1] = v;
                    data[idx + 2] = v;
                }
                ColorMode::Rgb => {
                    data[idx] = buf[base].clamp(0.0, 255.0) as u8;
                    data[idx + 1] = buf[base + 1].clamp(0.0, 255.0) as u8;
                    data[idx + 2] = buf[base + 2].clamp(0.0, 255.0) as u8;
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

#[cfg(test)]
mod tests {
    use super::*;

    const FS: &[(isize, isize, f32)] = &[
        (1, 0, 7.0 / 16.0),
        (-1, 1, 3.0 / 16.0),
        (0, 1, 5.0 / 16.0),
        (1, 1, 1.0 / 16.0),
    ];

    fn color_frame(w: u32, h: u32) -> Frame {
        let mut data = Vec::with_capacity((w * h * 4) as usize);
        for y in 0..h {
            for x in 0..w {
                data.extend_from_slice(&[
                    ((x * 7 + y * 13) % 256) as u8,
                    ((x * 11 + y * 5) % 256) as u8,
                    ((x * 3 + y * 17) % 256) as u8,
                    255,
                ]);
            }
        }
        Frame {
            width: w,
            height: h,
            data,
        }
    }

    #[test]
    fn grayscale_is_the_default_and_output_is_neutral() {
        let frame = color_frame(32, 32);
        let out = apply(&frame, FS, 2, true, &serde_json::Map::new()).unwrap();
        for px in out.data.chunks_exact(4) {
            assert_eq!(px[0], px[1], "default mode must be neutral grey");
            assert_eq!(px[1], px[2], "default mode must be neutral grey");
        }
    }

    #[test]
    fn explicit_grayscale_matches_the_default() {
        let frame = color_frame(32, 32);
        let implicit = apply(&frame, FS, 2, true, &serde_json::Map::new()).unwrap();
        let mut params = serde_json::Map::new();
        params.insert("color_mode".into(), json!("grayscale"));
        let explicit = apply(&frame, FS, 2, true, &params).unwrap();
        assert_eq!(implicit.data, explicit.data);
    }

    #[test]
    fn rgb_mode_keeps_color() {
        let frame = color_frame(32, 32);
        let mut params = serde_json::Map::new();
        params.insert("color_mode".into(), json!("rgb"));
        let out = apply(&frame, FS, 2, true, &params).unwrap();
        assert!(
            out.data
                .chunks_exact(4)
                .any(|px| px[0] != px[1] || px[1] != px[2]),
            "rgb mode must produce at least one non-neutral pixel"
        );
    }

    #[test]
    fn levels_param_overrides_the_default() {
        let frame = color_frame(32, 32);
        let two = apply(&frame, FS, 2, true, &serde_json::Map::new()).unwrap();
        let mut params = serde_json::Map::new();
        params.insert("levels".into(), json!(8));
        let eight = apply(&frame, FS, 2, true, &params).unwrap();
        assert_ne!(two.data, eight.data, "levels must change the output");

        let distinct = |f: &Frame| {
            let mut seen = std::collections::HashSet::new();
            for px in f.data.chunks_exact(4) {
                seen.insert(px[0]);
            }
            seen.len()
        };
        assert!(
            distinct(&eight) > distinct(&two),
            "more levels must yield more distinct output values"
        );
    }

    #[test]
    fn levels_accepts_a_json_float_from_a_slider() {
        let frame = color_frame(32, 32);
        let mut int_params = serde_json::Map::new();
        int_params.insert("levels".into(), json!(8));
        let mut float_params = serde_json::Map::new();
        float_params.insert("levels".into(), json!(8.0));

        let from_int = apply(&frame, FS, 2, true, &int_params).unwrap();
        let from_float = apply(&frame, FS, 2, true, &float_params).unwrap();
        let default = apply(&frame, FS, 2, true, &serde_json::Map::new()).unwrap();

        assert_eq!(from_int.data, from_float.data, "8 and 8.0 must agree");
        assert_ne!(
            from_float.data, default.data,
            "a float levels value must not be silently dropped"
        );
    }

    #[test]
    fn levels_below_two_are_clamped_not_divided_by_zero() {
        let frame = color_frame(16, 16);
        let mut params = serde_json::Map::new();
        params.insert("levels".into(), json!(0));
        let out = apply(&frame, FS, 2, true, &params).unwrap();
        assert_eq!(out.data.len(), frame.data.len());
    }

    #[test]
    fn serpentine_param_overrides_the_default() {
        let frame = color_frame(32, 32);
        let on = apply(&frame, FS, 2, true, &serde_json::Map::new()).unwrap();
        let mut params = serde_json::Map::new();
        params.insert("serpentine".into(), json!(false));
        let off = apply(&frame, FS, 2, true, &params).unwrap();
        assert_ne!(on.data, off.data, "serpentine must change the scan order");
    }

    #[test]
    fn alpha_is_preserved() {
        let mut frame = color_frame(16, 16);
        for (i, px) in frame.data.chunks_exact_mut(4).enumerate() {
            px[3] = (i % 256) as u8;
        }
        let out = apply(&frame, FS, 2, true, &serde_json::Map::new()).unwrap();
        for (a, b) in frame.data.chunks_exact(4).zip(out.data.chunks_exact(4)) {
            assert_eq!(a[3], b[3]);
        }
    }
}
