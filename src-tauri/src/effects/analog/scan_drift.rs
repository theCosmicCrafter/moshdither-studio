use crate::effects::types::*;
use crate::effects::Effect;
use crate::error::Result;
use serde_json::json;

/// Scan drift — horizontal drift of scanlines with sine wave.
pub struct ScanDrift {
    amplitude: f32,
    frequency: f32,
}

impl ScanDrift {
    pub fn new(amplitude: f32, frequency: f32) -> Self {
        Self {
            amplitude,
            frequency,
        }
    }
}

impl Default for ScanDrift {
    fn default() -> Self {
        Self::new(5.0, 0.1)
    }
}

impl Effect for ScanDrift {
    fn meta(&self) -> EffectMeta {
        EffectMeta {
            id: "analog.scan_drift".to_string(),
            name: "Scan Drift".to_string(),
            category: EffectCategory::Analog,
            media_type: MediaType::Both,
            parameters: vec![
                ParameterDef {
                    id: "amplitude".to_string(),
                    name: "Amplitude".to_string(),
                    param_type: ParamType::Slider,
                    default: json!(5.0),
                    min: Some(0.0),
                    max: Some(30.0),
                    step: Some(1.0),
                    options: None,
                },
                ParameterDef {
                    id: "frequency".to_string(),
                    name: "Frequency".to_string(),
                    param_type: ParamType::Slider,
                    default: json!(0.1),
                    min: Some(0.0),
                    max: Some(0.5),
                    step: Some(0.01),
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
        let amplitude = params
            .get("amplitude")
            .and_then(|v| v.as_f64())
            .unwrap_or(self.amplitude as f64) as f32;
        let frequency = params
            .get("frequency")
            .and_then(|v| v.as_f64())
            .unwrap_or(self.frequency as f64) as f32;
        let time = params.get("time").and_then(|v| v.as_f64()).unwrap_or(0.0) as f32;
        let w = input.width as usize;
        let h = input.height as usize;
        let mut data = vec![0u8; input.data.len()];

        for y in 0..h {
            let offset = (amplitude * (y as f32 * frequency + time * 0.2).sin()).round() as isize;
            for x in 0..w {
                let src_x = ((x as isize + offset).clamp(0, w as isize - 1)) as usize;
                let src = (y * w + src_x) * 4;
                let dst = (y * w + x) * 4;
                data[dst..dst + 4].copy_from_slice(&input.data[src..src + 4]);
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

    #[test]
    fn test_scan_drift() {
        let d = vec![128u8; 32 * 32 * 4];
        let f = Frame {
            width: 32,
            height: 32,
            data: d,
        };
        let e = ScanDrift::new(5.0, 0.1);
        let r = e.process_frame(&f, None, &serde_json::Map::new()).unwrap();
        assert_eq!(r.width, 32);
    }
}
