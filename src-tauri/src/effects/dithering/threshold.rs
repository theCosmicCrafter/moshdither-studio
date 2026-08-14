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
        // Read as f64, not as_u64: a slider with step 1.0 may still serialise
        // as a JSON float (e.g. `128.0`), and as_u64() returns None for a
        // float -- silently dropping the parameter and falling back to the
        // default. `clamp_params` always produces the float-tagged
        // representation when it clamps an out-of-range value, so this read
        // path must handle it. Round before casting: UI wheel drags can
        // produce values like `127.60000000000001`, not just clean integers.
        // See error_diffusion.rs for the established pattern.
        let threshold = params
            .get("threshold")
            .and_then(|v| v.as_f64())
            .filter(|v| v.is_finite())
            .map(|v| v.round().clamp(0.0, 255.0) as u8)
            .unwrap_or(self.threshold);
        let mut data = input.data.clone();
        for chunk in data.chunks_exact_mut(4) {
            let lum = crate::effects::luminance_f32(chunk[0], chunk[1], chunk[2]);
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

    /// A pixel whose luminance sits strictly between the hardcoded default
    /// threshold (128) and a clamped-to-max threshold (255) behaves
    /// oppositely under each: proof that the supplied value is what actually
    /// gets used, not a silent fallback to the default.
    fn gray_pixel_frame(lum: u8) -> Frame {
        Frame {
            width: 1,
            height: 1,
            data: vec![lum, lum, lum, 255],
        }
    }

    #[test]
    fn threshold_accepts_a_float_tagged_value_instead_of_falling_back_to_default() {
        let d = ThresholdDither::default(); // default threshold = 128
        let frame = gray_pixel_frame(200);

        let mut params = serde_json::Map::new();
        params.insert("threshold".to_string(), json!(255.0));
        let r = d.process_frame(&frame, None, &params).unwrap();
        assert_eq!(
            r.data[0], 0,
            "threshold=255.0 (float-tagged) must be honoured: 200 < 255 should stay black, \
             but a fallback to the default 128 would make 200 > 128 white"
        );
    }

    #[test]
    fn threshold_honours_a_clamp_then_read_round_trip() {
        let d = ThresholdDither::default();
        let frame = gray_pixel_frame(200);

        // Out of range (declared max is 255); clamp_params rewrites this to
        // the float-tagged representation that as_u64() cannot read.
        let mut raw = serde_json::Map::new();
        raw.insert("threshold".to_string(), json!(9999));
        let clamped = crate::effects::clamp_params("dithering.threshold", &raw);
        assert!(
            clamped["threshold"].is_f64(),
            "clamp_params should have rewritten the out-of-range value to a float"
        );

        let r = d.process_frame(&frame, None, &clamped).unwrap();
        assert_eq!(
            r.data[0], 0,
            "a threshold clamped to 255 must be honoured: 200 < 255 should stay black, \
             but a fallback to the default 128 would make 200 > 128 white"
        );
    }
}
