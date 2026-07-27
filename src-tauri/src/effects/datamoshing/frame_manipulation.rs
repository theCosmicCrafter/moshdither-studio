use crate::effects::types::*;
use crate::effects::Effect;
use crate::error::Result;

/// Reverse the order of frames in a video segment.
pub struct FrameReverse;

impl Default for FrameReverse {
    fn default() -> Self {
        FrameReverse
    }
}

impl Effect for FrameReverse {
    fn meta(&self) -> EffectMeta {
        EffectMeta {
            id: "datamoshing.frame_reverse".to_string(),
            name: "Frame Reverse".to_string(),
            category: EffectCategory::Datamoshing,
            media_type: MediaType::Video,
            parameters: vec![],
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
        _params: &ParameterValues,
    ) -> Result<VideoSegment> {
        let mut frames = input.frames.clone();
        frames.reverse();
        Ok(VideoSegment {
            frames,
            fps: input.fps,
        })
    }
}

/// Sort frames by their data size (smallest to largest).
pub struct FrameSortByDataSize;

impl Default for FrameSortByDataSize {
    fn default() -> Self {
        FrameSortByDataSize
    }
}

impl Effect for FrameSortByDataSize {
    fn meta(&self) -> EffectMeta {
        EffectMeta {
            id: "datamoshing.frame_sort_by_size".to_string(),
            name: "Frame Sort by Size".to_string(),
            category: EffectCategory::Datamoshing,
            media_type: MediaType::Video,
            parameters: vec![],
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
        _params: &ParameterValues,
    ) -> Result<VideoSegment> {
        // Ordered by visual complexity, which is what "size" means for this
        // effect: in an encoded stream a busy frame produces a larger packet
        // than a flat one, and reordering by that is the datamosh technique.
        //
        // This used to sort on `f.data.len()`. By the time an effect sees a
        // frame it has been decoded to raw RGBA, so every frame is exactly
        // width * height * 4 bytes -- every sort key was identical, the sort
        // was a no-op on a stable sort, and the effect returned its input
        // unchanged. Confirmed by rendering: its output was byte-identical to
        // seven effects that genuinely cannot act without extra input.
        //
        // Compressed size is unavailable post-decode, so complexity is
        // approximated by total absolute gradient between horizontally adjacent
        // pixels -- high-frequency detail is precisely what an encoder spends
        // bits on, so this tracks the quantity the original intent was after.
        fn complexity(f: &Frame) -> u64 {
            let w = f.width as usize;
            let h = f.height as usize;
            let mut acc: u64 = 0;
            for y in 0..h {
                let row = y * w * 4;
                for x in 1..w {
                    let i = row + x * 4;
                    let p = i - 4;
                    acc += (f.data[i] as i16 - f.data[p] as i16).unsigned_abs() as u64;
                    acc += (f.data[i + 1] as i16 - f.data[p + 1] as i16).unsigned_abs() as u64;
                    acc += (f.data[i + 2] as i16 - f.data[p + 2] as i16).unsigned_abs() as u64;
                }
            }
            acc
        }

        let mut frames_with_sizes: Vec<(u64, &Frame)> =
            input.frames.iter().map(|f| (complexity(f), f)).collect();
        frames_with_sizes.sort_by_key(|a| a.0);
        let frames = frames_with_sizes
            .into_iter()
            .map(|(_, f)| f.clone())
            .collect();
        Ok(VideoSegment {
            frames,
            fps: input.fps,
        })
    }
}

/// Hold/freeze the first frame for the entire segment.
pub struct FrameHold;

impl Default for FrameHold {
    fn default() -> Self {
        FrameHold
    }
}

impl Effect for FrameHold {
    fn meta(&self) -> EffectMeta {
        EffectMeta {
            id: "datamoshing.frame_hold".to_string(),
            name: "Frame Hold".to_string(),
            category: EffectCategory::Datamoshing,
            media_type: MediaType::Video,
            parameters: vec![],
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
        _params: &ParameterValues,
    ) -> Result<VideoSegment> {
        if input.frames.is_empty() {
            return Ok(VideoSegment {
                frames: vec![],
                fps: input.fps,
            });
        }
        let first = input.frames[0].clone();
        let frames = vec![first; input.frames.len()];
        Ok(VideoSegment {
            frames,
            fps: input.fps,
        })
    }
}
