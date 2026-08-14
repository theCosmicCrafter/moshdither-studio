pub mod analog;
pub mod artistic;
pub mod audio_reactive;
pub mod color;
pub mod color_math;
pub mod composite;
pub mod datamoshing;
pub mod dithering;
pub mod glitch;
pub mod motion;
pub mod noise;
pub mod pixel_geo;
pub mod segmentation;

pub mod effect_mask_tests;
pub mod engine;
pub mod functional_tests;
pub mod params;
pub mod registry;
pub mod rng;
#[cfg(test)]
pub mod semantic_tests;
pub mod test_helpers;
pub mod types;
pub mod verification;

pub use color_math::luminance_f32;
pub use engine::blend_mask;
pub use params::{clamp_for_effect, clamp_params};
pub use registry::EffectRegistry;
pub use types::*;

#[cfg(test)]
mod conformance_tests;
