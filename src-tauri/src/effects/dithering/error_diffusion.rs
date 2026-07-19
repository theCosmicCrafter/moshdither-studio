//! Shared error-diffusion logic for grayscale dithering.

use crate::effects::types::{Frame, ParameterValues};
use crate::error::Result;

/// Apply grayscale error diffusion to `input` using `kernel`.
///
/// * `kernel` is a list of `(dx, dy, factor)` offsets relative to the current
///   pixel in the forward-scan direction. For serpentine passes the kernel is
///   mirrored horizontally automatically.
/// * `levels` is the number of output gray levels (minimum 2).
/// * `serpentine` enables alternating scan-line direction.
///
/// Returns a new RGBA frame where R, G and B are all set to the diffused
/// luminance value. Alpha is preserved from the input.
pub fn apply(
    input: &Frame,
    kernel: &[(isize, isize, f32)],
    levels: u32,
    serpentine: bool,
    _params: &ParameterValues,
) -> Result<Frame> {
    let w = input.width as usize;
    let h = input.height as usize;
    let levels = levels.max(2);
    let step = 255.0 / (levels - 1) as f32;

    let mut lum = vec![0.0f32; w * h];
    for y in 0..h {
        for x in 0..w {
            let idx = (y * w + x) * 4;
            lum[y * w + x] = 0.299 * input.data[idx] as f32
                + 0.587 * input.data[idx + 1] as f32
                + 0.114 * input.data[idx + 2] as f32;
        }
    }

    let mut data = input.data.clone();

    for y in 0..h {
        let reverse = serpentine && y % 2 == 1;
        let x_range: Vec<usize> = if reverse {
            (0..w).rev().collect()
        } else {
            (0..w).collect()
        };

        for x in x_range {
            let i = y * w + x;
            let old = lum[i];
            let q = (old / step).round().clamp(0.0, (levels - 1) as f32) as u32;
            let new = q as f32 * step;
            let err = old - new;
            lum[i] = new;

            for (dx, dy, factor) in kernel {
                let nx = if reverse {
                    x as isize - dx
                } else {
                    x as isize + dx
                };
                let ny = y as isize + dy;
                if nx >= 0 && nx < w as isize && ny >= 0 && ny < h as isize {
                    lum[ny as usize * w + nx as usize] += err * factor;
                }
            }
        }
    }

    for y in 0..h {
        for x in 0..w {
            let idx = (y * w + x) * 4;
            let v = lum[y * w + x].clamp(0.0, 255.0) as u8;
            data[idx] = v;
            data[idx + 1] = v;
            data[idx + 2] = v;
        }
    }

    Ok(Frame {
        width: input.width,
        height: input.height,
        data,
    })
}
