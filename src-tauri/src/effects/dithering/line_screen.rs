use crate::effects::types::*;
use crate::effects::Effect;
use crate::error::Result;
use serde_json::json;

/// Line screen halftone effect.
///
/// Converts images to angled line patterns where line density varies
/// with image brightness, mimicking traditional printing line screens.
pub struct LineScreen;

impl Default for LineScreen {
    fn default() -> Self {
        Self
    }
}

impl Effect for LineScreen {
    fn meta(&self) -> EffectMeta {
        EffectMeta {
            id: "dithering.line_screen".to_string(),
            name: "Line Screen".to_string(),
            category: EffectCategory::Dithering,
            media_type: MediaType::Both,
            parameters: vec![
                ParameterDef {
                    id: "line_spacing".to_string(),
                    name: "Line Spacing".to_string(),
                    param_type: ParamType::Slider,
                    default: json!(4),
                    min: Some(2.0),
                    max: Some(20.0),
                    step: Some(1.0),
                    options: None,
                },
                ParameterDef {
                    id: "angle".to_string(),
                    name: "Angle".to_string(),
                    param_type: ParamType::Slider,
                    default: json!(-45.0),
                    min: Some(-90.0),
                    max: Some(90.0),
                    step: Some(0.5),
                    options: None,
                },
                ParameterDef {
                    id: "threshold".to_string(),
                    name: "Threshold".to_string(),
                    param_type: ParamType::Slider,
                    default: json!(0.5),
                    min: Some(0.1),
                    max: Some(0.9),
                    step: Some(0.05),
                    options: None,
                },
                ParameterDef {
                    id: "contrast".to_string(),
                    name: "Contrast".to_string(),
                    param_type: ParamType::Slider,
                    default: json!(1.2),
                    min: Some(1.0),
                    max: Some(2.0),
                    step: Some(0.1),
                    options: None,
                },
                ParameterDef {
                    id: "invert".to_string(),
                    name: "Invert".to_string(),
                    param_type: ParamType::Toggle,
                    default: json!(false),
                    min: None,
                    max: None,
                    step: None,
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
        // Read as f64, not as_i64: a slider with step 1.0 may still serialise
        // as a JSON float, and as_i64() returns None for a float -- silently
        // dropping the parameter and falling back to the default. Round
        // before casting since UI wheel drags can produce non-integral
        // values. See error_diffusion.rs for the established pattern.
        let spacing = params
            .get("line_spacing")
            .and_then(|v| v.as_f64())
            .filter(|v| v.is_finite())
            .map(|v| v.round().clamp(2.0, 20.0) as usize)
            .unwrap_or(4);
        let angle_deg = params
            .get("angle")
            .and_then(|v| v.as_f64())
            .unwrap_or(-45.0);
        let threshold = params
            .get("threshold")
            .and_then(|v| v.as_f64())
            .unwrap_or(0.5) as f32;
        let contrast = params
            .get("contrast")
            .and_then(|v| v.as_f64())
            .unwrap_or(1.2) as f32;
        let invert = params
            .get("invert")
            .and_then(|v| v.as_bool())
            .unwrap_or(false);

        let w = input.width as usize;
        let h = input.height as usize;
        let angle = angle_deg.to_radians() as f32;
        let cos_a = angle.cos();
        let sin_a = angle.sin();

        // Precompute the line pattern threshold for each pixel.
        // For each pixel, compute its projected distance along the line normal.
        // Lines are perpendicular to the screen angle direction.
        let mut data = vec![0u8; w * h * 4];

        for y in 0..h {
            for x in 0..w {
                let idx = (y * w + x) * 4;
                let r = input.data[idx] as f32 / 255.0;
                let g = input.data[idx + 1] as f32 / 255.0;
                let b = input.data[idx + 2] as f32 / 255.0;
                let a = input.data[idx + 3];

                // Compute luminance
                let lum = 0.299 * r + 0.587 * g + 0.114 * b;

                // Apply contrast enhancement
                let mut lum_contrasted = (lum - 0.5) * contrast + 0.5;
                lum_contrasted = lum_contrasted.clamp(0.0, 1.0);

                let lum_effective = if invert {
                    1.0 - lum_contrasted
                } else {
                    lum_contrasted
                };

                // Project pixel position onto line normal direction
                // The line direction is along (cos_a, sin_a), so the normal is (-sin_a, cos_a)
                let proj = (x as f32) * (-sin_a) + (y as f32) * cos_a;
                let phase = (proj / spacing as f32).fract().abs();

                // The line occupies a fraction of the spacing proportional to brightness.
                // Bright areas have wider lines (more ink coverage for dark-on-light, or
                // light-on-dark depending on invert).
                // Line width fraction = lum_effective (brighter = wider line)
                // Cap at 0.9 so background is always visible
                let line_width_frac = lum_effective * 0.9;

                // If the pixel falls within the line region, it's "on"
                let is_line = phase < line_width_frac;

                // Apply threshold: only show lines where brightness exceeds threshold
                if lum_effective > threshold {
                    if is_line {
                        // Line color: black (or inverted: white)
                        if invert {
                            data[idx] = 255;
                            data[idx + 1] = 255;
                            data[idx + 2] = 255;
                        } else {
                            data[idx] = 0;
                            data[idx + 1] = 0;
                            data[idx + 2] = 0;
                        }
                    } else {
                        // Background: white (or inverted: black)
                        if invert {
                            data[idx] = 0;
                            data[idx + 1] = 0;
                            data[idx + 2] = 0;
                        } else {
                            data[idx] = 255;
                            data[idx + 1] = 255;
                            data[idx + 2] = 255;
                        }
                    }
                } else {
                    // Below threshold: solid background
                    if invert {
                        data[idx] = 0;
                        data[idx + 1] = 0;
                        data[idx + 2] = 0;
                    } else {
                        data[idx] = 255;
                        data[idx + 1] = 255;
                        data[idx + 2] = 255;
                    }
                }
                data[idx + 3] = a;
            }
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

#[cfg(test)]
mod tests {
    use super::*;

    fn gray(w: u32, h: u32, g: u8) -> Frame {
        let mut d = Vec::with_capacity((w * h * 4) as usize);
        for _ in 0..(w * h) {
            d.extend_from_slice(&[g, g, g, 255]);
        }
        Frame {
            width: w,
            height: h,
            data: d,
        }
    }

    #[test]
    fn test_preserves_dimensions() {
        let e = LineScreen;
        let r = e
            .process_frame(&gray(32, 24, 128), None, &serde_json::Map::new())
            .unwrap();
        assert_eq!(r.width, 32);
        assert_eq!(r.height, 24);
    }

    #[test]
    fn test_preserves_alpha() {
        let mut d = Vec::new();
        for _ in 0..(8 * 8) {
            d.extend_from_slice(&[100, 100, 100, 200]);
        }
        let f = Frame {
            width: 8,
            height: 8,
            data: d,
        };
        let e = LineScreen;
        let r = e.process_frame(&f, None, &serde_json::Map::new()).unwrap();
        for i in 0..(8 * 8) {
            assert_eq!(r.data[i * 4 + 3], 200);
        }
    }

    #[test]
    fn test_black_produces_background() {
        // Black image (lum=0) should produce all-white background (non-inverted)
        let e = LineScreen;
        let r = e
            .process_frame(&gray(16, 16, 0), None, &serde_json::Map::new())
            .unwrap();
        for i in 0..(16 * 16) {
            // Black is below threshold, so background = white
            assert_eq!(r.data[i * 4], 255);
            assert_eq!(r.data[i * 4 + 1], 255);
            assert_eq!(r.data[i * 4 + 2], 255);
        }
    }

    #[test]
    fn test_white_produces_lines() {
        // White image (lum=1) exceeds threshold, so we should see line patterns
        let e = LineScreen;
        let r = e
            .process_frame(&gray(32, 32, 255), None, &serde_json::Map::new())
            .unwrap();
        let mut has_black = false;
        let mut has_white = false;
        for i in 0..(32 * 32) {
            if r.data[i * 4] == 0 {
                has_black = true;
            }
            if r.data[i * 4] == 255 {
                has_white = true;
            }
        }
        // Should have both line and background pixels
        assert!(has_black && has_white);
    }

    #[test]
    fn test_invert_flips_colors() {
        let e = LineScreen;
        let mut params = serde_json::Map::new();
        params.insert("invert".to_string(), json!(true));
        let r = e.process_frame(&gray(16, 16, 0), None, &params).unwrap();
        // Black inverted: lum=1, exceeds threshold, lines appear as white on black bg
        // Actually: invert makes lum_effective = 1 - 0 = 1, which exceeds threshold
        // Lines are white, background is black
        let mut has_black = false;
        let mut has_white = false;
        for i in 0..(16 * 16) {
            if r.data[i * 4] == 0 {
                has_black = true;
            }
            if r.data[i * 4] == 255 {
                has_white = true;
            }
        }
        assert!(has_black && has_white);
    }

    /// `line_spacing` must be read with `as_f64`, not `as_i64`: a JSON float
    /// (whether hand-supplied or produced by `clamp_params` rewriting an
    /// out-of-range value) would otherwise be silently dropped and the
    /// effect would fall back to its hardcoded default of 4.
    #[test]
    fn line_spacing_accepts_a_float_tagged_value_instead_of_falling_back_to_default() {
        // A bright, uniform frame: lum_effective is constant, so the only
        // spatially-varying input to the line pattern is line_spacing.
        let frame = gray(32, 32, 255);
        let e = LineScreen;

        let mut float_params = serde_json::Map::new();
        float_params.insert("line_spacing".into(), json!(12.0));
        let mut int_params = serde_json::Map::new();
        int_params.insert("line_spacing".into(), json!(12));

        let default_out = e
            .process_frame(&frame, None, &serde_json::Map::new())
            .unwrap();
        let float_out = e.process_frame(&frame, None, &float_params).unwrap();
        let int_out = e.process_frame(&frame, None, &int_params).unwrap();

        assert_eq!(
            float_out.data, int_out.data,
            "line_spacing 12 and 12.0 must resolve identically"
        );
        assert_ne!(
            float_out.data, default_out.data,
            "a float-tagged line_spacing must not silently fall back to the default"
        );
    }

    #[test]
    fn line_spacing_honours_a_clamp_then_read_round_trip() {
        let frame = gray(32, 32, 255);
        let e = LineScreen;

        // Out of range (declared max is 20); clamp_params rewrites this to
        // the float-tagged representation that as_i64() cannot read.
        let mut raw = serde_json::Map::new();
        raw.insert("line_spacing".into(), json!(9999));
        let clamped = crate::effects::clamp_params("dithering.line_screen", &raw);
        assert!(
            clamped["line_spacing"].is_f64(),
            "clamp_params should have rewritten the out-of-range value to a float"
        );

        let mut direct_max = serde_json::Map::new();
        direct_max.insert("line_spacing".into(), json!(20));

        let via_clamp = e.process_frame(&frame, None, &clamped).unwrap();
        let via_direct = e.process_frame(&frame, None, &direct_max).unwrap();
        let default_out = e
            .process_frame(&frame, None, &serde_json::Map::new())
            .unwrap();

        assert_eq!(
            via_clamp.data, via_direct.data,
            "a value clamped to 20 must behave exactly like line_spacing=20"
        );
        assert_ne!(
            via_clamp.data, default_out.data,
            "clamped line_spacing must not silently fall back to the default"
        );
    }
}
