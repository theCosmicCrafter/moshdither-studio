use super::types::*;
use super::Effect;

/// The linear effect stack. Applies effects in order.
#[derive(Default)]
pub struct EffectStack {
    pub effects: Vec<(Box<dyn Effect>, ParameterValues, Option<Mask>)>,
}

impl EffectStack {
    pub fn new() -> Self {
        Self::default()
    }

    pub fn push(&mut self, effect: Box<dyn Effect>, params: ParameterValues, mask: Option<Mask>) {
        self.effects.push((effect, params, mask));
    }

    /// Run the stack on a single frame.
    pub fn process_frame(&self, mut frame: Frame) -> crate::error::Result<Frame> {
        for (effect, params, mask) in &self.effects {
            frame = effect.process_frame(&frame, mask.as_ref(), params)?;
        }
        Ok(frame)
    }

    /// Run the stack on a full video segment.
    pub fn process_video(&self, mut segment: VideoSegment) -> crate::error::Result<VideoSegment> {
        for (effect, params, mask) in &self.effects {
            segment = effect.process_video(&segment, mask.as_ref(), params)?;
        }
        Ok(segment)
    }
}