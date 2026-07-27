use crate::effects::types::*;
use crate::effects::Effect;
use crate::error::Result;
use serde_json::{json, Value};

/// The selectable Bayer matrix sizes, in the order they appear in `options`.
/// The parameter is stored as an index into this table, so the two must stay
/// aligned -- `matrix_size_options()` derives the option list from it rather
/// than repeating the values.
const MATRIX_SIZES: [u32; 4] = [2, 4, 8, 16];

/// Index into [`MATRIX_SIZES`] used when the parameter is absent or unreadable.
/// Points at 4, the documented default.
const DEFAULT_MATRIX_INDEX: usize = 1;

fn matrix_size_options() -> Vec<String> {
    MATRIX_SIZES.iter().map(|n| n.to_string()).collect()
}

/// Resolve `matrix_size` to an actual Bayer matrix size.
///
/// Every Select in this app is index-based: `ParameterPanel.tsx` sends the
/// option's index, and `clamp_params` normalises option names to indices for
/// any Select whose declared default is a number. So a NUMBER here is an index
/// into [`MATRIX_SIZES`], not a size.
///
/// Reading it as a size is what made this control dead: the old lookup
/// `[2,4,8,16].find(|v| v >= idx)` mapped indices 0, 1 and 2 all onto a 2x2
/// matrix and index 3 onto 4x4, so picking "4", "8" or "16" in the UI did not
/// produce a 4x4, 8x8 or 16x16 screen -- 8x8 and 16x16 were unreachable at any
/// setting.
///
/// A STRING is taken as the literal size, which is what a project saved before
/// the index convention would hold. The two readings agree by construction:
/// option `i` is the string form of `MATRIX_SIZES[i]`, so whether a stored "8"
/// is normalised to index 2 first or parsed directly, it resolves to 8.
fn matrix_size_from_value(v: &Value) -> Option<u32> {
    if let Some(s) = v.as_str() {
        return s
            .trim()
            .parse::<u32>()
            .ok()
            .filter(|n| MATRIX_SIZES.contains(n));
    }
    let idx = v.as_f64()?;
    if idx < 0.0 || idx.fract() != 0.0 {
        return None;
    }
    MATRIX_SIZES.get(idx as usize).copied()
}

/// Bayer ordered dithering effect.
pub struct BayerDither {
    #[allow(dead_code)]
    matrix_size: u32,
    #[allow(dead_code)]
    matrix: Vec<Vec<u8>>,
}

impl BayerDither {
    pub fn new(matrix_size: u32) -> Self {
        assert!(
            matrix_size.is_power_of_two() && matrix_size >= 2,
            "matrix_size must be a power of 2 and >= 2"
        );
        let matrix = Self::generate_bayer_matrix(matrix_size);
        Self {
            matrix_size,
            matrix,
        }
    }

    /// Generate a Bayer matrix of size N×N where N is a power of 2.
    fn generate_bayer_matrix(n: u32) -> Vec<Vec<u8>> {
        if n == 2 {
            return vec![vec![0, 2], vec![3, 1]];
        }
        let half = n / 2;
        let prev = Self::generate_bayer_matrix(half);
        let mut matrix = vec![vec![0u8; n as usize]; n as usize];

        for y in 0..half {
            for x in 0..half {
                let v = prev[y as usize][x as usize];
                matrix[y as usize][x as usize] = v * 4;
                matrix[y as usize][(x + half) as usize] = v * 4 + 2;
                matrix[(y + half) as usize][x as usize] = v * 4 + 3;
                matrix[(y + half) as usize][(x + half) as usize] = v * 4 + 1;
            }
        }
        matrix
    }

    /// Apply Bayer dithering to a single pixel.
    /// Classic ordered dither: compare pixel value against scaled threshold.
    fn dither_pixel_static(r: u8, g: u8, b: u8, threshold: u8, ms: usize) -> (u8, u8, u8) {
        // Scale threshold to [0, 255), ensuring white pixels stay white
        let divisor = (ms * ms) as f32;
        let threshold_scaled = (threshold as f32 / divisor) * 255.0;

        // Use luminance for threshold comparison
        let lum = 0.299 * r as f32 + 0.587 * g as f32 + 0.114 * b as f32;

        if lum > threshold_scaled {
            (255, 255, 255)
        } else {
            (0, 0, 0)
        }
    }
}

impl Default for BayerDither {
    fn default() -> Self {
        Self::new(4)
    }
}

impl Effect for BayerDither {
    fn meta(&self) -> EffectMeta {
        EffectMeta {
            id: "dithering.bayer".to_string(),
            name: "Bayer Dither".to_string(),
            category: EffectCategory::Dithering,
            media_type: MediaType::Image,
            parameters: vec![ParameterDef {
                id: "matrix_size".to_string(),
                name: "Matrix Size".to_string(),
                param_type: ParamType::Select,
                // An INDEX into MATRIX_SIZES, not a size. Declaring the size (4)
                // here made the default the one value that is not a valid index
                // into a four-option list.
                default: json!(DEFAULT_MATRIX_INDEX),
                min: None,
                max: None,
                step: None,
                options: Some(matrix_size_options()),
            }],
        }
    }

