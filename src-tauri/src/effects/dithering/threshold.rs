use crate::effects::types::*;
use crate::effects::Effect;
use crate::error::Result;
use serde_json::json;

/// Simple threshold dithering (posterize).
pub struct ThresholdDither {
    threshold: u8,
}

impl ThresholdDither {
    pub fn new(threshold: u8) -> Self {
        Self { threshold }
    }
}

impl Default for ThresholdDither {
    fn default() -> Self {
        Self::new(128)
    }
}

impl Effect for ThresholdDither {
    fn meta(&self) -> EffectMeta {
        EffectMeta {
            id: "dithering.threshold".to_string(),
            name: "Threshold".to_string(),
            category: EffectCategory::Dithering,
            media_type: MediaType::Image,
            parameters: vec![ParameterDef {
                id: "threshold".to_string(),
                name: "Threshold".to_string(),
                param_type: ParamType::Slider,
                default: json!(128),
                min: Some(0.0),
                max: Some(255.0),
                step: Some(1.0),
                options: None,
            }],
        }
    }

    fn process_frame(
        &self,
        input: &Frame,
        _m: Option<&Mask>,
        params: &ParameterValues,
    ) -> Result<Frame> {
        let threshold = params
            .get("threshold")
            .and_then(|v| v.as_u64())
            .unwrap_or(self.threshold as u64) as u8;
        let mut data = input.data.clone();
        for chunk in data.chunks_exact_mut(4) {
            let lum = 0.299 * chunk[0] as f32 + 0.587 * chunk[1] as f32 + 0.114 * chunk[2] as f32;
            let color = if lum > threshold as f32 { 255 } else { 0 };
            chunk[0] = color;
            chunk[1] = color;
            chunk[2] = color;
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
    fn test_threshold() {
        let d = vec![50u8, 80, 100, 255];
        let f = Frame {
            width: 1,
            height: 1,
            data: d,
        };
        let e = ThresholdDither::new(128);
        let r = e.process_frame(&f, None, &serde_json::Map::new()).unwrap();
        // luminance = 0.299*50 + 0.587*80 + 0.114*100 = 14.95 + 46.96 + 11.4 = 73.31 < 128
        assert_eq!(r.data[0], 0);
        assert_eq!(r.data[1], 0);
        assert_eq!(r.data[2], 0);
    }
}
