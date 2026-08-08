use crate::effects::types::*;
use crate::effects::Effect;
use crate::error::Result;
use serde_json::json;

/// K-Means color quantization dithering.
/// Reduces colors to K clusters using Lloyd's algorithm, then applies
/// Floyd-Steinberg error diffusion with the discovered palette.
pub struct KMeansDither;

impl KMeansDither {
    pub fn new() -> Self {
        Self
    }
}

impl Default for KMeansDither {
    fn default() -> Self {
        Self::new()
    }
}

#[derive(Clone, Copy, Debug, Default)]
struct Centroid {
    r: f64,
    g: f64,
    b: f64,
    count: u64,
}

impl Centroid {
    fn dist_sq(&self, r: f64, g: f64, b: f64) -> f64 {
        let dr = self.r - r;
        let dg = self.g - g;
        let db = self.b - b;
        dr * dr + dg * dg + db * db
    }
}

/// Run K-Means clustering on pixel data and return K centroids.
/// k-means over the pixels of `data`.
///
/// `seed` makes the k-means++ initialisation reproducible. Without it the
/// palette differs on every call, so the preview and the export disagree and
/// two renders of the same project produce different files.
fn kmeans(data: &[u8], k: usize, max_iters: usize, seed: u64) -> Vec<Centroid> {
    // Collect non-transparent pixels, subsample for performance
    let mut pixels: Vec<(f64, f64, f64)> = Vec::new();
    for chunk in data.chunks_exact(4) {
        if chunk[3] > 0 {
            pixels.push((chunk[0] as f64, chunk[1] as f64, chunk[2] as f64));
        }
    }
    if pixels.is_empty() {
        return vec![Centroid::default(); k];
    }
    if pixels.len() > 10000 {
        let step = pixels.len() / 10000;
        pixels = pixels.into_iter().step_by(step).collect();
    }

    // Initialize centroids using k-means++ seeding
    let mut centroids = kmeans_plus_plus_init(&pixels, k, seed);

    for _ in 0..max_iters {
        let mut next = vec![Centroid::default(); k];
        let mut changed = false;

        for &(r, g, b) in &pixels {
            let best = nearest_centroid(&centroids, r, g, b);
            next[best].r += r;
            next[best].g += g;
            next[best].b += b;
            next[best].count += 1;
        }

        for (i, c) in next.iter_mut().enumerate() {
            if c.count > 0 {
                let new_r = c.r / c.count as f64;
                let new_g = c.g / c.count as f64;
                let new_b = c.b / c.count as f64;
                if (new_r - centroids[i].r).abs() > 0.5
                    || (new_g - centroids[i].g).abs() > 0.5
                    || (new_b - centroids[i].b).abs() > 0.5
                {
                    changed = true;
                }
                centroids[i] = Centroid {
                    r: new_r,
                    g: new_g,
                    b: new_b,
                    count: c.count,
                };
            }
        }

        if !changed {
            break;
        }
    }

    centroids
}

fn kmeans_plus_plus_init(pixels: &[(f64, f64, f64)], k: usize, seed: u64) -> Vec<Centroid> {
    use rand::Rng;
    let mut rng = crate::effects::rng::seeded_rng(seed);
    let mut centroids: Vec<Centroid> = Vec::with_capacity(k);

    // Pick first centroid randomly
    let first = pixels[rng.gen_range(0..pixels.len())];
    centroids.push(Centroid {
        r: first.0,
        g: first.1,
        b: first.2,
        count: 0,
    });

    for _ in 1..k {
        // Compute distances to nearest centroid for each pixel
        let dists: Vec<f64> = pixels
            .iter()
            .map(|&(r, g, b)| {
                centroids
                    .iter()
                    .map(|c| c.dist_sq(r, g, b))
                    .fold(f64::MAX, f64::min)
            })
            .collect();

        // Weighted random selection proportional to distance squared
        let total: f64 = dists.iter().sum();
        if total <= 0.0 {
            // All pixels identical to centroids — pick random
            let idx = rng.gen_range(0..pixels.len());
            centroids.push(Centroid {
                r: pixels[idx].0,
                g: pixels[idx].1,
                b: pixels[idx].2,
                count: 0,
            });
        } else {
            let target = rng.gen::<f64>() * total;
            let mut acc = 0.0;
            let mut chosen = 0;
            for (i, &d) in dists.iter().enumerate() {
                acc += d;
                if acc >= target {
                    chosen = i;
                    break;
                }
            }
            centroids.push(Centroid {
                r: pixels[chosen].0,
                g: pixels[chosen].1,
                b: pixels[chosen].2,
                count: 0,
            });
        }
    }

    centroids
}

