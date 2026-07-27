use crate::effects::types::*;
use crate::effects::Effect;
use crate::error::Result;
use serde_json::json;

/// JPEG re-quantization glitch using a real 8x8 DCT pipeline.
///
/// The frame is converted to YCbCr, each channel is split into 8x8 blocks,
/// forward-DCT'd, quantized with the standard JPEG quantization matrices
/// (scaled by the quality setting exactly as libjpeg does), de-quantized,
/// and inverse-DCT'd back. Low quality settings produce authentic JPEG
/// blocking, ringing, and chroma banding artifacts.
pub struct JpegQuantize {
    quality: u8,
}

/// Standard JPEG luminance quantization matrix (Annex K, Table K.1).
const LUMA_QUANT: [f32; 64] = [
    16.0, 11.0, 10.0, 16.0, 24.0, 40.0, 51.0, 61.0, //
    12.0, 12.0, 14.0, 19.0, 26.0, 58.0, 60.0, 55.0, //
    14.0, 13.0, 16.0, 24.0, 40.0, 57.0, 69.0, 56.0, //
    14.0, 17.0, 22.0, 29.0, 51.0, 87.0, 80.0, 62.0, //
    18.0, 22.0, 37.0, 56.0, 68.0, 109.0, 103.0, 77.0, //
    24.0, 35.0, 55.0, 64.0, 81.0, 104.0, 113.0, 92.0, //
    49.0, 64.0, 78.0, 87.0, 103.0, 121.0, 120.0, 101.0, //
    72.0, 92.0, 95.0, 98.0, 112.0, 100.0, 103.0, 99.0,
];

/// Standard JPEG chrominance quantization matrix (Annex K, Table K.2).
const CHROMA_QUANT: [f32; 64] = [
    17.0, 18.0, 24.0, 47.0, 99.0, 99.0, 99.0, 99.0, //
    18.0, 21.0, 26.0, 66.0, 99.0, 99.0, 99.0, 99.0, //
    24.0, 26.0, 56.0, 99.0, 99.0, 99.0, 99.0, 99.0, //
    47.0, 66.0, 99.0, 99.0, 99.0, 99.0, 99.0, 99.0, //
    99.0, 99.0, 99.0, 99.0, 99.0, 99.0, 99.0, 99.0, //
    99.0, 99.0, 99.0, 99.0, 99.0, 99.0, 99.0, 99.0, //
    99.0, 99.0, 99.0, 99.0, 99.0, 99.0, 99.0, 99.0, //
    99.0, 99.0, 99.0, 99.0, 99.0, 99.0, 99.0, 99.0,
];

impl JpegQuantize {
    pub fn new(quality: u8) -> Self {
        Self {
            quality: quality.clamp(1, 100),
        }
    }
}

impl Default for JpegQuantize {
    fn default() -> Self {
        Self::new(10)
    }
}

/// Scale a base quantization table by quality using the libjpeg formula.
fn scaled_quant_table(base: &[f32; 64], quality: u8) -> [f32; 64] {
    let q = quality.clamp(1, 100) as f32;
    let scale = if q < 50.0 {
        5000.0 / q
    } else {
        200.0 - 2.0 * q
    };
    let mut out = [1.0f32; 64];
    for i in 0..64 {
        out[i] = ((base[i] * scale + 50.0) / 100.0).clamp(1.0, 255.0);
    }
    out
}

/// Forward 8x8 DCT-II (JPEG normalization).
fn fdct_8x8(block: &[f32; 64], out: &mut [f32; 64]) {
    for u in 0..8 {
        for v in 0..8 {
            let cu = if u == 0 {
                std::f32::consts::FRAC_1_SQRT_2
            } else {
                1.0
            };
            let cv = if v == 0 {
                std::f32::consts::FRAC_1_SQRT_2
            } else {
                1.0
            };
            let mut sum = 0.0f32;
            for y in 0..8 {
                for x in 0..8 {
                    sum += block[y * 8 + x]
                        * (((2 * x + 1) as f32 * v as f32 * std::f32::consts::PI) / 16.0).cos()
                        * (((2 * y + 1) as f32 * u as f32 * std::f32::consts::PI) / 16.0).cos();
                }
            }
            out[u * 8 + v] = 0.25 * cu * cv * sum;
        }
    }
}

