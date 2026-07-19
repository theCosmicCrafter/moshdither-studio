use crate::effects::types::*;
use crate::effects::Effect;
use crate::error::Result;
use serde_json::json;

/// Bayer ordered dithering effect.
pub struct BayerDither {
    #[allow(dead_code)]
    matrix_size: u32,
    #[allow(dead_code)]
    matrix: Vec<Vec<u8>>,
}

impl BayerDither {
    pub fn new(matrix_size: u32) -> Self {
        assert!(
            matrix_size.is_power_of_two() && matrix_size >= 2,
            "matrix_size must be a power of 2 and >= 2"
        );
        let matrix = Self::generate_bayer_matrix(matrix_size);
        Self {
            matrix_size,
            matrix,
        }
    }

    /// Generate a Bayer matrix of size N×N where N is a power of 2.
    fn generate_bayer_matrix(n: u32) -> Vec<Vec<u8>> {
        if n == 2 {
            return vec![vec![0, 2], vec![3, 1]];
        }
        let half = n / 2;
        let prev = Self::generate_bayer_matrix(half);
        let mut matrix = vec![vec![0u8; n as usize]; n as usize];

        for y in 0..half {
            for x in 0..half {
                let v = prev[y as usize][x as usize];
                matrix[y as usize][x as usize] = v * 4;
                matrix[y as usize][(x + half) as usize] = v * 4 + 2;
                matrix[(y + half) as usize][x as usize] = v * 4 + 3;
                matrix[(y + half) as usize][(x + half) as usize] = v * 4 + 1;
            }
        }
        matrix
    }

    /// Apply Bayer dithering to a single pixel.
    /// Classic ordered dither: compare pixel value against scaled threshold.
    fn dither_pixel_static(r: u8, g: u8, b: u8, threshold: u8, ms: usize) -> (u8, u8, u8) {
        // Scale threshold to [0, 255), ensuring white pixels stay white
        let divisor = (ms * ms) as f32;
        let threshold_scaled = (threshold as f32 / divisor) * 255.0;

        // Use luminance for threshold comparison
        let lum = 0.299 * r as f32 + 0.587 * g as f32 + 0.114 * b as f32;

        if lum > threshold_scaled {
            (255, 255, 255)
        } else {
            (0, 0, 0)
        }
    }
}

impl Default for BayerDither {
    fn default() -> Self {
        Self::new(4)
    }
}

impl Effect for BayerDither {
    fn meta(&self) -> EffectMeta {
        EffectMeta {
            id: "dithering.bayer".to_string(),
            name: "Bayer Dither".to_string(),
            category: EffectCategory::Dithering,
            media_type: MediaType::Image,
            parameters: vec![ParameterDef {
                id: "matrix_size".to_string(),
                name: "Matrix Size".to_string(),
                param_type: ParamType::Select,
                default: json!(4),
                min: None,
                max: None,
                step: None,
                options: Some(vec![
                    "2".to_string(),
                    "4".to_string(),
                    "8".to_string(),
                    "16".to_string(),
                ]),
            }],
        }
    }

    fn process_frame(
        &self,
        input: &Frame,
        _mask: Option<&Mask>,
        params: &ParameterValues,
    ) -> Result<Frame> {
        let mut output = input.clone();
        let w = input.width as usize;
        let h = input.height as usize;

        let matrix_size_idx = params
            .get("matrix_size")
            .and_then(|v| v.as_u64())
            .unwrap_or(1) as usize;
        let ms_values = [2, 4, 8, 16];
        let ms = ms_values[matrix_size_idx % 4] as usize;
        let matrix = Self::generate_bayer_matrix(ms as u32);

        for y in 0..h {
            for x in 0..w {
                let idx = (y * w + x) * 4;
                let r = input.data[idx];
                let g = input.data[idx + 1];
                let b = input.data[idx + 2];
                let threshold = matrix[y % ms][x % ms];
                let (dr, dg, db) = Self::dither_pixel_static(r, g, b, threshold, ms);
                output.data[idx] = dr;
                output.data[idx + 1] = dg;
                output.data[idx + 2] = db;
                // Alpha preserved
            }
        }

        Ok(output)
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

    fn make_solid_frame(width: u32, height: u32, r: u8, g: u8, b: u8) -> Frame {
        let mut data = Vec::with_capacity((width * height * 4) as usize);
        for _ in 0..(width * height) {
            data.push(r);
            data.push(g);
            data.push(b);
            data.push(255);
        }
        Frame {
            width,
            height,
            data,
        }
    }

    #[test]
    fn test_bayer_2x2_matrix() {
        let dither = BayerDither::new(2);
        assert_eq!(dither.matrix, vec![vec![0, 2], vec![3, 1]]);
    }

    #[test]
    fn test_bayer_4x4_matrix() {
        let dither = BayerDither::new(4);
        assert_eq!(dither.matrix_size, 4);
        assert_eq!(dither.matrix[0][0], 0);
        assert_eq!(dither.matrix[0][1], 8);
        assert_eq!(dither.matrix[3][3], 5);
    }

    #[test]
    fn test_process_black_frame_stays_black() {
        let dither = BayerDither::new(4);
        let frame = make_solid_frame(8, 8, 0, 0, 0);
        let result = dither
            .process_frame(&frame, None, &serde_json::Map::new())
            .unwrap();

        // All pixels should remain black (0 + threshold is still < 127)
        for i in 0..result.data.len() / 4 {
            assert_eq!(result.data[i * 4], 0);
            assert_eq!(result.data[i * 4 + 1], 0);
            assert_eq!(result.data[i * 4 + 2], 0);
            assert_eq!(result.data[i * 4 + 3], 255);
        }
    }

    #[test]
    fn test_process_white_frame_stays_white() {
        let dither = BayerDither::new(4);
        let frame = make_solid_frame(8, 8, 255, 255, 255);
        let result = dither
            .process_frame(&frame, None, &serde_json::Map::new())
            .unwrap();

        // All pixels should remain white (255 + threshold is still > 127)
        for i in 0..result.data.len() / 4 {
            assert_eq!(result.data[i * 4], 255);
            assert_eq!(result.data[i * 4 + 1], 255);
            assert_eq!(result.data[i * 4 + 2], 255);
            assert_eq!(result.data[i * 4 + 3], 255);
        }
    }

    #[test]
    fn test_gray_frame_produces_pattern() {
        let dither = BayerDither::new(4);
        let frame = make_solid_frame(8, 8, 128, 128, 128);
        let result = dither
            .process_frame(&frame, None, &serde_json::Map::new())
            .unwrap();

        // Should produce a mix of black and white pixels (pattern)
        let mut has_black = false;
        let mut has_white = false;
        for i in 0..result.data.len() / 4 {
            let r = result.data[i * 4];
            if r == 0 {
                has_black = true;
            }
            if r == 255 {
                has_white = true;
            }
        }
        assert!(has_black, "Should have some black pixels");
        assert!(has_white, "Should have some white pixels");
    }

    #[test]
    fn test_alpha_preserved() {
        let dither = BayerDither::new(2);
        let data = vec![128u8, 128, 128, 128];
        let frame = Frame {
            width: 1,
            height: 1,
            data,
        };
        let result = dither
            .process_frame(&frame, None, &serde_json::Map::new())
            .unwrap();
        assert_eq!(result.data[3], 128);
    }
}
