use crate::effects::types::*;
use crate::effects::Effect;
use crate::error::Result;
use serde_json::json;

/// Mirror slices — mirror every other horizontal slice.
pub struct MirrorSlices {
    slice_height: u32,
}

impl MirrorSlices {
    pub fn new(slice_height: u32) -> Self {
        Self {
            slice_height: slice_height.max(1),
        }
    }
}

impl Default for MirrorSlices {
    fn default() -> Self {
        Self::new(4)
    }
}

impl Effect for MirrorSlices {
    fn meta(&self) -> EffectMeta {
        EffectMeta {
            id: "pixel_geo.mirror_slices".to_string(),
            name: "Mirror Slices".to_string(),
            category: EffectCategory::PixelGeometry,
            media_type: MediaType::Both,
            parameters: vec![ParameterDef {
                id: "slice_height".to_string(),
                name: "Slice Height".to_string(),
                param_type: ParamType::Slider,
                default: json!(4),
                min: Some(1.0),
                max: Some(32.0),
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
        let slice_height = params
            .get("slice_height")
            .and_then(|v| v.as_u64())
            .unwrap_or(self.slice_height as u64) as usize;
        let w = input.width as usize;
        let h = input.height as usize;
        let mut data = input.data.clone();

        for (slice_idx, y_start) in (0..h).step_by(slice_height).enumerate() {
            if slice_idx % 2 == 0 {
                continue;
            }
            for y in y_start..(y_start + slice_height).min(h) {
                for x in 0..w / 2 {
                    let left = (y * w + x) * 4;
                    let right = (y * w + (w - 1 - x)) * 4;
                    for c in 0..4 {
                        data.swap(left + c, right + c);
                    }
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
    fn test_mirror_slices() {
        // 2x2 image: row 0 = [255, 0], row 1 = [100, 50]
        let d = vec![
            255, 0, 0, 0, 0, 0, 0, 0, // row 0
            100, 0, 0, 0, 50, 0, 0, 0, // row 1
        ];
        let f = Frame {
            width: 2,
            height: 2,
            data: d,
        };
        let e = MirrorSlices::new(1);
        let r = e.process_frame(&f, None, &serde_json::Map::new()).unwrap();
        // Slice 0 (even) is NOT mirrored
        assert_eq!(r.data[0], 255);
        assert_eq!(r.data[4], 0);
        // Slice 1 (odd) IS mirrored: [100, 50] → [50, 100]
        assert_eq!(r.data[8], 50);
        assert_eq!(r.data[12], 100);
    }
}
