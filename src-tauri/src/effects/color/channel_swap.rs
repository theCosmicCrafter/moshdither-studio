use crate::effects::types::*;
use crate::effects::Effect;
use crate::error::Result;
use serde_json::json;

/// Channel swap — swap RGB channels.
pub struct ChannelSwap {
    mode: u32,
}

impl ChannelSwap {
    pub fn new(mode: u32) -> Self { Self { mode: mode % 6 } }
}

impl Default for ChannelSwap {
    fn default() -> Self { Self::new(1) }
}

impl Effect for ChannelSwap {
    fn meta(&self) -> EffectMeta {
        EffectMeta {
            id: "color.channel_swap".to_string(),
            name: "Channel Swap".to_string(),
            category: EffectCategory::Color,
            media_type: MediaType::Both,
            parameters: vec![
                ParameterDef {
                    id: "mode".to_string(),
                    name: "Mode".to_string(),
                    param_type: ParamType::Select,
                    default: json!(1),
                    min: None,
                    max: None,
                    step: None,
                    options: Some(vec![
                        "RGB".to_string(), "RBG".to_string(), "GRB".to_string(),
                        "GBR".to_string(), "BRG".to_string(), "BGR".to_string(),
                    ]),
                },
            ],
        }
    }

    fn process_frame(&self, input: &Frame, _m: Option<&Mask>, params: &ParameterValues) -> Result<Frame> {
        let mode = params.get("mode").and_then(|v| v.as_u64()).unwrap_or(self.mode as u64) as usize;
        let mut data = input.data.clone();
        let map: [(usize, usize, usize); 6] = [
            (0, 1, 2), (0, 2, 1), (1, 0, 2),
            (1, 2, 0), (2, 0, 1), (2, 1, 0),
        ];
        let (r_idx, g_idx, b_idx) = map[mode % 6];

        for chunk in data.chunks_exact_mut(4) {
            let r = chunk[r_idx];
            let g = chunk[g_idx];
            let b = chunk[b_idx];
            chunk[0] = r;
            chunk[1] = g;
            chunk[2] = b;
        }
        Ok(Frame { width: input.width, height: input.height, data })
    }

    fn process_video(&self, input: &VideoSegment, mask: Option<&Mask>, params: &ParameterValues) -> Result<VideoSegment> {
        let mut frames = Vec::with_capacity(input.frames.len());
        for frame in &input.frames { frames.push(self.process_frame(frame, mask, params)?); }
        Ok(VideoSegment { frames, fps: input.fps })
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_channel_swap() {
        let d = vec![255u8, 0, 0, 255]; // red
        let f = Frame { width: 1, height: 1, data: d };
        let e = ChannelSwap::new(2); // GRB
        let r = e.process_frame(&f, None, &serde_json::Map::new()).unwrap();
        assert_eq!(r.data[0], 0);  // G
        assert_eq!(r.data[1], 255); // R
        assert_eq!(r.data[2], 0);  // B
    }
}