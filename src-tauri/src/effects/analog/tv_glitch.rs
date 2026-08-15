use crate::effects::types::*;
use crate::effects::Effect;
use crate::error::Result;
use serde_json::json;

/// Analog TV glitch — full NTSC composite video simulation.
/// Mirrors the GlitchNodes TvGlitch.py approach:
/// RGB→YIQ → chroma lowpass → subcarrier modulation into luma →
/// preemphasis → correlated IIR noise → chroma extraction →
/// chroma noise/phase/loss → YIQ→RGB → scanlines.
pub struct TvGlitch {
    _noise: f32,
    _amplitude: f32,
}

impl TvGlitch {
    pub fn new(noise: f32, amplitude: f32) -> Self {
        Self {
            _noise: noise.clamp(0.0, 1.0),
            _amplitude: amplitude.clamp(0.0, 1.0),
        }
    }
}

impl Default for TvGlitch {
    fn default() -> Self {
        Self::new(0.2, 0.3)
    }
}

/// Simple xorshift PRNG for deterministic per-frame noise.
struct Rng {
    state: u64,
}

impl Rng {
    fn new(seed: u64) -> Self {
        Self {
            state: if seed == 0 { 0x9E3779B97F4A7C15 } else { seed },
        }
    }
    fn next_u32(&mut self) -> u32 {
        let mut x = self.state;
        x ^= x << 13;
        x ^= x >> 7;
        x ^= x << 17;
        self.state = x;
        (x & 0xFFFFFFFF) as u32
    }
    fn next_f32(&mut self) -> f32 {
        self.next_u32() as f32 / u32::MAX as f32
    }
    fn next_range(&mut self, lo: i32, hi: i32) -> i32 {
        if hi <= lo {
            return lo;
        }
        lo + (self.next_u32() as i32).rem_euclid(hi - lo)
    }
}

/// First-order IIR lowpass applied along the x-axis (per row).
fn iir_lowpass_rows(buf: &mut [f32], w: usize, h: usize, alpha: f32, passes: usize) {
    let beta = 1.0 - alpha;
    for _ in 0..passes {
        for y in 0..h {
            let row_start = y * w;
            for x in 1..w {
                let prev = buf[row_start + x - 1];
                buf[row_start + x] = alpha * buf[row_start + x] + beta * prev;
            }
        }
    }
}

/// IIR random walk: noise[n] = 0.5 * noise[n-1] + delta[n]
fn iir_noise_signal(deltas: &[f32]) -> Vec<f32> {
    let mut out = vec![0.0f32; deltas.len()];
    if deltas.is_empty() {
        return out;
    }
    out[0] = deltas[0];
    for i in 1..deltas.len() {
        out[i] = 0.5 * out[i - 1] + deltas[i];
    }
    out
}

