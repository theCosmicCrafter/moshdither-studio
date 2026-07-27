use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum EffectCategory {
    Datamoshing,
    Dithering,
    Glitch,
    Analog,
    PixelGeometry,
    OpticalFlow,
    AudioReactive,
    Segmentation,
    Artistic,
    Color,
    Noise,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum MediaType {
    Image,
    Video,
    Both,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ParameterDef {
    pub id: String,
    pub name: String,
    #[serde(rename = "type")]
    pub param_type: ParamType,
    pub default: serde_json::Value,
    pub min: Option<f64>,
    pub max: Option<f64>,
    pub step: Option<f64>,
    pub options: Option<Vec<String>>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum ParamType {
    Slider,
    Toggle,
    Color,
    Palette,
    Select,
    Mask,
    /// Free-form text. Used for values that cannot be enumerated, such as a
    /// path to a second media file.
    Text,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct EffectMeta {
    pub id: String,
    pub name: String,
    pub category: EffectCategory,
    pub media_type: MediaType,
    pub parameters: Vec<ParameterDef>,
}

/// Trait implemented by every effect in the engine.
pub trait Effect: Send + Sync {
    fn meta(&self) -> EffectMeta;

    /// Whether this effect internally applies the mask in `process_frame`.
    /// If `true`, the caller (commands.rs) will NOT apply a post-process mask blend,
    /// avoiding double-mask application.
    fn handles_masking(&self) -> bool {
        false
    }

    /// Whether this effect is temporal (cross-frame).
    /// Temporal effects MUST use `process_video` during export because they read
    /// adjacent frames. Non-temporal effects can be processed frame-by-frame
    /// with per-frame audio params injected.
    fn is_temporal(&self) -> bool {
        false
    }

    /// Process a single frame (images or preview).
    fn process_frame(
        &self,
        input: &Frame,
        mask: Option<&Mask>,
        params: &ParameterValues,
    ) -> crate::error::Result<Frame>;

    /// Process a full video segment (export tier).
    fn process_video(
        &self,
        input: &VideoSegment,
        mask: Option<&Mask>,
        params: &ParameterValues,
    ) -> crate::error::Result<VideoSegment>;
}

pub type ParameterValues = serde_json::Map<String, serde_json::Value>;

/// A single image frame.
#[derive(Debug, Clone)]
pub struct Frame {
    pub width: u32,
    pub height: u32,
    pub data: Vec<u8>, // RGBA
}

/// A sequence of frames (video).
#[derive(Debug, Clone)]
pub struct VideoSegment {
    pub frames: Vec<Frame>,
    pub fps: f64,
}

/// A grayscale mask (0-255).
#[derive(Debug, Clone)]
pub struct Mask {
    pub width: u32,
    pub height: u32,
    pub data: Vec<u8>,
}