fn nearest_centroid(centroids: &[Centroid], r: f64, g: f64, b: f64) -> usize {
    let mut best = 0;
    let mut best_dist = f64::MAX;
    for (i, c) in centroids.iter().enumerate() {
        let d = c.dist_sq(r, g, b);
        if d < best_dist {
            best_dist = d;
            best = i;
        }
    }
    best
}

fn nearest_centroid_color(centroids: &[Centroid], r: f64, g: f64, b: f64) -> (u8, u8, u8) {
    let idx = nearest_centroid(centroids, r, g, b);
    let c = &centroids[idx];
    (
        c.r.round().clamp(0.0, 255.0) as u8,
        c.g.round().clamp(0.0, 255.0) as u8,
        c.b.round().clamp(0.0, 255.0) as u8,
    )
}

impl Effect for KMeansDither {
    fn meta(&self) -> EffectMeta {
        EffectMeta {
            id: "dithering.kmeans".to_string(),
            name: "K-Means Quantization".to_string(),
            category: EffectCategory::Dithering,
            media_type: MediaType::Both,
            parameters: vec![
                ParameterDef {
                    id: "numColors".to_string(),
                    name: "Number of Colors".to_string(),
                    param_type: ParamType::Slider,
                    default: json!(8),
                    min: Some(2.0),
                    max: Some(256.0),
                    step: Some(1.0),
                    options: None,
                },
                ParameterDef {
                    id: "dither".to_string(),
                    name: "Dither".to_string(),
                    param_type: ParamType::Toggle,
                    default: json!(true),
                    min: None,
                    max: None,
                    step: None,
                    options: None,
                },
                ParameterDef {
                    id: "iterations".to_string(),
                    name: "K-Means Iterations".to_string(),
                    param_type: ParamType::Slider,
                    default: json!(10),
                    min: Some(1.0),
                    max: Some(50.0),
                    step: Some(1.0),
                    options: None,
                },
            ],
        }
    }

    fn is_temporal(&self) -> bool {
        // A still image has no "clip" to be consistent across, so
        // process_frame seeding k-means from its own pixels is correct for
        // preview/image use. But `commands.rs`'s video export path runs any
        // non-temporal effect through an independent-per-frame `par_iter()`
        // branch, and `frame_seed` derives from each frame's own sampled
        // content -- so every frame reseeds an independent palette, visible
        // as flicker across an exported clip. Declaring this effect temporal
        // routes export through `process_video` below, which computes the
        // palette ONCE for the whole segment instead.
        true
    }

    fn process_frame(
        &self,
        input: &Frame,
        _mask: Option<&Mask>,
        params: &ParameterValues,
    ) -> Result<Frame> {
        let (k, dither, max_iters) = Self::read_params(params);
        let seed = crate::effects::rng::frame_seed(input, params);
        let centroids = kmeans(&input.data, k, max_iters, seed);
        Ok(Self::quantize_with_centroids(input, &centroids, dither))
    }

