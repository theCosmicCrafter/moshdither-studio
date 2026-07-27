use crate::effects::types::*;
use crate::effects::Effect;
use crate::error::Result;
use serde_json::json;

/// Ordered dithering with selectable matrices — Bayer (dispersed) and clustered-dot.
/// Mirrors didder's `odm` subcommand which supports many preprogrammed matrices.
pub struct OrderedDitherVariants;

impl Default for OrderedDitherVariants {
    fn default() -> Self {
        Self
    }
}

/// Get a named ordered dithering matrix as a flat Vec<(row, col, value)>.
/// Values are in range [0, max] where max = rows * cols - 1.
fn get_matrix(name: &str) -> (Vec<Vec<u32>>, usize, usize) {
    match name.to_lowercase().replace('-', "_").as_str() {
        "clustereddot4x4" => {
            // Classic 4x4 clustered dot (AM screen)
            let m = vec![
                vec![12, 5, 6, 13],
                vec![4, 0, 1, 7],
                vec![11, 3, 2, 8],
                vec![15, 10, 9, 14],
            ];
            (m, 4, 4)
        }
        "clustereddotdiagonal8x8" => {
            // 8x8 clustered dot diagonal
            let m = vec![
                vec![24, 10, 12, 26, 35, 47, 49, 37],
                vec![8, 0, 2, 14, 45, 59, 61, 51],
                vec![22, 6, 4, 16, 43, 57, 63, 53],
                vec![30, 20, 18, 28, 33, 41, 55, 39],
                vec![34, 46, 48, 36, 25, 11, 13, 27],
                vec![44, 58, 60, 50, 9, 1, 3, 15],
                vec![42, 56, 62, 52, 23, 7, 5, 17],
                vec![32, 40, 54, 38, 31, 21, 19, 29],
            ];
            (m, 8, 8)
        }
        "clustereddot6x6" => {
            // 6x6 clustered dot
            let m = vec![
                vec![33, 26, 19, 20, 27, 34],
                vec![25, 11, 10, 9, 12, 28],
                vec![18, 8, 0, 1, 13, 21],
                vec![22, 14, 2, 3, 7, 17],
                vec![29, 15, 4, 5, 6, 23],
                vec![35, 30, 24, 16, 31, 32],
            ];
            (m, 6, 6)
        }
        "clustereddotspiral5x5" => {
            // 5x5 clustered dot spiral
            let m = vec![
                vec![20, 15, 10, 5, 0],
                vec![21, 16, 11, 6, 1],
                vec![22, 17, 12, 7, 2],
                vec![23, 18, 13, 8, 3],
                vec![24, 19, 14, 9, 4],
            ];
            (m, 5, 5)
        }
        "clustereddothorizontalline" => {
            // Horizontal line clustered dot (3x6)
            let m = vec![
                vec![15, 14, 13, 12, 11, 10],
                vec![0, 1, 2, 3, 4, 5],
                vec![9, 8, 7, 6, 5, 4],
            ];
            (m, 3, 6)
        }
        "clustereddotverticalline" => {
            // Vertical line clustered dot (6x3)
            let m = vec![
                vec![15, 0, 9],
                vec![14, 1, 8],
                vec![13, 2, 7],
                vec![12, 3, 6],
                vec![11, 4, 5],
                vec![10, 5, 4],
            ];
            (m, 6, 3)
        }
        "vertical5x3" => {
            let m = vec![
                vec![9, 10, 11],
                vec![8, 7, 6],
                vec![5, 4, 3],
                vec![0, 1, 2],
                vec![13, 12, 14],
            ];
            (m, 5, 3)
        }
        "horizontal3x5" => {
            let m = vec![
                vec![9, 8, 7, 6, 5],
                vec![0, 1, 2, 3, 4],
                vec![14, 13, 12, 11, 10],
            ];
            (m, 3, 5)
        }
        "clustereddot8x8" => {
            // 8x8 clustered dot (AM screen, round dot)
            let m = vec![
                vec![24, 10, 12, 26, 35, 47, 49, 37],
                vec![8, 0, 2, 14, 45, 59, 61, 51],
                vec![22, 6, 4, 16, 43, 57, 63, 53],
                vec![30, 20, 18, 28, 33, 41, 55, 39],
                vec![34, 46, 48, 36, 25, 11, 13, 27],
                vec![44, 58, 60, 50, 9, 1, 3, 15],
                vec![42, 56, 62, 52, 23, 7, 5, 17],
                vec![32, 40, 54, 38, 31, 21, 19, 29],
            ];
            (m, 8, 8)
        }
        "clustereddotdiagonal6x6" => {
            // 6x6 diagonal clustered dot
            let m = vec![
                vec![31, 23, 15, 14, 22, 30],
                vec![21, 13, 5, 4, 12, 20],
                vec![11, 3, 0, 1, 9, 18],
                vec![19, 9, 1, 0, 3, 11],
                vec![29, 21, 13, 5, 4, 12],
                vec![35, 27, 19, 17, 25, 33],
            ];
            (m, 6, 6)
        }
        "clustereddotdiagonal8x8_2" => {
            // 8x8 diagonal clustered dot variant 2
            let m = vec![
                vec![48, 29, 30, 36, 49, 59, 60, 55],
                vec![28, 13, 12, 18, 58, 45, 44, 37],
                vec![31, 14, 0, 4, 61, 46, 32, 33],
                vec![35, 17, 5, 1, 57, 43, 21, 22],
                vec![50, 62, 63, 56, 47, 27, 26, 20],
                vec![42, 54, 53, 38, 19, 9, 8, 2],
                vec![39, 40, 41, 25, 16, 3, 7, 11],
                vec![34, 24, 23, 10, 15, 6, 52, 51],
            ];
            (m, 8, 8)
        }
        "clustereddotdiagonal8x8_3" => {
            // 8x8 diagonal clustered dot variant 3
            let m = vec![
                vec![48, 29, 30, 36, 49, 59, 60, 55],
                vec![28, 13, 12, 18, 58, 45, 44, 37],
                vec![31, 14, 0, 4, 61, 46, 32, 33],
                vec![35, 17, 5, 1, 57, 43, 21, 22],
                vec![50, 62, 63, 56, 47, 27, 26, 20],
                vec![42, 54, 53, 38, 19, 9, 8, 2],
                vec![39, 40, 41, 25, 16, 3, 7, 11],
                vec![34, 24, 23, 10, 15, 6, 52, 51],
            ];
            (m, 8, 8)
        }
        "clustereddot6x6_2" => {
            // 6x6 clustered dot variant 2
            let m = vec![
                vec![18, 14, 12, 19, 25, 29],
                vec![13, 9, 6, 8, 11, 24],
                vec![7, 4, 0, 1, 10, 23],
                vec![20, 16, 5, 2, 3, 17],
                vec![26, 21, 15, 10, 8, 22],
                vec![31, 27, 28, 22, 30, 35],
            ];
            (m, 6, 6)
        }
        "clustereddot6x6_3" => {
            // 6x6 clustered dot variant 3 (dispersed cluster)
            let m = vec![
                vec![33, 26, 19, 20, 27, 34],
                vec![25, 11, 10, 9, 12, 28],
                vec![18, 8, 0, 1, 13, 21],
                vec![22, 14, 2, 3, 7, 17],
                vec![29, 15, 4, 5, 6, 23],
                vec![35, 30, 24, 16, 31, 32],
            ];
            (m, 6, 6)
        }
        "clustereddotdiagonal16x16" => {
            // 16x16 diagonal clustered dot
            let m = vec![
                vec![
                    240, 228, 216, 204, 192, 180, 168, 156, 145, 157, 169, 181, 193, 205, 217, 229,
                ],
                vec![
                    227, 215, 203, 191, 179, 167, 155, 143, 132, 144, 156, 168, 180, 192, 204, 216,
                ],
                vec![
                    214, 202, 190, 178, 166, 154, 142, 130, 119, 131, 143, 155, 167, 179, 191, 203,
                ],
                vec![
                    201, 189, 177, 165, 153, 141, 129, 117, 106, 118, 130, 142, 154, 166, 178, 190,
                ],
                vec![
                    188, 176, 164, 152, 140, 128, 116, 104, 93, 105, 117, 129, 141, 153, 165, 177,
                ],
                vec![
                    175, 163, 151, 139, 127, 115, 103, 91, 80, 92, 104, 116, 128, 140, 152, 164,
                ],
                vec![
                    162, 150, 138, 126, 114, 102, 90, 78, 67, 79, 91, 103, 115, 127, 139, 151,
                ],
                vec![
                    149, 137, 125, 113, 101, 89, 77, 65, 54, 66, 78, 90, 102, 114, 126, 138,
                ],
                vec![
                    136, 124, 112, 100, 88, 76, 64, 52, 0, 12, 24, 36, 48, 60, 72, 84,
                ],
                vec![
                    123, 111, 99, 87, 75, 63, 51, 39, 28, 40, 52, 64, 76, 88, 100, 112,
                ],
                vec![
                    110, 98, 86, 74, 62, 50, 38, 26, 15, 27, 39, 51, 63, 75, 87, 99,
                ],
                vec![
                    97, 85, 73, 61, 49, 37, 25, 13, 2, 14, 26, 38, 50, 62, 74, 86,
                ],
                vec![
                    84, 72, 60, 48, 36, 24, 12, 0, 41, 53, 65, 77, 89, 101, 113, 125,
                ],
                vec![
                    71, 59, 47, 35, 23, 11, 0, 28, 54, 66, 78, 90, 102, 114, 126, 138,
                ],
                vec![
                    58, 46, 34, 22, 10, 0, 15, 41, 67, 79, 91, 103, 115, 127, 139, 151,
                ],
                vec![
                    45, 33, 21, 9, 0, 28, 54, 80, 106, 118, 130, 142, 154, 166, 178, 190,
                ],
            ];
            (m, 16, 16)
        }
        _ => {
            // Default: ClusteredDot4x4
            let m = vec![
                vec![12, 5, 6, 13],
                vec![4, 0, 1, 7],
                vec![11, 3, 2, 8],
                vec![15, 10, 9, 14],
            ];
            (m, 4, 4)
        }
    }
}

