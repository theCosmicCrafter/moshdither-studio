use crate::effects::types::*;
use crate::effects::Effect;
use crate::error::Result;
use rand::rngs::StdRng;
use rand::{Rng, SeedableRng};
use serde_json::json;

const BN_SIZE: usize = 64;
const BN_N: usize = BN_SIZE * BN_SIZE;
/// Gaussian sigma for the void-and-cluster energy filter (Ulichney used ~1.5).
const BN_SIGMA: f32 = 1.9;

/// Blue noise dithering using a true void-and-cluster threshold matrix
/// (Ulichney 1993). The 64x64 rank matrix is generated deterministically at
/// construction time and reused for every frame.
pub struct BlueNoiseDither {
    noise: Vec<u8>,
}

/// Precomputed toroidal Gaussian kernel: kernel[dy][dx] = exp(-d^2 / 2σ^2)
/// where d is the wrapped distance between two pixels.
fn gaussian_kernel() -> Vec<f32> {
    let mut kernel = vec![0.0f32; BN_N];
    for dy in 0..BN_SIZE {
        for dx in 0..BN_SIZE {
            let wx = dx.min(BN_SIZE - dx) as f32;
            let wy = dy.min(BN_SIZE - dy) as f32;
            let d2 = wx * wx + wy * wy;
            kernel[dy * BN_SIZE + dx] = (-d2 / (2.0 * BN_SIGMA * BN_SIGMA)).exp();
        }
    }
    kernel
}

/// Add or subtract the kernel centered at (cx, cy) into the energy field.
fn splat(energy: &mut [f32], kernel: &[f32], cx: usize, cy: usize, sign: f32) {
    for y in 0..BN_SIZE {
        let dy = (y + BN_SIZE - cy) % BN_SIZE;
        for x in 0..BN_SIZE {
            let dx = (x + BN_SIZE - cx) % BN_SIZE;
            energy[y * BN_SIZE + x] += sign * kernel[dy * BN_SIZE + dx];
        }
    }
}

/// Index of the "tightest cluster": the minority pixel with maximum energy.
fn tightest_cluster(pattern: &[bool], energy: &[f32]) -> usize {
    let mut best = usize::MAX;
    let mut best_e = f32::NEG_INFINITY;
    for (i, &on) in pattern.iter().enumerate() {
        if on && energy[i] > best_e {
            best_e = energy[i];
            best = i;
        }
    }
    best
}

/// Index of the "largest void": the non-minority pixel with minimum energy.
fn largest_void(pattern: &[bool], energy: &[f32]) -> usize {
    let mut best = usize::MAX;
    let mut best_e = f32::INFINITY;
    for (i, &on) in pattern.iter().enumerate() {
        if !on && energy[i] < best_e {
            best_e = energy[i];
            best = i;
        }
    }
    best
}

