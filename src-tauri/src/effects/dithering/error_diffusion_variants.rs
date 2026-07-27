use crate::effects::types::*;
use crate::effects::Effect;
use crate::error::Result;
use serde_json::json;

/// Additional error diffusion dithering variants.
/// Supported algorithms:
/// - false_floyd_steinberg
/// - steven_pigeon
/// - sierra_two_row
/// - filter_lite
/// - burkes
/// - jarvis_judice_ninke
/// - stucki
/// - atkinson
/// - simple2d
pub struct ErrorDiffusionDither;

impl Default for ErrorDiffusionDither {
    fn default() -> Self {
        ErrorDiffusionDither
    }
}

impl Effect for ErrorDiffusionDither {
    fn meta(&self) -> EffectMeta {
        EffectMeta {
            id: "dithering.error_diffusion_variants".to_string(),
            name: "Error Diffusion Variants".to_string(),
            category: EffectCategory::Dithering,
            media_type: MediaType::Both,
            // `algorithm` selects the kernel; the rest (levels, color_mode,
            // serpentine) are the definitions shared with every other
            // error-diffusion effect, so the ranges cannot drift apart.
            parameters: std::iter::once(ParameterDef {
                id: "algorithm".to_string(),
                name: "Algorithm".to_string(),
                param_type: ParamType::Select,
                default: json!("jarvis_judice_ninke"),
                min: None,
                max: None,
                step: None,
                options: Some(vec![
                    "false_floyd_steinberg".to_string(),
                    "steven_pigeon".to_string(),
                    "sierra_two_row".to_string(),
                    "filter_lite".to_string(),
                    "sierra2_4a".to_string(),
                    "burkes".to_string(),
                    "jarvis_judice_ninke".to_string(),
                    "stucki".to_string(),
                    "atkinson".to_string(),
                    "simple2d".to_string(),
                ]),
            })
            .chain(super::error_diffusion::param_defs())
            .collect(),
        }
    }

    fn process_frame(
        &self,
        input: &Frame,
        _m: Option<&Mask>,
        params: &ParameterValues,
    ) -> Result<Frame> {
        let algorithm = params
            .get("algorithm")
            .and_then(|v| v.as_str())
            .unwrap_or("jarvis_judice_ninke");
        // `levels` is read by error_diffusion::apply from `params`, along with
        // color_mode and serpentine. Parsing it again here would duplicate the
        // logic — and the old as_i64() read silently ignored a slider value
        // that arrived as a JSON float.

        let kernel: &[(isize, isize, f32)] = match algorithm {
            "simple2d" => &[(1, 0, 0.5), (0, 1, 0.5)],
            "false_floyd_steinberg" => &[(1, 0, 3.0 / 8.0), (0, 1, 3.0 / 8.0), (1, 1, 2.0 / 8.0)],
            "steven_pigeon" => &[(1, 0, 7.0 / 16.0), (0, 1, 7.0 / 16.0), (1, 1, 2.0 / 16.0)],
            "sierra_two_row" => &[
                (1, 0, 4.0 / 16.0),
                (2, 0, 3.0 / 16.0),
                (-2, 1, 1.0 / 16.0),
                (-1, 1, 2.0 / 16.0),
                (0, 1, 3.0 / 16.0),
                (1, 1, 2.0 / 16.0),
                (2, 1, 1.0 / 16.0),
            ],
            "filter_lite" | "sierra2_4a" => {
                &[(1, 0, 2.0 / 4.0), (-1, 1, 1.0 / 4.0), (0, 1, 1.0 / 4.0)]
            }
            "burkes" => &[
                (1, 0, 8.0 / 32.0),
                (2, 0, 4.0 / 32.0),
                (-2, 1, 2.0 / 32.0),
                (-1, 1, 4.0 / 32.0),
                (0, 1, 8.0 / 32.0),
                (1, 1, 4.0 / 32.0),
                (2, 1, 2.0 / 32.0),
            ],
            "jarvis_judice_ninke" => &[
                (1, 0, 7.0 / 48.0),
                (2, 0, 5.0 / 48.0),
                (-2, 1, 3.0 / 48.0),
                (-1, 1, 5.0 / 48.0),
                (0, 1, 7.0 / 48.0),
                (1, 1, 5.0 / 48.0),
                (2, 1, 3.0 / 48.0),
                (-2, 2, 1.0 / 48.0),
                (-1, 2, 3.0 / 48.0),
                (0, 2, 5.0 / 48.0),
                (1, 2, 3.0 / 48.0),
                (2, 2, 1.0 / 48.0),
            ],
            "stucki" => &[
                (1, 0, 8.0 / 42.0),
                (2, 0, 4.0 / 42.0),
                (-2, 1, 2.0 / 42.0),
                (-1, 1, 4.0 / 42.0),
                (0, 1, 8.0 / 42.0),
                (1, 1, 4.0 / 42.0),
                (2, 1, 2.0 / 42.0),
                (-2, 2, 1.0 / 42.0),
                (-1, 2, 2.0 / 42.0),
                (0, 2, 4.0 / 42.0),
                (1, 2, 2.0 / 42.0),
                (2, 2, 1.0 / 42.0),
            ],
            "atkinson" => &[
                (1, 0, 1.0 / 8.0),
                (2, 0, 1.0 / 8.0),
                (-1, 1, 1.0 / 8.0),
                (0, 1, 1.0 / 8.0),
                (1, 1, 1.0 / 8.0),
                (0, 2, 1.0 / 8.0),
            ],
            _ => &[
                (1, 0, 7.0 / 48.0),
                (2, 0, 5.0 / 48.0),
                (-2, 1, 3.0 / 48.0),
                (-1, 1, 5.0 / 48.0),
                (0, 1, 7.0 / 48.0),
                (1, 1, 5.0 / 48.0),
                (2, 1, 3.0 / 48.0),
                (-2, 2, 1.0 / 48.0),
                (-1, 2, 3.0 / 48.0),
                (0, 2, 5.0 / 48.0),
                (1, 2, 3.0 / 48.0),
                (2, 2, 1.0 / 48.0),
            ],
        };

        super::error_diffusion::apply(input, kernel, 2, true, params)
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
    fn test_jarvis_produces_pattern() {
        let e = ErrorDiffusionDither;
        let mut params = serde_json::Map::new();
        params.insert("algorithm".to_string(), json!("jarvis_judice_ninke"));
        let r = e.process_frame(&gray(16, 16, 128), None, &params).unwrap();
        let mut hb = false;
        let mut hw = false;
        for i in 0..r.data.len() / 4 {
            if r.data[i * 4] == 0 {
                hb = true;
            }
            if r.data[i * 4] == 255 {
                hw = true;
            }
        }
        assert!(hb && hw);
    }
}
