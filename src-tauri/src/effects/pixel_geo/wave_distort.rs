use crate::effects::types::*;
use crate::effects::Effect;
use crate::error::Result;
use serde_json::json;

/// Sine wave horizontal distortion.
pub struct WaveDistort {
    amplitude: f32,
    frequency: f32,
}

impl WaveDistort {
    pub fn new(amplitude: f32, frequency: f32) -> Self {
        Self { amplitude, frequency }
    }
}

impl Default for WaveDistort {
    fn default() -> Self {
        Self::new(10.0, 0.05)
    }
}

impl Effect for WaveDistort {
    fn meta(&self) -> EffectMeta {
        EffectMeta {
            id: "pixel_geo.wave_distort".to_string(),
            name: "Wave Distort".to_string(),
            category: EffectCategory::PixelGeometry,
            media_type: MediaType::Image,
            parameters: vec![
                ParameterDef {
                    id: "amplitude".to_string(),
                    name: "Amplitude".to_string(),
                    param_type: ParamType::Slider,
                    default: json!(10.0),
                    min: Some(0.0),
                    max: Some(50.0),
                    step: Some(1.0),
                    options: None,
                },
                ParameterDef {
                    id: "frequency".to_string(),
                    name: "Frequency".to_string(),
                    param_type: ParamType::Slider,
                    default: json!(0.05),
                    min: Some(0.0),
                    max: Some(0.2),
                    step: Some(0.01),
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
        let amplitude = params.get("amplitude").and_then(|v| v.as_f64()).unwrap_or(self.amplitude as f64) as f32;
        let frequency = params.get("frequency").and_then(|v| v.as_f64()).unwrap_or(self.frequency as f64) as f32;
        let time = params.get("time").and_then(|v| v.as_f64()).unwrap_or(0.0) as f32;

        let w = input.width as usize;
        let h = input.height as usize;
        let mut data = vec![0u8; input.data.len()];

        for y in 0..h {
            let offset = (amplitude * (y as f32 * frequency + time * 0.2).sin()).round() as isize;
            for x in 0..w {
                let src_x = ((x as isize + offset).clamp(0, w as isize - 1)) as usize;
                let src_idx = (y * w + src_x) * 4;
                let dst_idx = (y * w + x) * 4;
                data[dst_idx..dst_idx + 4].copy_from_slice(&input.data[src_idx..src_idx + 4]);
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
        Ok(VideoSegment { frames, fps: input.fps })
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_wave_distort_creates_output() {
        let data = vec![128u8; 32 * 32 * 4];
        let frame = Frame { width: 32, height: 32, data };
        let effect = WaveDistort::new(5.0, 0.1);
        let result = effect.process_frame(&frame, None, &serde_json::Map::new()).unwrap();
        assert_eq!(result.width, 32);
        assert_eq!(result.height, 32);
    }
}