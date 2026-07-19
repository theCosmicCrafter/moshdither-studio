use crate::effects::types::*;
use crate::effects::Effect;
use crate::error::Result;
use serde_json::json;

/// JPEG-style re-quantization glitch.
/// Simulates harsh DCT quantization by rounding color values to coarse steps.
pub struct JpegQuantize {
    quality: u8,
}

impl JpegQuantize {
    pub fn new(quality: u8) -> Self {
        Self {
            quality: quality.clamp(1, 100),
        }
    }
}

impl Default for JpegQuantize {
    fn default() -> Self {
        Self::new(10)
    }
}

impl Effect for JpegQuantize {
    fn meta(&self) -> EffectMeta {
        EffectMeta {
            id: "glitch.jpeg_quantize".to_string(),
            name: "JPEG Quantize".to_string(),
            category: EffectCategory::Glitch,
            media_type: MediaType::Image,
            parameters: vec![ParameterDef {
                id: "quality".to_string(),
                name: "Quality".to_string(),
                param_type: ParamType::Slider,
                default: json!(10),
                min: Some(1.0),
                max: Some(100.0),
                step: Some(1.0),
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
        let quality = params
            .get("quality")
            .and_then(|v| v.as_u64())
            .unwrap_or(self.quality as u64) as u8;
        let step = (101 - quality).max(1);
        let mut data = input.data.clone();

        for chunk in data.chunks_exact_mut(4) {
            chunk[0] = chunk[0] / step * step;
            chunk[1] = chunk[1] / step * step;
            chunk[2] = chunk[2] / step * step;
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
    fn test_jpeg_quantize_reduces_colors() {
        let data = vec![137u8; 16 * 4];
        let frame = Frame {
            width: 4,
            height: 4,
            data,
        };
        let effect = JpegQuantize::new(10);
        let result = effect
            .process_frame(&frame, None, &serde_json::Map::new())
            .unwrap();
        // With quality=10, step = 91, so 137 / 91 = 1, * 91 = 91
        assert_eq!(result.data[0], 91);
    }
}
