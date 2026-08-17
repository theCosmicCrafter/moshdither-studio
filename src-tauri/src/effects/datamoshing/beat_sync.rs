//! Beat-synced datamosh.
//!
//! The datamoshing family was entirely audio-blind: every temporal effect cut
//! on a fixed interval, so a mosh could land anywhere against the music. These
//! read the beat timeline the export bake supplies (`_audio_beat_frames`) and
//! act on those frames instead, which is the difference between a glitch that
//! happens *during* a track and one that happens *with* it.
//!
//! Temporal effects receive the whole segment and no per-frame audio, so the
//! beat positions arrive once as a frame-index array rather than as a per-frame
//! value -- see `AudioBakeData::inject_timeline_params`.

use crate::effects::types::*;
use crate::effects::Effect;
use crate::error::Result;
use serde_json::json;

/// Frame indices carrying a beat, as injected by the bake.
///
/// Absent when no audio is baked, in which case every effect here passes the
/// segment through untouched rather than inventing a pulse.
fn beat_frames(params: &ParameterValues) -> Vec<usize> {
    params
        .get("_audio_beat_frames")
        .and_then(|v| v.as_array())
        .map(|arr| {
            arr.iter()
                .filter_map(|v| v.as_u64().map(|n| n as usize))
                .collect()
        })
        .unwrap_or_default()
}

fn u64_param(params: &ParameterValues, key: &str, fallback: u64) -> u64 {
    params.get(key).and_then(|v| v.as_u64()).unwrap_or(fallback)
}

/// Beat-triggered frame hold: freezes the picture for a moment on each beat.
///
/// `datamoshing.frame_hold` holds the first frame for the entire clip. This
/// holds the frame that lands on each beat, for a configurable number of
/// frames, then resumes -- the stutter that reads as rhythmic rather than as a
/// stuck decoder.
pub struct BeatHold;

impl Default for BeatHold {
    fn default() -> Self {
        Self
    }
}