/// Inverse 8x8 DCT (JPEG normalization).
fn idct_8x8(coeffs: &[f32; 64], out: &mut [f32; 64]) {
    for y in 0..8 {
        for x in 0..8 {
            let mut sum = 0.0f32;
            for u in 0..8 {
                for v in 0..8 {
                    let cu = if u == 0 {
                        std::f32::consts::FRAC_1_SQRT_2
                    } else {
                        1.0
                    };
                    let cv = if v == 0 {
                        std::f32::consts::FRAC_1_SQRT_2
                    } else {
                        1.0
                    };
                    sum += cu
                        * cv
                        * coeffs[u * 8 + v]
                        * (((2 * x + 1) as f32 * v as f32 * std::f32::consts::PI) / 16.0).cos()
                        * (((2 * y + 1) as f32 * u as f32 * std::f32::consts::PI) / 16.0).cos();
                }
            }
            out[y * 8 + x] = 0.25 * sum;
        }
    }
}

/// Run one channel plane through DCT → quantize → dequantize → IDCT.
fn requantize_plane(plane: &mut [f32], w: usize, h: usize, quant: &[f32; 64]) {
    let mut block = [0.0f32; 64];
    let mut coeffs = [0.0f32; 64];
    let mut recon = [0.0f32; 64];

    let bw = w.div_ceil(8);
    let bh = h.div_ceil(8);

    for by in 0..bh {
        for bx in 0..bw {
            // Gather block (clamp-to-edge for partial blocks), centered at 0.
            for y in 0..8 {
                for x in 0..8 {
                    let sx = (bx * 8 + x).min(w - 1);
                    let sy = (by * 8 + y).min(h - 1);
                    block[y * 8 + x] = plane[sy * w + sx] - 128.0;
                }
            }
            fdct_8x8(&block, &mut coeffs);
            for i in 0..64 {
                coeffs[i] = (coeffs[i] / quant[i]).round() * quant[i];
            }
            idct_8x8(&coeffs, &mut recon);
            // Scatter back (only real pixels)
            for y in 0..8 {
                let sy = by * 8 + y;
                if sy >= h {
                    break;
                }
                for x in 0..8 {
                    let sx = bx * 8 + x;
                    if sx >= w {
                        break;
                    }
                    plane[sy * w + sx] = recon[y * 8 + x] + 128.0;
                }
            }
        }
    }
}