impl Effect for OrderedDitherVariants {
    fn meta(&self) -> EffectMeta {
        EffectMeta {
            id: "dithering.ordered_variants".to_string(),
            name: "Ordered Dither Variants".to_string(),
            category: EffectCategory::Dithering,
            media_type: MediaType::Image,
            parameters: vec![
                ParameterDef {
                    id: "matrix".to_string(),
                    name: "Matrix".to_string(),
                    param_type: ParamType::Select,
                    default: json!("clustereddot4x4"),
                    min: None,
                    max: None,
                    step: None,
                    options: Some(vec![
                        "clustereddot4x4".to_string(),
                        "clustereddotdiagonal8x8".to_string(),
                        "clustereddot6x6".to_string(),
                        "clustereddotspiral5x5".to_string(),
                        "clustereddothorizontalline".to_string(),
                        "clustereddotverticalline".to_string(),
                        "vertical5x3".to_string(),
                        "horizontal3x5".to_string(),
                        "clustereddot8x8".to_string(),
                        "clustereddotdiagonal6x6".to_string(),
                        "clustereddotdiagonal8x8_2".to_string(),
                        "clustereddotdiagonal8x8_3".to_string(),
                        "clustereddot6x6_2".to_string(),
                        "clustereddot6x6_3".to_string(),
                        "clustereddotdiagonal16x16".to_string(),
                    ]),
                },
                ParameterDef {
                    id: "levels".to_string(),
                    name: "Levels".to_string(),
                    param_type: ParamType::Slider,
                    default: json!(2),
                    min: Some(2.0),
                    max: Some(16.0),
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
        let matrix_name = params
            .get("matrix")
            .and_then(|v| v.as_str())
            .unwrap_or("clustereddot4x4");
        let levels = params.get("levels").and_then(|v| v.as_f64()).unwrap_or(2.0) as u32;
        let levels = levels.max(2);

        let (matrix, rows, cols) = get_matrix(matrix_name);
        let max_val = (rows * cols) as f32; // Use count, not count-1, so thresholds are [0,1)
        let quant_levels = (levels - 1) as f32;
        let step = 255.0 / quant_levels;

        let w = input.width as usize;
        let h = input.height as usize;
        let mut data = input.data.clone();

        for y in 0..h {
            for x in 0..w {
                let idx = (y * w + x) * 4;
                let lum = 0.299 * input.data[idx] as f32
                    + 0.587 * input.data[idx + 1] as f32
                    + 0.114 * input.data[idx + 2] as f32;

                let threshold = matrix[y % rows][x % cols] as f32 / max_val;
                let dithered = lum + (threshold - 0.5) * step;
                let q = (dithered / step).round().clamp(0.0, quant_levels);
                let v = (q * step).clamp(0.0, 255.0) as u8;

                data[idx] = v;
                data[idx + 1] = v;
                data[idx + 2] = v;
                // Alpha preserved
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
    fn test_ordered_variants_preserves_dimensions() {
        let d = vec![128u8; 16 * 4];
        let f = Frame {
            width: 4,
            height: 4,
            data: d,
        };
        let e = OrderedDitherVariants;
        let r = e.process_frame(&f, None, &serde_json::Map::new()).unwrap();
        assert_eq!(r.width, 4);
        assert_eq!(r.height, 4);
        assert_eq!(r.data.len(), 16 * 4);
    }

    #[test]
    fn test_ordered_variants_preserves_alpha() {
        let mut d = vec![128u8; 16 * 4];
        for i in (3..d.len()).step_by(4) {
            d[i] = 200;
        }
        let f = Frame {
            width: 4,
            height: 4,
            data: d,
        };
        let e = OrderedDitherVariants;
        let r = e.process_frame(&f, None, &serde_json::Map::new()).unwrap();
        for i in (3..r.data.len()).step_by(4) {
            assert_eq!(r.data[i], 200);
        }
    }

    #[test]
    fn test_clustereddot4x4_matrix() {
        let (m, rows, cols) = get_matrix("clustereddot4x4");
        assert_eq!(rows, 4);
        assert_eq!(cols, 4);
        assert_eq!(m[1][1], 0); // center should be 0
        assert_eq!(m[0][0], 12);
        assert_eq!(m[3][0], 15);
    }

    #[test]
    fn test_black_stays_black() {
        let d = vec![0u8; 16 * 4];
        let f = Frame {
            width: 4,
            height: 4,
            data: d,
        };
        let e = OrderedDitherVariants;
        let r = e.process_frame(&f, None, &serde_json::Map::new()).unwrap();
        for i in 0..r.data.len() / 4 {
            assert_eq!(r.data[i * 4], 0, "Black should stay black at pixel {}", i);
        }
    }

    #[test]
    fn test_white_stays_white() {
        let d = vec![255u8; 16 * 4];
        let f = Frame {
            width: 4,
            height: 4,
            data: d,
        };
        let e = OrderedDitherVariants;
        let r = e.process_frame(&f, None, &serde_json::Map::new()).unwrap();
        for i in 0..r.data.len() / 4 {
            assert_eq!(r.data[i * 4], 255, "White should stay white at pixel {}", i);
        }
    }

    #[test]
    fn test_gray_produces_pattern() {
        let d = vec![128u8; 64 * 4];
        let f = Frame {
            width: 8,
            height: 8,
            data: d,
        };
        let e = OrderedDitherVariants;
        let r = e.process_frame(&f, None, &serde_json::Map::new()).unwrap();
        let mut has_black = false;
        let mut has_white = false;
        for i in 0..r.data.len() / 4 {
            if r.data[i * 4] == 0 {
                has_black = true;
            }
            if r.data[i * 4] == 255 {
                has_white = true;
            }
        }
        assert!(has_black, "Should have some black pixels");
        assert!(has_white, "Should have some white pixels");
    }
}