/// Generate a 64x64 blue-noise rank matrix with the void-and-cluster method.
fn generate_void_and_cluster() -> Vec<u8> {
    let kernel = gaussian_kernel();
    // Deterministic seed so preview/export and repeated runs are identical.
    let mut rng = StdRng::seed_from_u64(0xB10E_0B00_u64.wrapping_mul(0x9E37_79B9_7F4A_7C15));

    // Initial binary pattern: ~10% minority pixels placed at random.
    let ones_count = BN_N / 10;
    let mut pattern = vec![false; BN_N];
    let mut energy = vec![0.0f32; BN_N];
    let mut placed = 0;
    while placed < ones_count {
        let i = rng.gen_range(0..BN_N);
        if !pattern[i] {
            pattern[i] = true;
            splat(&mut energy, &kernel, i % BN_SIZE, i / BN_SIZE, 1.0);
            placed += 1;
        }
    }

    // Relax the initial pattern: move tightest cluster into largest void
    // until the pattern is stable (swap would undo itself).
    loop {
        let c = tightest_cluster(&pattern, &energy);
        pattern[c] = false;
        splat(&mut energy, &kernel, c % BN_SIZE, c / BN_SIZE, -1.0);
        let v = largest_void(&pattern, &energy);
        pattern[v] = true;
        splat(&mut energy, &kernel, v % BN_SIZE, v / BN_SIZE, 1.0);
        if v == c {
            break;
        }
    }

    let prototype = pattern.clone();
    let proto_energy = energy.clone();
    let mut rank = vec![0u32; BN_N];

    // Phase 1: rank the initial minority pixels by repeatedly removing the
    // tightest cluster (ranks ones_count-1 down to 0).
    {
        let mut pat = prototype.clone();
        let mut en = proto_energy.clone();
        for r in (0..ones_count).rev() {
            let c = tightest_cluster(&pat, &en);
            pat[c] = false;
            splat(&mut en, &kernel, c % BN_SIZE, c / BN_SIZE, -1.0);
            rank[c] = r as u32;
        }
    }

    // Phase 2: insert into the largest void until half the pixels are set.
    let mut pat = prototype;
    let mut en = proto_energy;
    for r in ones_count..(BN_N / 2) {
        let v = largest_void(&pat, &en);
        pat[v] = true;
        splat(&mut en, &kernel, v % BN_SIZE, v / BN_SIZE, 1.0);
        rank[v] = r as u32;
    }

    // Phase 3: past 50%, the zeros become the minority. Track the energy of
    // the zero pixels and repeatedly remove the tightest cluster of zeros.
    let mut zero_energy = vec![0.0f32; BN_N];
    for (i, &on) in pat.iter().enumerate() {
        if !on {
            splat(&mut zero_energy, &kernel, i % BN_SIZE, i / BN_SIZE, 1.0);
        }
    }
    for r in (BN_N / 2)..BN_N {
        // The tightest cluster of zeros is the zero pixel with max zero-energy.
        let mut best = usize::MAX;
        let mut best_e = f32::NEG_INFINITY;
        for i in 0..BN_N {
            if !pat[i] && zero_energy[i] > best_e {
                best_e = zero_energy[i];
                best = i;
            }
        }
        pat[best] = true;
        splat(
            &mut zero_energy,
            &kernel,
            best % BN_SIZE,
            best / BN_SIZE,
            -1.0,
        );
        rank[best] = r as u32;
    }

    // Normalize ranks 0..N-1 evenly to 0..255 threshold values.
    rank.iter()
        .map(|&r| ((r * 256) / BN_N as u32).min(255) as u8)
        .collect()
}

impl BlueNoiseDither {
    pub fn new() -> Self {
        Self {
            noise: generate_void_and_cluster(),
        }
    }
}

impl Default for BlueNoiseDither {
    fn default() -> Self {
        Self::new()
    }
}

impl Effect for BlueNoiseDither {
    fn meta(&self) -> EffectMeta {
        EffectMeta {
            id: "dithering.blue_noise".to_string(),
            name: "Blue Noise".to_string(),
            category: EffectCategory::Dithering,
            media_type: MediaType::Image,
            parameters: vec![ParameterDef {
                id: "strength".to_string(),
                name: "Strength".to_string(),
                param_type: ParamType::Slider,
                default: json!(1.0),
                min: Some(0.0),
                max: Some(2.0),
                step: Some(0.1),
                options: None,
            }],
        }
    }

