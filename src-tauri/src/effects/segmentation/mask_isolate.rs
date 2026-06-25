use crate::effects::types::*;

/// Segmentation effect: isolate the masked region, making everything outside transparent.
pub struct MaskIsolate;

impl Default for MaskIsolate {
    fn default() -> Self {
        Self
    }
}

impl Effect for MaskIsolate {
    fn handles_masking(&self) -> bool {
        true
    }

    fn meta(&self) -> EffectMeta {
        EffectMeta {
            id: "mask_isolate".to_string(),
            name: "Mask Isolate".to_string(),
            category: EffectCategory::Segmentation,
            media_type: MediaType::Both,
            parameters: vec![ParameterDef {
                id: "invert".to_string(),
                name: "Invert Mask".to_string(),
                param_type: ParamType::Toggle,
                default: serde_json::Value::Bool(false),
                min: None,
                max: None,
                step: None,
                options: None,
            }],
        }
    }

    fn process_frame(
        &self,
        input: &Frame,
        mask: Option<&Mask>,
        params: &ParameterValues,
    ) -> crate::error::Result<Frame> {
        let Some(mask) = mask else {
            return Ok(input.clone());
        };

        let invert = params
            .get("invert")
            .and_then(|v| v.as_bool())
            .unwrap_or(false);

        let mut out = input.data.clone();
        let mask_w = mask.width as usize;
        let mask_h = mask.height as usize;
        let img_w = input.width as usize;
        let img_h = input.height as usize;

        for y in 0..img_h {
            for x in 0..img_w {
                // Sample mask (bilinear-ish nearest for simplicity)
                let mx = (x * mask_w) / img_w;
                let my = (y * mask_h) / img_h;
                let m_idx = my * mask_w + mx;
                let mask_val = mask.data[m_idx];

                let apply = if invert { 255 - mask_val } else { mask_val };
                let idx = (y * img_w + x) * 4 + 3; // alpha channel
                out[idx] = ((out[idx] as u16 * apply as u16) / 255) as u8;
            }
        }

        Ok(Frame {
            width: input.width,
            height: input.height,
            data: out,
        })
    }