    fn process_frame(
        &self,
        input: &Frame,
        _mask: Option<&Mask>,
        params: &ParameterValues,
    ) -> Result<Frame> {
        let mut output = input.clone();
        let w = input.width as usize;
        let h = input.height as usize;

        let ms = params
            .get("matrix_size")
            .and_then(matrix_size_from_value)
            .unwrap_or(MATRIX_SIZES[DEFAULT_MATRIX_INDEX]);
        let matrix = Self::generate_bayer_matrix(ms);

        for y in 0..h {
            for x in 0..w {
                let idx = (y * w + x) * 4;
                let r = input.data[idx];
                let g = input.data[idx + 1];
                let b = input.data[idx + 2];
                let threshold = matrix[y % ms as usize][x % ms as usize];
                let (dr, dg, db) = Self::dither_pixel_static(r, g, b, threshold, ms as usize);
                output.data[idx] = dr;
                output.data[idx + 1] = dg;
                output.data[idx + 2] = db;
                // Alpha preserved
            }
        }

        Ok(output)
    }

    fn process_video(
        &self,
        input: &VideoSegment,
        mask: Option<&Mask>,
        params: &ParameterValues,
    ) -> Result<VideoSegment> {
        let mut frames = Vec::with_capacity(input.frames.len());
        for frame in &input.frames {
            frames.push(self.process_frame(frame, mask, params)?);
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

    fn make_solid_frame(width: u32, height: u32, r: u8, g: u8, b: u8) -> Frame {
        let mut data = Vec::with_capacity((width * height * 4) as usize);
        for _ in 0..(width * height) {
            data.push(r);
            data.push(g);
            data.push(b);
            data.push(255);
        }
        Frame {
            width,
            height,
            data,
        }
    }

    #[test]
    fn test_bayer_2x2_matrix() {
        let dither = BayerDither::new(2);
        assert_eq!(dither.matrix, vec![vec![0, 2], vec![3, 1]]);
    }

    #[test]
    fn test_bayer_4x4_matrix() {
        let dither = BayerDither::new(4);
        assert_eq!(dither.matrix_size, 4);
        assert_eq!(dither.matrix[0][0], 0);
        assert_eq!(dither.matrix[0][1], 8);
        assert_eq!(dither.matrix[3][3], 5);
    }

    #[test]
    fn test_process_black_frame_stays_black() {
        let dither = BayerDither::new(4);
        let frame = make_solid_frame(8, 8, 0, 0, 0);
        let result = dither
            .process_frame(&frame, None, &serde_json::Map::new())
            .unwrap();

        // All pixels should remain black (0 + threshold is still < 127)
        for i in 0..result.data.len() / 4 {
            assert_eq!(result.data[i * 4], 0);
            assert_eq!(result.data[i * 4 + 1], 0);
            assert_eq!(result.data[i * 4 + 2], 0);
            assert_eq!(result.data[i * 4 + 3], 255);
        }
    }

    #[test]
    fn test_process_white_frame_stays_white() {
        let dither = BayerDither::new(4);
        let frame = make_solid_frame(8, 8, 255, 255, 255);
        let result = dither
            .process_frame(&frame, None, &serde_json::Map::new())
            .unwrap();

        // All pixels should remain white (255 + threshold is still > 127)
        for i in 0..result.data.len() / 4 {
            assert_eq!(result.data[i * 4], 255);
            assert_eq!(result.data[i * 4 + 1], 255);
            assert_eq!(result.data[i * 4 + 2], 255);
            assert_eq!(result.data[i * 4 + 3], 255);
        }
    }

    #[test]
    fn test_gray_frame_produces_pattern() {
        let dither = BayerDither::new(4);
        let frame = make_solid_frame(8, 8, 128, 128, 128);
        let result = dither
            .process_frame(&frame, None, &serde_json::Map::new())
            .unwrap();

        // Should produce a mix of black and white pixels (pattern)
        let mut has_black = false;
        let mut has_white = false;
        for i in 0..result.data.len() / 4 {
            let r = result.data[i * 4];
            if r == 0 {
                has_black = true;
            }
            if r == 255 {
                has_white = true;
            }
        }
        assert!(has_black, "Should have some black pixels");
        assert!(has_white, "Should have some white pixels");
    }

    fn run_with(matrix_size: serde_json::Value, frame: &Frame) -> Frame {
        let mut params = serde_json::Map::new();
        params.insert("matrix_size".to_string(), matrix_size);
        BayerDither::default()
            .process_frame(frame, None, &params)
            .unwrap()
    }

    fn gradient_frame(w: u32, h: u32) -> Frame {
        let mut data = Vec::with_capacity((w * h * 4) as usize);
        for y in 0..h {
            for x in 0..w {
                // Sweep the full range in both axes so every threshold in a
                // 16x16 matrix has pixels on each side of it.
                let v = (((x * 255) / w.max(1) + (y * 255) / h.max(1)) / 2) as u8;
                data.extend_from_slice(&[v, v, v, 255]);
            }
        }
        Frame {
            width: w,
            height: h,
            data,
        }
    }

    /// Smallest p in {1,2,4,8,16} for which row 0 of `f` repeats with period p.
    fn horizontal_period(f: &Frame) -> u32 {
        let w = f.width;
        [1u32, 2, 4, 8, 16]
            .into_iter()
            .find(|&p| (0..w).all(|x| f.data[(x * 4) as usize] == f.data[((x % p) * 4) as usize]))
            .unwrap_or(w)
    }

    /// The parameter is an index into MATRIX_SIZES, and each index must select a
    /// screen of that actual size.
    ///
    /// Proving the size rather than merely "the output changed" is the point: the
    /// bug this replaces DID vary with the parameter (index 3 gave 4x4 where the
    /// others gave 2x2), so any test that only asserted "different settings look
    /// different" would have passed against it. An NxN Bayer screen on a uniform
    /// field tiles with period exactly N, so the period is the size.
    #[test]
    fn every_option_index_selects_a_screen_of_that_size() {
        for (idx, &expected) in MATRIX_SIZES.iter().enumerate() {
            // The period can never exceed the matrix size, and for at least one
            // grey level it reaches it -- at other levels neighbouring
            // thresholds can fall on the same side of the input and collapse the
            // visible period, which is a property of the grey, not the screen.
            let mut best = 0;
            for grey in 1u8..=254 {
                let out = run_with(json!(idx), &make_solid_frame(16, 16, grey, grey, grey));
                let p = horizontal_period(&out);
                assert!(
                    p <= expected,
                    "index {idx} (size {expected}) produced period {p} at grey {grey}, \
                     which is larger than the matrix"
                );
                best = best.max(p);
            }
            assert_eq!(
                best, expected,
                "index {idx} should select a {expected}x{expected} screen, but the \
                 widest period observed over all grey levels was {best}"
            );
        }
    }

    /// 8x8 and 16x16 were unreachable from the UI before this fix; all four
    /// options must now give four different images.
    #[test]
    fn all_four_matrix_sizes_produce_distinct_output() {
        let src = gradient_frame(64, 64);
        let outs: Vec<Frame> = (0..MATRIX_SIZES.len())
            .map(|i| run_with(json!(i), &src))
            .collect();
        for i in 0..outs.len() {
            for j in (i + 1)..outs.len() {
                assert_ne!(
                    outs[i].data, outs[j].data,
                    "matrix sizes {} and {} produced identical output",
                    MATRIX_SIZES[i], MATRIX_SIZES[j]
                );
            }
        }
    }

    /// A project saved before the index convention stores the size as a string.
    /// Both readings must land on the same screen, or the same project would
    /// render differently depending on whether clamping ran first.
    #[test]
    fn legacy_string_sizes_agree_with_their_indices() {
        let src = gradient_frame(32, 32);
        for (idx, &size) in MATRIX_SIZES.iter().enumerate() {
            let by_index = run_with(json!(idx), &src);
            let by_string = run_with(json!(size.to_string()), &src);
            assert_eq!(
                by_index.data, by_string.data,
                "index {idx} and literal \"{size}\" must select the same screen"
            );
        }
    }

    /// The declared default has to be a usable index, and has to mean 4 -- the
    /// size this effect has always documented. Declaring the size (4) made the
    /// default the one number that is not a valid index into a four-option list.
    #[test]
    fn the_declared_default_is_a_valid_index_meaning_four() {
        let meta = BayerDither::default().meta();
        let p = &meta.parameters[0];
        let options = p.options.as_ref().expect("matrix_size declares options");
        let idx = p.default.as_u64().expect("default is a number") as usize;
        assert!(
            idx < options.len(),
            "default index {idx} is out of range for {} options",
            options.len()
        );
        assert_eq!(options[idx], "4");
        assert_eq!(MATRIX_SIZES[idx], 4);
    }

    /// An absent or unusable value must fall back to the documented default
    /// rather than to whatever `find` happened to return.
    #[test]
    fn unreadable_values_fall_back_to_the_default_screen() {
        let src = gradient_frame(32, 32);
        let expected = run_with(json!(DEFAULT_MATRIX_INDEX), &src);
        for junk in [
            json!(null),
            json!("not a number"),
            json!(99),   // index past the end
            json!(-1),   // negative index
            json!(1.5),  // non-integral index
            json!("64"), // a size that is not offered
        ] {
            let got = run_with(junk.clone(), &src);
            assert_eq!(
                got.data, expected.data,
                "{junk} should have fallen back to the default screen"
            );
        }
        let none = BayerDither::default()
            .process_frame(&src, None, &serde_json::Map::new())
            .unwrap();
        assert_eq!(none.data, expected.data, "absent parameter should default");
    }

    #[test]
    fn test_alpha_preserved() {
        let dither = BayerDither::new(2);
        let data = vec![128u8, 128, 128, 128];
        let frame = Frame {
            width: 1,
            height: 1,
            data,
        };
        let result = dither
            .process_frame(&frame, None, &serde_json::Map::new())
            .unwrap();
        assert_eq!(result.data[3], 128);
    }
}