    fn process_video(
        &self,
        input: &VideoSegment,
        _mask: Option<&Mask>,
        params: &ParameterValues,
    ) -> Result<VideoSegment> {
        if input.frames.is_empty() {
            return Ok(VideoSegment {
                frames: Vec::new(),
                fps: input.fps,
            });
        }

        let (k, dither, max_iters) = Self::read_params(params);

        // Derive centroids ONCE from a representative sample of the whole
        // segment, seeded from the first frame so the result is stable and
        // reproducible for a given clip -- never re-seeded per frame, which
        // is exactly what caused the flicker this method exists to fix.
        let sample = Self::sample_segment_data(input);
        let seed = crate::effects::rng::frame_seed(&input.frames[0], params);
        let centroids = kmeans(&sample, k, max_iters, seed);

        let frames = input
            .frames
            .iter()
            .map(|frame| Self::quantize_with_centroids(frame, &centroids, dither))
            .collect();

        Ok(VideoSegment {
            frames,
            fps: input.fps,
        })
    }
}

impl KMeansDither {
    /// Read `numColors`, `dither` and `iterations`, honouring the
    /// read-after-clamp path.
    ///
    /// `numColors` and `iterations` must be read with `as_f64`, not
    /// `as_u64`: a JSON float (whether hand-supplied or produced by
    /// `clamp_params` rewriting an out-of-range value) would otherwise be
    /// silently dropped and the effect would fall back to its hardcoded
    /// defaults.
    fn read_params(params: &ParameterValues) -> (usize, bool, usize) {
        let k = params
            .get("numColors")
            .and_then(|v| v.as_f64())
            .filter(|v| v.is_finite())
            .map(|v| v.round().clamp(2.0, 256.0) as usize)
            .unwrap_or(8);
        let dither = params
            .get("dither")
            .and_then(|v| v.as_bool())
            .unwrap_or(true);
        let max_iters = params
            .get("iterations")
            .and_then(|v| v.as_f64())
            .filter(|v| v.is_finite())
            .map(|v| v.round().clamp(1.0, 50.0) as usize)
            .unwrap_or(10);
        (k, dither, max_iters)
    }

    /// Merge pixel data from a representative sample of frames spread across
    /// the whole segment, so the palette reflects the clip as a whole rather
    /// than any single frame. `kmeans` reads raw bytes directly and does not
    /// care about frame boundaries.
    fn sample_segment_data(input: &VideoSegment) -> Vec<u8> {
        const MAX_SAMPLES: usize = 5;
        let n = input.frames.len();
        if n == 0 {
            return Vec::new();
        }
        let count = n.min(MAX_SAMPLES);
        let mut merged = Vec::new();
        for i in 0..count {
            let idx = if count == 1 {
                0
            } else {
                i * (n - 1) / (count - 1)
            };
            merged.extend_from_slice(&input.frames[idx].data);
        }
        merged
    }

