//! Audio-reactive effects whose WebGL shaders already existed but had no Rust
//! counterpart, so no effect could be registered for them and they shipped as
//! dead code in the engine bundle.
//!
//! Two of these composite a visualiser over the frame (spectrum, waveform) and
//! two modulate an existing look by an audio feature (chromatic, pixelate).
//! All read the `_audio_*` params the export bake injects per frame, which is
//! the same data the shaders receive as uniforms -- so preview and export are
//! driven by one analysis rather than two that could drift apart.

use crate::effects::types::*;
use crate::effects::Effect;
use crate::error::Result;
use serde_json::json;

/// Read an audio param as f32, defaulting to 0.0 when the bake is absent.
/// A missing value means "no audio", which every effect below treats as a
/// no-op rather than as silence-shaped input.
fn audio_f32(params: &ParameterValues, key: &str) -> f32 {
    params.get(key).and_then(|v| v.as_f64()).unwrap_or(0.0) as f32
}

fn f32_param(params: &ParameterValues, key: &str, fallback: f32) -> f32 {
    params
        .get(key)
        .and_then(|v| v.as_f64())
        .unwrap_or(fallback as f64) as f32
}

/// Alpha-composite a colour over RGBA data in place.
fn blend_over(dst: &mut [u8], offset: usize, src: [f32; 3], alpha: f32) {
    let a = alpha.clamp(0.0, 1.0);
    if a <= 0.0 {
        return;
    }
    for c in 0..3 {
        let base = dst[offset + c] as f32;
        dst[offset + c] = (base * (1.0 - a) + src[c] * 255.0 * a).clamp(0.0, 255.0) as u8;
    }
}

/// The seven band energies the bake injects, low to high.
fn audio_bands(params: &ParameterValues) -> [f32; 7] {
    [
        audio_f32(params, "_audio_sub_bass"),
        audio_f32(params, "_audio_bass"),
        audio_f32(params, "_audio_low_mid"),
        audio_f32(params, "_audio_mid"),
        audio_f32(params, "_audio_high_mid"),
        audio_f32(params, "_audio_presence"),
        audio_f32(params, "_audio_brilliance"),
    ]
}

// ─── Spectrum ────────────────────────────────────────────────────────────

/// Composites a band-energy spectrum analyser over the frame.
///
/// The bars are drawn from the band energies in the bake rather than from a
/// fresh FFT here: the analysis already happened once, and repeating it would
/// let the exported bars disagree with the ones previewed.
pub struct AudioSpectrum;

impl Default for AudioSpectrum {
    fn default() -> Self {
        Self
    }
}

