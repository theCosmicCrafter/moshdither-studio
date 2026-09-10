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
    /// Quantise to the nearest entry of a palette and diffuse the resulting
    /// colour error as a vector. This is the look most associated with the
    /// genre — see `references/dither_pie`, which `docs/PRD.md` names as the
    /// upstream reference.
    ///
    /// Distinct from `Rgb` in an important way: RGB mode quantises each channel
    /// on its own grid, so the reachable output colours are a cube. Palette mode
    /// quantises the colour as a whole, so output is restricted to the palette
    /// and the error carried forward is the full three-dimensional difference.
    Palette,
}

impl ColorMode {
    fn from_params(params: &ParameterValues) -> Self {
        match params.get("color_mode").and_then(|v| v.as_str()) {
            Some("rgb") => ColorMode::Rgb,
            Some("palette") => ColorMode::Palette,
            _ => ColorMode::Grayscale,
        }
    }

    fn channels(self) -> usize {
        match self {
            ColorMode::Grayscale => 1,
            ColorMode::Rgb | ColorMode::Palette => 3,
        }
    }
}

/// Where the palette comes from in [`ColorMode::Palette`].
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
enum PaletteSource {
    /// Derive the palette from the frame itself with k-means.
    ///
    /// The default, because a fixed palette forces the user to know which one
    /// suits an image before they can see anything good, whereas a derived one
    /// always lands somewhere reasonable.
    KMeans,
    /// Use one of the bundled historical palettes (PICO-8, GameBoy, NES, …).
    Preset,
}

impl PaletteSource {
    fn from_params(params: &ParameterValues) -> Self {
        match params.get("palette_source").and_then(|v| v.as_str()) {
            Some("preset") => PaletteSource::Preset,
            _ => PaletteSource::KMeans,
        }
    }
}

/// Resolve the palette for a frame.
///
/// Returns `None` when a palette cannot be produced — an image with fewer
/// distinct colours than requested, for instance. Callers fall back to RGB mode
/// rather than failing, since a dither with an empty palette has no meaning.
fn resolve_palette(input: &Frame, params: &ParameterValues) -> Option<Vec<(u8, u8, u8)>> {
    match PaletteSource::from_params(params) {
        PaletteSource::Preset => {
            let name = params
                .get("palette")
                .and_then(|v| v.as_str())
                .unwrap_or_default();
            let colors = crate::effects::color::historical_palettes::palette_by_name(name);
            (!colors.is_empty()).then(|| colors.to_vec())
        }
        PaletteSource::KMeans => {
            let size = params
                .get("palette_size")
                .and_then(|v| v.as_f64())
                .filter(|v| v.is_finite())
                .map(|v| v.clamp(2.0, 64.0) as usize)
                .unwrap_or(8);
            let palette = super::kmeans::extract_kmeans_palette(input, size);
            (!palette.is_empty()).then_some(palette)
        }
    }
}

