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
        let levels = params
            .get("levels")
            .and_then(|v| v.as_i64())
            .unwrap_or(2)
            .max(2) as u32;
        let matrix_name = params
            .get("matrix")
            .and_then(|v| v.as_str())
            .unwrap_or("bayer2");
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