    /// Quantize a frame against an already-computed set of centroids.
    /// Factored out of `process_frame` so `process_video` can apply the SAME
    /// centroids to every frame instead of re-deriving them per frame.
    fn quantize_with_centroids(input: &Frame, centroids: &[Centroid], dither: bool) -> Frame {
        let w = input.width as usize;
        let h = input.height as usize;

        if dither {
            // Floyd-Steinberg error diffusion with the K-Means palette
            let mut buf: Vec<f32> = input.data.iter().map(|&v| v as f32).collect();

            for y in 0..h {
                let reverse = y % 2 == 1;
                let x_range: Vec<usize> = if reverse {
                    (0..w).rev().collect()
                } else {
                    (0..w).collect()
                };

                for &x in &x_range {
                    let idx = (y * w + x) * 4;
                    let old_r = buf[idx] as f64;
                    let old_g = buf[idx + 1] as f64;
                    let old_b = buf[idx + 2] as f64;

                    let (nr, ng, nb) = nearest_centroid_color(centroids, old_r, old_g, old_b);
                    let nr_f = nr as f32;
                    let ng_f = ng as f32;
                    let nb_f = nb as f32;

                    buf[idx] = nr_f;
                    buf[idx + 1] = ng_f;
                    buf[idx + 2] = nb_f;

                    let err_r = old_r as f32 - nr_f;
                    let err_g = old_g as f32 - ng_f;
                    let err_b = old_b as f32 - nb_f;

                    let distribute = |buf: &mut [f32], nx: isize, ny: isize, factor: f32| {
                        if nx >= 0 && nx < w as isize && ny >= 0 && ny < h as isize {
                            let nidx = (ny as usize * w + nx as usize) * 4;
                            buf[nidx] += err_r * factor;
                            buf[nidx + 1] += err_g * factor;
                            buf[nidx + 2] += err_b * factor;
                        }
                    };

                    if reverse {
                        distribute(&mut buf, x as isize - 1, y as isize, 7.0 / 16.0);
                        distribute(&mut buf, x as isize + 1, y as isize + 1, 3.0 / 16.0);
                        distribute(&mut buf, x as isize, y as isize + 1, 5.0 / 16.0);
                        distribute(&mut buf, x as isize - 1, y as isize + 1, 1.0 / 16.0);
                    } else {
                        distribute(&mut buf, x as isize + 1, y as isize, 7.0 / 16.0);
                        distribute(&mut buf, x as isize - 1, y as isize + 1, 3.0 / 16.0);
                        distribute(&mut buf, x as isize, y as isize + 1, 5.0 / 16.0);
                        distribute(&mut buf, x as isize + 1, y as isize + 1, 1.0 / 16.0);
                    }
                }
            }

            let data: Vec<u8> = buf.iter().map(|&v| v.clamp(0.0, 255.0) as u8).collect();
            Frame {
                width: input.width,
                height: input.height,
                data,
            }
        } else {
            // Nearest-color quantization without dithering
            let mut data = input.data.clone();
            for chunk in data.chunks_exact_mut(4) {
                let (nr, ng, nb) = nearest_centroid_color(
                    centroids,
                    chunk[0] as f64,
                    chunk[1] as f64,
                    chunk[2] as f64,
                );
                chunk[0] = nr;
                chunk[1] = ng;
                chunk[2] = nb;
            }
            Frame {
                width: input.width,
                height: input.height,
                data,
            }
        }
    }
}

/// Extract a palette from a frame using K-Means and return the colors as RGB tuples.
/// Public API for the palette-extraction feature (#23).
/// Derive a `k`-colour palette from `frame`.
///
/// Deterministic for a given frame: the k-means seeding is keyed off the frame
/// content, so the same image always yields the same palette and a preview
/// matches its export.
pub fn extract_kmeans_palette(frame: &Frame, k: usize) -> Vec<(u8, u8, u8)> {
    let k = k.clamp(2, 256);
    let seed = crate::effects::rng::frame_seed(frame, &ParameterValues::new());
    let centroids = kmeans(&frame.data, k, 10, seed);
    centroids
        .iter()
        .map(|c| {
            (
                c.r.round().clamp(0.0, 255.0) as u8,
                c.g.round().clamp(0.0, 255.0) as u8,
                c.b.round().clamp(0.0, 255.0) as u8,
            )
        })
        .collect()
}

#[cfg(test)]
mod tests {
    use super::*;

    fn make_gradient_frame(w: u32, h: u32) -> Frame {
        let mut data = Vec::with_capacity((w * h * 4) as usize);
        for y in 0..h {
            for x in 0..w {
                data.push((x * 255 / w) as u8);
                data.push((y * 255 / h) as u8);
                data.push(128);
                data.push(255);
            }
        }
        Frame {
            width: w,
            height: h,
            data,
        }
    }

