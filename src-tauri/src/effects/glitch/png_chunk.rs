//! PNG-aware byte glitch effects.
//!
//! Simulates file-level byte manipulation on PNG-encoded image data, including
//! CRC-aware chunk corruption. Inspired by glitch-tool.py and the glitch-studio
//! dynamic PNG codec. Since we operate on raw RGBA frames (not encoded files),
//! these effects simulate the visual outcome of byte-level PNG corruption:
//! chunk boundary artifacts, CRC mismatch color shifts, and IDAT chunk scrambling.

use crate::effects::types::*;
use crate::effects::Effect;
use crate::error::Result;
use rand::Rng;
use serde_json::json;

/// PNG chunk boundary glitch — simulates corruption at PNG chunk boundaries
/// by applying byte operations at regular intervals that mimic chunk sizes.
pub struct PngChunkGlitch;

impl Default for PngChunkGlitch {
    fn default() -> Self {
        Self
    }
}

impl Effect for PngChunkGlitch {
    fn meta(&self) -> EffectMeta {
        EffectMeta {
            id: "glitch.png_chunk".to_string(),
            name: "PNG Chunk Glitch".to_string(),
            category: EffectCategory::Glitch,
            media_type: MediaType::Image,
            parameters: vec![
                ParameterDef {
                    id: "chunk_interval".to_string(),
                    name: "Chunk Interval".to_string(),
                    param_type: ParamType::Slider,
                    default: json!(4096),
                    min: Some(256.0),
                    max: Some(65536.0),
                    step: Some(256.0),
                    options: None,
                },
                ParameterDef {
                    id: "corruption".to_string(),
                    name: "Corruption".to_string(),
                    param_type: ParamType::Slider,
                    default: json!(0.3),
                    min: Some(0.0),
                    max: Some(1.0),
                    step: Some(0.05),
                    options: None,
                },
            ],
        }
    }

    fn is_temporal(&self) -> bool {
        false
    }

    fn process_frame(
        &self,
        input: &Frame,
        _m: Option<&Mask>,
        params: &ParameterValues,
    ) -> Result<Frame> {
        let chunk_interval = params
            .get("chunk_interval")
            .and_then(|v| v.as_u64())
            .unwrap_or(4096) as usize;
        let corruption = params
            .get("corruption")
            .and_then(|v| v.as_f64())
            .unwrap_or(0.3) as f32;

        let mut data = input.data.clone();
        let mut rng = rand::thread_rng();
        let len = data.len();

        // Simulate PNG chunk boundary corruption
        let mut offset = chunk_interval;
        while offset < len {
            let corrupt_len = (chunk_interval as f32 * corruption) as usize;
            let end = (offset + corrupt_len).min(len);
            for i in offset..end {
                let op = rng.gen_range(0..6u8);
                match op {
                    0 => data[i] = data[i].wrapping_add(rng.gen_range(1..50)),
                    1 => data[i] = data[i].rotate_left(rng.gen_range(1..7u32)),
                    2 => data[i] = !data[i],
                    3 => {
                        let v: u8 = rng.gen();
                        data[i] = v;
                    }
                    4 => data[i] = data[i].wrapping_mul(rng.gen_range(2..5u8)),
                    _ => {
                        let v: u8 = rng.gen();
                        data[i] = data[i] ^ v;
                    }
                }
            }
            offset += chunk_interval;
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

/// Simulates a CRC mismatch on PNG IDAT chunks — produces color band shifts
/// and scanline corruption patterns typical of broken PNG decoders.
pub struct CrcMismatchGlitch;

impl Default for CrcMismatchGlitch {
    fn default() -> Self {
        Self
    }
}

impl Effect for CrcMismatchGlitch {
    fn meta(&self) -> EffectMeta {
        EffectMeta {
            id: "glitch.crc_mismatch".to_string(),
            name: "CRC Mismatch".to_string(),
            category: EffectCategory::Glitch,
            media_type: MediaType::Image,
            parameters: vec![
                ParameterDef {
                    id: "scanline_interval".to_string(),
                    name: "Scanline Interval".to_string(),
                    param_type: ParamType::Slider,
                    default: json!(8),
                    min: Some(1.0),
                    max: Some(64.0),
                    step: Some(1.0),
                    options: None,
                },
                ParameterDef {
                    id: "shift_amount".to_string(),
                    name: "Shift Amount".to_string(),
                    param_type: ParamType::Slider,
                    default: json!(16),
                    min: Some(1.0),
                    max: Some(128.0),
                    step: Some(1.0),
                    options: None,
                },
            ],
        }
    }

    fn is_temporal(&self) -> bool {
        false
    }

    fn process_frame(
        &self,
        input: &Frame,
        _m: Option<&Mask>,
        params: &ParameterValues,
    ) -> Result<Frame> {
        let scanline_interval = params
            .get("scanline_interval")
            .and_then(|v| v.as_u64())
            .unwrap_or(8) as usize;
        let shift_amount = params
            .get("shift_amount")
            .and_then(|v| v.as_u64())
            .unwrap_or(16) as usize;

        let w = input.width as usize;
        let h = input.height as usize;
        let mut data = input.data.clone();

        // Every Nth scanline, shift pixels horizontally (simulating CRC-corrupted
        // scanline filter bytes in PNG IDAT data)
        for y in (0..h).step_by(scanline_interval) {
            let row_start = y * w * 4;
            let row_end = ((y + 1) * w * 4).min(data.len());
            let row = &data[row_start..row_end].to_vec();
            for x in 0..w {
                let src_x = (x + shift_amount) % w;
                let dst_idx = row_start + x * 4;
                let src_idx = row_start + src_x * 4;
                if dst_idx + 3 < data.len() && src_idx + 3 < data.len() {
                    data[dst_idx] = row[src_idx - row_start];
                    data[dst_idx + 1] = row[src_idx - row_start + 1];
                    data[dst_idx + 2] = row[src_idx - row_start + 2];
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

    fn make_frame(w: u32, h: u32) -> Frame {
        let mut data = Vec::with_capacity((w * h * 4) as usize);
        for y in 0..h {
            for x in 0..w {
                data.extend_from_slice(&[(x * 10) as u8, (y * 10) as u8, 128, 255]);
            }
        }
        Frame {
            width: w,
            height: h,
            data,
        }
    }

    #[test]
    fn test_png_chunk_glitch() {
        let e = PngChunkGlitch;
        let f = make_frame(32, 32);
        let mut params = serde_json::Map::new();
        params.insert("chunk_interval".to_string(), json!(512));
        let r = e.process_frame(&f, None, &params).unwrap();
        assert_eq!(r.width, 32);
        assert_eq!(r.height, 32);
        // Some bytes should have changed
        assert_ne!(r.data, f.data);
    }

    #[test]
    fn test_crc_mismatch_glitch() {
        let e = CrcMismatchGlitch;
        let f = make_frame(32, 32);
        let r = e.process_frame(&f, None, &serde_json::Map::new()).unwrap();
        assert_eq!(r.width, 32);
        assert_eq!(r.height, 32);
        // Scanline-shifted data should differ
        assert_ne!(r.data, f.data);
    }
}