impl Effect for JpegQuantize {
    fn meta(&self) -> EffectMeta {
        EffectMeta {
            id: "glitch.jpeg_quantize".to_string(),
            name: "JPEG Quantize".to_string(),
            category: EffectCategory::Glitch,
            media_type: MediaType::Image,
            parameters: vec![ParameterDef {
                id: "quality".to_string(),
                name: "Quality".to_string(),
                param_type: ParamType::Slider,
                default: json!(10),
                min: Some(1.0),
                max: Some(100.0),
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
        let quality = params
            .get("quality")
            .and_then(|v| v.as_u64())
            .unwrap_or(self.quality as u64)
            .clamp(1, 100) as u8;

        let w = input.width as usize;
        let h = input.height as usize;
        if w == 0 || h == 0 {
            return Ok(input.clone());
        }

        let luma_q = scaled_quant_table(&LUMA_QUANT, quality);
        let chroma_q = scaled_quant_table(&CHROMA_QUANT, quality);

        // RGB → YCbCr (BT.601, JPEG full-range)
        let n = w * h;
        let mut y_plane = vec![0.0f32; n];
        let mut cb_plane = vec![0.0f32; n];
        let mut cr_plane = vec![0.0f32; n];
        for (i, chunk) in input.data.chunks_exact(4).enumerate() {
            let r = chunk[0] as f32;
            let g = chunk[1] as f32;
            let b = chunk[2] as f32;
            y_plane[i] = 0.299 * r + 0.587 * g + 0.114 * b;
            cb_plane[i] = 128.0 - 0.168_736 * r - 0.331_264 * g + 0.5 * b;
            cr_plane[i] = 128.0 + 0.5 * r - 0.418_688 * g - 0.081_312 * b;
        }

        requantize_plane(&mut y_plane, w, h, &luma_q);
        requantize_plane(&mut cb_plane, w, h, &chroma_q);
        requantize_plane(&mut cr_plane, w, h, &chroma_q);

        // YCbCr → RGB
        let mut data = input.data.clone();
        for (i, chunk) in data.chunks_exact_mut(4).enumerate() {
            let y = y_plane[i];
            let cb = cb_plane[i] - 128.0;
            let cr = cr_plane[i] - 128.0;
            chunk[0] = (y + 1.402 * cr).clamp(0.0, 255.0) as u8;
            chunk[1] = (y - 0.344_136 * cb - 0.714_136 * cr).clamp(0.0, 255.0) as u8;
            chunk[2] = (y + 1.772 * cb).clamp(0.0, 255.0) as u8;
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

    fn gradient_frame(w: u32, h: u32) -> Frame {
        let mut data = Vec::with_capacity((w * h * 4) as usize);
        for y in 0..h {
            for x in 0..w {
                data.extend_from_slice(&[
                    ((x * 255) / w.max(1)) as u8,
                    ((y * 255) / h.max(1)) as u8,
                    (((x + y) * 128) / (w + h).max(1)) as u8,
                    255,
                ]);
            }
        }
        Frame {
            width: w,
            height: h,
            data,
        }
    }

    #[test]
    fn test_high_quality_nearly_lossless() {
        // At quality 100 the quantization steps are ~1, so the DCT round-trip
        // should reconstruct the image within a small tolerance.
        let frame = gradient_frame(32, 32);
        let effect = JpegQuantize::new(100);
        let mut params = serde_json::Map::new();
        params.insert("quality".to_string(), json!(100));
        let result = effect.process_frame(&frame, None, &params).unwrap();
        let max_err = frame
            .data
            .chunks_exact(4)
            .zip(result.data.chunks_exact(4))
            .flat_map(|(a, b)| (0..3).map(move |c| (a[c] as i32 - b[c] as i32).abs()))
            .max()
            .unwrap();
        assert!(
            max_err <= 8,
            "quality 100 should be near-lossless, max_err={max_err}"
        );
    }

    #[test]
    fn test_low_quality_produces_blocking() {
        // At quality 1 the image should be heavily degraded (real DCT blocking),
        // with 8x8 blocks collapsing toward their DC average.
        let frame = gradient_frame(32, 32);
        let effect = JpegQuantize::new(1);
        let mut params = serde_json::Map::new();
        params.insert("quality".to_string(), json!(1));
        let result = effect.process_frame(&frame, None, &params).unwrap();
        assert_ne!(frame.data, result.data);

        // Within an 8x8 block, quality-1 quantization should leave little
        // variation (mostly the DC term survives).
        let w = 32usize;
        let mut max_in_block_range = 0i32;
        for by in 0..2 {
            for bx in 0..2 {
                let mut min_v = 255i32;
                let mut max_v = 0i32;
                for y in 0..8 {
                    for x in 0..8 {
                        let idx = ((by * 8 + y) * w + bx * 8 + x) * 4;
                        let v = result.data[idx] as i32;
                        min_v = min_v.min(v);
                        max_v = max_v.max(v);
                    }
                }
                max_in_block_range = max_in_block_range.max(max_v - min_v);
            }
        }
        // The original gradient spans ~64 luminance levels per 8px; after
        // quality-1 quantization high-frequency detail should be mostly gone.
        assert!(
            max_in_block_range < 64,
            "expected DC-dominated blocks, range={max_in_block_range}"
        );
    }

    #[test]
    fn test_dct_roundtrip_identity() {
        // FDCT followed by IDCT with no quantization must reproduce the input.
        let mut block = [0.0f32; 64];
        for (i, v) in block.iter_mut().enumerate() {
            *v = ((i * 37) % 256) as f32 - 128.0;
        }
        let mut coeffs = [0.0f32; 64];
        let mut recon = [0.0f32; 64];
        fdct_8x8(&block, &mut coeffs);
        idct_8x8(&coeffs, &mut recon);
        for i in 0..64 {
            assert!(
                (block[i] - recon[i]).abs() < 0.01,
                "DCT roundtrip mismatch at {i}: {} vs {}",
                block[i],
                recon[i]
            );
        }
    }
}
