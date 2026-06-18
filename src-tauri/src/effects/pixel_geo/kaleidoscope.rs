use crate::effects::types::*;
use crate::effects::Effect;
use crate::error::Result;
use serde_json::json;

/// Kaleidoscope effect — mirror-tile a segment of the image.
pub struct Kaleidoscope {
    segments: u32,
}

impl Kaleidoscope {
    pub fn new(segments: u32) -> Self {
        Self { segments: segments.max(2) }
    }
}

impl Default for Kaleidoscope {
    fn default() -> Self {
        Self::new(6)
    }
}

impl Effect for Kaleidoscope {
    fn meta(&self) -> EffectMeta {
        EffectMeta {
            id: "pixel_geo.kaleidoscope".to_string(),
            name: "Kaleidoscope".to_string(),
            category: EffectCategory::PixelGeometry,
            media_type: MediaType::Image,
            parameters: vec![
                ParameterDef {
                    id: "segments".to_string(),
                    name: "Segments".to_string(),
                    param_type: ParamType::Slider,
                    default: json!(6),
                    min: Some(2.0),
                    max: Some(12.0),
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
        let segments = params.get("segments").and_then(|v| v.as_u64()).unwrap_or(self.segments as u64) as u32;
        let w = input.width as usize;
        let h = input.height as usize;
        let cx = w / 2;
        let cy = h / 2;
        let mut data = vec![0u8; input.data.len()];

        let angle_step = (2.0 * std::f32::consts::PI) / segments as f32;

        for y in 0..h {
            for x in 0..w {
                let dx = x as f32 - cx as f32;
                let dy = y as f32 - cy as f32;
                let dist = (dx * dx + dy * dy).sqrt();
                let angle = dy.atan2(dx);

                // Map to first segment
                let mapped_angle = angle.rem_euclid(angle_step);
                let src_x = (cx as f32 + dist * mapped_angle.cos()).clamp(0.0, w as f32 - 1.0) as usize;
                let src_y = (cy as f32 + dist * mapped_angle.sin()).clamp(0.0, h as f32 - 1.0) as usize;

                let src_idx = (src_y * w + src_x) * 4;
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
    fn test_kaleidoscope_creates_output() {
        let data = vec![128u8; 64 * 64 * 4];
        let frame = Frame { width: 64, height: 64, data };
        let effect = Kaleidoscope::new(6);
        let result = effect.process_frame(&frame, None, &serde_json::Map::new()).unwrap();
        assert_eq!(result.width, 64);
        assert_eq!(result.height, 64);
    }
}