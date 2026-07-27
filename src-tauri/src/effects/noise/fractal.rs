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
                ParameterDef {
                    id: "amount".to_string(),
                    name: "Amount".to_string(),
                    param_type: ParamType::Slider,
                    default: json!(5.0),
                    min: Some(0.0),
                    max: Some(10.0),
                    step: Some(0.1),
                    options: None,
                },
            ],
        }
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
