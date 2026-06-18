use crate::effects::types::*;
use crate::effects::Effect;
use crate::error::Result;
use serde_json::json;

/// Chromatic aberration — shift R and B channels horizontally.
pub struct ChromaticAberration {
    shift: u32,
}

impl ChromaticAberration {
    pub fn new(shift: u32) -> Self {
        Self { shift }
    }
}

impl Default for ChromaticAberration {
    fn default() -> Self {
        Self::new(4)
    }
}

impl Effect for ChromaticAberration {
    fn meta(&self) -> EffectMeta {
        EffectMeta {
            id: "analog.chromatic_aberration".to_string(),
            name: "Chromatic Aberration".to_string(),
            category: EffectCategory::Analog,
            media_type: MediaType::Both,
            parameters: vec![
                ParameterDef {
                    id: "shift".to_string(),
                    name: "Shift".to_string(),
                    param_type: ParamType::Slider,
                    default: json!(4),
                    min: Some(1.0),
                    max: Some(20.0),
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
        let shift = params.get("shift").and_then(|v| v.as_u64()).unwrap_or(self.shift as u64) as usize;
        let w = input.width as usize;
        let h = input.height as usize;
        let mut data = vec![0u8; input.data.len()];

        for y in 0..h {
            for x in 0..w {
                let idx = (y * w + x) * 4;
                // Green stays at current position
                data[idx + 1] = input.data[idx + 1];
                data[idx + 3] = input.data[idx + 3];

                // Red shifted left
                let rx = x.saturating_sub(shift).min(w - 1);
                let ridx = (y * w + rx) * 4;
                data[idx] = input.data[ridx];

                // Blue shifted right
                let bx = (x + shift).min(w - 1);
                let bidx = (y * w + bx) * 4;
                data[idx + 2] = input.data[bidx];
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
    fn test_chromatic_shifts_channels() {
        let mut data = vec![0u8; 16 * 4]; // 4x1 image
        // Pixel 0: R=255, Pixel 1: G=255, Pixel 2: B=255
        data[0] = 255; data[1] = 0; data[2] = 0; data[3] = 255;
        data[4] = 0; data[5] = 255; data[6] = 0; data[7] = 255;
        data[8] = 0; data[9] = 0; data[10] = 255; data[11] = 255;
        data[12] = 0; data[13] = 0; data[14] = 0; data[15] = 255;

        let frame = Frame { width: 4, height: 1, data };
        let effect = ChromaticAberration::new(1);
        let result = effect.process_frame(&frame, None, &serde_json::Map::new()).unwrap();

        // At x=1, red should come from x=0 (which had R=255)
        assert_eq!(result.data[4], 255); // R at pixel 1
    }
}