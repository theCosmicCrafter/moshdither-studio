use crate::effects::types::*;
use crate::effects::Effect;
use crate::error::Result;
use serde_json::json;

/// CRT-style scanline effect.
/// Darkens every other row to simulate CRT phosphor gaps.
pub struct Scanlines {
    gap: u32,     // Row gap (every N rows)
    intensity: f32, // Darkness intensity [0.0, 1.0]
}

impl Scanlines {
    pub fn new(gap: u32, intensity: f32) -> Self {
        Self { gap: gap.max(1), intensity: intensity.clamp(0.0, 1.0) }
    }
}

impl Default for Scanlines {
    fn default() -> Self {
        Self::new(2, 0.3)
    }
}

impl Effect for Scanlines {
    fn meta(&self) -> EffectMeta {
        EffectMeta {
            id: "analog.scanlines".to_string(),
            name: "Scanlines".to_string(),
            category: EffectCategory::Analog,
            media_type: MediaType::Both,
            parameters: vec![
                ParameterDef {
                    id: "gap".to_string(),
                    name: "Gap".to_string(),
                    param_type: ParamType::Slider,
                    default: json!(2),
                    min: Some(1.0),
                    max: Some(8.0),
                    step: Some(1.0),
                    options: None,
                },
                ParameterDef {
                    id: "intensity".to_string(),
                    name: "Intensity".to_string(),
                    param_type: ParamType::Slider,
                    default: json!(0.3),
                    min: Some(0.0),
                    max: Some(1.0),
                    step: Some(0.05),
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
        let gap = params.get("gap").and_then(|v| v.as_u64()).unwrap_or(self.gap as u64) as u32;
        let intensity = params.get("intensity").and_then(|v| v.as_f64()).unwrap_or(self.intensity as f64) as f32;

        let w = input.width as usize;
        let h = input.height as usize;
        let mut data = input.data.clone();
        let factor = 1.0 - intensity;

        for y in 0..h {
            if y % gap as usize == 0 {
                continue; // Skip darkening on bright rows
            }
            for x in 0..w {
                let idx = (y * w + x) * 4;
                data[idx] = (data[idx] as f32 * factor) as u8;
                data[idx + 1] = (data[idx + 1] as f32 * factor) as u8;
                data[idx + 2] = (data[idx + 2] as f32 * factor) as u8;
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
    fn test_scanlines_darkens_rows() {
        let effect = Scanlines::new(2, 0.5);
        let data = vec![200u8; 4 * 4 * 4]; // 4x4 white-ish
        let frame = Frame { width: 4, height: 4, data };
        let result = effect.process_frame(&frame, None, &serde_json::Map::new()).unwrap();

        // Row 0 (bright): unchanged
        assert_eq!(result.data[0], 200);
        // Row 1 (darkened): 200 * 0.5 = 100
        assert_eq!(result.data[4 * 4], 100);
    }
}