use crate::effects::types::*;
use crate::effects::Effect;
use crate::error::Result;
use serde_json::json;

/// Halftone pattern dithering using a rotated dot screen.
pub struct HalftoneDither {
    dot_size: u32,
    screen_angle: f32,
}

impl HalftoneDither {
    pub fn new(dot_size: u32, screen_angle: f32) -> Self {
        Self {
            dot_size: dot_size.clamp(1, 32),
            screen_angle,
        }
    }
}

impl Default for HalftoneDither {
    fn default() -> Self {
        Self::new(8, 45.0)
    }
}

impl Effect for HalftoneDither {
    fn meta(&self) -> EffectMeta {
        EffectMeta {
            id: "dithering.halftone".to_string(),
            name: "Halftone".to_string(),
            category: EffectCategory::Dithering,
            media_type: MediaType::Both,
            parameters: vec![
                ParameterDef {
                    id: "dot_size".to_string(),
                    name: "Dot Size".to_string(),
                    param_type: ParamType::Slider,
                    default: json!(8),
                    min: Some(2.0),
                    max: Some(32.0),
                    step: Some(1.0),
                    options: None,
                },
                ParameterDef {
                    id: "screen_angle".to_string(),
                    name: "Screen Angle".to_string(),
                    param_type: ParamType::Slider,
                    default: json!(45.0),
                    min: Some(-90.0),
                    max: Some(90.0),
                    step: Some(1.0),
                    options: None,
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
        // Read as f64, not as_u64: a slider with step 1.0 may still serialise
        // as a JSON float, and as_u64() returns None for a float -- silently
        // dropping the parameter and falling back to the default. Round
        // before casting since UI wheel drags can produce non-integral
        // values. See error_diffusion.rs for the established pattern.
        let dot_size = params
            .get("dot_size")
            .and_then(|v| v.as_f64())
            .filter(|v| v.is_finite())
            .map(|v| v.round().clamp(2.0, 32.0) as u32)
            .unwrap_or(self.dot_size);
        let screen_angle = params
            .get("screen_angle")
            .and_then(|v| v.as_f64())
            .unwrap_or(self.screen_angle as f64) as f32;
        let mut data = vec![0u8; input.data.len()];
        let w = input.width;
        let h = input.height;

        let theta = screen_angle.to_radians();
        let cos_t = theta.cos();
        let sin_t = theta.sin();
        let cell = dot_size as f32;

        // The screen angle rotates the LATTICE OF DOTS, which is what a physical
        // halftone screen does -- CMYK separations are printed at 15/45/75
        // degrees precisely so their dot grids do not coincide and moire.
        //
        // The previous implementation rotated each pixel's offset around its own
        // cell centre and then took the distance from that centre. Rotation
        // preserves magnitude, so rx*rx + ry*ry always equalled lx*lx + ly*ly and
        // the angle cancelled out exactly: the control existed, was documented,
        // and changed nothing in preview or export.
        //
        // Iterating over output pixels rather than over cells: each pixel is
        // mapped into the rotated screen space, which decides the cell it belongs
        // to, and the cell's luminance is sampled back in image space.
        for py in 0..h {
            for px in 0..w {
                let fx = px as f32;
                let fy = py as f32;

                // Into screen space.
                let sx = fx * cos_t + fy * sin_t;
                let sy = -fx * sin_t + fy * cos_t;

                // Which cell of the rotated lattice, and where its centre sits.
                let cx = (sx / cell).floor();
                let cy = (sy / cell).floor();
                let centre_sx = (cx + 0.5) * cell;
                let centre_sy = (cy + 0.5) * cell;

                // Cell centre back in image space, to sample the source there.
                let centre_x = centre_sx * cos_t - centre_sy * sin_t;
                let centre_y = centre_sx * sin_t + centre_sy * cos_t;

                // Mean luminance of the source region under this cell. Sampled
                // around the cell centre in image space so the value follows the
                // rotated lattice rather than an axis-aligned block.
                let mut sum = 0.0;
                let mut count = 0u32;
                let r = (dot_size / 2).max(1) as i32;
                for oy in -r..=r {
                    for ox in -r..=r {
                        let mx = centre_x.round() as i32 + ox;
                        let my = centre_y.round() as i32 + oy;
                        if mx >= 0 && my >= 0 && (mx as u32) < w && (my as u32) < h {
                            let midx = ((my as u32 * w + mx as u32) * 4) as usize;
                            sum += crate::effects::luminance_f32(
                                input.data[midx],
                                input.data[midx + 1],
                                input.data[midx + 2],
                            );
                            count += 1;
                        }
                    }
                }
                let avg = if count > 0 { sum / count as f32 } else { 0.0 };

                // Dark cells get large dots, light cells small ones.
                let radius = ((255.0 - avg) / 255.0) * (cell / 2.0);

                // Distance measured in screen space, so the dot is centred on the
                // rotated lattice point rather than on an axis-aligned cell.
                let dx = sx - centre_sx;
                let dy = sy - centre_sy;
                let dist = (dx * dx + dy * dy).sqrt();

                let idx = ((py * w + px) * 4) as usize;
                let on = if dist <= radius { 0u8 } else { 255u8 };
                data[idx] = on;
                data[idx + 1] = on;
                data[idx + 2] = on;
                data[idx + 3] = input.data[idx + 3];
            }
        }

        Ok(Frame {
            width: w,
            height: h,
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

    #[test]
    fn test_halftone() {
        let d = vec![128u8; 64]; // 2x2 white-ish pixels
        let f = Frame {
            width: 2,
            height: 2,
            data: d,
        };
        let e = HalftoneDither::new(2, 0.0);
        let r = e.process_frame(&f, None, &serde_json::Map::new()).unwrap();
        assert_eq!(r.data.len(), 64);
    }
}

#[cfg(test)]
mod screen_angle_tests {
    use super::*;
    use serde_json::json;

    /// Non-uniform source: a uniform field gives every cell the same radius, so
    /// a rotated lattice can still land on identical output and hide a bug.
    fn gradient_frame(w: u32, h: u32) -> Frame {
        let mut data = Vec::with_capacity((w * h * 4) as usize);
        for y in 0..h {
            for x in 0..w {
                let v = (((x * 5 + y * 3) % 256) as u8).saturating_add(20);
                data.extend_from_slice(&[v, v / 2, 255 - v, 255]);
            }
        }
        Frame {
            width: w,
            height: h,
            data,
        }
    }

    fn run(angle: f64, dot: u64) -> Frame {
        let mut p = serde_json::Map::new();
        p.insert("screen_angle".into(), json!(angle));
        p.insert("dot_size".into(), json!(dot));
        HalftoneDither::default()
            .process_frame(&gradient_frame(64, 64), None, &p)
            .expect("halftone ok")
    }

    /// The regression this file existed to have.
    ///
    /// The original implementation rotated each pixel's offset around its own
    /// cell centre and then measured distance from that same centre. Rotation
    /// preserves magnitude, so the angle cancelled exactly and the control did
    /// nothing -- silently, in both preview and export.
    #[test]
    fn screen_angle_changes_the_output() {
        let a = run(0.0, 8);
        let b = run(45.0, 8);
        assert_ne!(
            a.data, b.data,
            "screen_angle produced identical output at 0 and 45 degrees; the \
             dot lattice is not being rotated"
        );
    }

    #[test]
    fn distinct_angles_give_distinct_screens() {
        let angles = [0.0, 15.0, 30.0, 45.0, 75.0];
        let outputs: Vec<_> = angles.iter().map(|a| run(*a, 8).data).collect();
        for i in 0..outputs.len() {
            for j in (i + 1)..outputs.len() {
                assert_ne!(
                    outputs[i], outputs[j],
                    "screen angles {} and {} produced identical output",
                    angles[i], angles[j]
                );
            }
        }
    }

    /// A full rotation of the square lattice is 90 degrees, so 0 and 90 must
    /// agree. This pins that the angle is a real lattice rotation rather than
    /// some arbitrary function of the parameter that merely happens to differ.
    #[test]
    fn the_lattice_has_ninety_degree_symmetry() {
        assert_eq!(
            run(0.0, 8).data,
            run(90.0, 8).data,
            "a square dot lattice repeats every 90 degrees"
        );
    }

    #[test]
    fn output_is_still_bilevel_and_preserves_alpha() {
        let out = run(30.0, 6);
        for px in out.data.chunks_exact(4) {
            assert!(
                px[0] == 0 || px[0] == 255,
                "halftone must be pure black or white, got {}",
                px[0]
            );
            assert_eq!(px[0], px[1]);
            assert_eq!(px[1], px[2]);
            assert_eq!(px[3], 255);
        }
    }

    /// `dot_size` must be read with `as_f64`, not `as_u64`: a JSON float
    /// (whether hand-supplied or produced by `clamp_params` rewriting an
    /// out-of-range value) would otherwise be silently dropped and the
    /// effect would fall back to its hardcoded default of 8.
    #[test]
    fn dot_size_accepts_a_float_tagged_value_instead_of_falling_back_to_default() {
        let frame = gradient_frame(48, 48);
        let e = HalftoneDither::default(); // default dot_size = 8

        let mut float_params = serde_json::Map::new();
        float_params.insert("dot_size".into(), json!(20.0));
        let mut int_params = serde_json::Map::new();
        int_params.insert("dot_size".into(), json!(20));

        let default_out = e
            .process_frame(&frame, None, &serde_json::Map::new())
            .unwrap();
        let float_out = e.process_frame(&frame, None, &float_params).unwrap();
        let int_out = e.process_frame(&frame, None, &int_params).unwrap();

        assert_eq!(
            float_out.data, int_out.data,
            "dot_size 20 and 20.0 must resolve identically"
        );
        assert_ne!(
            float_out.data, default_out.data,
            "a float-tagged dot_size must not silently fall back to the default"
        );
    }

    #[test]
    fn dot_size_honours_a_clamp_then_read_round_trip() {
        let frame = gradient_frame(48, 48);
        let e = HalftoneDither::default();

        // Out of range (declared max is 32); clamp_params rewrites this to
        // the float-tagged representation that as_u64() cannot read.
        let mut raw = serde_json::Map::new();
        raw.insert("dot_size".into(), json!(9999));
        let clamped = crate::effects::clamp_params("dithering.halftone", &raw);
        assert!(
            clamped["dot_size"].is_f64(),
            "clamp_params should have rewritten the out-of-range value to a float"
        );

        let mut direct_max = serde_json::Map::new();
        direct_max.insert("dot_size".into(), json!(32));

        let via_clamp = e.process_frame(&frame, None, &clamped).unwrap();
        let via_direct = e.process_frame(&frame, None, &direct_max).unwrap();
        let default_out = e
            .process_frame(&frame, None, &serde_json::Map::new())
            .unwrap();

        assert_eq!(
            via_clamp.data, via_direct.data,
            "a value clamped to 32 must behave exactly like dot_size=32"
        );
        assert_ne!(
            via_clamp.data, default_out.data,
            "clamped dot_size must not silently fall back to the default"
        );
    }
}
