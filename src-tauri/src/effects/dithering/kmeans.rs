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
fn kmeans(data: &[u8], k: usize, max_iters: usize) -> Vec<Centroid> {
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
    let mut centroids = kmeans_plus_plus_init(&pixels, k);

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

fn kmeans_plus_plus_init(pixels: &[(f64, f64, f64)], k: usize) -> Vec<Centroid> {
    use rand::Rng;
    let mut rng = rand::thread_rng();
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

    fn process_frame(
        &self,
        input: &Frame,
        _mask: Option<&Mask>,
        params: &ParameterValues,
    ) -> Result<Frame> {
        let k = params
            .get("numColors")
            .and_then(|v| v.as_u64())
            .unwrap_or(8) as usize;
        let dither = params
            .get("dither")
            .and_then(|v| v.as_bool())
            .unwrap_or(true);
        let max_iters = params
            .get("iterations")
            .and_then(|v| v.as_u64())
            .unwrap_or(10) as usize;

        let k = k.clamp(2, 256);
        let centroids = kmeans(&input.data, k, max_iters);

        let w = input.width as usize;
        let h = input.height as usize;

        if dither {
            // Floyd-Steinberg error diffusion with K-Means palette
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

                    let (nr, ng, nb) = nearest_centroid_color(&centroids, old_r, old_g, old_b);
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
            Ok(Frame {
                width: input.width,
                height: input.height,
                data,
            })
        } else {
            // Nearest-color quantization without dithering
            let mut data = input.data.clone();
            for chunk in data.chunks_exact_mut(4) {
                let (nr, ng, nb) = nearest_centroid_color(
                    &centroids,
                    chunk[0] as f64,
                    chunk[1] as f64,
                    chunk[2] as f64,
                );
                chunk[0] = nr;
                chunk[1] = ng;
                chunk[2] = nb;
            }
            Ok(Frame {
                width: input.width,
                height: input.height,
                data,
            })
        }
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

/// Extract a palette from a frame using K-Means and return the colors as RGB tuples.
/// Public API for the palette-extraction feature (#23).
pub fn extract_kmeans_palette(frame: &Frame, k: usize) -> Vec<(u8, u8, u8)> {
    let k = k.clamp(2, 256);
    let centroids = kmeans(&frame.data, k, 10);
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
}