impl Effect for BeatHold {
    fn meta(&self) -> EffectMeta {
        EffectMeta {
            id: "datamoshing.beat_hold".to_string(),
            name: "Beat Hold".to_string(),
            category: EffectCategory::Datamoshing,
            media_type: MediaType::Video,
            parameters: vec![
                ParameterDef {
                    id: "hold_frames".to_string(),
                    name: "Hold Frames".to_string(),
                    param_type: ParamType::Slider,
                    default: json!(4),
                    min: Some(1.0),
                    max: Some(60.0),
                    step: Some(1.0),
                    options: None,
                },
                ParameterDef {
                    id: "every_nth_beat".to_string(),
                    name: "Every Nth Beat".to_string(),
                    param_type: ParamType::Slider,
                    default: json!(1),
                    min: Some(1.0),
                    max: Some(16.0),
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
        _m: Option<&Mask>,
        _params: &ParameterValues,
    ) -> Result<Frame> {
        // A hold is defined across frames; a single frame has nothing to hold
        // against, so this is deliberately identity.
        Ok(input.clone())
    }

    fn process_video(
        &self,
        input: &VideoSegment,
        _mask: Option<&Mask>,
        params: &ParameterValues,
    ) -> Result<VideoSegment> {
        let beats = beat_frames(params);
        let hold = u64_param(params, "hold_frames", 4).max(1) as usize;
        let nth = u64_param(params, "every_nth_beat", 1).max(1) as usize;

        if beats.is_empty() || input.frames.is_empty() {
            return Ok(input.clone());
        }

        // Only the selected beats trigger, so "every 4th beat" lands on the bar
        // rather than on every kick.
        let triggers: Vec<usize> = beats.iter().copied().step_by(nth).collect();

        let mut frames = input.frames.clone();
        for &start in &triggers {
            if start >= frames.len() {
                continue;
            }
            let held = input.frames[start].clone();
            let end = (start + hold).min(frames.len());
            for slot in frames.iter_mut().take(end).skip(start + 1) {
                *slot = held.clone();
            }
        }

        Ok(VideoSegment {
            frames,
            fps: input.fps,
        })
    }
}

/// Beat-triggered I-frame drop: repeats the frame *before* each beat over the
/// beat itself, so motion smears through the hit.
///
/// This is the classic datamosh gesture -- removing the keyframe so the decoder
/// carries stale blocks forward -- aimed at the beat rather than at a fixed
/// cadence.
pub struct BeatSmear;

impl Default for BeatSmear {
    fn default() -> Self {
        Self
    }
}

impl Effect for BeatSmear {
    fn meta(&self) -> EffectMeta {
        EffectMeta {
            id: "datamoshing.beat_smear".to_string(),
            name: "Beat Smear".to_string(),
            category: EffectCategory::Datamoshing,
            media_type: MediaType::Video,
            parameters: vec![
                ParameterDef {
                    id: "smear_frames".to_string(),
                    name: "Smear Frames".to_string(),
                    param_type: ParamType::Slider,
                    default: json!(6),
                    min: Some(1.0),
                    max: Some(60.0),
                    step: Some(1.0),
                    options: None,
                },
                ParameterDef {
                    id: "every_nth_beat".to_string(),
                    name: "Every Nth Beat".to_string(),
                    param_type: ParamType::Slider,
                    default: json!(1),
                    min: Some(1.0),
                    max: Some(16.0),
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
        _m: Option<&Mask>,
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
        let beats = beat_frames(params);
        let smear = u64_param(params, "smear_frames", 6).max(1) as usize;
        let nth = u64_param(params, "every_nth_beat", 1).max(1) as usize;

        if beats.is_empty() || input.frames.is_empty() {
            return Ok(input.clone());
        }

        let triggers: Vec<usize> = beats.iter().copied().step_by(nth).collect();
        let mut frames = input.frames.clone();

        for &beat in &triggers {
            // The frame carried forward is the one *before* the beat -- that is
            // what makes the hit look like it smeared through rather than
            // freezing on impact. A beat at frame 0 has no predecessor.
            if beat == 0 || beat >= frames.len() {
                continue;
            }
            let carried = input.frames[beat - 1].clone();
            let end = (beat + smear).min(frames.len());
            for slot in frames.iter_mut().take(end).skip(beat) {
                *slot = carried.clone();
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

    fn seg(n: usize) -> VideoSegment {
        // Each frame is a flat colour equal to its index, so which source frame
        // ended up where is readable from the data.
        let frames = (0..n)
            .map(|i| Frame {
                width: 2,
                height: 2,
                data: vec![i as u8; 16],
            })
            .collect();
        VideoSegment { frames, fps: 30.0 }
    }

    fn params(beats: &[u64], extra: &[(&str, u64)]) -> ParameterValues {
        let mut m = serde_json::Map::new();
        m.insert("_audio_beat_frames".to_string(), json!(beats.to_vec()));
        for (k, v) in extra {
            m.insert((*k).to_string(), json!(v));
        }
        m
    }

    fn indices(s: &VideoSegment) -> Vec<u8> {
        s.frames.iter().map(|f| f.data[0]).collect()
    }

    #[test]
    fn beat_hold_without_audio_is_a_passthrough() {
        let e = BeatHold;
        let s = seg(6);
        let out = e.process_video(&s, None, &serde_json::Map::new()).unwrap();
        assert_eq!(indices(&out), vec![0, 1, 2, 3, 4, 5]);
    }

    #[test]
    fn beat_hold_freezes_the_beat_frame_for_the_hold_length() {
        let e = BeatHold;
        let s = seg(8);
        // Beat at frame 2, hold 3 -> frames 2,3,4 all show frame 2.
        let out = e
            .process_video(&s, None, &params(&[2], &[("hold_frames", 3)]))
            .unwrap();
        assert_eq!(indices(&out), vec![0, 1, 2, 2, 2, 5, 6, 7]);
    }

    #[test]
    fn beat_hold_respects_every_nth_beat() {
        let e = BeatHold;
        let s = seg(10);
        // Beats on 1,3,5,7 but only every 2nd triggers -> 1 and 5.
        let out = e
            .process_video(
                &s,
                None,
                &params(&[1, 3, 5, 7], &[("hold_frames", 2), ("every_nth_beat", 2)]),
            )
            .unwrap();
        assert_eq!(indices(&out), vec![0, 1, 1, 3, 4, 5, 5, 7, 8, 9]);
    }

    #[test]
    fn beat_hold_clamps_a_hold_running_past_the_end() {
        let e = BeatHold;
        let s = seg(4);
        let out = e
            .process_video(&s, None, &params(&[2], &[("hold_frames", 50)]))
            .unwrap();
        assert_eq!(out.frames.len(), 4, "must not grow the segment");
        assert_eq!(indices(&out), vec![0, 1, 2, 2]);
    }

    #[test]
    fn beat_smear_carries_the_pre_beat_frame_through_the_hit() {
        let e = BeatSmear;
        let s = seg(8);
        // Beat at 4, smear 3 -> frames 4,5,6 show frame 3.
        let out = e
            .process_video(&s, None, &params(&[4], &[("smear_frames", 3)]))
            .unwrap();
        assert_eq!(indices(&out), vec![0, 1, 2, 3, 3, 3, 3, 7]);
    }

    #[test]
    fn beat_smear_ignores_a_beat_on_the_first_frame() {
        let e = BeatSmear;
        let s = seg(5);
        // Frame 0 has no predecessor to carry forward, so nothing changes.
        let out = e
            .process_video(&s, None, &params(&[0], &[("smear_frames", 3)]))
            .unwrap();
        assert_eq!(indices(&out), vec![0, 1, 2, 3, 4]);
    }

    #[test]
    fn beat_frames_beyond_the_segment_are_skipped() {
        let e = BeatHold;
        let s = seg(3);
        let out = e
            .process_video(&s, None, &params(&[99], &[("hold_frames", 4)]))
            .unwrap();
        assert_eq!(indices(&out), vec![0, 1, 2]);
    }
}
