use crate::effects::types::*;
use crate::effects::Effect;
use crate::error::Result;
use serde_json::json;

/// Standard brightness / contrast / gamma / saturation adjustment.
pub struct BrightnessContrast;

impl Default for BrightnessContrast {
    fn default() -> Self {
        BrightnessContrast
    }
}

fn rgb_to_hsl(r: f32, g: f32, b: f32) -> (f32, f32, f32) {
    let max = r.max(g).max(b);
    let min = r.min(g).min(b);
    let l = (max + min) / 2.0;
    if max == min {
        return (0.0, 0.0, l);
    }
    let d = max - min;
    let s = if l > 0.5 {
        d / (2.0 - max - min)
    } else {
        d / (max + min)
    };
    let h = if max == r {
        ((g - b) / d + (if g < b { 6.0 } else { 0.0 })) / 6.0
    } else if max == g {
        ((b - r) / d + 2.0) / 6.0
    } else {
        ((r - g) / d + 4.0) / 6.0
    };
    (h, s, l)
}

fn hsl_to_rgb(h: f32, s: f32, l: f32) -> (f32, f32, f32) {
    if s == 0.0 {
        return (l, l, l);
    }
    let q = if l < 0.5 {
        l * (1.0 + s)
    } else {
        l + s - l * s
    };
    let p = 2.0 * l - q;
    let hue_to_rgb = |t: f32| {
        let t = t.fract();
        let t = if t < 0.0 { t + 1.0 } else { t };
        if t < 1.0 / 6.0 {
            p + (q - p) * 6.0 * t
        } else if t < 1.0 / 2.0 {
            q
        } else if t < 2.0 / 3.0 {
            p + (q - p) * (2.0 / 3.0 - t) * 6.0
        } else {
            p
        }
    };
    (
        hue_to_rgb(h + 1.0 / 3.0),
        hue_to_rgb(h),
        hue_to_rgb(h - 1.0 / 3.0),
    )
}

impl Effect for BrightnessContrast {
    fn meta(&self) -> EffectMeta {
        EffectMeta {
            id: "color.brightness_contrast".to_string(),
            name: "Brightness / Contrast / Gamma / Saturation".to_string(),
            category: EffectCategory::Color,
            media_type: MediaType::Both,
            parameters: vec![
                ParameterDef {
                    id: "brightness".to_string(),
                    name: "Brightness".to_string(),
                    param_type: ParamType::Slider,
                    default: json!(0.0),
                    min: Some(-1.0),
                    max: Some(1.0),
                    step: Some(0.01),
                    options: None,
                },
                ParameterDef {
                    id: "contrast".to_string(),
                    name: "Contrast".to_string(),
                    param_type: ParamType::Slider,
                    default: json!(0.0),
                    min: Some(-1.0),
                    max: Some(1.0),
                    step: Some(0.01),
                    options: None,
                },
                ParameterDef {
                    id: "gamma".to_string(),
                    name: "Gamma".to_string(),
                    param_type: ParamType::Slider,
                    default: json!(1.0),
                    min: Some(0.1),
                    max: Some(3.0),
                    step: Some(0.01),
                    options: None,
                },
                ParameterDef {
                    id: "saturation".to_string(),
                    name: "Saturation".to_string(),
                    param_type: ParamType::Slider,
                    default: json!(1.0),
                    min: Some(0.0),
                    max: Some(2.0),
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
        let brightness = params
            .get("brightness")
            .and_then(|v| v.as_f64())
            .unwrap_or(0.0) as f32;
        let contrast = params
            .get("contrast")
            .and_then(|v| v.as_f64())
            .unwrap_or(0.0) as f32;
        let gamma = params.get("gamma").and_then(|v| v.as_f64()).unwrap_or(1.0) as f32;
        let saturation = params
            .get("saturation")
            .and_then(|v| v.as_f64())
            .unwrap_or(1.0) as f32;
        let gamma = gamma.clamp(0.01, 10.0);

        let contrast_factor = (contrast + 1.0).clamp(0.0, 2.0);
        let slope = contrast_factor;
        let intercept = 0.5 * (1.0 - contrast_factor) + brightness;

        let mut data = input.data.clone();
        for chunk in data.as_chunks_mut::<4>().0.iter_mut() {
            let r = chunk[0] as f32 / 255.0;
            let g = chunk[1] as f32 / 255.0;
            let b = chunk[2] as f32 / 255.0;

            // Brightness + contrast
            let r = (r * slope + intercept).clamp(0.0, 1.0);
            let g = (g * slope + intercept).clamp(0.0, 1.0);
            let b = (b * slope + intercept).clamp(0.0, 1.0);

            // Gamma
            let r = r.powf(1.0 / gamma);
            let g = g.powf(1.0 / gamma);
            let b = b.powf(1.0 / gamma);

            // Saturation
            let (h, s, l) = rgb_to_hsl(r, g, b);
            let s = (s * saturation).clamp(0.0, 1.0);
            let (r, g, b) = hsl_to_rgb(h, s, l);

            chunk[0] = (r * 255.0).clamp(0.0, 255.0) as u8;
            chunk[1] = (g * 255.0).clamp(0.0, 255.0) as u8;
            chunk[2] = (b * 255.0).clamp(0.0, 255.0) as u8;
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
    fn test_brightness_contrast() {
        let d = vec![128u8, 128, 128, 255];
        let f = Frame {
            width: 1,
            height: 1,
            data: d,
        };
        let e = BrightnessContrast;
        let mut params = serde_json::Map::new();
        params.insert("brightness".to_string(), json!(0.1));
        params.insert("contrast".to_string(), json!(0.2));
        params.insert("gamma".to_string(), json!(1.0));
        params.insert("saturation".to_string(), json!(1.0));
        let r = e.process_frame(&f, None, &params).unwrap();
        // Gray pixel with brightness and contrast should remain gray
        assert_eq!(r.data[0], r.data[1]);
        assert_eq!(r.data[1], r.data[2]);
        assert!(r.data[0] > 128);
    }
}
