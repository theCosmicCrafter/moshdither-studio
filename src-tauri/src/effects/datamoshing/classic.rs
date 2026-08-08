use crate::effects::types::*;
use crate::effects::Effect;
use crate::error::Result;
use serde_json::json;

/// Frame Stutter — repeats frame chunks to create temporal stutter/smearing.
/// This is a pixel-level simulation of datamosh-style frame repetition,
/// not true codec-level I-frame removal.
pub struct ClassicDatamosh {
    chunk_size: u32,
    repeats: u32,
}

impl ClassicDatamosh {
    pub fn new(chunk_size: u32, repeats: u32) -> Self {
        Self {
            chunk_size: chunk_size.clamp(2, 30),
            repeats: repeats.clamp(1, 10),
        }
    }
}

impl Default for ClassicDatamosh {
    fn default() -> Self {
        Self::new(5, 3)
    }
}

impl Effect for ClassicDatamosh {
    fn meta(&self) -> EffectMeta {
        EffectMeta {
            id: "datamoshing.classic".to_string(),
            name: "Frame Stutter".to_string(),
            category: EffectCategory::Datamoshing,
            media_type: MediaType::Video,
            parameters: vec![
                ParameterDef {
                    id: "chunk_size".to_string(),
                    name: "Chunk Size".to_string(),
                    param_type: ParamType::Slider,
                    default: json!(5),
                    min: Some(2.0),
                    max: Some(30.0),
                    step: Some(1.0),
                    options: None,
                },
                ParameterDef {
                    id: "repeats".to_string(),
                    name: "Repeats".to_string(),
                    param_type: ParamType::Slider,
                    default: json!(3),
                    min: Some(1.0),
                    max: Some(10.0),
                    step: Some(1.0),
                    options: None,
                },
                // Only affects still images. On video both settings produce the
                // same result, because the frame-sequence path repeats whole
                // chunks of frames and never touches pixel layout.
                //
                // "vertical" is the behaviour of the removed `datamoshing.repeat`
                // effect, preserved here so consolidating the two did not delete
                // a look that was reachable before.
                ParameterDef {
                    id: "smear_direction".to_string(),
                    name: "Smear Direction".to_string(),
                    param_type: ParamType::Select,
                    default: json!("horizontal"),
                    min: None,
                    max: None,
                    step: None,
                    options: Some(vec!["horizontal".to_string(), "vertical".to_string()]),
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
        params: &ParameterValues,
    ) -> Result<Frame> {
        let chunk_size = params
            .get("chunk_size")
            .and_then(|v| v.as_u64())
            .unwrap_or(self.chunk_size as u64) as usize;
        let w = input.width as usize;
        let h = input.height as usize;
        let mut out = input.data.clone();

        // The removed `datamoshing.repeat` effect had the SAME process_video as
        // this one, but a different process_frame: it duplicated whole rows
        // downward (a vertical smear) where this one repeats a pixel across a
        // horizontal run. Consolidating the two without noticing would have
        // silently deleted the vertical variant, so it survives here as a mode.
        //
        // `series_size` is accepted as an alias for chunk_size above, so a
        // project saved against the old effect keeps its spacing.
        let vertical = matches!(
            params.get("smear_direction").and_then(|v| v.as_str()),
            Some("vertical")
        );

        if vertical {
            // Copy row y over the following chunk_size-1 rows.
            for y in (0..h).step_by(chunk_size) {
                let src_row = y * w * 4;
                for yy in (y + 1)..(y + chunk_size).min(h) {
                    let dst_row = yy * w * 4;
                    let (head, tail) = out.split_at_mut(dst_row);
                    tail[..w * 4].copy_from_slice(&head[src_row..src_row + w * 4]);
                }
            }
        } else {
            for y in 0..h {
                let row_start = y * w * 4;
                for chunk in (0..w).step_by(chunk_size) {
                    let chunk_end = (chunk + chunk_size).min(w);
                    let src_idx = row_start + chunk * 4;
                    let r = out[src_idx];
                    let g = out[src_idx + 1];
                    let b = out[src_idx + 2];
                    let a = out[src_idx + 3];
                    for x in chunk..chunk_end {
                        let dst_idx = row_start + x * 4;
                        out[dst_idx] = r;
                        out[dst_idx + 1] = g;
                        out[dst_idx + 2] = b;
                        out[dst_idx + 3] = a;
                    }
                }
            }
        }

        Ok(Frame {
            width: input.width,
            height: input.height,
            data: out,
        })
    }

    fn process_video(
        &self,
        input: &VideoSegment,
        _mask: Option<&Mask>,
        params: &ParameterValues,
    ) -> Result<VideoSegment> {
        // `series_size` and `repeat_count` are the parameter names the removed
        // `datamoshing.repeat` effect used. That effect was this same algorithm
        // under a second ID (see registry.rs, where the ID is now aliased here),
        // so accepting its names means a project saved against it keeps the
        // values the user chose instead of silently falling back to defaults.
        // `series_size`/`repeat_count` aren't declared in this effect's
        // ParameterDef list (they only exist for backward-compat with the
        // retired `datamoshing.repeat` effect ID), so `clamp_params` never
        // bounds them the way it bounds `chunk_size`/`repeats`. A
        // hand-edited or corrupted legacy project file with an enormous
        // value here would otherwise drive an unbounded
        // `Vec::extend_from_slice` allocation below. Clamp each alias to its
        // modern counterpart's own declared max so behaviour stays
        // consistent whichever name a project file uses.
        let chunk_size = params
            .get("chunk_size")
            .and_then(|v| v.as_u64())
            .or_else(|| {
                params
                    .get("series_size")
                    .and_then(|v| v.as_u64())
                    .map(|v| v.min(30))
            })
            .unwrap_or(self.chunk_size as u64) as usize;
        let repeats = params
            .get("repeats")
            .and_then(|v| v.as_u64())
            .or_else(|| {
                params
                    .get("repeat_count")
                    .and_then(|v| v.as_u64())
                    .map(|v| v.min(10))
            })
            .unwrap_or(self.repeats as u64) as usize;

        // chunks(0) panics, and a zero repeat count silently produces an empty
        // video. Both are reachable from a hand-edited project file.
        let chunk_size = chunk_size.max(1);
        let repeats = repeats.max(1);

        let mut frames = Vec::new();
        for chunk in input.frames.chunks(chunk_size) {
            for _ in 0..repeats {
                frames.extend_from_slice(chunk);
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
                width: 2,
                height: 2,
                data: vec![i as u8; 16],
            })
            .collect();
        VideoSegment { frames, fps: 30.0 }
    }

    #[test]
    fn test_repeats_chunks() {
        let e = ClassicDatamosh::new(2, 3);
        let seg = make_segment(4);
        let r = e
            .process_video(&seg, None, &serde_json::Map::new())
            .unwrap();
        assert_eq!(r.frames.len(), 12); // 2 chunks * 2 frames * 3 repeats = 12
    }

    #[test]
    fn test_legacy_repeat_count_alias_is_clamped() {
        // `repeat_count` is the parameter name the retired
        // `datamoshing.repeat` effect used. It isn't declared in this
        // effect's ParameterDef list, so `clamp_params` never bounds it --
        // an absurd value from a hand-edited/corrupted legacy project file
        // must still be clamped here rather than driving a huge
        // `Vec::extend_from_slice` allocation.
        let e = ClassicDatamosh::new(2, 3);
        let seg = make_segment(4);
        let mut params = serde_json::Map::new();
        params.insert("repeat_count".to_string(), serde_json::json!(1_000_000));
        let r = e.process_video(&seg, None, &params).unwrap();
        // 2 chunks * 2 frames * 10 (repeats' own declared max) = 40, not
        // anywhere near 1,000,000 * 2 chunks * 2 frames.
        assert_eq!(r.frames.len(), 40);
    }

    #[test]
    fn test_legacy_series_size_alias_is_clamped() {
        // Same reasoning as `repeat_count` above, for `series_size` (the
        // `chunk_size` alias). Chunking-then-repeating preserves total frame
        // count no matter what chunk_size is (sum of chunk lengths is always
        // the input length), so a count assertion can't tell clamped from
        // unclamped. Instead, check WHERE the repeat boundary lands, which
        // does depend on chunk_size.
        let e = ClassicDatamosh::new(2, 1);
        let seg = make_segment(40); // frame i carries marker byte i
        let mut params = serde_json::Map::new();
        params.insert("series_size".to_string(), serde_json::json!(1_000_000));
        params.insert("repeats".to_string(), serde_json::json!(2));
        let r = e.process_video(&seg, None, &params).unwrap();
        // Clamped to chunk_size's declared max of 30: first chunk is frames
        // [0..30), so its repeat starts at output index 30 (marker 0).
        // Left unclamped at 1,000,000, all 40 frames form a single chunk,
        // and the repeat would instead start at output index 40 (marker 0
        // would land at index 40, not 30 -- index 30 would still carry
        // marker 30).
        assert_eq!(
            r.frames[30].data[0], 0,
            "series_size should be clamped to 30 (chunk_size's declared max), \
             so the first repeated chunk boundary falls at index 30"
        );
    }

    #[test]
    fn test_process_frame_pixelates() {
        let e = ClassicDatamosh::new(2, 1);
        let mut params = serde_json::Map::new();
        params.insert(
            "chunk_size".to_string(),
            serde_json::Value::Number(2.into()),
        );
        let frame = Frame {
            width: 4,
            height: 1,
            data: vec![
                0, 0, 0, 255, 255, 255, 255, 255, 0, 0, 0, 255, 255, 255, 255, 255,
            ],
        };
        let result = e.process_frame(&frame, None, &params).unwrap();
        // Chunk size 2: first 2 pixels become [0,0,0,255], last 2 become [0,0,0,255] (from index 2)
        // Wait, index 2 is [0,0,0,255] so last 2 pixels should become black
        assert_eq!(result.data[0..4], [0, 0, 0, 255]); // first pixel of chunk -> black
        assert_eq!(result.data[4..8], [0, 0, 0, 255]); // second pixel -> same as first
        assert_eq!(result.data[8..12], [0, 0, 0, 255]); // first pixel of second chunk (index 2)
        assert_eq!(result.data[12..16], [0, 0, 0, 255]); // second pixel -> same
    }
}
