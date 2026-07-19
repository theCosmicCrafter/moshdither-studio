pub mod color;
pub mod image_io;
pub mod math;

pub use color::{clamp_u8, luminance, nearest_palette_color};
pub use image_io::{load_image, save_jpeg, save_png};
pub use math::{clamp, lerp};