    #[test]
    fn test_kmeans_reduces_colors() {
        let frame = make_gradient_frame(32, 32);
        let dither = KMeansDither::new();
        let mut params = serde_json::Map::new();
        params.insert("numColors".to_string(), json!(4));
        params.insert("dither".to_string(), json!(false));
        params.insert("iterations".to_string(), json!(10));
        let result = dither.process_frame(&frame, None, &params).unwrap();

        let unique: std::collections::HashSet<(u8, u8, u8)> = result
            .data
            .chunks_exact(4)
            .map(|c| (c[0], c[1], c[2]))
            .collect();
        assert!(
            unique.len() <= 4,
            "Should have at most 4 unique colors, got {}",
            unique.len()
        );
    }

    #[test]
    fn test_kmeans_with_dither() {
        let frame = make_gradient_frame(16, 16);
        let dither = KMeansDither::new();
        let mut params = serde_json::Map::new();
        params.insert("numColors".to_string(), json!(8));
        params.insert("dither".to_string(), json!(true));
        params.insert("iterations".to_string(), json!(5));
        let result = dither.process_frame(&frame, None, &params).unwrap();
        assert_eq!(result.width, 16);
        assert_eq!(result.height, 16);
        assert_eq!(result.data.len(), 16 * 16 * 4);
    }

    #[test]
    fn test_extract_palette() {
        let frame = make_gradient_frame(32, 32);
        let palette = extract_kmeans_palette(&frame, 6);
        assert_eq!(palette.len(), 6);
    }

    /// `numColors` must be read with `as_f64`, not `as_u64`: a JSON float
    /// (whether hand-supplied or produced by `clamp_params` rewriting an
    /// out-of-range value) would otherwise be silently dropped and the
    /// effect would fall back to its hardcoded default of 8. k-means is
    /// deterministic given the same seed, k and iteration count, and
    /// `frame_seed` does not depend on `numColors`, so equal `k` must give
    /// byte-identical output.
    #[test]
    fn num_colors_accepts_a_float_tagged_value_instead_of_falling_back_to_default() {
        let frame = make_gradient_frame(48, 48);
        let dither = KMeansDither::new();

        let mut float_params = serde_json::Map::new();
        float_params.insert("numColors".into(), json!(4.0));
        float_params.insert("dither".into(), json!(false));
        let mut int_params = serde_json::Map::new();
        int_params.insert("numColors".into(), json!(4));
        int_params.insert("dither".into(), json!(false));
        let mut default_params = serde_json::Map::new();
        default_params.insert("dither".into(), json!(false));

        let default_out = dither.process_frame(&frame, None, &default_params).unwrap();
        let float_out = dither.process_frame(&frame, None, &float_params).unwrap();
        let int_out = dither.process_frame(&frame, None, &int_params).unwrap();

        assert_eq!(
            float_out.data, int_out.data,
            "numColors 4 and 4.0 must resolve identically"
        );
        assert_ne!(
            float_out.data, default_out.data,
            "a float-tagged numColors must not silently fall back to the default"
        );
    }

    #[test]
    fn num_colors_honours_a_clamp_then_read_round_trip() {
        let frame = make_gradient_frame(48, 48);
        let dither = KMeansDither::new();

        // Out of range (declared max is 256); clamp_params rewrites this to
        // the float-tagged representation that as_u64() cannot read.
        let mut raw = serde_json::Map::new();
        raw.insert("numColors".into(), json!(99999));
        raw.insert("dither".into(), json!(false));
        let clamped = crate::effects::clamp_params("dithering.kmeans", &raw);
        assert!(
            clamped["numColors"].is_f64(),
            "clamp_params should have rewritten the out-of-range value to a float"
        );

        let mut direct_max = serde_json::Map::new();
        direct_max.insert("numColors".into(), json!(256));
        direct_max.insert("dither".into(), json!(false));
        let mut default_params = serde_json::Map::new();
        default_params.insert("dither".into(), json!(false));

        let via_clamp = dither.process_frame(&frame, None, &clamped).unwrap();
        let via_direct = dither.process_frame(&frame, None, &direct_max).unwrap();
        let default_out = dither.process_frame(&frame, None, &default_params).unwrap();

        assert_eq!(
            via_clamp.data, via_direct.data,
            "a value clamped to 256 must behave exactly like numColors=256"
        );
        assert_ne!(
            via_clamp.data, default_out.data,
            "clamped numColors must not silently fall back to the default"
        );
    }

