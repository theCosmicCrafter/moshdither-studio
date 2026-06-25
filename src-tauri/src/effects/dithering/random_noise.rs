use crate::effects::types::*;
use crate::effects::Effect;
use crate::error::Result;

/// Random noise dithering.
pub struct RandomNoiseDither;

impl RandomNoiseDither {
    pub fn new() -> Self {
        Self
    }
}

impl Default for RandomNoiseDither {
    fn default() -> Self {
        Self::new()
    }
}

impl Effect for RandomNoiseDither {
    fn meta(&self) -> EffectMeta {
        EffectMeta {
            id: "dithering.random_noise".to_string(),
            name: "Random Noise".to_string(),
            category: EffectCategory::Dithering,
            media_type: MediaType::Image,
            parameters: vec![],
        }
    }

    fn process_frame(
        &self,
        input: &Frame,
        _m: Option<&Mask>,
        params: &ParameterValues,
    ) -> Result<Frame> {
        let w = input.width as usize;
        let h = input.height as usize;
        let time = params.get("time").and_then(|v| v.as_f64()).unwrap_or(0.0) as usize;
        let mut data = input.data.clone();

        for y in 0..h {
            for x in 0..w {
                let idx = (y * w + x) * 4;
                let seed = x
                    .wrapping_mul(374761393usize)
                    .wrapping_add(y.wrapping_mul(668265263usize))
                    .wrapping_add(time.wrapping_mul(982451653usize));
                let noise = ((seed.wrapping_mul(1203246503usize) >> 24) & 0xFF) as u8;
                for c in 0..3 {
                    let v = data[idx + c] as u16 + noise as u16;
                    data[idx + c] = if v > 255 { 255 } else { v as u8 };
                }
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
    fn gray(w: u32, h: u32, g: u8) -> Frame {
        let mut d = Vec::with_capacity((w * h * 4) as usize);
        for _ in 0..(w * h) {
            d.extend_from_slice(&[g, g, g, 255]);
        }
        Frame {
            width: w,
            height: h,
            data: d,
        }
    }

    #[test]
    fn test_changes_values() {
        let e = RandomNoiseDither::new();
        let r = e
            .process_frame(&gray(4, 4, 128), None, &serde_json::Map::new())
            .unwrap();
        assert!(r.data.iter().any(|&v| v != 128));
    }
}
