use crate::effects::motion::{block_match_motion_field, warp_and_blend, MotionField};
use crate::effects::types::*;
use crate::effects::Effect;
use crate::error::Result;
use crate::path_guard::validate_io_path;
use serde_json::json;

/// Cross-Video Datamosh — applies motion vectors from a second video
/// to the primary video, creating cross-video motion transfer.
///
/// This effect decodes a second video (specified by `second_video_path`),
/// computes block-matching motion vectors between its frames, and applies
/// those vectors to warp the primary video's frames.
///
/// Inspired by Mosh Pro's cross-video datamoshing feature.
pub struct CrossVideoDatamosh;

impl Default for CrossVideoDatamosh {
    fn default() -> Self {
        Self
    }
}

const SHIFT_OPTIONS: &[i32] = &[0, 1, -1, 2, -2, 4, -4, 8, -8];

impl Effect for CrossVideoDatamosh {
    fn meta(&self) -> EffectMeta {
        EffectMeta {
            id: "datamoshing.cross_video".to_string(),
            name: "Cross-Video Datamosh".to_string(),
            category: EffectCategory::Datamoshing,
            media_type: MediaType::Video,
            parameters: vec![
                ParameterDef {
                    id: "second_video_path".to_string(),
                    name: "Second Video Path".to_string(),
                    // A path, not a choice. Declared as a Select with an empty
                    // option list this rendered as a dropdown with nothing in
                    // it, so the effect's one required input could not be set
                    // from the UI at all and it always fell back to the
                    // no-second-video branch.
                    param_type: ParamType::Text,
                    default: json!(""),
                    min: None,
                    max: None,
                    step: None,
                    options: None,
                },
                ParameterDef {
                    id: "block_size".to_string(),
                    name: "Block Size".to_string(),
                    param_type: ParamType::Slider,
                    default: json!(16),
                    min: Some(4.0),
                    max: Some(64.0),
                    step: Some(4.0),
                    options: None,
                },
                ParameterDef {
                    id: "strength".to_string(),
                    name: "Strength".to_string(),
                    param_type: ParamType::Slider,
                    default: json!(0.7),
                    min: Some(0.0),
                    max: Some(1.0),
                    step: Some(0.05),
                    options: None,
                },
                ParameterDef {
                    id: "interleave".to_string(),
                    name: "Interleave Mode".to_string(),
                    param_type: ParamType::Select,
                    default: json!("sequential"),
                    min: None,
                    max: None,
                    step: None,
                    options: Some(vec![
                        "sequential".to_string(),
                        "random".to_string(),
                        "pingpong".to_string(),
                    ]),
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
        _m: Option<&Mask>,
        _params: &ParameterValues,
    ) -> Result<Frame> {
        // Cross-video is temporal only; pass through for single-frame
        Ok(input.clone())
    }

    fn process_video(
        &self,
        input: &VideoSegment,
        _mask: Option<&Mask>,
        params: &ParameterValues,
    ) -> Result<VideoSegment> {
        let second_path = params
            .get("second_video_path")
            .and_then(|v| v.as_str())
            .unwrap_or("");

        if second_path.is_empty() {
            return Ok(input.clone());
        }

        let validated_second_path = validate_io_path(second_path, true)
            .map_err(|e| crate::error::AppError::Generic(e.to_string()))?;

        let block_size = params
            .get("block_size")
            .and_then(|v| v.as_u64())
            .unwrap_or(16) as usize;

        let strength = params
            .get("strength")
            .and_then(|v| v.as_f64())
            .unwrap_or(0.7) as f32;

        let interleave = params
            .get("interleave")
            .and_then(|v| v.as_str())
            .unwrap_or("sequential");

        // Decode the second video
        let second_segment =
            crate::ffmpeg::decode_video(validated_second_path.to_string_lossy().as_ref(), None)?;

        if second_segment.frames.is_empty() {
            return Ok(input.clone());
        }

        let n = input.frames.len();
        let m = second_segment.frames.len();
        let mut frames = Vec::with_capacity(n);

        // Compute motion fields from the second video
        // We compute vectors between consecutive frames of the second video
        let mut motion_fields: Vec<MotionField> = Vec::with_capacity(m.saturating_sub(1));
        for i in 1..m {
            let field = block_match_motion_field(
                &second_segment.frames[i - 1],
                &second_segment.frames[i],
                block_size,
                SHIFT_OPTIONS,
            );
            motion_fields.push(field);
        }

        // Apply motion vectors to the primary video
        for (i, frame) in input.frames.iter().enumerate() {
            // Pick which motion field to use based on interleave mode
            let field_idx = match interleave {
                "random" => {
                    let seed = i.wrapping_mul(374761393);
                    seed % motion_fields.len().max(1)
                }
                "pingpong" => {
                    let cycle = (motion_fields.len() * 2).max(2);
                    i % cycle.min(motion_fields.len().max(1))
                }
                _ => {
                    // sequential: map primary frame index to second video's motion field
                    if motion_fields.is_empty() {
                        0
                    } else {
                        // Scale index to second video length
                        (i * motion_fields.len() / n.max(1)).min(motion_fields.len() - 1)
                    }
                }
            };

            if motion_fields.is_empty() {
                frames.push(frame.clone());
            } else {
                let field = &motion_fields[field_idx];
                let warped = warp_and_blend(frame, field, strength);
                frames.push(warped);
            }
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

    fn make_segment(n: usize) -> VideoSegment {
        let frames: Vec<Frame> = (0..n)
            .map(|i| Frame {
                width: 8,
                height: 8,
                data: vec![i as u8; 256],
            })
            .collect();
        VideoSegment { frames, fps: 30.0 }
    }

    #[test]
    fn test_cross_video_no_path() {
        let e = CrossVideoDatamosh;
        let seg = make_segment(5);
        let params = serde_json::Map::new();
        let r = e.process_video(&seg, None, &params).unwrap();
        // Without a second video path, should return input unchanged
        assert_eq!(r.frames.len(), 5);
        assert_eq!(r.frames[0].data, seg.frames[0].data);
    }

    #[test]
    fn test_cross_video_frame_passthrough() {
        let e = CrossVideoDatamosh;
        let f = Frame {
            width: 4,
            height: 4,
            data: vec![128; 64],
        };
        let params = serde_json::Map::new();
        let r = e.process_frame(&f, None, &params).unwrap();
        assert_eq!(r.data, f.data);
    }

    #[test]
    fn test_cross_video_meta() {
        let e = CrossVideoDatamosh;
        let meta = e.meta();
        assert_eq!(meta.id, "datamoshing.cross_video");
        assert_eq!(meta.category, EffectCategory::Datamoshing);
        assert_eq!(meta.media_type, MediaType::Video);
        assert!(meta.parameters.len() >= 4);
    }
}