    /// `iterations` must be read with `as_f64`, not `as_u64`, for the same
    /// reason as `numColors` above.
    #[test]
    fn iterations_accepts_a_float_tagged_value_instead_of_falling_back_to_default() {
        let frame = make_gradient_frame(48, 48);
        let dither = KMeansDither::new();

        let mut float_params = serde_json::Map::new();
        float_params.insert("numColors".into(), json!(6));
        float_params.insert("dither".into(), json!(false));
        float_params.insert("iterations".into(), json!(1.0));
        let mut int_params = serde_json::Map::new();
        int_params.insert("numColors".into(), json!(6));
        int_params.insert("dither".into(), json!(false));
        int_params.insert("iterations".into(), json!(1));

        let float_out = dither.process_frame(&frame, None, &float_params).unwrap();
        let int_out = dither.process_frame(&frame, None, &int_params).unwrap();
        assert_eq!(
            float_out.data, int_out.data,
            "iterations 1 and 1.0 must resolve identically"
        );
    }

    #[test]
    fn iterations_honours_a_clamp_then_read_round_trip() {
        let frame = make_gradient_frame(48, 48);
        let dither = KMeansDither::new();

        // Out of range (declared max is 50); clamp_params rewrites this to
        // the float-tagged representation that as_u64() cannot read.
        let mut raw = serde_json::Map::new();
        raw.insert("numColors".into(), json!(6));
        raw.insert("dither".into(), json!(false));
        raw.insert("iterations".into(), json!(99999));
        let clamped = crate::effects::clamp_params("dithering.kmeans", &raw);
        assert!(
            clamped["iterations"].is_f64(),
            "clamp_params should have rewritten the out-of-range value to a float"
        );

        let mut direct_max = serde_json::Map::new();
        direct_max.insert("numColors".into(), json!(6));
        direct_max.insert("dither".into(), json!(false));
        direct_max.insert("iterations".into(), json!(50));

        let via_clamp = dither.process_frame(&frame, None, &clamped).unwrap();
        let via_direct = dither.process_frame(&frame, None, &direct_max).unwrap();
        assert_eq!(
            via_clamp.data, via_direct.data,
            "a value clamped to 50 must behave exactly like iterations=50"
        );
    }

