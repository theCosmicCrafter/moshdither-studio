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
        let mut frames_with_sizes: Vec<(usize, &Frame)> =
            input.frames.iter().map(|f| (f.data.len(), f)).collect();
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