impl Effect for TvGlitch {
    fn meta(&self) -> EffectMeta {
        EffectMeta {
            id: "analog.tv_glitch".to_string(),
            name: "TV Glitch".to_string(),
            category: EffectCategory::Analog,
            media_type: MediaType::Both,
            parameters: vec![
                ParameterDef {
                    id: "subcarrier_amplitude".to_string(),
                    name: "Subcarrier Amplitude".to_string(),
                    param_type: ParamType::Slider,
                    default: json!(40.0),
                    min: Some(1.0),
                    max: Some(200.0),
                    step: Some(1.0),
                    options: None,
                },
                ParameterDef {
                    id: "video_noise".to_string(),
                    name: "Video Noise".to_string(),
                    param_type: ParamType::Slider,
                    default: json!(100.0),
                    min: Some(0.0),
                    max: Some(1000.0),
                    step: Some(10.0),
                    options: None,
                },
                ParameterDef {
                    id: "chroma_noise".to_string(),
                    name: "Chroma Noise".to_string(),
                    param_type: ParamType::Slider,
                    default: json!(100.0),
                    min: Some(0.0),
                    max: Some(1000.0),
                    step: Some(10.0),
                    options: None,
                },
                ParameterDef {
                    id: "chroma_phase_noise".to_string(),
                    name: "Chroma Phase Noise".to_string(),
                    param_type: ParamType::Slider,
                    default: json!(15.0),
                    min: Some(0.0),
                    max: Some(100.0),
                    step: Some(1.0),
                    options: None,
                },
                ParameterDef {
                    id: "chroma_loss".to_string(),
                    name: "Chroma Loss".to_string(),
                    param_type: ParamType::Slider,
                    default: json!(0.24),
                    min: Some(0.0),
                    max: Some(1.0),
                    step: Some(0.01),
                    options: None,
                },
                ParameterDef {
                    id: "preemphasis".to_string(),
                    name: "Composite Preemphasis".to_string(),
                    param_type: ParamType::Slider,
                    default: json!(1.0),
                    min: Some(0.0),
                    max: Some(10.0),
                    step: Some(0.1),
                    options: None,
                },
                ParameterDef {
                    id: "scanlines".to_string(),
                    name: "Scanlines".to_string(),
                    param_type: ParamType::Slider,
                    default: json!(1.5),
                    min: Some(1.0),
                    max: Some(5.0),
                    step: Some(0.1),
                    options: None,
                },
            ],
        }
    }

    fn uses_time_param(&self) -> bool {
        true
    }

