use crate::effects::types::*;
use crate::effects::Effect;
use crate::error::Result;
use rand::Rng;
use serde_json::json;

/// Helper: read an audio param as f32, defaulting to 0.0 if absent.
fn audio_f32(params: &ParameterValues, key: &str) -> f32 {
    params.get(key).and_then(|v| v.as_f64()).unwrap_or(0.0) as f32
}

// ─── BassPulse ───────────────────────────────────────────────────────────
/// Scales pixel blocks outward based on bass energy.
/// Creates a "pulsing" zoom effect synced to the bass frequencies.
pub struct BassPulse;

impl Default for BassPulse {
    fn default() -> Self {
        Self
    }
}

impl Effect for BassPulse {
    fn meta(&self) -> EffectMeta {
        EffectMeta {
            id: "audio_reactive.bass_pulse".to_string(),
            name: "Bass Pulse".to_string(),
            category: EffectCategory::AudioReactive,
            media_type: MediaType::Both,
            parameters: vec![
                ParameterDef {
                    id: "sensitivity".to_string(),
                    name: "Sensitivity".to_string(),
                    param_type: ParamType::Slider,
                    default: json!(1.0),
                    min: Some(0.1),
                    max: Some(5.0),
                    step: Some(0.1),
                    options: None,
                },
                ParameterDef {
                    id: "block_size".to_string(),
                    name: "Block Size".to_string(),
                    param_type: ParamType::Slider,
                    default: json!(16),
                    min: Some(4.0),
                    max: Some(64.0),
                    step: Some(4.0),
                    options: None,
                },
            ],
        }
    }

