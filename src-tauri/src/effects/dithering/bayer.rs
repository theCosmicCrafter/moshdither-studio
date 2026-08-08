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
    matrix_size: u32,
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

        // `new()` already computed a matrix for this instance's own size.
        // Regenerating a <=16x16 matrix costs microseconds either way, but
        // reusing it when the resolved per-frame size matches -- the common
        // video-export case, where every frame uses the same params -- avoids
        // the recursive rebuild for free and gives `self.matrix` an actual
        // reader instead of `#[allow(dead_code)]`. `process_frame` only takes
        // `&self`, so a genuine cache keyed by an arbitrary size would need
        // interior mutability (RefCell/Mutex); that complexity isn't worth it
        // for a computation this cheap, so the fallback path still generates
        // fresh when the sizes differ.
        let generated;
        let matrix: &Vec<Vec<u8>> = if ms == self.matrix_size {
            &self.matrix
        } else {
            generated = Self::generate_bayer_matrix(ms);
            &generated
        };

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

    /// The canonical 4x4 and 8x8 Bayer matrices, pinned in full.
    ///
    /// These are externally known tables, not something re-derived from the
    /// production generator, so they anchor the whole family: 8x8 and 16x16 are
    /// built from 4x4 by the same recursion, and a wrong quadrant offset shows
    /// up here first. Swapping the `v*4+2` and `v*4+3` offsets, for example,
    /// changes m[0][2] and m[2][0] of the 4x4 -- which the three cells the old
    /// tests pinned all happened to miss.
    const BAYER_4: [[u8; 4]; 4] = [[0, 8, 2, 10], [12, 4, 14, 6], [3, 11, 1, 9], [15, 7, 13, 5]];
    const BAYER_8: [[u8; 8]; 8] = [
        [0, 32, 8, 40, 2, 34, 10, 42],
        [48, 16, 56, 24, 50, 18, 58, 26],
        [12, 44, 4, 36, 14, 46, 6, 38],
        [60, 28, 52, 20, 62, 30, 54, 22],
        [3, 35, 11, 43, 1, 33, 9, 41],
        [51, 19, 59, 27, 49, 17, 57, 25],
        [15, 47, 7, 39, 13, 45, 5, 37],
        [63, 31, 55, 23, 61, 29, 53, 21],
    ];

    /// The matrix is stored as `u8`, and the 16x16 case fills it exactly: its
    /// largest threshold is 255, the top of the type, with zero headroom.
    ///
    /// So this is a guard on MATRIX_SIZES, not on the generator. Adding 32 to
    /// that table would make the recursion compute 255 * 4 + 3 = 1023 and
    /// overflow -- a panic in debug, a silent wrap in release. Nothing else in
    /// the file would stop it, because every other test only exercises the four
    /// sizes that are currently listed.
    #[test]
    fn every_offered_matrix_size_fits_in_the_u8_it_is_stored_in() {
        for &n in MATRIX_SIZES.iter() {
            let largest = (n as usize) * (n as usize) - 1;
            assert!(
                largest <= u8::MAX as usize,
                "a {n}x{n} Bayer matrix needs thresholds up to {largest}, which does                  not fit the u8 in Vec<Vec<u8>>; widen the matrix type before                  offering this size"
            );
        }
    }

    #[test]
    fn the_generated_matrices_are_the_canonical_bayer_tables() {
        let m4 = BayerDither::generate_bayer_matrix(4);
        for y in 0..4 {
            assert_eq!(m4[y], BAYER_4[y].to_vec(), "4x4 row {y}");
        }
        let m8 = BayerDither::generate_bayer_matrix(8);
        for y in 0..8 {
            assert_eq!(m8[y], BAYER_8[y].to_vec(), "8x8 row {y}");
        }
        // 16x16 is too large to pin by hand, but a Bayer matrix is by definition
        // a permutation of 0..n^2-1, which rules out duplicated or missing
        // thresholds -- and it maxes at exactly 255, the top of the u8 it is
        // stored in.
        let m16 = BayerDither::generate_bayer_matrix(16);
        let mut seen: Vec<u8> = m16.iter().flatten().copied().collect();
        seen.sort_unstable();
        assert_eq!(
            seen,
            (0..=255u8).collect::<Vec<u8>>(),
            "the 16x16 matrix must be a permutation of 0..=255"
        );
    }

    /// The rendered screen must use the matrix ROW-MAJOR, per pixel, at full
    /// resolution -- `matrix[y % n][x % n]`, not its transpose, not row 0 alone,
    /// and not a block-averaged copy.
    ///
    /// This replaces a test that sampled only row 0 of the output. That test
    /// passed against `threshold = matrix[0][x % ms]` -- a 1-D stripe pattern
    /// with no y dependence at all, which is not a dither. Checking every pixel
    /// against a pinned table closes transposition, y-independence, wrong
    /// quadrant offsets, inverted polarity and mis-scaled thresholds together.
    #[test]
    fn the_rendered_screen_matches_the_pinned_matrix_at_every_pixel() {
        for (idx, n, table) in [
            (
                1usize,
                4usize,
                &BAYER_4[..].iter().map(|r| r.to_vec()).collect::<Vec<_>>(),
            ),
            (
                2usize,
                8usize,
                &BAYER_8[..].iter().map(|r| r.to_vec()).collect::<Vec<_>>(),
            ),
        ] {
            // Not a multiple of either matrix size, so a wrapping bug cannot hide
            // behind an exact tiling.
            let (w, h) = (26u32, 22u32);
            for grey in [1u8, 17, 64, 128, 200, 254] {
                let out = run_with(json!(idx), &make_solid_frame(w, h, grey, grey, grey));
                for y in 0..h as usize {
                    for x in 0..w as usize {
                        let t = table[y % n][x % n];
                        let scaled = (t as f32 / (n * n) as f32) * 255.0;
                        let want = if grey as f32 > scaled { 255u8 } else { 0u8 };
                        let got = out.data[(y * w as usize + x) * 4];
                        assert_eq!(
                            got,
                            want,
                            "size {n} grey {grey} at ({x},{y}): matrix[{}][{}]={t}",
                            y % n,
                            x % n
                        );
                    }
                }
            }
        }
    }

    /// Smallest p in `candidates` for which `f` repeats along the given axis,
    /// checked over EVERY pixel rather than a single line.
    fn period(f: &Frame, vertical: bool) -> u32 {
        let (w, h) = (f.width, f.height);
        let px = |x: u32, y: u32| f.data[((y * w + x) * 4) as usize];
        let limit = if vertical { h } else { w };
        (1..=limit)
            .find(|&p| {
                (0..h).all(|y| {
                    (0..w).all(|x| {
                        let (rx, ry) = if vertical { (x, y % p) } else { (x % p, y) };
                        px(x, y) == px(rx, ry)
                    })
                })
            })
            .unwrap_or(limit)
    }

    /// The parameter is an index into MATRIX_SIZES, and each index must select a
    /// screen of that actual size.
    ///
    /// An NxN Bayer screen on a uniform field tiles with period exactly N in
    /// BOTH axes, so both periods are the size. The frame is 48x48 -- three
    /// whole tiles of the largest matrix -- because on a 16-wide frame a period
    /// of 16 is satisfied by anything at all (`x % 16 == x` for every x), which
    /// made the 16x16 case, the one that was unreachable before this fix and so
    /// has no legacy coverage, effectively untested.
    #[test]
    fn every_option_index_selects_a_screen_of_that_size() {
        for (idx, &expected) in MATRIX_SIZES.iter().enumerate() {
            // The period can never exceed the matrix size, and for at least one
            // grey level it reaches it -- at other levels neighbouring
            // thresholds can fall on the same side of the input and collapse the
            // visible period, which is a property of the grey, not the screen.
            let mut best = (0, 0);
            for grey in 1u8..=254 {
                let out = run_with(json!(idx), &make_solid_frame(48, 48, grey, grey, grey));
                let (ph, pv) = (period(&out, false), period(&out, true));
                assert!(
                    ph <= expected && pv <= expected,
                    "index {idx} (size {expected}) produced periods h={ph} v={pv} at grey                      {grey}, larger than the matrix"
                );
                best = (best.0.max(ph), best.1.max(pv));
            }
            assert_eq!(
                best,
                (expected, expected),
                "index {idx} should select a {expected}x{expected} screen, but the \
                 widest periods observed over all grey levels were {best:?}"
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
