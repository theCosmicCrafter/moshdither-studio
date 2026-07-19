use crate::effects::types::*;
use crate::effects::Effect;
use crate::error::Result;
use serde_json::json;

/// Pixel sorting — sort contiguous runs of pixels by brightness.
pub struct PixelSort {
    threshold: u8,
}

impl PixelSort {
    pub fn new(threshold: u8) -> Self {
        Self { threshold }
    }
}

impl Default for PixelSort {
    fn default() -> Self {
        Self::new(128)
    }
}

impl Effect for PixelSort {
    fn meta(&self) -> EffectMeta {
        EffectMeta {
            id: "pixel_geo.pixel_sort".to_string(),
            name: "Pixel Sort".to_string(),
            category: EffectCategory::PixelGeometry,
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
        _mask: Option<&Mask>,
        params: &ParameterValues,
    ) -> Result<Frame> {
        let threshold = params
            .get("threshold")
            .and_then(|v| v.as_u64())
            .unwrap_or(self.threshold as u64) as u8;
        let w = input.width as usize;
        let h = input.height as usize;
        let mut data = input.data.clone();

        for y in 0..h {
            let mut run_start = 0;
            let mut in_run = false;

            for x in 0..w {
                let idx = (y * w + x) * 4;
                let lum = (0.299 * data[idx] as f32
                    + 0.587 * data[idx + 1] as f32
                    + 0.114 * data[idx + 2] as f32) as u8;

                if lum > threshold && !in_run {
                    run_start = x;
                    in_run = true;
                } else if (lum <= threshold || x == w - 1) && in_run {
                    let run_end = if lum <= threshold { x } else { x + 1 };
                    // Sort pixels in [run_start, run_end) by luminance
                    let mut pixels: Vec<[u8; 4]> = (run_start..run_end)
                        .map(|px| {
                            let pidx = (y * w + px) * 4;
                            [data[pidx], data[pidx + 1], data[pidx + 2], data[pidx + 3]]
                        })
                        .collect();

                    pixels.sort_by_key(|p| {
                        (0.299 * p[0] as f32 + 0.587 * p[1] as f32 + 0.114 * p[2] as f32) as u8
                    });

                    for (offset, pixel) in pixels.iter().enumerate() {
                        let pidx = (y * w + (run_start + offset)) * 4;
                        data[pidx..pidx + 4].copy_from_slice(pixel);
                    }

                    in_run = false;
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

    #[test]
    fn test_pixel_sort_sorts_above_threshold() {
        let mut data = vec![0u8; 16 * 4];
        // 4 pixels all above threshold, unsorted brightness: 200, 50, 210, 150
        data[0] = 200;
        data[1] = 200;
        data[2] = 200;
        data[4] = 50;
        data[5] = 50;
        data[6] = 50;
        data[8] = 210;
        data[9] = 210;
        data[10] = 210;
        data[12] = 150;
        data[13] = 150;
        data[14] = 150;

        let frame = Frame {
            width: 4,
            height: 1,
            data,
        };
        let effect = PixelSort::new(20);
        let result = effect
            .process_frame(&frame, None, &serde_json::Map::new())
            .unwrap();

        // All pixels should be sorted by brightness: 50, 150, 200, 210
        assert_eq!(result.data[0], 50);
        assert_eq!(result.data[4], 150);
        assert_eq!(result.data[8], 200);
        assert_eq!(result.data[12], 210);
    }
}