    fn process_frame(
        &self,
        input: &Frame,
        _m: Option<&Mask>,
        params: &ParameterValues,
    ) -> Result<Frame> {
        let sensitivity = params
            .get("sensitivity")
            .and_then(|v| v.as_f64())
            .unwrap_or(1.0) as f32;
        let block_size = params
            .get("block_size")
            .and_then(|v| v.as_u64())
            .unwrap_or(16) as usize;

        let bass = audio_f32(params, "_audio_bass");
        let pulse = bass * sensitivity;

        if pulse <= 0.01 {
            return Ok(input.clone());
        }

        let w = input.width as usize;
        let h = input.height as usize;
        let mut out = vec![0u8; input.data.len()];

        let cx = w as f32 / 2.0;
        let cy = h as f32 / 2.0;
        let scale = 1.0 + pulse * 0.15;

        for by in (0..h).step_by(block_size) {
            for bx in (0..w).step_by(block_size) {
                let bw = block_size.min(w - bx);
                let bh = block_size.min(h - by);

                let block_cx = bx as f32 + bw as f32 / 2.0;
                let block_cy = by as f32 + bh as f32 / 2.0;
                let dx = block_cx - cx;
                let dy = block_cy - cy;
                let new_cx = cx + dx * scale;
                let new_cy = cy + dy * scale;
                let src_x = (new_cx - bw as f32 / 2.0).round() as i64;
                let src_y = (new_cy - bh as f32 / 2.0).round() as i64;

                for py in 0..bh {
                    for px in 0..bw {
                        let sx = (src_x + px as i64).clamp(0, w as i64 - 1) as usize;
                        let sy = (src_y + py as i64).clamp(0, h as i64 - 1) as usize;
                        let dst_idx = ((by + py) * w + (bx + px)) * 4;
                        let src_idx = (sy * w + sx) * 4;
                        out[dst_idx] = input.data[src_idx];
                        out[dst_idx + 1] = input.data[src_idx + 1];
                        out[dst_idx + 2] = input.data[src_idx + 2];
                        out[dst_idx + 3] = input.data[src_idx + 3];
                    }
                }
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
    ) -> Result<VideoSegment> {
        let frames: Vec<Frame> = input
            .frames
            .iter()
            .map(|f| self.process_frame(f, mask, params))
            .collect::<Result<Vec<_>>>()?;
        Ok(VideoSegment {
            frames,
            fps: input.fps,
        })
    }
}

// ─── BeatGlitch ──────────────────────────────────────────────────────────
/// Triggers databend-style pixel corruption on bass beat hits.
/// When `_audio_beat_bass` > 0.5, injects random byte corruption.
pub struct BeatGlitch;

impl Default for BeatGlitch {
    fn default() -> Self {
        Self
    }
}

impl Effect for BeatGlitch {
    fn meta(&self) -> EffectMeta {
        EffectMeta {
            id: "audio_reactive.beat_glitch".to_string(),
            name: "Beat Glitch".to_string(),
            category: EffectCategory::AudioReactive,
            media_type: MediaType::Both,
            parameters: vec![
                ParameterDef {
                    id: "corruption".to_string(),
                    name: "Corruption Amount".to_string(),
                    param_type: ParamType::Slider,
                    default: json!(0.5),
                    min: Some(0.0),
                    max: Some(1.0),
                    step: Some(0.05),
                    options: None,
                },
                ParameterDef {
                    id: "trigger_threshold".to_string(),
                    name: "Trigger Threshold".to_string(),
                    param_type: ParamType::Slider,
                    default: json!(0.5),
                    min: Some(0.0),
                    max: Some(1.0),
                    step: Some(0.05),
                    options: None,
                },
            ],
        }
    }

    fn process_frame(
        &self,
        input: &Frame,
        _m: Option<&Mask>,
        params: &ParameterValues,
    ) -> Result<Frame> {
        let corruption = params
            .get("corruption")
            .and_then(|v| v.as_f64())
            .unwrap_or(0.5) as f32;
        let threshold = params
            .get("trigger_threshold")
            .and_then(|v| v.as_f64())
            .unwrap_or(0.5) as f32;

        let beat_bass = audio_f32(params, "_audio_beat_bass");
        let beat_energy = audio_f32(params, "_audio_beat_energy");

        let trigger = if beat_bass > threshold {
            1.0
        } else if beat_energy > threshold {
            beat_energy
        } else {
            0.0
        };

        if trigger <= 0.01 {
            return Ok(input.clone());
        }

        let mut rng = rand::thread_rng();
        let mut out = input.data.clone();
        let len = out.len();

        let corruption_count = (len as f32 * corruption * trigger * 0.08) as usize;
        for _ in 0..corruption_count {
            let i = rng.gen_range(0..len.saturating_sub(3));
            if i % 4 != 3 {
                let val = rng.gen_range(0..255);
                out[i] = val;
            }
        }

        // Row glitch on beat
        let w = input.width as usize;
        let h = input.height as usize;
        let glitch_rows = (trigger * corruption * 5.0) as usize;
        for _ in 0..glitch_rows {
            let row = rng.gen_range(0..h);
            let shift = rng.gen_range(1..(w / 8).max(2));
            let row_start = row * w * 4;
            let mut temp = vec![0u8; w * 4];
            for x in 0..w {
                let src_x = (x + shift) % w;
                let dst = x * 4;
                let src = src_x * 4;
                temp[dst] = out[row_start + src];
                temp[dst + 1] = out[row_start + src + 1];
                temp[dst + 2] = out[row_start + src + 2];
                temp[dst + 3] = out[row_start + src + 3];
            }
            out[row_start..row_start + w * 4].copy_from_slice(&temp);
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
    ) -> Result<VideoSegment> {
        let frames: Vec<Frame> = input
            .frames
            .iter()
            .map(|f| self.process_frame(f, mask, params))
            .collect::<Result<Vec<_>>>()?;
        Ok(VideoSegment {
            frames,
            fps: input.fps,
        })
    }
}

// ─── SpectralShift ───────────────────────────────────────────────────────
/// Shifts hue based on spectral centroid.
/// High-frequency content shifts toward cool colors, low-frequency toward warm.
pub struct SpectralShift;

impl Default for SpectralShift {
    fn default() -> Self {
        Self
    }
}

impl Effect for SpectralShift {
    fn meta(&self) -> EffectMeta {
        EffectMeta {
            id: "audio_reactive.spectral_shift".to_string(),
            name: "Spectral Shift".to_string(),
            category: EffectCategory::AudioReactive,
            media_type: MediaType::Both,
            parameters: vec![ParameterDef {
                id: "shift_amount".to_string(),
                name: "Shift Amount".to_string(),
                param_type: ParamType::Slider,
                default: json!(0.5),
                min: Some(0.0),
                max: Some(2.0),
                step: Some(0.05),
                options: None,
            }],
        }
    }

    fn process_frame(
        &self,
        input: &Frame,
        _m: Option<&Mask>,
        params: &ParameterValues,
    ) -> Result<Frame> {
        let shift_amount = params
            .get("shift_amount")
            .and_then(|v| v.as_f64())
            .unwrap_or(0.5) as f32;

        let centroid = audio_f32(params, "_audio_centroid");
        let flux = audio_f32(params, "_audio_flux");

        // Normalize centroid (typically 0-8000 Hz range)
        let centroid_norm = (centroid / 4000.0).clamp(0.0, 2.0);
        let flux_norm = (flux / 100.0).clamp(0.0, 2.0);

        let hue_shift = (centroid_norm + flux_norm) * shift_amount;

        if hue_shift.abs() < 0.01 {
            return Ok(input.clone());
        }

        let mut out = input.data.clone();

        for i in (0..out.len()).step_by(4) {
            let r = out[i] as f32;
            let g = out[i + 1] as f32;
            let b = out[i + 2] as f32;

            // Simple hue rotation via channel mixing
            let angle = hue_shift * 0.5;
            let cos_a = angle.cos();
            let sin_a = angle.sin();

            // YIQ-style rotation
            let y = 0.299 * r + 0.587 * g + 0.114 * b;
            let i_channel = 0.596 * r - 0.275 * g - 0.321 * b;
            let q = 0.212 * r - 0.523 * g + 0.311 * b;

            let i_new = i_channel * cos_a - q * sin_a;
            let q_new = i_channel * sin_a + q * cos_a;

            let new_r = y + 0.956 * i_new + 0.621 * q_new;
            let new_g = y - 0.272 * i_new - 0.647 * q_new;
            let new_b = y - 1.105 * i_new + 1.702 * q_new;

            out[i] = new_r.clamp(0.0, 255.0) as u8;
            out[i + 1] = new_g.clamp(0.0, 255.0) as u8;
            out[i + 2] = new_b.clamp(0.0, 255.0) as u8;
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
    ) -> Result<VideoSegment> {
        let frames: Vec<Frame> = input
            .frames
            .iter()
            .map(|f| self.process_frame(f, mask, params))
            .collect::<Result<Vec<_>>>()?;
        Ok(VideoSegment {
            frames,
            fps: input.fps,
        })
    }
}

// ─── AudioDither ─────────────────────────────────────────────────────────
/// Modulates dithering threshold based on audio energy.
/// Creates audio-reactive pixelation/dithering that pulses with the music.
pub struct AudioDither;

impl Default for AudioDither {
    fn default() -> Self {
        Self
    }
}

impl Effect for AudioDither {
    fn meta(&self) -> EffectMeta {
        EffectMeta {
            id: "audio_reactive.audio_dither".to_string(),
            name: "Audio Dither".to_string(),
            category: EffectCategory::AudioReactive,
            media_type: MediaType::Both,
            parameters: vec![
                ParameterDef {
                    id: "base_threshold".to_string(),
                    name: "Base Threshold".to_string(),
                    param_type: ParamType::Slider,
                    default: json!(128),
                    min: Some(1.0),
                    max: Some(254.0),
                    step: Some(1.0),
                    options: None,
                },
                ParameterDef {
                    id: "modulation".to_string(),
                    name: "Modulation Depth".to_string(),
                    param_type: ParamType::Slider,
                    default: json!(0.5),
                    min: Some(0.0),
                    max: Some(1.0),
                    step: Some(0.05),
                    options: None,
                },
                ParameterDef {
                    id: "palette_size".to_string(),
                    name: "Palette Size".to_string(),
                    param_type: ParamType::Slider,
                    default: json!(4),
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
        _m: Option<&Mask>,
        params: &ParameterValues,
    ) -> Result<Frame> {
        let base_threshold = params
            .get("base_threshold")
            .and_then(|v| v.as_f64())
            .unwrap_or(128.0) as f32;
        let modulation = params
            .get("modulation")
            .and_then(|v| v.as_f64())
            .unwrap_or(0.5) as f32;
        let palette_size = params
            .get("palette_size")
            .and_then(|v| v.as_u64())
            .unwrap_or(4) as usize;

        let energy = audio_f32(params, "_audio_energy");
        let rms = audio_f32(params, "_audio_rms");

        // Modulate threshold based on audio energy
        let audio_mod = (energy + rms * 0.5) * modulation;
        let threshold = (base_threshold + audio_mod * 60.0).clamp(1.0, 254.0);

        let mut out = input.data.clone();
        let step = 255 / palette_size.max(1);

        for i in (0..out.len()).step_by(4) {
            for c in 0..3 {
                let val = out[i + c] as f32;
                // Ordered dithering with audio-modulated threshold
                let x = (i / 4) % input.width as usize;
                let y = (i / 4) / input.width as usize;
                let bayer = ((x & 1) ^ (y & 1)) as f32 * threshold * 0.5;
                let dithered = val + bayer - threshold * 0.5;
                let quantized =
                    ((dithered / step as f32).round() * step as f32).clamp(0.0, 255.0) as u8;
                out[i + c] = quantized;
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
    ) -> Result<VideoSegment> {
        let frames: Vec<Frame> = input
            .frames
            .iter()
            .map(|f| self.process_frame(f, mask, params))
            .collect::<Result<Vec<_>>>()?;
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
        Frame {
            width: w,
            height: h,
            data: vec![128u8; (w * h * 4) as usize],
        }
    }

    fn make_segment(n: usize) -> VideoSegment {
        let frames: Vec<Frame> = (0..n)
            .map(|i| Frame {
                width: 8,
                height: 8,
                data: vec![i as u8; 256],
            })
            .collect();
        VideoSegment { frames, fps: 30.0 }
    }

    fn audio_params(bass: f64, beat: f64, energy: f64, centroid: f64) -> ParameterValues {
        let mut p = serde_json::Map::new();
        p.insert("_audio_bass".to_string(), json!(bass));
        p.insert("_audio_beat_bass".to_string(), json!(beat));
        p.insert("_audio_beat_energy".to_string(), json!(energy));
        p.insert("_audio_energy".to_string(), json!(energy));
        p.insert("_audio_rms".to_string(), json!(energy * 0.5));
        p.insert("_audio_centroid".to_string(), json!(centroid));
        p.insert("_audio_flux".to_string(), json!(50.0));
        p
    }

    #[test]
    fn test_bass_pulse_no_audio() {
        let e = BassPulse;
        let f = make_frame(16, 16);
        let params = serde_json::Map::new();
        let r = e.process_frame(&f, None, &params).unwrap();
        // Without audio, should return input unchanged
        assert_eq!(r.data, f.data);
    }

    #[test]
    fn test_bass_pulse_with_audio() {
        let e = BassPulse;
        let f = make_frame(16, 16);
        let params = audio_params(0.8, 0.0, 0.5, 1000.0);
        let r = e.process_frame(&f, None, &params).unwrap();
        assert_eq!(r.width, 16);
        assert_eq!(r.height, 16);
    }

    #[test]
    fn test_beat_glitch_no_beat() {
        let e = BeatGlitch;
        let f = make_frame(16, 16);
        let params = audio_params(0.0, 0.0, 0.0, 0.0);
        let r = e.process_frame(&f, None, &params).unwrap();
        // No beat → no glitch → same as input
        assert_eq!(r.data, f.data);
    }

    #[test]
    fn test_beat_glitch_with_beat() {
        let e = BeatGlitch;
        let f = make_frame(16, 16);
        let params = audio_params(0.9, 1.0, 0.8, 0.0);
        let r = e.process_frame(&f, None, &params).unwrap();
        assert_eq!(r.width, 16);
        assert_eq!(r.height, 16);
        // With beat, data should change
        assert_ne!(r.data, f.data);
    }

    #[test]
    fn test_spectral_shift_no_audio() {
        let e = SpectralShift;
        let f = make_frame(16, 16);
        let params = serde_json::Map::new();
        let r = e.process_frame(&f, None, &params).unwrap();
        assert_eq!(r.data, f.data);
    }

    #[test]
    fn test_spectral_shift_with_audio() {
        let e = SpectralShift;
        // Use a colorful frame — hue rotation has no effect on uniform gray (zero chrominance)
        let mut data = vec![0u8; 16 * 16 * 4];
        for i in 0..256 {
            data[i * 4] = 200; // R
            data[i * 4 + 1] = 50; // G
            data[i * 4 + 2] = 100; // B
            data[i * 4 + 3] = 255;
        }
        let f = Frame {
            width: 16,
            height: 16,
            data,
        };
        let params = audio_params(0.0, 0.0, 0.5, 2000.0);
        let r = e.process_frame(&f, None, &params).unwrap();
        assert_eq!(r.width, 16);
        assert_eq!(r.height, 16);
        assert_ne!(r.data, f.data);
    }

    #[test]
    fn test_audio_dither_no_audio() {
        let e = AudioDither;
        let f = make_frame(16, 16);
        let mut params = serde_json::Map::new();
        params.insert("base_threshold".to_string(), json!(128));
        params.insert("palette_size".to_string(), json!(4));
        let r = e.process_frame(&f, None, &params).unwrap();
        assert_eq!(r.width, 16);
        assert_eq!(r.height, 16);
        // Even without audio, dithering should apply
        assert_ne!(r.data, f.data);
    }

    #[test]
    fn test_audio_dither_with_audio() {
        let e = AudioDither;
        let f = make_frame(16, 16);
        let mut params = audio_params(0.0, 0.0, 0.8, 1000.0);
        params.insert("base_threshold".to_string(), json!(100));
        params.insert("palette_size".to_string(), json!(8));
        let r = e.process_frame(&f, None, &params).unwrap();
        assert_eq!(r.width, 16);
        assert_eq!(r.height, 16);
    }

    #[test]
    fn test_bass_pulse_video() {
        let e = BassPulse;
        let seg = make_segment(5);
        let params = audio_params(0.5, 0.0, 0.3, 500.0);
        let r = e.process_video(&seg, None, &params).unwrap();
        assert_eq!(r.frames.len(), 5);
    }

    #[test]
    fn test_beat_glitch_video() {
        let e = BeatGlitch;
        let seg = make_segment(5);
        let params = audio_params(0.0, 1.0, 0.9, 0.0);
        let r = e.process_video(&seg, None, &params).unwrap();
        assert_eq!(r.frames.len(), 5);
    }
}