impl Effect for AudioSpectrum {
    fn meta(&self) -> EffectMeta {
        EffectMeta {
            id: "audio_reactive.spectrum".to_string(),
            name: "Audio Spectrum".to_string(),
            category: EffectCategory::AudioReactive,
            media_type: MediaType::Both,
            parameters: vec![
                ParameterDef {
                    id: "intensity".to_string(),
                    name: "Intensity".to_string(),
                    param_type: ParamType::Slider,
                    default: json!(1.0),
                    min: Some(0.0),
                    max: Some(2.0),
                    step: Some(0.05),
                    options: None,
                },
                ParameterDef {
                    id: "bar_count".to_string(),
                    name: "Bars".to_string(),
                    param_type: ParamType::Slider,
                    default: json!(7.0),
                    min: Some(1.0),
                    max: Some(7.0),
                    step: Some(1.0),
                    options: None,
                },
                ParameterDef {
                    id: "height".to_string(),
                    name: "Max Height".to_string(),
                    param_type: ParamType::Slider,
                    default: json!(0.4),
                    min: Some(0.05),
                    max: Some(1.0),
                    step: Some(0.05),
                    options: None,
                },
                ParameterDef {
                    id: "opacity".to_string(),
                    name: "Opacity".to_string(),
                    param_type: ParamType::Slider,
                    default: json!(0.85),
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
        let intensity = f32_param(params, "intensity", 1.0);
        let bar_count = f32_param(params, "bar_count", 7.0).clamp(1.0, 7.0) as usize;
        let max_height = f32_param(params, "height", 0.4).clamp(0.01, 1.0);
        let opacity = f32_param(params, "opacity", 0.85).clamp(0.0, 1.0);
        let bands = audio_bands(params);

        // With no audio the frame passes through untouched, so leaving this in
        // a stack costs nothing until a track is loaded.
        if intensity <= 0.0 || opacity <= 0.0 || bands.iter().all(|b| *b <= 0.001) {
            return Ok(input.clone());
        }

        let w = input.width as usize;
        let h = input.height as usize;
        let mut out = input.data.clone();
        let bar_w = (w as f32 / bar_count as f32).max(1.0);

        for (i, band) in bands.iter().take(bar_count).enumerate() {
            let level = (band * intensity).clamp(0.0, 1.0);
            let bar_h = (level * max_height * h as f32) as usize;
            if bar_h == 0 {
                continue;
            }
            let x0 = (i as f32 * bar_w) as usize;
            let x1 = (((i + 1) as f32 * bar_w) as usize).min(w);
            // Hue walks low-to-high so the bands stay tellable apart.
            let t = i as f32 / bar_count.max(1) as f32;
            let color = [1.0 - t * 0.5, 0.3 + t * 0.5, 0.6 + t * 0.4];

            for y in h.saturating_sub(bar_h)..h {
                for x in x0..x1 {
                    blend_over(&mut out, (y * w + x) * 4, color, level * opacity);
                }
            }
        }

        Ok(Frame {
            width: input.width,
            height: input.height,
            data: out,
        })
    }

    /// Frame-independent: each frame's look is a function of that frame's own
    /// audio params, so mapping is correct and no cross-frame state is needed.
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

// ─── Waveform ────────────────────────────────────────────────────────────

/// Composites a horizontal trace whose displacement follows RMS.
///
/// The bake stores per-frame RMS, not raw samples, so this is a deterministic
/// function of position, time and RMS rather than a true sample trace. The
/// shader has no sample buffer either, so both sides agree -- which matters
/// more here than sample accuracy.
pub struct AudioWaveform;

impl Default for AudioWaveform {
    fn default() -> Self {
        Self
    }
}

impl Effect for AudioWaveform {
    fn meta(&self) -> EffectMeta {
        EffectMeta {
            id: "audio_reactive.waveform".to_string(),
            name: "Audio Waveform".to_string(),
            category: EffectCategory::AudioReactive,
            media_type: MediaType::Both,
            parameters: vec![
                ParameterDef {
                    id: "amplitude".to_string(),
                    name: "Amplitude".to_string(),
                    param_type: ParamType::Slider,
                    default: json!(0.3),
                    min: Some(0.0),
                    max: Some(1.0),
                    step: Some(0.05),
                    options: None,
                },
                ParameterDef {
                    id: "thickness".to_string(),
                    name: "Thickness".to_string(),
                    param_type: ParamType::Slider,
                    default: json!(2.0),
                    min: Some(1.0),
                    max: Some(20.0),
                    step: Some(1.0),
                    options: None,
                },
                ParameterDef {
                    id: "glow".to_string(),
                    name: "Glow".to_string(),
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
        let amplitude = f32_param(params, "amplitude", 0.3).clamp(0.0, 1.0);
        let thickness = f32_param(params, "thickness", 2.0).clamp(1.0, 20.0);
        let glow = f32_param(params, "glow", 0.5).clamp(0.0, 1.0);
        let rms = audio_f32(params, "_audio_rms");
        // `time` is injected per frame by the host for every effect, so the
        // trace advances with playback instead of standing still.
        let time = f32_param(params, "time", 0.0);

        if amplitude <= 0.0 || rms <= 0.001 {
            return Ok(input.clone());
        }

        let w = input.width as usize;
        let h = input.height as usize;
        let mut out = input.data.clone();
        let mid = h as f32 / 2.0;
        let half = thickness / 2.0;

        for x in 0..w {
            let u = x as f32 / w.max(1) as f32;
            // Two detuned components, so the trace does not read as one pure tone.
            let wave = ((u * 24.0 + time * 2.0).sin() * 0.6 + (u * 61.0 + time * 3.1).sin() * 0.4)
                * rms
                * amplitude
                * mid;
            let center = mid + wave;

            let y0 = (center - half).floor().max(0.0) as usize;
            let y1 = ((center + half).ceil().min(h as f32 - 1.0)).max(0.0) as usize;
            for y in y0..=y1.min(h.saturating_sub(1)) {
                let dist = (y as f32 - center).abs();
                let alpha = if dist <= half {
                    1.0
                } else {
                    glow * (1.0 - (dist - half) / half.max(0.001)).clamp(0.0, 1.0)
                };
                blend_over(&mut out, (y * w + x) * 4, [0.2, 1.0, 0.9], alpha);
            }
        }

        Ok(Frame {
            width: input.width,
            height: input.height,
            data: out,
        })
    }

    /// Frame-independent: each frame's look is a function of that frame's own
    /// audio params, so mapping is correct and no cross-frame state is needed.
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

// ─── Chromatic ───────────────────────────────────────────────────────────

/// Chromatic aberration whose split widens with spectral flux.
pub struct AudioChromatic;

impl Default for AudioChromatic {
    fn default() -> Self {
        Self
    }
}

impl Effect for AudioChromatic {
    fn meta(&self) -> EffectMeta {
        EffectMeta {
            id: "audio_reactive.chromatic".to_string(),
            name: "Audio Chromatic".to_string(),
            category: EffectCategory::AudioReactive,
            media_type: MediaType::Both,
            parameters: vec![
                ParameterDef {
                    id: "max_shift".to_string(),
                    name: "Max Shift".to_string(),
                    param_type: ParamType::Slider,
                    default: json!(12.0),
                    min: Some(0.0),
                    max: Some(60.0),
                    step: Some(1.0),
                    options: None,
                },
                ParameterDef {
                    id: "direction".to_string(),
                    name: "Direction".to_string(),
                    param_type: ParamType::Select,
                    default: json!(0),
                    min: None,
                    max: None,
                    step: None,
                    options: Some(vec!["Horizontal".to_string(), "Vertical".to_string()]),
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
        let max_shift = f32_param(params, "max_shift", 12.0).clamp(0.0, 60.0);
        let vertical = params
            .get("direction")
            .and_then(|v| v.as_u64())
            .unwrap_or(0)
            == 1;
        let flux = audio_f32(params, "_audio_flux").clamp(0.0, 1.0);
        let shift = (flux * max_shift).round() as i64;

        if shift == 0 {
            return Ok(input.clone());
        }

        let w = input.width as i64;
        let h = input.height as i64;
        let mut out = input.data.clone();

        // Red leads, blue trails, green holds -- the conventional split, and the
        // arrangement the shader uses.
        for y in 0..h {
            for x in 0..w {
                let dst = ((y * w + x) * 4) as usize;
                let (rx, ry) = if vertical {
                    (x, y - shift)
                } else {
                    (x - shift, y)
                };
                let (bx, by) = if vertical {
                    (x, y + shift)
                } else {
                    (x + shift, y)
                };

                if rx >= 0 && rx < w && ry >= 0 && ry < h {
                    out[dst] = input.data[((ry * w + rx) * 4) as usize];
                }
                if bx >= 0 && bx < w && by >= 0 && by < h {
                    out[dst + 2] = input.data[((by * w + bx) * 4) as usize + 2];
                }
            }
        }

        Ok(Frame {
            width: input.width,
            height: input.height,
            data: out,
        })
    }

    /// Frame-independent: each frame's look is a function of that frame's own
    /// audio params, so mapping is correct and no cross-frame state is needed.
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

// ─── Pixelate ────────────────────────────────────────────────────────────

/// Pixelation whose block size grows with overall audio energy.
pub struct AudioPixelate;

impl Default for AudioPixelate {
    fn default() -> Self {
        Self
    }
}

impl Effect for AudioPixelate {
    fn meta(&self) -> EffectMeta {
        EffectMeta {
            id: "audio_reactive.pixelate".to_string(),
            name: "Audio Pixelate".to_string(),
            category: EffectCategory::AudioReactive,
            media_type: MediaType::Both,
            parameters: vec![
                ParameterDef {
                    id: "min_block".to_string(),
                    name: "Min Block".to_string(),
                    param_type: ParamType::Slider,
                    default: json!(1.0),
                    min: Some(1.0),
                    max: Some(64.0),
                    step: Some(1.0),
                    options: None,
                },
                ParameterDef {
                    id: "max_block".to_string(),
                    name: "Max Block".to_string(),
                    param_type: ParamType::Slider,
                    default: json!(32.0),
                    min: Some(1.0),
                    max: Some(128.0),
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
        let a = f32_param(params, "min_block", 1.0).clamp(1.0, 128.0);
        let b = f32_param(params, "max_block", 32.0).clamp(1.0, 128.0);
        // Crossed sliders are tolerated rather than producing a negative range,
        // which would silently invert the reaction.
        let (lo, hi) = if a <= b { (a, b) } else { (b, a) };
        let energy = audio_f32(params, "_audio_energy").clamp(0.0, 1.0);
        let block = (lo + (hi - lo) * energy).round().max(1.0) as usize;

        if block <= 1 {
            return Ok(input.clone());
        }

        let w = input.width as usize;
        let h = input.height as usize;
        let mut out = input.data.clone();

        for by in (0..h).step_by(block) {
            for bx in (0..w).step_by(block) {
                let bw = block.min(w - bx);
                let bh = block.min(h - by);
                let (mut r, mut g, mut bl, mut al) = (0u32, 0u32, 0u32, 0u32);
                for y in by..by + bh {
                    for x in bx..bx + bw {
                        let i = (y * w + x) * 4;
                        r += input.data[i] as u32;
                        g += input.data[i + 1] as u32;
                        bl += input.data[i + 2] as u32;
                        al += input.data[i + 3] as u32;
                    }
                }
                let n = (bw * bh) as u32;
                let (r, g, bl, al) = ((r / n) as u8, (g / n) as u8, (bl / n) as u8, (al / n) as u8);
                for y in by..by + bh {
                    for x in bx..bx + bw {
                        let i = (y * w + x) * 4;
                        out[i] = r;
                        out[i + 1] = g;
                        out[i + 2] = bl;
                        out[i + 3] = al;
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

    /// Frame-independent: each frame's look is a function of that frame's own
    /// audio params, so mapping is correct and no cross-frame state is needed.
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
    use serde_json::json;

    /// A frame with structure, so a no-op is distinguishable from a real edit.
    fn frame(w: u32, h: u32) -> Frame {
        let mut data = vec![0u8; (w * h * 4) as usize];
        for y in 0..h as usize {
            for x in 0..w as usize {
                let i = (y * w as usize + x) * 4;
                data[i] = (x * 7 % 256) as u8;
                data[i + 1] = (y * 11 % 256) as u8;
                data[i + 2] = ((x + y) % 256) as u8;
                data[i + 3] = 255;
            }
        }
        Frame {
            width: w,
            height: h,
            data,
        }
    }

    fn with_audio(pairs: &[(&str, f64)]) -> ParameterValues {
        let mut m = serde_json::Map::new();
        for (k, v) in pairs {
            m.insert((*k).to_string(), json!(v));
        }
        m
    }

    /// These effects sit on the `SINGLE_FRAME_NOOPS` and `NEEDS_INPUT_EFFECTS`
    /// allowlists, which exempt them from the "produces output" checks. That
    /// exemption is only honest if they demonstrably DO something once audio is
    /// present -- otherwise a broken effect hides behind the allowlist. Each
    /// test below asserts both halves: unchanged without audio, changed with it.
    #[test]
    fn spectrum_is_inert_without_audio_and_draws_with_it() {
        let e = AudioSpectrum;
        let f = frame(32, 32);
        let silent = e.process_frame(&f, None, &serde_json::Map::new()).unwrap();
        assert_eq!(silent.data, f.data, "no audio should leave the frame alone");

        let loud = e
            .process_frame(
                &f,
                None,
                &with_audio(&[("_audio_bass", 0.9), ("_audio_mid", 0.7)]),
            )
            .unwrap();
        assert_ne!(loud.data, f.data, "band energy should draw bars");
        // Bars rise from the bottom, so the top row must be untouched.
        assert_eq!(loud.data[0..128], f.data[0..128]);
    }

    #[test]
    fn waveform_is_inert_without_audio_and_draws_with_it() {
        let e = AudioWaveform;
        let f = frame(32, 32);
        let silent = e.process_frame(&f, None, &serde_json::Map::new()).unwrap();
        assert_eq!(silent.data, f.data);

        let loud = e
            .process_frame(&f, None, &with_audio(&[("_audio_rms", 0.8)]))
            .unwrap();
        assert_ne!(loud.data, f.data);
    }

    #[test]
    fn chromatic_splits_channels_only_when_flux_is_present() {
        let e = AudioChromatic;
        let f = frame(32, 32);
        assert_eq!(
            e.process_frame(&f, None, &serde_json::Map::new())
                .unwrap()
                .data,
            f.data
        );

        let shifted = e
            .process_frame(&f, None, &with_audio(&[("_audio_flux", 1.0)]))
            .unwrap();
        assert_ne!(shifted.data, f.data);
        // Green is the anchor channel and must survive untouched.
        let green_intact = (0..f.data.len())
            .step_by(4)
            .all(|i| shifted.data[i + 1] == f.data[i + 1]);
        assert!(green_intact, "green channel should not move");
    }

    #[test]
    fn pixelate_block_size_follows_energy() {
        let e = AudioPixelate;
        let f = frame(32, 32);
        assert_eq!(
            e.process_frame(&f, None, &serde_json::Map::new())
                .unwrap()
                .data,
            f.data,
            "min_block defaults to 1, so silence must not pixelate"
        );

        let loud = e
            .process_frame(&f, None, &with_audio(&[("_audio_energy", 1.0)]))
            .unwrap();
        assert_ne!(loud.data, f.data);
        // At full energy the block is max_block (32) over a 32px frame, so the
        // whole image collapses to one averaged colour.
        let first = &loud.data[0..3];
        let uniform = (0..loud.data.len())
            .step_by(4)
            .all(|i| loud.data[i..i + 3] == *first);
        assert!(uniform, "a full-frame block should average to one colour");
    }

    #[test]
    fn crossed_pixelate_sliders_do_not_invert_the_reaction() {
        let e = AudioPixelate;
        let f = frame(16, 16);
        let mut params = with_audio(&[("_audio_energy", 1.0)]);
        params.insert("min_block".to_string(), json!(16.0));
        params.insert("max_block".to_string(), json!(2.0));
        // Swapped bounds should still resolve to a sane range rather than a
        // negative one, and still pixelate.
        let out = e.process_frame(&f, None, &params).unwrap();
        assert_ne!(out.data, f.data);
    }
}
