use crate::effects::types::*;
use crate::effects::Effect;
use crate::error::Result;
use serde_json::json;

/// Advanced frame drop variants: automatic scene-change, random, range, precise.
/// Operates on decoded pixels, not at the codec level.
pub struct IFrameRemovalAdvanced;

impl Default for IFrameRemovalAdvanced {
    fn default() -> Self {
        IFrameRemovalAdvanced
    }
}

impl Effect for IFrameRemovalAdvanced {
    fn meta(&self) -> EffectMeta {
        EffectMeta {
            id: "datamoshing.iframe_removal_advanced".to_string(),
            name: "Frame Drop Advanced".to_string(),
            category: EffectCategory::Datamoshing,
            media_type: MediaType::Video,
            parameters: vec![
                ParameterDef {
                    id: "mode".to_string(),
                    name: "Mode".to_string(),
                    param_type: ParamType::Select,
                    default: json!("automatic"),
                    min: None,
                    max: None,
                    step: None,
                    options: Some(vec![
                        "automatic".to_string(),
                        "random".to_string(),
                        "range".to_string(),
                        "precise".to_string(),
                        "progressive".to_string(),
                    ]),
                },
                ParameterDef {
                    id: "threshold".to_string(),
                    name: "Scene Change Threshold".to_string(),
                    param_type: ParamType::Slider,
                    default: json!(30.0),
                    min: Some(1.0),
                    max: Some(100.0),
                    step: Some(1.0),
                    options: None,
                },
                ParameterDef {
                    id: "rate".to_string(),
                    name: "Drop Rate".to_string(),
                    param_type: ParamType::Slider,
                    default: json!(0.3),
                    min: Some(0.0),
                    max: Some(1.0),
                    step: Some(0.01),
                    options: None,
                },
                ParameterDef {
                    id: "start_frame".to_string(),
                    name: "Start Frame".to_string(),
                    param_type: ParamType::Slider,
                    default: json!(0),
                    min: Some(0.0),
                    max: Some(10000.0),
                    step: Some(1.0),
                    options: None,
                },
                ParameterDef {
                    id: "end_frame".to_string(),
                    name: "End Frame".to_string(),
                    param_type: ParamType::Slider,
                    default: json!(100),
                    min: Some(0.0),
                    max: Some(10000.0),
                    step: Some(1.0),
                    options: None,
                },
                ParameterDef {
                    id: "frame_number".to_string(),
                    name: "Precise Frame Number".to_string(),
                    param_type: ParamType::Slider,
                    default: json!(0),
                    min: Some(0.0),
                    max: Some(10000.0),
                    step: Some(1.0),
                    options: None,
                },
            ],
        }
    }

    fn is_temporal(&self) -> bool {
        true
    }

    fn process_frame(
        &self,
        input: &Frame,
        _mask: Option<&Mask>,
        _params: &ParameterValues,
    ) -> Result<Frame> {
        Ok(input.clone())
    }

    fn process_video(
        &self,
        input: &VideoSegment,
        _mask: Option<&Mask>,
        params: &ParameterValues,
    ) -> Result<VideoSegment> {
        let mode = params
            .get("mode")
            .and_then(|v| v.as_str())
            .unwrap_or("automatic");
        let threshold = params
            .get("threshold")
            .and_then(|v| v.as_f64())
            .unwrap_or(30.0) as f32;
        let rate = params.get("rate").and_then(|v| v.as_f64()).unwrap_or(0.3) as f32;
        let start_frame = params
            .get("start_frame")
            .and_then(|v| v.as_u64())
            .unwrap_or(0) as usize;
        let end_frame = params
            .get("end_frame")
            .and_then(|v| v.as_u64())
            .unwrap_or(100) as usize;
        let frame_number = params
            .get("frame_number")
            .and_then(|v| v.as_u64())
            .unwrap_or(0) as usize;

        let mut frames = Vec::with_capacity(input.frames.len());
        match mode {
            "automatic" => {
                for (i, frame) in input.frames.iter().enumerate() {
                    if i == 0 {
                        frames.push(frame.clone());
                        continue;
                    }
                    let prev = &input.frames[i - 1];
                    let diff = frame_difference(prev, frame);
                    if diff < threshold || rand::random::<f32>() > rate {
                        frames.push(frame.clone());
                    }
                }
            }
            "random" => {
                for (i, frame) in input.frames.iter().enumerate() {
                    if i == 0 || rand::random::<f32>() > rate {
                        frames.push(frame.clone());
                    }
                }
            }
            "range" => {
                for (i, frame) in input.frames.iter().enumerate() {
                    if i < start_frame || i > end_frame || rand::random::<f32>() > rate {
                        frames.push(frame.clone());
                    }
                }
            }
            "precise" => {
                for (i, frame) in input.frames.iter().enumerate() {
                    if i != frame_number || rand::random::<f32>() > rate {
                        frames.push(frame.clone());
                    }
                }
            }
            "progressive" => {
                let mut current_rate = 0.0f32;
                let step = rate / input.frames.len().max(1) as f32;
                for (i, frame) in input.frames.iter().enumerate() {
                    if i == 0 || rand::random::<f32>() > current_rate {
                        frames.push(frame.clone());
                    }
                    current_rate = (current_rate + step).min(1.0);
                }
            }
            _ => {
                frames = input.frames.clone();
            }
        }

        if frames.is_empty() && !input.frames.is_empty() {
            frames.push(input.frames[0].clone());
        }

        Ok(VideoSegment {
            frames,
            fps: input.fps,
        })
    }
}

fn frame_difference(a: &Frame, b: &Frame) -> f32 {
    if a.data.len() != b.data.len() {
        return f32::MAX;
    }
    let mut diff: u64 = 0;
    let len = a.data.len().min(b.data.len()) / 4 * 4;
    for i in (0..len).step_by(4) {
        let dr = (a.data[i] as i32 - b.data[i] as i32).unsigned_abs() as u64;
        let dg = (a.data[i + 1] as i32 - b.data[i + 1] as i32).unsigned_abs() as u64;
        let db = (a.data[i + 2] as i32 - b.data[i + 2] as i32).unsigned_abs() as u64;
        diff += dr + dg + db;
    }
    let count = (len / 4).max(1) as u64;
    (diff / (3 * count)) as f32
}
