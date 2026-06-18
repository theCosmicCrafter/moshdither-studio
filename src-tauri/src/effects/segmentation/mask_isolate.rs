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
