use crate::effects::types::*;
use crate::effects::Effect;
use crate::error::Result;

/// Vaporwave aesthetic — color banding + chromatic shift + glow simulation.
pub struct Vaporwave;

impl Vaporwave {
    pub fn new() -> Self {
        Self
    }
}

impl Default for Vaporwave {
    fn default() -> Self {
        Self::new()
    }
}

impl Effect for Vaporwave {
    fn meta(&self) -> EffectMeta {
        EffectMeta {
            id: "artistic.vaporwave".to_string(),
            name: "Vaporwave".to_string(),
            category: EffectCategory::Artistic,
            media_type: MediaType::Image,
            parameters: vec![],
        }
    }

    fn process_frame(
        &self,
        input: &Frame,
        _mask: Option<&Mask>,
        _params: &ParameterValues,
    ) -> Result<Frame> {
        let mut data = input.data.clone();

        for chunk in data.as_chunks_mut::<4>().0.iter_mut() {
            let r = chunk[0] as f32;
            let g = chunk[1] as f32;
            let b = chunk[2] as f32;

            // Boost pink/cyan, reduce green
            let nr = (r * 1.3 + b * 0.3).clamp(0.0, 255.0);
            let ng = (g * 0.6).clamp(0.0, 255.0);
            let nb = (b * 1.2 + r * 0.2).clamp(0.0, 255.0);

            // Color banding: quantize to 8 levels
            let levels = 8.0;
            let band = |v: f32| ((v / 255.0 * levels).round() / levels * 255.0) as u8;

            chunk[0] = band(nr);
            chunk[1] = band(ng);
            chunk[2] = band(nb);
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
    fn test_vaporwave_changes_colors() {
        let data = vec![100u8, 150, 200, 255];
        let frame = Frame {
            width: 1,
            height: 1,
            data,
        };
        let effect = Vaporwave::new();
        let result = effect
            .process_frame(&frame, None, &serde_json::Map::new())
            .unwrap();

        // Should be different from input due to color shift + banding
        assert_ne!(result.data[0], 100);
        assert_ne!(result.data[1], 150);
        assert_ne!(result.data[2], 200);
    }
}
