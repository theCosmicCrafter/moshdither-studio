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
        Self::new(0.5, 10.0, 0)
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
                // See pixel_geo::pixel_sort for the measurement behind this: a
                // fixed brightness threshold decides which pixels form a sortable
                // run, so on any image darker than the threshold the effect
                // degenerates to short runs and looks like it is doing nothing.
                // Auto derives it from the frame instead.
                ParameterDef {
                    id: "auto_threshold".to_string(),
                    name: "Auto Threshold".to_string(),
                    param_type: ParamType::Toggle,
                    default: json!(true),
                    min: None,
                    max: None,
                    step: None,
                    options: None,
                },
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
                    // Before the partial-sort fix, this parameter was inert and
                    // every run always sorted fully regardless of its value, so
                    // "1.0" was never actually experienced as "barely sorted" --
                    // it looked identical to 10.0. Now that intensity genuinely
                    // gates how much of each run sorts (sort_count scales
                    // linearly with it), keeping the old default of 1.0 would
                    // silently change the out-of-the-box look to a near-no-op
                    // (sort_count rounds to 1 pixel for most run lengths at
                    // intensity=1.0, which is trivially unsorted). Defaulting to
                    // 10.0 preserves the effect everyone has always actually
                    // seen; lower values are now a real, reachable choice rather
                    // than the accidental default.
                    default: json!(10.0),
                    min: Some(0.0),
                    max: Some(10.0),
                    step: Some(0.1),
                    options: None,
                },
                ParameterDef {
                    id: "u_direction".to_string(),
                    name: "Direction".to_string(),
                    param_type: ParamType::Select,
                    // Must be the option NAME, not an index. `clamp_params`
                    // decides which way to normalise a select from the type of
                    // this default: a number means "the stored value is an
                    // index", a string means "the stored value is a name".
                    // process_frame reads this with `as_str()`, so declaring 0
                    // left the value a number, `as_str()` returned None, and it
                    // fell back to "Horizontal" at every setting -- Vertical was
                    // unreachable. `u_sort_mode` below declares a string and has
                    // always worked, which is why only this one was stuck.
                    default: json!("Horizontal"),
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

        // Auto mode replaces the fixed threshold with the frame's own mean of
        // whatever quantity sort_mode ranks by, so roughly half the pixels
        // qualify at any exposure and runs are long enough to see.
        let auto = params
            .get("auto_threshold")
            .and_then(|v| v.as_bool())
            .unwrap_or(true);

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

        // Computed here rather than with the other parameters because it depends
        // on sort_key, which depends on sort_mode.
        let threshold = if auto {
            let mut sum = 0.0f64;
            let n = (w * h).max(1) as f64;
            for i in (0..data.len()).step_by(4) {
                sum += sort_key(data[i], data[i + 1], data[i + 2]) as f64;
            }
            (sum / n) as f32
        } else {
            threshold
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
                            // Apply intensity as a partial sort: only the first
                            // `sort_count` pixels of the run -- by ORIGINAL
                            // position, not by sorted rank -- are rearranged
                            // among themselves; the remaining pixels of the run
                            // keep their original, unsorted values. At
                            // intensity == 10.0, sort_count == run_len, so the
                            // whole run is sorted among itself, identical to an
                            // unconditional full sort -- this keeps the
                            // established look at the max setting unchanged.
                            let sort_count = ((run_len as f32 * intensity / 10.0).ceil() as usize)
                                .clamp(1, run_len);
                            pixels[..sort_count].sort_by(|a, b| {
                                a.0.partial_cmp(&b.0).unwrap_or(std::cmp::Ordering::Equal)
                            });
                            for (i, (_, px)) in pixels.iter().enumerate().take(sort_count) {
                                let pidx = (row_start + x + i) * 4;
                                data[pidx] = px[0];
                                data[pidx + 1] = px[1];
                                data[pidx + 2] = px[2];
                                data[pidx + 3] = px[3];
                            }
                            // Positions x+sort_count..run_end keep the original
                            // values already present in `data` -- untouched.
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
                            // Same partial-sort intensity gating as the
                            // horizontal branch above -- kept consistent so
                            // Vertical isn't the only direction where intensity
                            // is unreachable.
                            let sort_count = ((run_len as f32 * intensity / 10.0).ceil() as usize)
                                .clamp(1, run_len);
                            pixels[..sort_count].sort_by(|a, b| {
                                a.0.partial_cmp(&b.0).unwrap_or(std::cmp::Ordering::Equal)
                            });
                            for (i, (_, px)) in pixels.iter().enumerate().take(sort_count) {
                                let pidx = ((y + i) * w + x) * 4;
                                data[pidx] = px[0];
                                data[pidx + 1] = px[1];
                                data[pidx + 2] = px[2];
                                data[pidx + 3] = px[3];
                            }
                            // Positions y+sort_count..run_end keep the original
                            // values already present in `data` -- untouched.
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
        // auto_threshold defaults on, which would derive a threshold from this
        // 4-pixel frame. This test pins the MANUAL path at 0.1.
        let mut params = serde_json::Map::new();
        params.insert("auto_threshold".to_string(), serde_json::json!(false));
        params.insert("u_threshold".to_string(), serde_json::json!(0.1));
        let r = e.process_frame(&f, None, &params).unwrap();
        assert_eq!(r.data[0], 128);
        assert_eq!(r.data[4], 180);
        assert_eq!(r.data[8], 200);
        assert_eq!(r.data[12], 255);
    }

    /// Builds an `n`-pixel single row/column with strictly descending gray
    /// values, so a full ascending sort reverses the run with no fixed
    /// points (every pixel moves) while a partial sort of just the first
    /// pixel leaves the run byte-identical to the input.
    fn descending_gray_row(n: usize) -> Vec<u8> {
        let mut d = vec![0u8; n * 4];
        for i in 0..n {
            let g = (250 - i * 30) as u8;
            d[i * 4] = g;
            d[i * 4 + 1] = g;
            d[i * 4 + 2] = g;
            d[i * 4 + 3] = 255;
        }
        d
    }

    fn count_pixel_diffs(a: &[u8], b: &[u8], n: usize) -> usize {
        (0..n).filter(|&i| a[i * 4] != b[i * 4]).count()
    }

    #[test]
    fn test_intensity_scales_sort_extent_horizontal() {
        // Regression/behaviour test for the partial-sort semantic: intensity
        // 0.1 on an 8-pixel run should only ever touch a `sort_count`-sized
        // prefix (here sort_count == 1, which sorting alone can't change),
        // while intensity 10.0 must reproduce the historical full-sort
        // behaviour and rearrange every pixel in this strictly-descending
        // run.
        let d = descending_gray_row(8);
        let f = Frame {
            width: 8,
            height: 1,
            data: d.clone(),
        };
        let mut params = serde_json::Map::new();
        params.insert("auto_threshold".to_string(), serde_json::json!(false));
        params.insert("u_threshold".to_string(), serde_json::json!(0.05));

        let low = SortingGlitch::new(0.05, 0.1, 0);
        let r_low = low.process_frame(&f, None, &params).unwrap();
        let diffs_low = count_pixel_diffs(&r_low.data, &d, 8);

        let high = SortingGlitch::new(0.05, 10.0, 0);
        let r_high = high.process_frame(&f, None, &params).unwrap();
        let diffs_high = count_pixel_diffs(&r_high.data, &d, 8);

        assert_eq!(
            diffs_low, 0,
            "intensity 0.1 should only sort a 1-pixel prefix, which is a no-op"
        );
        assert_eq!(
            diffs_high, 8,
            "intensity 10.0 must fully reverse this strictly-descending run, matching the historical full-sort behaviour"
        );
        assert!(
            diffs_low < diffs_high,
            "lower intensity must produce a less-sorted (fewer changed pixels) result than higher intensity"
        );
    }

    #[test]
    fn test_intensity_scales_sort_extent_vertical() {
        // Same property as the horizontal test, but for the vertical
        // direction branch, which previously had no intensity gating at all
        // (always a full sort regardless of intensity).
        let d = descending_gray_row(8);
        let f = Frame {
            width: 1,
            height: 8,
            data: d.clone(),
        };
        let mut params = serde_json::Map::new();
        params.insert("auto_threshold".to_string(), serde_json::json!(false));
        params.insert("u_threshold".to_string(), serde_json::json!(0.05));
        params.insert("u_direction".to_string(), serde_json::json!("Vertical"));

        let low = SortingGlitch::new(0.05, 0.1, 1);
        let r_low = low.process_frame(&f, None, &params).unwrap();
        let diffs_low = count_pixel_diffs(&r_low.data, &d, 8);

        let high = SortingGlitch::new(0.05, 10.0, 1);
        let r_high = high.process_frame(&f, None, &params).unwrap();
        let diffs_high = count_pixel_diffs(&r_high.data, &d, 8);

        assert_eq!(diffs_low, 0);
        assert_eq!(diffs_high, 8);
        assert!(diffs_low < diffs_high);
    }

    #[test]
    fn test_intensity_ten_matches_full_sort_regression() {
        // Pins intensity == 10.0 to the exact byte-for-byte output of the
        // pre-existing full-sort behaviour (same fixture as
        // test_sorting_glitch_sorts_contiguous_run), so the max setting's
        // established visual cannot silently change.
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
        let mut params = serde_json::Map::new();
        params.insert("auto_threshold".to_string(), serde_json::json!(false));
        params.insert("u_threshold".to_string(), serde_json::json!(0.1));
        let r = e.process_frame(&f, None, &params).unwrap();
        assert_eq!(r.data[0], 128);
        assert_eq!(r.data[4], 180);
        assert_eq!(r.data[8], 200);
        assert_eq!(r.data[12], 255);
    }
}