    fn process_frame(
        &self,
        input: &Frame,
        _m: Option<&Mask>,
        params: &ParameterValues,
    ) -> Result<Frame> {
        let subcarrier_amplitude = params
            .get("subcarrier_amplitude")
            .and_then(|v| v.as_f64())
            .unwrap_or(40.0) as f32;
        let video_noise = params
            .get("video_noise")
            .and_then(|v| v.as_f64())
            .unwrap_or(100.0) as i32;
        let chroma_noise_amt = params
            .get("chroma_noise")
            .and_then(|v| v.as_f64())
            .unwrap_or(100.0) as i32;
        let chroma_phase_noise = params
            .get("chroma_phase_noise")
            .and_then(|v| v.as_f64())
            .unwrap_or(15.0) as i32;
        let chroma_loss = params
            .get("chroma_loss")
            .and_then(|v| v.as_f64())
            .unwrap_or(0.24) as f32;
        let preemphasis = params
            .get("preemphasis")
            .and_then(|v| v.as_f64())
            .unwrap_or(1.0) as f32;
        let scanlines_scale = params
            .get("scanlines")
            .and_then(|v| v.as_f64())
            .unwrap_or(1.5) as f32;
        let time = params.get("time").and_then(|v| v.as_f64()).unwrap_or(0.0) as u64;
        let w = input.width as usize;
        let h = input.height as usize;
        let mut rng = Rng::new(time.wrapping_mul(2654435761).wrapping_add(12345));

        // --- Step 1: RGB → YIQ ---
        let mut f_y = vec![0.0f32; w * h];
        let mut f_i = vec![0.0f32; w * h];
        let mut f_q = vec![0.0f32; w * h];
        for y in 0..h {
            for x in 0..w {
                let idx = (y * w + x) * 4;
                let r = input.data[idx] as f32;
                let g = input.data[idx + 1] as f32;
                let b = input.data[idx + 2] as f32;
                let p = y * w + x;
                f_y[p] = (0.299 * r + 0.587 * g + 0.114 * b) * 256.0;
                f_i[p] = (0.596 * r - 0.274 * g - 0.322 * b) * 256.0;
                f_q[p] = (0.211 * r - 0.523 * g + 0.312 * b) * 256.0;
            }
        }

        // --- Step 2: Composite lowpass on chroma (I and Q) ---
        // I channel: cutoff 1.3MHz, delay 2; Q channel: cutoff 600kHz, delay 4
        // Using simplified alpha values derived from NTSC rate
        let alpha_i = 0.12f32;
        let alpha_q = 0.06f32;
        iir_lowpass_rows(&mut f_i, w, h, alpha_i, 3);
        iir_lowpass_rows(&mut f_q, w, h, alpha_q, 3);

        // --- Step 3: Modulate chroma into luma (subcarrier) ---
        // Pattern: [1, 0, -1, 0] for I, [0, 1, 0, -1] for Q
        for y in 0..h {
            for x in 0..w {
                let p = y * w + x;
                let phase = x % 4;
                let pat_u = match phase {
                    0 => 1.0,
                    2 => -1.0,
                    _ => 0.0,
                };
                let pat_v = match phase {
                    1 => 1.0,
                    3 => -1.0,
                    _ => 0.0,
                };
                let chroma =
                    f_i[p] * subcarrier_amplitude * pat_u + f_q[p] * subcarrier_amplitude * pat_v;
                f_y[p] += chroma / 50.0;
                f_i[p] = 0.0;
                f_q[p] = 0.0;
            }
        }

        // --- Step 4: Composite pre-emphasis (highpass) ---
        if preemphasis != 0.0 {
            let mut lowpassed = f_y.clone();
            iir_lowpass_rows(&mut lowpassed, w, h, 0.02, 1);
            for i in 0..f_y.len() {
                let highpassed = f_y[i] - lowpassed[i];
                f_y[i] += highpassed * preemphasis;
            }
        }

        // --- Step 5: Video noise (IIR random walk) ---
        if video_noise != 0 {
            let noise_mod = video_noise * 2 + 1;
            let mut deltas = vec![0.0f32; w * h];
            for delta in &mut deltas {
                *delta = rng.next_range(0, noise_mod) as f32 - video_noise as f32;
            }
            let noise_signal = iir_noise_signal(&deltas);
            for i in 0..f_y.len() {
                f_y[i] += noise_signal[i];
            }
        }

        // --- Step 6: Extract chroma from luma (demodulate) ---
        // 4-tap moving average → smoothed luma, difference = chroma
        let mut smoothed = vec![0.0f32; w * h];
        for y in 0..h {
            let row_start = y * w;
            for x in 0..w {
                let mut sum = 0.0f32;
                let mut count = 0;
                for dx in -2..=1 {
                    let sx = x as isize + dx;
                    if sx >= 0 && sx < w as isize {
                        sum += f_y[row_start + sx as usize];
                        count += 1;
                    }
                }
                smoothed[row_start + x] = sum / count as f32;
            }
        }
        // chroma = luma - smoothed; sign flip pattern [1,1,-1,-1]
        let mut chroma = vec![0.0f32; w * h];
        for y in 0..h {
            for x in 0..w {
                let p = y * w + x;
                chroma[p] = f_y[p] - smoothed[p];
                f_y[p] = smoothed[p];
                let sign = match x % 4 {
                    0 | 1 => 1.0,
                    _ => -1.0,
                };
                chroma[p] *= sign;
                chroma[p] = chroma[p] * 50.0 / subcarrier_amplitude;
            }
        }
        // Assign I and Q from interleaved chroma
        for y in 0..h {
            for x in (0..w).step_by(2) {
                let p = y * w + x;
                f_i[p] = -chroma[p];
                if x + 1 < w {
                    f_q[p] = -chroma[y * w + x + 1];
                }
            }
            // Interpolate odd positions
            for x in (1..w).step_by(2) {
                let p = y * w + x;
                let prev = if x > 0 { f_i[y * w + x - 1] } else { 0.0 };
                let next = if x + 1 < w { f_i[y * w + x + 1] } else { prev };
                f_i[p] = (prev + next) / 2.0;
                let prev_q = if x > 0 { f_q[y * w + x - 1] } else { 0.0 };
                let next_q = if x + 1 < w {
                    f_q[y * w + x + 1]
                } else {
                    prev_q
                };
                f_q[p] = (prev_q + next_q) / 2.0;
            }
        }

        // --- Step 7: Chroma noise ---
        if chroma_noise_amt != 0 {
            let noise_mod = chroma_noise_amt * 2 + 1;
            let mut deltas_i = vec![0.0f32; w * h];
            let mut deltas_q = vec![0.0f32; w * h];
            for i in 0..deltas_i.len() {
                deltas_i[i] = rng.next_range(0, noise_mod) as f32 - chroma_noise_amt as f32;
                deltas_q[i] = rng.next_range(0, noise_mod) as f32 - chroma_noise_amt as f32;
            }
            let noise_i = iir_noise_signal(&deltas_i);
            let noise_q = iir_noise_signal(&deltas_q);
            for i in 0..f_i.len() {
                f_i[i] += noise_i[i];
                f_q[i] += noise_q[i];
            }
        }

        // --- Step 8: Chroma phase noise (per-row rotation) ---
        if chroma_phase_noise != 0 {
            let noise_mod = chroma_phase_noise * 2 + 1;
            let mut deltas = vec![0.0f32; h];
            for delta in deltas.iter_mut().take(h) {
                *delta = rng.next_range(0, noise_mod) as f32 - chroma_phase_noise as f32;
            }
            let row_noise = iir_noise_signal(&deltas);
            for (y, &noise_val) in row_noise.iter().enumerate().take(h) {
                let pi_val = noise_val * std::f32::consts::PI / 100.0;
                let sin_p = pi_val.sin();
                let cos_p = pi_val.cos();
                for x in 0..w {
                    let p = y * w + x;
                    let u = f_i[p];
                    let v = f_q[p];
                    f_i[p] = u * cos_p - v * sin_p;
                    f_q[p] = u * sin_p + v * cos_p;
                }
            }
        }

        // --- Step 9: Chroma loss (random rows drop color) ---
        if chroma_loss > 0.0 {
            for y in 0..h {
                if rng.next_f32() < chroma_loss {
                    for x in 0..w {
                        let p = y * w + x;
                        f_i[p] = 0.0;
                        f_q[p] = 0.0;
                    }
                }
            }
        }

        // --- Step 10: YIQ → RGB ---
        let mut data = vec![0u8; w * h * 4];
        for y in 0..h {
            for x in 0..w {
                let p = y * w + x;
                let y_val = f_y[p] / 256.0;
                let i_val = f_i[p] / 256.0;
                let q_val = f_q[p] / 256.0;
                let r = y_val + 0.956 * i_val + 0.621 * q_val;
                let g = y_val - 0.272 * i_val - 0.647 * q_val;
                let b = y_val - 1.106 * i_val + 1.703 * q_val;
                let idx = (y * w + x) * 4;
                data[idx] = r.clamp(0.0, 255.0) as u8;
                data[idx + 1] = g.clamp(0.0, 255.0) as u8;
                data[idx + 2] = b.clamp(0.0, 255.0) as u8;
                data[idx + 3] = input.data[idx + 3]; // preserve alpha
            }
        }

        // --- Step 11: Scanlines ---
        if scanlines_scale > 1.0 {
            let small_h = (h as f32 / scanlines_scale).max(1.0) as usize;
            let small_w = (w as f32 / scanlines_scale).max(1.0) as usize;
            // Downscale then upscale for blur effect
            let blurred = downscale_upscale(&data, w, h, small_w, small_h);
            // Scanline color overlay: every 3rd row gets a color tint
            for y in 0..h {
                let color_ch = y % 3;
                let tint = 0.8 + rng.next_f32() * 0.1; // 0.8-0.9
                for x in 0..w {
                    let idx = (y * w + x) * 4;
                    let blend = 0.7 * data[idx + color_ch] as f32
                        + 0.3 * blurred[idx + color_ch] as f32
                        + 0.15 * tint * 255.0;
                    data[idx] = (0.7 * data[idx] as f32 + 0.3 * blurred[idx] as f32)
                        .clamp(0.0, 255.0) as u8;
                    data[idx + 1] = (0.7 * data[idx + 1] as f32 + 0.3 * blurred[idx + 1] as f32)
                        .clamp(0.0, 255.0) as u8;
                    data[idx + 2] = (0.7 * data[idx + 2] as f32 + 0.3 * blurred[idx + 2] as f32)
                        .clamp(0.0, 255.0) as u8;
                    data[idx + color_ch] = blend.clamp(0.0, 255.0) as u8;
                }
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

/// Simple bilinear downscale then upscale for scanline blur.
fn downscale_upscale(data: &[u8], w: usize, h: usize, sw: usize, sh: usize) -> Vec<u8> {
    let mut small = vec![0.0f32; sw * sh * 3];
    // Downscale (average)
    let x_ratio = w as f32 / sw as f32;
    let y_ratio = h as f32 / sh as f32;
    for sy in 0..sh {
        for sx in 0..sw {
            let x0 = (sx as f32 * x_ratio) as usize;
            let y0 = (sy as f32 * y_ratio) as usize;
            let x1 = (x0 + 1).min(w - 1);
            let y1 = (y0 + 1).min(h - 1);
            for c in 0..3 {
                let val = (data[(y0 * w + x0) * 4 + c] as f32
                    + data[(y0 * w + x1) * 4 + c] as f32
                    + data[(y1 * w + x0) * 4 + c] as f32
                    + data[(y1 * w + x1) * 4 + c] as f32)
                    / 4.0;
                small[(sy * sw + sx) * 3 + c] = val;
            }
        }
    }
    // Upscale (nearest neighbor)
    let mut out = vec![0u8; w * h * 4];
    for y in 0..h {
        for x in 0..w {
            let sx = ((x as f32 / x_ratio) as usize).min(sw - 1);
            let sy = ((y as f32 / y_ratio) as usize).min(sh - 1);
            for c in 0..3 {
                out[(y * w + x) * 4 + c] = small[(sy * sw + sx) * 3 + c].clamp(0.0, 255.0) as u8;
            }
        }
    }
    out
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_tv_glitch_preserves_dimensions() {
        let d = vec![128u8; 16 * 4];
        let f = Frame {
            width: 4,
            height: 4,
            data: d,
        };
        let e = TvGlitch::new(0.5, 0.5);
        let r = e.process_frame(&f, None, &serde_json::Map::new()).unwrap();
        assert_eq!(r.width, 4);
        assert_eq!(r.height, 4);
        assert_eq!(r.data.len(), 16 * 4);
    }

    #[test]
    fn test_tv_glitch_preserves_alpha() {
        let mut d = vec![128u8; 16 * 4];
        for i in (3..d.len()).step_by(4) {
            d[i] = 200;
        }
        let f = Frame {
            width: 4,
            height: 4,
            data: d,
        };
        let e = TvGlitch::new(0.5, 0.5);
        let r = e.process_frame(&f, None, &serde_json::Map::new()).unwrap();
        for i in (3..r.data.len()).step_by(4) {
            assert_eq!(
                r.data[i],
                200,
                "Alpha should be preserved at pixel {}",
                i / 4
            );
        }
    }

    #[test]
    fn test_tv_glitch_modifies_pixels() {
        let d = vec![128u8; 64 * 4];
        let f = Frame {
            width: 8,
            height: 8,
            data: d,
        };
        let e = TvGlitch::new(0.5, 0.5);
        let mut params = serde_json::Map::new();
        params.insert("video_noise".to_string(), json!(200));
        params.insert("chroma_noise".to_string(), json!(200));
        let r = e.process_frame(&f, None, &params).unwrap();
        let mut changed = false;
        for i in 0..r.data.len() / 4 {
            if r.data[i * 4] != 128 {
                changed = true;
                break;
            }
        }
        assert!(changed, "TV glitch with noise should alter pixel values");
    }
}
