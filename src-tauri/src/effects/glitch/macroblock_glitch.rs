use crate::effects::types::*;
use crate::effects::Effect;
use crate::error::Result;
use serde_json::json;

/// Macroblock glitch — simulates H.264-style block corruption.
pub struct MacroblockGlitch {
    intensity: f32,
    block_size: f32,
    seed: u32,
}

impl MacroblockGlitch {
    pub fn new(intensity: f32, block_size: f32, seed: u32) -> Self {
        Self {
            intensity: intensity.clamp(0.0, 1.0),
            block_size: block_size.max(1.0),
            seed,
        }
    }
}

impl Default for MacroblockGlitch {
    fn default() -> Self {
        Self::new(0.3, 16.0, 1)
    }
}

impl Effect for MacroblockGlitch {
    fn meta(&self) -> EffectMeta {
        EffectMeta {
            id: "glitch.macroblock_glitch".to_string(),
            name: "Macroblock Glitch".to_string(),
            category: EffectCategory::Glitch,
            media_type: MediaType::Image,
            parameters: vec![
                ParameterDef {
                    id: "u_intensity".to_string(),
                    name: "Intensity".to_string(),
                    param_type: ParamType::Slider,
                    default: json!(0.3),
                    min: Some(0.0),
                    max: Some(1.0),
                    step: Some(0.01),
                    options: None,
                },
                ParameterDef {
                    id: "u_blockSize".to_string(),
                    name: "Block Size".to_string(),
                    param_type: ParamType::Slider,
                    default: json!(16.0),
                    min: Some(1.0),
                    max: Some(64.0),
                    step: Some(1.0),
                    options: None,
                },
                ParameterDef {
                    id: "u_seed".to_string(),
                    name: "Seed".to_string(),
                    param_type: ParamType::Slider,
                    default: json!(1.0),
                    min: Some(0.0),
                    max: Some(1000.0),
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
        let intensity = params
            .get("u_intensity")
            .and_then(|v| v.as_f64())
            .unwrap_or(self.intensity as f64) as f32;
        let block_size = params
            .get("u_blockSize")
            .and_then(|v| v.as_f64())
            .unwrap_or(self.block_size as f64) as f32;
        let seed = params
            .get("u_seed")
            .and_then(|v| v.as_f64())
            .unwrap_or(self.seed as f64) as u32;
        let time = params.get("time").and_then(|v| v.as_f64()).unwrap_or(0.0) as u32;
        let seed = seed.wrapping_add(time.wrapping_mul(2654435761));

        let width = input.width;
        let height = input.height;
        let mut data = input.data.clone();

        fn get_pixel(data: &[u8], width: u32, x: i32, y: i32) -> [u8; 4] {
            let x = x.clamp(0, width as i32 - 1) as usize;
            let y = y.clamp(
                0,
                (data.len() / (width as usize * 4)).saturating_sub(1) as i32,
            ) as usize;
            let idx = (y * width as usize + x) * 4;
            [data[idx], data[idx + 1], data[idx + 2], data[idx + 3]]
        }

        let blocks_x = ((width as f32 / block_size).ceil() as u32).max(1);
        let blocks_y = ((height as f32 / block_size).ceil() as u32).max(1);

        for by in 0..blocks_y {
            for bx in 0..blocks_x {
                let noise = pcg_hash(bx, by, seed);
                if noise > 1.0 - intensity {
                    let x_off = (pcg_hash(bx.wrapping_add(7), by.wrapping_add(13), seed) - 0.5)
                        * intensity
                        * 0.2
                        * width as f32;
                    let y_off = (pcg_hash(bx.wrapping_add(17), by.wrapping_add(31), seed) - 0.5)
                        * intensity
                        * 0.02
                        * height as f32;
                    let mix = pcg_hash(bx.wrapping_add(53), by.wrapping_add(71), seed);

                    let start_x = (bx as f32 * block_size) as u32;
                    let start_y = (by as f32 * block_size) as u32;
                    let end_x = ((bx as f32 + 1.0) * block_size).min(width as f32) as u32;
                    let end_y = ((by as f32 + 1.0) * block_size).min(height as f32) as u32;

                    for y in start_y..end_y {
                        for x in start_x..end_x {
                            let idx = ((y * width + x) * 4) as usize;
                            let a = get_pixel(
                                &input.data,
                                width,
                                x as i32 + x_off.round() as i32,
                                y as i32 + y_off.round() as i32,
                            );
                            let b = get_pixel(
                                &input.data,
                                width,
                                x as i32 - x_off.round() as i32,
                                y as i32 - y_off.round() as i32,
                            );
                            for c in 0..4 {
                                let mixed =
                                    (a[c] as f32 * (1.0 - mix) + b[c] as f32 * mix).round() as u8;
                                data[idx + c] = mixed;
                            }
                        }
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

fn pcg_hash(x: u32, y: u32, seed: u32) -> f32 {
    let mut state = seed
        .wrapping_add(x.wrapping_mul(374761393))
        .wrapping_add(y.wrapping_mul(668265263));
    state = state.wrapping_mul(1664525).wrapping_add(1013904223);
    let mut word = state;
    word = (word ^ (word >> 16)).wrapping_mul(0x85ebca6b);
    word = (word ^ (word >> 13)).wrapping_mul(0xc2b2ae35);
    word = word ^ (word >> 16);
    (word as f32) / (u32::MAX as f32)
}