    /// The defining fix for the flicker bug (#5): a video-export segment
    /// must be quantized against ONE shared set of centroids, not centroids
    /// re-derived per frame from each frame's own content.
    ///
    /// An earlier version of this test used four SOLID, well-separated
    /// colors, one per frame. That fixture cannot actually distinguish a
    /// correct shared-palette implementation from a silently-reverted
    /// per-frame-independent one: a solid frame's true color is exactly
    /// recoverable from ANY palette containing it, whether that palette came
    /// from just that frame or from every frame merged, so both
    /// implementations produced byte-identical output and the assertions
    /// below passed either way -- proven by deriving both k-means runs by
    /// hand: with k equal to the number of pairwise-distinct colors, k-means++
    /// deterministically recovers each color as its own centroid regardless
    /// of whether the sample is one frame or all of them.
    ///
    /// This fixture uses two BIMODAL frames instead, each internally
    /// consistent but occupying a different brightness band: frame A is
    /// {10, 60} (a tight, dark pair), frame B is {190, 245} (a tight, light
    /// pair). With numColors=2:
    /// - processed INDEPENDENTLY, each frame's own 2-means recovers its own
    ///   two native tones exactly (10 and 60 for A; 190 and 245 for B) --
    ///   the two-cluster structure is already present within a single frame.
    /// - processed as ONE shared 2-means over the union {10,60,190,245}, the
    ///   optimal (lowest-cost) 2-way split groups the close pair against the
    ///   far pair -- {10,60} -> centroid ~35, {190,245} -> centroid ~217.5 --
    ///   verified by hand: that split's total squared error is 2762.5, versus
    ///   17266+ for every other possible 2-way split of those four values, so
    ///   k-means has no ambiguity to converge to a different answer.
    ///
    /// So under the shared palette, frame A's pixels (10 and 60) BOTH map to
    /// the single merged centroid ~35 -- a value neither of frame A's own
    /// pixels originally had -- which is exactly what a genuinely shared
    /// palette must do and a per-frame-independent implementation cannot.
    #[test]
    fn process_video_uses_one_shared_palette_for_the_whole_segment() {
        fn bimodal_frame(w: u32, h: u32, low: u8, high: u8) -> Frame {
            let mut data = Vec::with_capacity((w * h * 4) as usize);
            for i in 0..(w * h) {
                let v = if i % 2 == 0 { low } else { high };
                data.extend_from_slice(&[v, v, v, 255]);
            }
            Frame {
                width: w,
                height: h,
                data,
            }
        }

        let frame_a = bimodal_frame(16, 16, 10, 60);
        let frame_b = bimodal_frame(16, 16, 190, 245);
        let frames = vec![frame_a.clone(), frame_b.clone()];
        let segment = VideoSegment {
            frames: frames.clone(),
            fps: 24.0,
        };

        let dither = KMeansDither::new();
        assert!(
            dither.is_temporal(),
            "must be temporal so commands.rs routes export through process_video"
        );

        let mut params = serde_json::Map::new();
        params.insert("numColors".to_string(), json!(2));
        params.insert("dither".to_string(), json!(false));
        params.insert("iterations".to_string(), json!(10));

        let out = dither.process_video(&segment, None, &params).unwrap();

        // The whole segment must be drawn from ONE shared 2-color palette.
        let mut shared_colors = std::collections::HashSet::new();
        for f in &out.frames {
            for px in f.data.chunks_exact(4) {
                shared_colors.insert(px[0]);
            }
        }
        assert!(
            shared_colors.len() <= 2,
            "process_video must quantize every frame against ONE shared set of \
             centroids; got {} distinct grey levels across the segment, expected at most 2: {:?}",
            shared_colors.len(),
            shared_colors
        );

        // The decisive assertion: frame A's shared-palette output must differ
        // from what frame A produces on its own. If process_video silently
        // fell back to calling process_frame per frame internally (the
        // regression this test exists to catch), these would be
        // byte-identical, since process_frame is exactly what it would be
        // calling.
        let independent_a = dither.process_frame(&frame_a, None, &params).unwrap();
        assert_ne!(
            out.frames[0].data, independent_a.data,
            "frame A processed through process_video must reflect the segment's \
             SHARED palette, not the palette its own content alone would produce -- \
             identical output means process_video is not actually sharing a palette"
        );

        // And pin the actual shared value: frame A's two native tones (10, 60)
        // must have collapsed onto the SAME merged centroid, since the merged
        // 2-means groups the close dark pair together rather than splitting it.
        let frame_a_shared_values: std::collections::HashSet<u8> =
            out.frames[0].data.chunks_exact(4).map(|px| px[0]).collect();
        assert_eq!(
            frame_a_shared_values.len(),
            1,
            "frame A's two native tones (10 and 60) must both map to the single \
             merged dark-cluster centroid under the shared palette, not remain \
             distinct as they would under independent per-frame quantization: got {:?}",
            frame_a_shared_values
        );

        // Sanity check on the independent path: run on its own, frame A's
        // native bimodal structure is exactly what 2-means recovers.
        let mut independent_a_values = std::collections::HashSet::new();
        for px in independent_a.data.chunks_exact(4) {
            independent_a_values.insert(px[0]);
        }
        assert_eq!(
            independent_a_values.len(),
            2,
            "sanity check: frame A processed independently should recover its own \
             two native tones, demonstrating what the shared-palette fix avoids"
        );
    }
}
