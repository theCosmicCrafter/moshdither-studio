use crate::effects::types::*;
use crate::effects::Effect;
use crate::error::Result;
use serde_json::json;

/// Halftone pattern dithering using a dot pattern.
pub struct HalftoneDither {
    dot_size: u32,
}

impl HalftoneDither {
    pub fn new(dot_size: u32) -> Self {
        Self {
            dot_size: dot_size.max(1).min(32),
        }
    }
}

impl Default for HalftoneDither {
    fn default() -> Self {
        Self::new(8)
    }
}

impl Effect for HalftoneDither {
    fn meta(&self) -> EffectMeta {
        EffectMeta {
            id: "dithering.halftone".to_string(),
            name: "Halftone".to_string(),
            category: EffectCategory::Dithering,
            media_type: MediaType::Both,
            parameters: vec![
                ParameterDef {
                    id: "dot_size".to_string(),
                    name: "Dot Size".to_string(),
                    param_type: ParamType::Slider,
                    default: json!(8),
                    min: Some(2.0),
                    max: Some(32.0),
                    step: Some(1.0),
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
        let dot_size = params
            .get("dot_size")
            .and_then(|v| v.as_u64())
            .unwrap_or(self.dot_size as u64) as u32;
        let dot_size = dot_size.max(1);
        let mut data = vec![0u8; input.data.len()];
        let w = input.width;
        let h = input.height;

        for y in (0..h).step_by(dot_size as usize) {
            for x in (0..w).step_by(dot_size as usize) {
                let mut sum = 0.0;
                let mut count = 0;
                for dy in 0..dot_size {
                    for dx in 0..dot_size {
                        let px = x + dx;
                        let py = y + dy;
                        if px < w && py < h {
                            let idx = ((py * w + px) * 4) as usize;
                            let lum = 0.299 * input.data[idx] as f32
                                + 0.587 * input.data[idx + 1] as f32
                                + 0.114 * input.data[idx + 2] as f32;
                            sum += lum;
                            count += 1;
                        }
                    }
                }
                let avg = sum / count.max(1) as f32;
                let radius = (avg / 255.0) * (dot_size as f32 / 2.0);
                let center_x = x as f32 + (dot_size as f32 - 1.0) / 2.0;
                let center_y = y as f32 + (dot_size as f32 - 1.0) / 2.0;

                for dy in 0..dot_size {
                    for dx in 0..dot_size {
                        let px = x + dx;
                        let py = y + dy;
                        if px < w && py < h {
                            let idx = ((py * w + px) * 4) as usize;
                            let dist = ((px as f32 - center_x).powi(2)
                                + (py as f32 - center_y).powi(2))
                            .sqrt();
                            let on = if dist <= radius { 0u8 } else { 255u8 };
                            data[idx] = on;
                            data[idx + 1] = on;
                            data[idx + 2] = on;
                            data[idx + 3] = input.data[idx + 3];
                        }
                    }
                }
            }
        }

        Ok(Frame {
            width: w,
            height: h,
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
    fn test_halftone() {
        let d = vec![128u8; 64]; // 2x2 white-ish pixels
        let f = Frame {
            width: 2,
            height: 2,
            data: d,
        };
        let e = HalftoneDither::new(2);
        let r = e.process_frame(&f, None, &serde_json::Map::new()).unwrap();
        assert_eq!(r.data.len(), 64);
    }
}
