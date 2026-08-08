use crate::effects::types::*;
use crate::effects::Effect;
use crate::error::Result;
use serde_json::json;

/// Custom ordered or error-diffusion matrix loaded from JSON.
pub struct CustomMatrixDither;

impl Default for CustomMatrixDither {
    fn default() -> Self {
        CustomMatrixDither
    }
}

impl Effect for CustomMatrixDither {
    fn meta(&self) -> EffectMeta {
        EffectMeta {
            id: "dithering.custom_matrix".to_string(),
            name: "Custom Matrix".to_string(),
            category: EffectCategory::Dithering,
            media_type: MediaType::Both,
            parameters: vec![
                ParameterDef {
                    id: "matrix".to_string(),
                    name: "Matrix".to_string(),
                    param_type: ParamType::Select,
                    default: json!("bayer2"),
                    min: None,
                    max: None,
                    step: None,
                    options: Some(vec![
                        "bayer2".to_string(),
                        "bayer4".to_string(),
                        "horizontal".to_string(),
                        "vertical".to_string(),
                        "diagonal".to_string(),
                        "checker".to_string(),
                    ]),
                },
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
            ],
        }
    }

    fn process_frame(
        &self,
        input: &Frame,
        _m: Option<&Mask>,
        params: &ParameterValues,
    ) -> Result<Frame> {
        // Read as f64, not as_i64: a slider with step 1.0 may still serialise
        // as a JSON float, and as_i64() returns None for a float -- silently
        // dropping the parameter and falling back to the default. Round
        // before casting since UI wheel drags can produce non-integral
        // values. See error_diffusion.rs for the established pattern.
        let levels = params
            .get("levels")
            .and_then(|v| v.as_f64())
            .filter(|v| v.is_finite())
            .map(|v| v.round().clamp(2.0, 16.0) as u32)
            .unwrap_or(2);
        let matrix_name = params
            .get("matrix")
            .and_then(|v| v.as_str())
            .unwrap_or("bayer2");
        // Unlike bayer.rs's `generate_bayer_matrix`, which recursively
        // computes an NxN matrix, this is a `match` returning a small
        // hardcoded literal -- there is no computation to cache and no
        // `#[allow(dead_code)]` to remove. Reusing a precomputed field the
        // way bayer.rs does its `self.matrix` would add an instance field
        // and an interior-mutability story for zero measurable benefit here.
        let matrix: Vec<Vec<u32>> = match matrix_name {
            "bayer2" => vec![vec![0, 2], vec![3, 1]],
            "bayer4" => vec![
                vec![0, 8, 2, 10],
                vec![12, 4, 14, 6],
                vec![3, 11, 1, 9],
                vec![15, 7, 13, 5],
            ],
            "horizontal" => vec![vec![0, 1, 2, 3]],
            "vertical" => vec![vec![0], vec![1], vec![2], vec![3]],
            "diagonal" => vec![vec![0, 1], vec![1, 2]],
            "checker" => vec![vec![0, 1], vec![1, 0]],
            _ => vec![vec![0, 2], vec![3, 1]],
        };
        let rows = matrix.len().max(1);
        let cols = matrix.first().map(|r| r.len()).unwrap_or(1).max(1);
        let max_val = matrix.iter().flatten().copied().max().unwrap_or(1).max(1);

        let w = input.width as usize;
        let h = input.height as usize;
        let mut data = input.data.clone();

        let step = 255.0 / (levels - 1) as f32;
        let max_f = max_val.max(1) as f32;

        for y in 0..h {
            for x in 0..w {
                let idx = (y * w + x) * 4;
                let gray = 0.299 * data[idx] as f32
                    + 0.587 * data[idx + 1] as f32
                    + 0.114 * data[idx + 2] as f32;

                // Normalised ordered-dither threshold [0, 1]
                let threshold = matrix[y % rows][x % cols] as f32 / max_f;
                let dithered = gray + (threshold - 0.5) * step;

                let q = (dithered / step).round().clamp(0.0, (levels - 1) as f32) as u32;
                let final_val = (q as f32 * step).clamp(0.0, 255.0) as u8;

                data[idx] = final_val;
                data[idx + 1] = final_val;
                data[idx + 2] = final_val;
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

    fn gradient_frame(w: u32, h: u32) -> Frame {
        let mut data = Vec::with_capacity((w * h * 4) as usize);
        for y in 0..h {
            for x in 0..w {
                let v = (((x * 255) / w.max(1) + (y * 255) / h.max(1)) / 2) as u8;
                data.extend_from_slice(&[v, v, v, 255]);
            }
        }
        Frame {
            width: w,
            height: h,
            data,
        }
    }

    /// `levels` must be read with `as_f64`, not `as_i64`: a JSON float
    /// (whether hand-supplied or produced by `clamp_params` rewriting an
    /// out-of-range value) would otherwise be silently dropped and the
    /// effect would fall back to its hardcoded default of 2.
    #[test]
    fn levels_accepts_a_float_tagged_value_instead_of_falling_back_to_default() {
        let frame = gradient_frame(32, 32);
        let e = CustomMatrixDither;

        let mut float_params = serde_json::Map::new();
        float_params.insert("levels".into(), json!(8.0));
        let mut int_params = serde_json::Map::new();
        int_params.insert("levels".into(), json!(8));

        let default_out = e
            .process_frame(&frame, None, &serde_json::Map::new())
            .unwrap();
        let float_out = e.process_frame(&frame, None, &float_params).unwrap();
        let int_out = e.process_frame(&frame, None, &int_params).unwrap();

        assert_eq!(
            float_out.data, int_out.data,
            "levels 8 and 8.0 must resolve identically"
        );
        assert_ne!(
            float_out.data, default_out.data,
            "a float-tagged levels must not silently fall back to the default"
        );
    }

    #[test]
    fn levels_honours_a_clamp_then_read_round_trip() {
        let frame = gradient_frame(32, 32);
        let e = CustomMatrixDither;

        // Out of range (declared max is 16); clamp_params rewrites this to
        // the float-tagged representation that as_i64() cannot read.
        let mut raw = serde_json::Map::new();
        raw.insert("levels".into(), json!(9999));
        let clamped = crate::effects::clamp_params("dithering.custom_matrix", &raw);
        assert!(
            clamped["levels"].is_f64(),
            "clamp_params should have rewritten the out-of-range value to a float"
        );

        let mut direct_max = serde_json::Map::new();
        direct_max.insert("levels".into(), json!(16));

        let via_clamp = e.process_frame(&frame, None, &clamped).unwrap();
        let via_direct = e.process_frame(&frame, None, &direct_max).unwrap();
        let default_out = e
            .process_frame(&frame, None, &serde_json::Map::new())
            .unwrap();

        assert_eq!(
            via_clamp.data, via_direct.data,
            "a value clamped to 16 must behave exactly like levels=16"
        );
        assert_ne!(
            via_clamp.data, default_out.data,
            "clamped levels must not silently fall back to the default"
        );
    }
}