    fn process_frame(
        &self,
        input: &Frame,
        _mask: Option<&Mask>,
        params: &ParameterValues,
    ) -> Result<Frame> {
        let strength = params
            .get("strength")
            .and_then(|v| v.as_f64())
            .unwrap_or(1.0) as f32;
        let w = input.width as usize;
        let h = input.height as usize;
        let mut data = input.data.clone();

        for y in 0..h {
            for x in 0..w {
                let idx = (y * w + x) * 4;
                let threshold = self.noise[(y % 64) * 64 + (x % 64)] as f32;
                let lum = crate::effects::luminance_f32(data[idx], data[idx + 1], data[idx + 2]);
                // Apply strength: higher strength pushes more pixels to extremes
                let adjusted = if strength > 1.0 {
                    let center = 128.0;
                    center + (lum - center) * strength
                } else {
                    lum
                };
                let color = if adjusted > threshold { 255 } else { 0 };
                data[idx] = color;
                data[idx + 1] = color;
                data[idx + 2] = color;
            }
        }

        Ok(Frame {
            width: input.width,
            height: input.height,
            data,
        })
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

    fn make_gray_frame(width: u32, height: u32, gray: u8) -> Frame {
        let mut data = Vec::with_capacity((width * height * 4) as usize);
        for _ in 0..(width * height) {
            data.push(gray);
            data.push(gray);
            data.push(gray);
            data.push(255);
        }
        Frame {
            width,
            height,
            data,
        }
    }

    #[test]
    fn test_blue_noise_produces_pattern() {
        let dither = BlueNoiseDither::new();
        let frame = make_gray_frame(64, 64, 128);
        let result = dither
            .process_frame(&frame, None, &serde_json::Map::new())
            .unwrap();

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
        assert!(has_black && has_white);
    }

    #[test]
    fn test_blue_noise_strength() {
        let dither = BlueNoiseDither::new();
        let frame = make_gray_frame(32, 32, 128);
        let mut params = serde_json::Map::new();
        params.insert("strength".to_string(), json!(2.0));
        let r = dither.process_frame(&frame, None, &params).unwrap();
        assert_eq!(r.width, 32);
    }

    #[test]
    fn test_rank_matrix_is_uniform() {
        // A true threshold (rank) matrix uses every threshold level evenly:
        // each of the 256 possible u8 values must appear exactly N/256 times.
        let matrix = generate_void_and_cluster();
        assert_eq!(matrix.len(), BN_N);
        let mut counts = [0usize; 256];
        for &v in &matrix {
            counts[v as usize] += 1;
        }
        let expected = BN_N / 256;
        for (v, &c) in counts.iter().enumerate() {
            assert!(
                c == expected || c == expected + 1,
                "threshold {v} appears {c} times, expected ~{expected}"
            );
        }
    }

    #[test]
    fn test_blue_noise_spatial_distribution() {
        // Blue noise has no low-frequency energy: the darkest 10% of
        // thresholds must be spread apart, never adjacent in tight clumps.
        // Measure: for the lowest-decile pixels, count 8-neighbor pairs that
        // are both in the lowest decile. For void-and-cluster output this is
        // near zero; for white noise it would be ~10% of neighbor pairs.
        let matrix = generate_void_and_cluster();
        let cutoff = 25u8; // ~lowest 10% of 0-255
        let mut low_pixels = 0usize;
        let mut adjacent_low_pairs = 0usize;
        for y in 0..BN_SIZE {
            for x in 0..BN_SIZE {
                if matrix[y * BN_SIZE + x] > cutoff {
                    continue;
                }
                low_pixels += 1;
                for (dx, dy) in [(1i32, 0i32), (0, 1), (1, 1), (1, -1)] {
                    let nx = ((x as i32 + dx).rem_euclid(BN_SIZE as i32)) as usize;
                    let ny = ((y as i32 + dy).rem_euclid(BN_SIZE as i32)) as usize;
                    if matrix[ny * BN_SIZE + nx] <= cutoff {
                        adjacent_low_pairs += 1;
                    }
                }
            }
        }
        assert!(low_pixels > 0);
        let clumping = adjacent_low_pairs as f64 / (low_pixels as f64 * 4.0);
        // White noise would give clumping ≈ 0.10. Blue noise should be far lower.
        assert!(
            clumping < 0.05,
            "low-threshold pixels are clumped (ratio {clumping:.3}); not blue noise"
        );
    }
}
