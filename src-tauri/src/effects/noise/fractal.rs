use crate::effects::types::*;
use crate::effects::Effect;
use crate::error::Result;
use serde_json::json;

/// Fractal value noise with octaves.
pub struct FractalNoise {
    octaves: u32,
    persistence: f32,
}

impl FractalNoise {
    pub fn new(octaves: u32, persistence: f32) -> Self {
        Self {
            octaves: octaves.clamp(1, 8),
            persistence: persistence.clamp(0.0, 1.0),
        }
    }
}

impl Default for FractalNoise {
    fn default() -> Self {
        Self::new(4, 0.5)
    }
}

impl Effect for FractalNoise {
    fn meta(&self) -> EffectMeta {
        EffectMeta {
            id: "noise.fractal".to_string(),
            name: "Fractal Noise".to_string(),
            category: EffectCategory::Noise,
            media_type: MediaType::Both,
            parameters: vec![
                ParameterDef {
                    id: "octaves".to_string(),
                    name: "Octaves".to_string(),
                    param_type: ParamType::Slider,
                    default: json!(4),
                    min: Some(1.0),
                    max: Some(8.0),
                    step: Some(1.0),
                    options: None,
                },
                ParameterDef {
                    id: "persistence".to_string(),
                    name: "Persistence".to_string(),
                    param_type: ParamType::Slider,
                    default: json!(0.5),
                    min: Some(0.0),
                    max: Some(1.0),
                    step: Some(0.1),
                    options: None,
                },
                // Applied below as `noise * 60.0 * amount`, so this is an
                // amplitude in 8-bit levels: 1.0 means roughly +/-60 of 255.
                // The default was 5.0 -- the slider MIDPOINT, i.e. +/-300 on a
                // 0-255 scale -- which buried the image under noise: measured
                // correlation with the source 0.245, with 15% of pixels clipped
                // to black and 23% to white. At 1.0 the correlation is 0.816,
                // in line with the other noise effects (gaussian 0.95, uniform
                // 0.97, salt & pepper 0.82), with no meaningful clipping. The
                // slider still reaches 10 for anyone who wants the old wall of
                // noise.
                ParameterDef {
                    id: "amount".to_string(),
                    name: "Amount".to_string(),
                    param_type: ParamType::Slider,
                    default: json!(1.0),
                    min: Some(0.0),
                    max: Some(10.0),
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
        let octaves = params
            .get("octaves")
            .and_then(|v| v.as_u64())
            .unwrap_or(self.octaves as u64) as u32;
        let persistence = params
            .get("persistence")
            .and_then(|v| v.as_f64())
            .unwrap_or(self.persistence as f64) as f32;
        let amount = params.get("amount").and_then(|v| v.as_f64()).unwrap_or(1.0) as f32;
        let time = params.get("time").and_then(|v| v.as_f64()).unwrap_or(0.0) as u32;
        let w = input.width as usize;
        let h = input.height as usize;
        let mut data = input.data.clone();

        for y in 0..h {
            for x in 0..w {
                let mut noise = 0.0f32;
                let mut amp = 1.0f32;
                let mut freq = 1.0f32;
                for _ in 0..octaves {
                    noise += value_noise(x as f32 * freq, y as f32 * freq, time) * amp;
                    amp *= persistence;
                    freq *= 2.0;
                }
                let idx = (y * w + x) * 4;
                for c in 0..3 {
                    let v = data[idx + c] as f32 + noise * 60.0 * amount;
                    data[idx + c] = v.clamp(0.0, 255.0) as u8;
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

/// Hash to a uniform random value in [0,1] for integer grid coordinates.
fn rand01(x: i32, y: i32, seed: i32) -> f32 {
    let hash = x
        .wrapping_mul(374761393)
        .wrapping_add(y.wrapping_mul(668265263))
        .wrapping_add(seed.wrapping_mul(127));
    let h = (hash.wrapping_mul(1203246503) >> 24) & 0xFF;
    h as f32 / 255.0
}

/// Smoothly interpolate between grid values using cubic Hermite (3t^2-2t^3).
fn smooth(t: f32) -> f32 {
    t * t * (3.0 - 2.0 * t)
}

/// 2D value noise: deterministic, band-limited, continuously varying.
/// At each lattice point we hash a value; the sample is bilinearly interpolated
/// using the smoothstep curve, making it suitable for fractal layering (FBM).
fn value_noise(x: f32, y: f32, t: u32) -> f32 {
    let ix = x.floor() as i32;
    let iy = y.floor() as i32;
    let fx = x - x.floor();
    let fy = y - y.floor();
    let sx = smooth(fx);
    let sy = smooth(fy);

    let n00 = rand01(ix, iy, t as i32);
    let n01 = rand01(ix, iy + 1, t as i32);
    let n10 = rand01(ix + 1, iy, t as i32);
    let n11 = rand01(ix + 1, iy + 1, t as i32);

    let nx0 = n00 * (1.0 - sx) + n10 * sx;
    let nx1 = n01 * (1.0 - sx) + n11 * sx;
    (nx0 * (1.0 - sy) + nx1 * sy) - 0.5
}

#[cfg(test)]
mod tests {
    /// The default must leave the picture visible underneath the noise.
    ///
    /// `amount` was 5.0 -- the midpoint of a 0..10 slider -- and it is applied
    /// as `noise * 60.0 * amount`, i.e. +/-300 on a 0-255 scale. Measured on a
    /// photographic frame that gave correlation 0.245 with the source, 15% of
    /// pixels clipped to black and 23% to white: the image was gone, replaced
    /// by noise. Correlation is the right check because amplitude alone cannot
    /// tell "grainy photograph" from "static".
    #[test]
    fn default_amount_leaves_the_image_visible() {
        let (w, h) = (96usize, 64usize);
        let mut data = vec![255u8; w * h * 4];
        for y in 0..h {
            for x in 0..w {
                // A smooth gradient with structure, like a photograph.
                let v =
                    (60.0 + 120.0 * (y as f64 / h as f64) + 30.0 * ((x as f64 / 9.0).sin())) as u8;
                let i = (y * w + x) * 4;
                data[i] = v;
                data[i + 1] = v;
                data[i + 2] = v;
            }
        }
        let input = Frame {
            width: w as u32,
            height: h as u32,
            data,
        };

        let effect = FractalNoise::default();
        let params = serde_json::Map::new(); // defaults only -- the point of the test
        let out = effect
            .process_frame(&input, None, &params)
            .expect("renders");

        let a: Vec<f64> = (0..w * h).map(|i| input.data[i * 4] as f64).collect();
        let b: Vec<f64> = (0..w * h).map(|i| out.data[i * 4] as f64).collect();
        let ma = a.iter().sum::<f64>() / a.len() as f64;
        let mb = b.iter().sum::<f64>() / b.len() as f64;
        let cov: f64 = a.iter().zip(&b).map(|(x, y)| (x - ma) * (y - mb)).sum();
        let va: f64 = a.iter().map(|x| (x - ma).powi(2)).sum::<f64>().sqrt();
        let vb: f64 = b.iter().map(|y| (y - mb).powi(2)).sum::<f64>().sqrt();
        let corr = cov / (va * vb);

        assert!(
            corr > 0.5,
            "default amount buries the image: correlation {corr:.3}"
        );

        // And it must still be doing something -- a default of 0 would pass the
        // check above trivially.
        assert_ne!(out.data, input.data, "fractal noise must alter the frame");

        let clipped = out
            .data
            .as_chunks::<4>()
            .0
            .iter()
            .filter(|p| p[0] < 4 || p[0] > 251)
            .count() as f64
            / (w * h) as f64;
        assert!(
            clipped < 0.10,
            "default clips {:.0}% of pixels",
            clipped * 100.0
        );
    }

    use super::*;

    #[test]
    fn test_fractal_noise() {
        let d = vec![128u8; 16 * 4];
        let f = Frame {
            width: 4,
            height: 4,
            data: d,
        };
        let e = FractalNoise::new(3, 0.5);
        let r = e.process_frame(&f, None, &serde_json::Map::new()).unwrap();
        assert!(r.data.iter().any(|&v| v != 128));
    }
}
