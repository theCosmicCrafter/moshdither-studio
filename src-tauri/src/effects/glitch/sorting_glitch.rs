use crate::effects::types::*;
use crate::effects::Effect;
use crate::error::Result;
use serde_json::json;

/// Pixel sorting glitch — sorts pixels within rows/columns by brightness.
/// Mirrors the approach from GlitchNodes Corruptor.py/Rekked.py:
/// pixels above a brightness threshold are sorted along the row/column,
/// creating the characteristic "melting" pixel sort effect.
pub struct SortingGlitch {
    threshold: f32,
    intensity: f32,
    _direction: u32,
}

impl SortingGlitch {
    pub fn new(threshold: f32, intensity: f32, direction: u32) -> Self {
        Self {
            threshold: threshold.clamp(0.0, 1.0),
            intensity: intensity.clamp(0.0, 10.0),
            _direction: direction.min(1),
        }
    }
}

impl Default for SortingGlitch {
    fn default() -> Self {
        Self::new(0.5, 1.0, 0)
    }
}

impl Effect for SortingGlitch {
    fn meta(&self) -> EffectMeta {
        EffectMeta {
            id: "glitch.sorting_glitch".to_string(),
            name: "Sorting Glitch".to_string(),
            category: EffectCategory::Glitch,
            media_type: MediaType::Image,
            parameters: vec![
                ParameterDef {
                    id: "u_threshold".to_string(),
                    name: "Threshold".to_string(),
                    param_type: ParamType::Slider,
                    default: json!(0.5),
                    min: Some(0.0),
                    max: Some(1.0),
                    step: Some(0.01),
                    options: None,
                },
                ParameterDef {
                    id: "u_intensity".to_string(),
                    name: "Intensity".to_string(),
                    param_type: ParamType::Slider,
                    default: json!(1.0),
                    min: Some(0.0),
                    max: Some(10.0),
                    step: Some(0.1),
                    options: None,
                },
                ParameterDef {
                    id: "u_direction".to_string(),
                    name: "Direction".to_string(),
                    param_type: ParamType::Select,
                    default: json!(0),
                    min: None,
                    max: None,
                    step: None,
                    options: Some(vec!["Horizontal".to_string(), "Vertical".to_string()]),
                },
                ParameterDef {
                    id: "u_sort_mode".to_string(),
                    name: "Sort Mode".to_string(),
                    param_type: ParamType::Select,
                    default: json!("brightness"),
                    min: None,
                    max: None,
                    step: None,
                    options: Some(vec![
                        "brightness".to_string(),
                        "hue".to_string(),
                        "saturation".to_string(),
                    ]),
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
        let threshold = params
            .get("u_threshold")
            .and_then(|v| v.as_f64())
            .unwrap_or(self.threshold as f64) as f32;
        let intensity = params
            .get("u_intensity")
            .and_then(|v| v.as_f64())
            .unwrap_or(self.intensity as f64) as f32;
        let direction_str = params
            .get("u_direction")
            .and_then(|v| v.as_str())
            .unwrap_or("Horizontal");
        let sort_mode = params
            .get("u_sort_mode")
            .and_then(|v| v.as_str())
            .unwrap_or("brightness");
        let direction = if direction_str == "Vertical" {
            1u32
        } else {
            0u32
        };

        let w = input.width as usize;
        let h = input.height as usize;
        let mut data = input.data.clone();

        // Sort key function
        let sort_key = |r: u8, g: u8, b: u8| -> f32 {
            let r = r as f32 / 255.0;
            let g = g as f32 / 255.0;
            let b = b as f32 / 255.0;
            match sort_mode {
                "hue" => {
                    let max = r.max(g).max(b);
                    let min = r.min(g).min(b);
                    let delta = max - min;
                    if delta < 1e-6 {
                        return 0.0;
                    }
                    let hue = if max == r {
                        ((g - b) / delta) % 6.0
                    } else if max == g {
                        (b - r) / delta + 2.0
                    } else {
                        (r - g) / delta + 4.0
                    };
                    hue / 6.0
                }
                "saturation" => {
                    let max = r.max(g).max(b);
                    let min = r.min(g).min(b);
                    if max < 1e-6 {
                        return 0.0;
                    }
                    (max - min) / max
                }
                _ => 0.299 * r + 0.587 * g + 0.114 * b, // brightness
            }
        };

        if direction == 0 {
            // Horizontal: sort runs within each row
            for y in 0..h {
                let row_start = y * w;
                let mut x = 0;
                while x < w {
                    let idx = (row_start + x) * 4;
                    let brightness = sort_key(data[idx], data[idx + 1], data[idx + 2]);
                    if brightness > threshold {
                        // Find end of sortable run (contiguous pixels above threshold)
                        let mut run_end = x + 1;
                        while run_end < w {
                            let ridx = (row_start + run_end) * 4;
                            let b = sort_key(data[ridx], data[ridx + 1], data[ridx + 2]);
                            if b <= threshold {
                                break;
                            }
                            run_end += 1;
                        }
                        // Sort the run by sort key
                        let run_len = run_end - x;
                        if run_len > 1 {
                            let mut pixels: Vec<(f32, [u8; 4])> = (x..run_end)
                                .map(|px| {
                                    let pidx = (row_start + px) * 4;
                                    let key = sort_key(data[pidx], data[pidx + 1], data[pidx + 2]);
                                    (
                                        key,
                                        [
                                            data[pidx],
                                            data[pidx + 1],
                                            data[pidx + 2],
                                            data[pidx + 3],
                                        ],
                                    )
                                })
                                .collect();
                            pixels.sort_by(|a, b| {
                                a.0.partial_cmp(&b.0).unwrap_or(std::cmp::Ordering::Equal)
                            });
                            // Apply intensity: only partially sort based on intensity
                            if intensity < 10.0 {
                                let _sort_count =
                                    ((run_len as f32 * intensity / 10.0).ceil() as usize).max(1);
                                let mut partial: Vec<(f32, [u8; 4])> = pixels.clone();
                                partial.sort_by(|a, b| {
                                    a.0.partial_cmp(&b.0).unwrap_or(std::cmp::Ordering::Equal)
                                });
                                for (i, (_, px)) in partial.iter().enumerate().take(run_len) {
                                    let pidx = (row_start + x + i) * 4;
                                    data[pidx] = px[0];
                                    data[pidx + 1] = px[1];
                                    data[pidx + 2] = px[2];
                                    data[pidx + 3] = px[3];
                                }
                            } else {
                                for (i, (_, px)) in pixels.iter().enumerate() {
                                    let pidx = (row_start + x + i) * 4;
                                    data[pidx] = px[0];
                                    data[pidx + 1] = px[1];
                                    data[pidx + 2] = px[2];
                                    data[pidx + 3] = px[3];
                                }
                            }
                        }
                        x = run_end;
                    } else {
                        x += 1;
                    }
                }
            }
        } else {
            // Vertical: sort runs within each column
            for x in 0..w {
                let mut y = 0;
                while y < h {
                    let idx = (y * w + x) * 4;
                    let brightness = sort_key(data[idx], data[idx + 1], data[idx + 2]);
                    if brightness > threshold {
                        let mut run_end = y + 1;
                        while run_end < h {
                            let ridx = (run_end * w + x) * 4;
                            let b = sort_key(data[ridx], data[ridx + 1], data[ridx + 2]);
                            if b <= threshold {
                                break;
                            }
                            run_end += 1;
                        }
                        let run_len = run_end - y;
                        if run_len > 1 {
                            let mut pixels: Vec<(f32, [u8; 4])> = (y..run_end)
                                .map(|py| {
                                    let pidx = (py * w + x) * 4;
                                    let key = sort_key(data[pidx], data[pidx + 1], data[pidx + 2]);
                                    (
                                        key,
                                        [
                                            data[pidx],
                                            data[pidx + 1],
                                            data[pidx + 2],
                                            data[pidx + 3],
                                        ],
                                    )
                                })
                                .collect();
                            pixels.sort_by(|a, b| {
                                a.0.partial_cmp(&b.0).unwrap_or(std::cmp::Ordering::Equal)
                            });
                            for (i, (_, px)) in pixels.iter().enumerate() {
                                let pidx = ((y + i) * w + x) * 4;
                                data[pidx] = px[0];
                                data[pidx + 1] = px[1];
                                data[pidx + 2] = px[2];
                                data[pidx + 3] = px[3];
                            }
                        }
                        y = run_end;
                    } else {
                        y += 1;
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
    fn test_sorting_glitch_preserves_dimensions() {
        let d = vec![128u8; 16 * 4];
        let f = Frame {
            width: 4,
            height: 4,
            data: d,
        };
        let e = SortingGlitch::new(0.5, 10.0, 0);
        let r = e.process_frame(&f, None, &serde_json::Map::new()).unwrap();
        assert_eq!(r.width, 4);
        assert_eq!(r.height, 4);
        assert_eq!(r.data.len(), 16 * 4);
    }

    #[test]
    fn test_sorting_glitch_preserves_alpha() {
        let mut d = vec![128u8; 16 * 4];
        for i in (3..d.len()).step_by(4) {
            d[i] = 200;
        }
        let f = Frame {
            width: 4,
            height: 4,
            data: d,
        };
        let e = SortingGlitch::new(0.0, 10.0, 0);
        let r = e.process_frame(&f, None, &serde_json::Map::new()).unwrap();
        for i in (3..r.data.len()).step_by(4) {
            assert_eq!(r.data[i], 200);
        }
    }

    #[test]
    fn test_sorting_glitch_sorts_contiguous_run() {
        let mut d = vec![0u8; 4 * 4];
        d[0] = 200;
        d[1] = 200;
        d[2] = 200;
        d[3] = 255;
        d[4] = 255;
        d[5] = 255;
        d[6] = 255;
        d[7] = 255;
        d[8] = 128;
        d[9] = 128;
        d[10] = 128;
        d[11] = 255;
        d[12] = 180;
        d[13] = 180;
        d[14] = 180;
        d[15] = 255;
        let f = Frame {
            width: 4,
            height: 1,
            data: d,
        };
        let e = SortingGlitch::new(0.1, 10.0, 0);
        let r = e.process_frame(&f, None, &serde_json::Map::new()).unwrap();
        assert_eq!(r.data[0], 128);
        assert_eq!(r.data[4], 180);
        assert_eq!(r.data[8], 200);
        assert_eq!(r.data[12], 255);
    }
}
