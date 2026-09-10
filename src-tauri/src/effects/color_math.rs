//! Shared luminance math for effects operating on the raw 0-255 RGB domain.
//!
//! Several effects independently computed the ITU-R BT.601 luma weights
//! (0.299/0.587/0.114) on raw u8 channel values before further processing.
//! Sites that instead work in a normalized `[0, 1]` domain
//! (`glitch::sorting_glitch`, `dithering::line_screen`) or that compute a
//! full YCbCr/YIQ transform alongside chroma channels
//! (`analog::vhs::rgb_to_ycbcr`, `analog::tv_glitch`,
//! `glitch::jpeg_quantize`, and one hue-rotation site in `audio_reactive`)
//! are deliberately NOT routed through this -- they aren't doing the same
//! computation, just a superficially similar one.

/// ITU-R BT.601 luma of an 0-255 RGB triple, as f32.
pub fn luminance_f32(r: u8, g: u8, b: u8) -> f32 {
    0.299 * r as f32 + 0.587 * g as f32 + 0.114 * b as f32
}

#[cfg(test)]
mod tests {
    use super::*;

    /// Pins the exact weights before any call site is repointed at this
    /// function. A transcription slip here would silently shift every
    /// dithering threshold, edge map, and luminance sort key at once.
    #[test]
    fn luminance_f32_matches_known_reference_values() {
        assert_eq!(luminance_f32(0, 0, 0), 0.0);
        assert_eq!(
            luminance_f32(255, 255, 255),
            0.299 * 255.0 + 0.587 * 255.0 + 0.114 * 255.0
        );
        assert_eq!(luminance_f32(255, 0, 0), 0.299 * 255.0);
        assert_eq!(luminance_f32(0, 255, 0), 0.587 * 255.0);
        assert_eq!(luminance_f32(0, 0, 255), 0.114 * 255.0);
        assert_eq!(
            luminance_f32(50, 80, 100),
            0.299 * 50.0 + 0.587 * 80.0 + 0.114 * 100.0
        );
    }
}