/// Index of the palette entry closest to `(r, g, b)` by squared RGB distance.
fn nearest_palette_index(palette: &[(u8, u8, u8)], r: f32, g: f32, b: f32) -> usize {
    let mut best = 0usize;
    let mut best_dist = f32::INFINITY;
    for (i, &(pr, pg, pb)) in palette.iter().enumerate() {
        let dr = r - pr as f32;
        let dg = g - pg as f32;
        let db = b - pb as f32;
        let dist = dr * dr + dg * dg + db * db;
        if dist < best_dist {
            best_dist = dist;
            best = i;
        }
    }
    best
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
            options: Some(vec![
                "grayscale".to_string(),
                "rgb".to_string(),
                "palette".to_string(),
            ]),
        },
        ParameterDef {
            id: "palette_source".to_string(),
            name: "Palette Source".to_string(),
            param_type: ParamType::Select,
            default: json!("kmeans"),
            min: None,
            max: None,
            step: None,
            options: Some(vec!["kmeans".to_string(), "preset".to_string()]),
        },
        ParameterDef {
            id: "palette_size".to_string(),
            name: "Palette Size".to_string(),
            param_type: ParamType::Slider,
            default: json!(8),
            min: Some(2.0),
            max: Some(64.0),
            step: Some(1.0),
            options: None,
        },
        ParameterDef {
            id: "palette".to_string(),
            name: "Palette".to_string(),
            param_type: ParamType::Select,
            default: json!("PICO-8"),
            min: None,
            max: None,
            step: None,
            options: Some(crate::effects::color::historical_palettes::palette_names()),
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
    let mut mode = ColorMode::from_params(params);

    // Resolve the palette up front. k-means over the frame is far too expensive
    // to redo per pixel, and a palette that cannot be built degrades to RGB
    // rather than failing — a dither against an empty palette has no meaning.
    let palette = if mode == ColorMode::Palette {
        match resolve_palette(input, params) {
            Some(p) => Some(p),
            None => {
                mode = ColorMode::Rgb;
                None
            }
        }
    } else {
        None
    };

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
                    buf[base] = crate::effects::luminance_f32(
                        input.data[idx],
                        input.data[idx + 1],
                        input.data[idx + 2],
                    );
                }
                ColorMode::Rgb | ColorMode::Palette => {
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

        // Serpentine scanning needs to walk each row forwards or backwards
        // depending on parity. Indexing `w - 1 - i` on the reverse rows
        // gets the same traversal as `(0..w).rev()` without a per-row Vec
        // allocation -- this loop runs once per apply() call for every
        // effect that shares this function (Floyd-Steinberg, Sierra,
        // Stucki, Burkes, Jarvis-Judice-Ninke, Atkinson).
        for i in 0..w {
            let x = if reverse { w - 1 - i } else { i };
            let base = (y * w + x) * nc;

            // Quantise. Grayscale and RGB snap each channel to its own level
            // grid; palette mode picks the nearest palette entry using all three
            // channels at once, so the error carried forward is the full colour
            // difference rather than three independent scalars.
            let mut err = [0.0f32; 3];
            match &palette {
                Some(colors) => {
                    let idx =
                        nearest_palette_index(colors, buf[base], buf[base + 1], buf[base + 2]);
                    let (pr, pg, pb) = colors[idx];
                    let chosen = [pr as f32, pg as f32, pb as f32];
                    for c in 0..3 {
                        err[c] = buf[base + c] - chosen[c];
                        buf[base + c] = chosen[c];
                    }
                }
                None => {
                    for c in 0..nc {
                        let old = buf[base + c];
                        let q = (old / step).round().clamp(0.0, (levels - 1) as f32) as u32;
                        let new = q as f32 * step;
                        err[c] = old - new;
                        buf[base + c] = new;
                    }
                }
            }

            // Diffuse.
            for (dx, dy, factor) in kernel {
                let nx = if reverse {
                    x as isize - dx
                } else {
                    x as isize + dx
                };
                let ny = y as isize + dy;
                if nx >= 0 && nx < w as isize && ny >= 0 && ny < h as isize {
                    let nbase = (ny as usize * w + nx as usize) * nc;
                    for c in 0..nc {
                        buf[nbase + c] += err[c] * factor;
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
                ColorMode::Rgb | ColorMode::Palette => {
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
        for px in out.data.as_chunks::<4>().0.iter() {
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
                .as_chunks::<4>()
                .0
                .iter()
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
            for px in f.data.as_chunks::<4>().0.iter() {
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

    fn palette_params(source: &str) -> serde_json::Map<String, serde_json::Value> {
        let mut p = serde_json::Map::new();
        p.insert("color_mode".into(), json!("palette"));
        p.insert("palette_source".into(), json!(source));
        p
    }

    #[test]
    fn palette_mode_emits_only_palette_colours() {
        // The defining property: output is restricted to the palette. RGB mode
        // cannot make this guarantee, because it quantises channels separately.
        let frame = color_frame(48, 48);
        let mut params = palette_params("preset");
        params.insert("palette".into(), json!("GameBoy"));
        let out = apply(&frame, FS, 2, true, &params).unwrap();

        let gameboy = crate::effects::color::historical_palettes::palette_by_name("GameBoy");
        for px in out.data.as_chunks::<4>().0.iter() {
            let colour = (px[0], px[1], px[2]);
            assert!(
                gameboy.contains(&colour),
                "{colour:?} is not in the GameBoy palette"
            );
        }
    }

    #[test]
    fn palette_mode_uses_the_named_palette() {
        let frame = color_frame(32, 32);
        let mut gameboy = palette_params("preset");
        gameboy.insert("palette".into(), json!("GameBoy"));
        let mut pico = palette_params("preset");
        pico.insert("palette".into(), json!("PICO-8"));

        let a = apply(&frame, FS, 2, true, &gameboy).unwrap();
        let b = apply(&frame, FS, 2, true, &pico).unwrap();
        assert_ne!(
            a.data, b.data,
            "different palettes must give different output"
        );
    }

    #[test]
    fn an_unknown_palette_name_falls_back_rather_than_failing() {
        let frame = color_frame(16, 16);
        let mut params = palette_params("preset");
        params.insert("palette".into(), json!("no-such-palette"));
        let out = apply(&frame, FS, 2, true, &params).unwrap();
        assert_eq!(out.data.len(), frame.data.len());
    }

    #[test]
    fn kmeans_is_the_default_palette_source() {
        let frame = color_frame(32, 32);
        let implicit = apply(&frame, FS, 2, true, &palette_params("kmeans")).unwrap();

        let mut no_source = serde_json::Map::new();
        no_source.insert("color_mode".into(), json!("palette"));
        let defaulted = apply(&frame, FS, 2, true, &no_source).unwrap();

        assert_eq!(implicit.data, defaulted.data);
    }

    #[test]
    fn kmeans_palette_size_bounds_the_colour_count() {
        let frame = color_frame(48, 48);
        let mut params = palette_params("kmeans");
        params.insert("palette_size".into(), json!(4));
        let out = apply(&frame, FS, 2, true, &params).unwrap();

        let distinct: std::collections::HashSet<_> = out
            .data
            .as_chunks::<4>()
            .0
            .iter()
            .map(|p| (p[0], p[1], p[2]))
            .collect();
        assert!(
            distinct.len() <= 4,
            "palette_size 4 produced {} distinct colours",
            distinct.len()
        );
    }

    #[test]
    fn palette_mode_differs_from_rgb_mode() {
        // Palette mode quantises the colour as a whole; RGB mode quantises each
        // channel on its own grid. They are genuinely different operations.
        let frame = color_frame(32, 32);
        let mut rgb = serde_json::Map::new();
        rgb.insert("color_mode".into(), json!("rgb"));

        let mut pal = palette_params("preset");
        pal.insert("palette".into(), json!("PICO-8"));

        assert_ne!(
            apply(&frame, FS, 2, true, &rgb).unwrap().data,
            apply(&frame, FS, 2, true, &pal).unwrap().data
        );
    }

    #[test]
    fn palette_mode_preserves_alpha() {
        let mut frame = color_frame(16, 16);
        for (i, px) in frame.data.as_chunks_mut::<4>().0.iter_mut().enumerate() {
            px[3] = (i % 256) as u8;
        }
        let mut params = palette_params("preset");
        params.insert("palette".into(), json!("NES"));
        let out = apply(&frame, FS, 2, true, &params).unwrap();
        for (a, b) in frame
            .data
            .as_chunks::<4>()
            .0
            .iter()
            .zip(out.data.as_chunks::<4>().0.iter())
        {
            assert_eq!(a[3], b[3]);
        }
    }

    #[test]
    fn palette_mode_does_not_change_the_grayscale_default() {
        // Adding palette support must not disturb the default path — saved
        // projects store no color_mode and must render exactly as before.
        let frame = color_frame(32, 32);
        let out = apply(&frame, FS, 2, true, &serde_json::Map::new()).unwrap();
        for px in out.data.as_chunks::<4>().0.iter() {
            assert_eq!(px[0], px[1]);
            assert_eq!(px[1], px[2]);
        }
    }

    #[test]
    fn alpha_is_preserved() {
        let mut frame = color_frame(16, 16);
        for (i, px) in frame.data.as_chunks_mut::<4>().0.iter_mut().enumerate() {
            px[3] = (i % 256) as u8;
        }
        let out = apply(&frame, FS, 2, true, &serde_json::Map::new()).unwrap();
        for (a, b) in frame
            .data
            .as_chunks::<4>()
            .0
            .iter()
            .zip(out.data.as_chunks::<4>().0.iter())
        {
            assert_eq!(a[3], b[3]);
        }
    }
}
