use super::types::*;

/// Fast, approximate preview renderer.
/// May downscale, skip frames, or use simpler algorithms.
pub struct PreviewRenderer;

impl PreviewRenderer {
    pub fn render_frame(frame: &Frame) -> Vec<u8> {
        frame.data.clone()
    }
}