    fn process_video(
        &self,
        input: &VideoSegment,
        mask: Option<&Mask>,
        params: &ParameterValues,
    ) -> crate::error::Result<VideoSegment> {
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

    fn make_frame(w: u32, h: u32, rgba: u8, alpha: u8) -> Frame {
        let count = (w * h) as usize;
        let mut data = Vec::with_capacity(count * 4);
        for _ in 0..count {
            data.extend_from_slice(&[rgba, rgba, rgba, alpha]);
        }
        Frame {
            width: w,
            height: h,
            data,
        }
    }

    fn make_mask(w: u32, h: u32, values: &[u8]) -> Mask {
        Mask {
            width: w,
            height: h,
            data: values.to_vec(),
        }
    }

    #[test]
    fn test_no_mask_returns_input_unchanged() {
        let frame = make_frame(2, 2, 128, 255);
        let effect = MaskIsolate;
        let result = effect
            .process_frame(&frame, None, &serde_json::Map::new())
            .unwrap();
        assert_eq!(result.data, frame.data);
    }

    #[test]
    fn test_white_mask_preserves_alpha() {
        // Mask all white (255) → alpha should be preserved (255 * 255 / 255 = 255)
        let frame = make_frame(2, 2, 128, 255);
        let mask = make_mask(2, 2, &[255, 255, 255, 255]);
        let effect = MaskIsolate;
        let result = effect
            .process_frame(&frame, Some(&mask), &serde_json::Map::new())
            .unwrap();
        // All alpha values should remain 255
        for i in 0..4 {
            assert_eq!(result.data[i * 4 + 3], 255);
        }
    }

    #[test]
    fn test_black_mask_zeros_alpha() {
        // Mask all black (0) → alpha should be 0 (255 * 0 / 255 = 0)
        let frame = make_frame(2, 2, 128, 255);
        let mask = make_mask(2, 2, &[0, 0, 0, 0]);
        let effect = MaskIsolate;
        let result = effect
            .process_frame(&frame, Some(&mask), &serde_json::Map::new())
            .unwrap();
        // All alpha values should be 0
        for i in 0..4 {
            assert_eq!(result.data[i * 4 + 3], 0);
        }
    }

    #[test]
    fn test_partial_mask_isolates_only_masked_region() {
        // 4x1 image, mask = [255, 0, 255, 0]
        // Pixels 0 and 2 should keep alpha=255, pixels 1 and 3 should get alpha=0
        let frame = make_frame(4, 1, 100, 255);
        let mask = make_mask(4, 1, &[255, 0, 255, 0]);
        let effect = MaskIsolate;
        let result = effect
            .process_frame(&frame, Some(&mask), &serde_json::Map::new())
            .unwrap();
        // Pixel 0: mask=255 → alpha stays 255
        assert_eq!(result.data[3], 255);
        // Pixel 1: mask=0 → alpha becomes 0
        assert_eq!(result.data[7], 0);
        // Pixel 2: mask=255 → alpha stays 255
        assert_eq!(result.data[11], 255);
        // Pixel 3: mask=0 → alpha becomes 0
        assert_eq!(result.data[15], 0);
    }

    #[test]
    fn test_half_mask_scales_alpha() {
        // Mask=128 → alpha = 255 * 128 / 255 = 128
        let frame = make_frame(1, 1, 100, 255);
        let mask = make_mask(1, 1, &[128]);
        let effect = MaskIsolate;
        let result = effect
            .process_frame(&frame, Some(&mask), &serde_json::Map::new())
            .unwrap();
        assert_eq!(result.data[3], 128);
    }

    #[test]
    fn test_invert_mask_flips_alpha() {
        // Mask=255 (white), invert=true → apply = 255-255 = 0 → alpha = 0
        // Mask=0 (black), invert=true → apply = 255-0 = 255 → alpha = 255
        let frame = make_frame(2, 1, 100, 255);
        let mask = make_mask(2, 1, &[255, 0]);
        let effect = MaskIsolate;
        let mut params = serde_json::Map::new();
        params.insert("invert".to_string(), serde_json::Value::Bool(true));
        let result = effect.process_frame(&frame, Some(&mask), &params).unwrap();
        // Pixel 0: mask=255, invert → apply=0 → alpha=0
        assert_eq!(result.data[3], 0);
        // Pixel 1: mask=0, invert → apply=255 → alpha=255
        assert_eq!(result.data[7], 255);
    }

    #[test]
    fn test_rgb_channels_unchanged() {
        // MaskIsolate only modifies alpha, RGB should be untouched
        let frame = Frame {
            width: 2,
            height: 1,
            data: vec![100, 150, 200, 255, 50, 60, 70, 255],
        };
        let mask = make_mask(2, 1, &[0, 0]);
        let effect = MaskIsolate;
        let result = effect
            .process_frame(&frame, Some(&mask), &serde_json::Map::new())
            .unwrap();
        // RGB should be unchanged even though alpha is zeroed
        assert_eq!(result.data[0], 100);
        assert_eq!(result.data[1], 150);
        assert_eq!(result.data[2], 200);
        assert_eq!(result.data[4], 50);
        assert_eq!(result.data[5], 60);
        assert_eq!(result.data[6], 70);
    }

    #[test]
    fn test_2d_mask_regional_isolation() {
        // 2x2 image with mask covering only top-left
        let frame = make_frame(2, 2, 100, 255);
        let mask = Mask {
            width: 2,
            height: 2,
            data: vec![255, 0, 0, 0],
        };
        let effect = MaskIsolate;
        let result = effect
            .process_frame(&frame, Some(&mask), &serde_json::Map::new())
            .unwrap();
        // Top-left (0,0): mask=255 → alpha=255
        assert_eq!(result.data[3], 255);
        // Top-right (0,1): mask=0 → alpha=0
        assert_eq!(result.data[7], 0);
        // Bottom-left (1,0): mask=0 → alpha=0
        assert_eq!(result.data[11], 0);
        // Bottom-right (1,1): mask=0 → alpha=0
        assert_eq!(result.data[15], 0);
    }

    #[test]
    fn test_handles_masking_is_true() {
        let effect = MaskIsolate;
        assert!(effect.handles_masking());
    }

    #[test]
    fn test_mask_smaller_than_frame_scales() {
        // 4x4 frame with 2x2 mask — mask is scaled to frame dimensions
        let frame = make_frame(4, 4, 100, 255);
        let mask = make_mask(2, 2, &[255, 0, 0, 0]);
        let effect = MaskIsolate;
        let result = effect
            .process_frame(&frame, Some(&mask), &serde_json::Map::new())
            .unwrap();
        // Top-left quadrant (0,0) maps to mask (0,0)=255 → alpha=255
        assert_eq!(result.data[3], 255);
        // Top-right area (0,2) maps to mask (0,1)=0 → alpha=0
        assert_eq!(result.data[11], 0);
    }
}
