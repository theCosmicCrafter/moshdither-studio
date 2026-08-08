use crate::effects::types::*;
use crate::effects::Effect;
use crate::error::Result;
use rand::Rng;
use serde_json::json;

// ─── Glitch Profile ─────────────────────────────────────────────────────
// Aggressive I-frame removal + shuffle + pixel corruption.
// Inspired by Mosh Pro's "Glitch" preset.

pub struct GlitchProfile;

impl Default for GlitchProfile {
    fn default() -> Self {
        Self
    }
}

impl Effect for GlitchProfile {
    fn meta(&self) -> EffectMeta {
        EffectMeta {
            id: "datamoshing.profile_glitch".to_string(),
            name: "Profile: Glitch".to_string(),
            category: EffectCategory::Datamoshing,
            media_type: MediaType::Video,
            parameters: vec![
                ParameterDef {
                    id: "intensity".to_string(),
                    name: "Intensity".to_string(),
                    param_type: ParamType::Slider,
                    default: json!(0.7),
                    min: Some(0.0),
                    max: Some(1.0),
                    step: Some(0.05),
                    options: None,
                },
                ParameterDef {
                    id: "drop_interval".to_string(),
                    name: "Drop Interval".to_string(),
                    param_type: ParamType::Slider,
                    default: json!(8),
                    min: Some(2.0),
                    max: Some(30.0),
                    step: Some(1.0),
                    options: None,
                },
            ],
        }
    }

    fn is_temporal(&self) -> bool {
        true
    }

    fn process_frame(
        &self,
        input: &Frame,
        _m: Option<&Mask>,
        params: &ParameterValues,
    ) -> Result<Frame> {
        let intensity = params
            .get("intensity")
            .and_then(|v| v.as_f64())
            .unwrap_or(0.7) as f32;

        // A near-empty or zero-dimension frame's byte buffer has len <= 3,
        // which would make `len.saturating_sub(3)` produce an empty `0..0`
        // range below -- `gen_range` panics on an empty range. Nothing to
        // corrupt in a buffer this small anyway.
        if input.data.len() <= 3 {
            return Ok(input.clone());
        }

        let mut rng = crate::effects::rng::frame_rng(input, params);
        let mut out = input.data.clone();
        let len = out.len();

        // Pixel corruption — random byte swaps and noise
        let corruption_count = (len as f32 * intensity * 0.05) as usize;
        for _ in 0..corruption_count {
            let i = rng.gen_range(0..len.saturating_sub(3));
            let j = rng.gen_range(0..len.saturating_sub(3));
            if i % 4 != 3 && j % 4 != 3 {
                out.swap(i, j);
            }
        }

        // Noise injection
        for i in (0..len).step_by(4) {
            if rng.gen_range(0.0..1.0) < intensity * 0.3 {
                for c in 0..3 {
                    // No `as i32`: the range literal already fixes this to i32,
                    // and clippy 1.97 rejects the redundant cast under
                    // -D warnings. It was inferred differently under
                    // thread_rng(); switching to a seeded StdRng made the type
                    // concrete here.
                    let noise: i32 = rng.gen_range(0..60);
                    out[i + c] = (out[i + c] as i32 + noise).clamp(0, 255) as u8;
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
        let drop_interval = params
            .get("drop_interval")
            .and_then(|v| v.as_u64())
            .unwrap_or(8) as usize;

        // Phase 1: Drop I-frames
        let mut frames = Vec::new();
        for (i, frame) in input.frames.iter().enumerate() {
            if i % drop_interval != 0 {
                frames.push(frame.clone());
            }
        }

        // Phase 2: Shuffle chunks
        let chunk_size = 4usize;
        let mut chunks: Vec<Vec<Frame>> = frames.chunks(chunk_size).map(|c| c.to_vec()).collect();
        let n = chunks.len();
        for i in 0..n {
            let seed = i.wrapping_mul(374761393);
            let j = (seed % (n - i).max(1)) + i;
            chunks.swap(i, j);
        }
        let frames_out: Vec<Frame> = chunks.into_iter().flatten().collect();

        // Phase 3: Apply per-frame glitch
        let mut glitched = Vec::with_capacity(frames_out.len());
        for frame in &frames_out {
            glitched.push(self.process_frame(frame, mask, params)?);
        }

        Ok(VideoSegment {
            frames: glitched,
            fps: input.fps,
        })
    }
}

// ─── Bloom Profile ──────────────────────────────────────────────────────
// Heavy bloom + repeat + color remapping.
// Inspired by Mosh Pro's "Bloom" preset.

pub struct BloomProfile;

impl Default for BloomProfile {
    fn default() -> Self {
        Self
    }
}

impl Effect for BloomProfile {
    fn meta(&self) -> EffectMeta {
        EffectMeta {
            id: "datamoshing.profile_bloom".to_string(),
            name: "Profile: Bloom".to_string(),
            category: EffectCategory::Datamoshing,
            media_type: MediaType::Video,
            parameters: vec![
                ParameterDef {
                    id: "bloom_size".to_string(),
                    name: "Bloom Size".to_string(),
                    param_type: ParamType::Slider,
                    default: json!(8),
                    min: Some(2.0),
                    max: Some(20.0),
                    step: Some(1.0),
                    options: None,
                },
                ParameterDef {
                    id: "repeat_count".to_string(),
                    name: "Repeat Count".to_string(),
                    param_type: ParamType::Slider,
                    default: json!(3),
                    min: Some(1.0),
                    max: Some(8.0),
                    step: Some(1.0),
                    options: None,
                },
            ],
        }
    }

    fn is_temporal(&self) -> bool {
        true
    }

    fn process_frame(
        &self,
        input: &Frame,
        _m: Option<&Mask>,
        params: &ParameterValues,
    ) -> Result<Frame> {
        let bloom_size = params
            .get("bloom_size")
            .and_then(|v| v.as_u64())
            .unwrap_or(8) as usize;
        let mut out = input.data.clone();

        // Bloom: amplify and smear colors
        for _pass in 0..3 {
            for i in (0..out.len()).step_by(4) {
                for c in 0..3 {
                    let v = (out[i + c] as f32 * 1.4).min(280.0) as u8;
                    out[i + c] = v;
                }
            }
        }
        for i in (0..out.len()).step_by(4) {
            for c in 0..3 {
                let v = (out[i + c] as f32 * 1.4).min(255.0) as u8;
                out[i + c] = v;
            }
        }

        // Row smearing based on bloom_size
        let w = input.width as usize;
        let h = input.height as usize;
        for y in (0..h).step_by(bloom_size) {
            if y + 1 < h {
                let src_row_start = y * w * 4;
                let src_row = out[src_row_start..src_row_start + w * 4].to_vec();
                for yy in (y + 1)..(y + bloom_size).min(h) {
                    let dst_row_start = yy * w * 4;
                    out[dst_row_start..dst_row_start + w * 4].copy_from_slice(&src_row);
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
        let bloom_size = params
            .get("bloom_size")
            .and_then(|v| v.as_u64())
            .unwrap_or(8) as usize;
        let repeat_count = params
            .get("repeat_count")
            .and_then(|v| v.as_u64())
            .unwrap_or(3) as usize;

        // Phase 1: Bloom — duplicate keyframes
        let mut frames = Vec::new();
        for chunk in input.frames.chunks(bloom_size) {
            if let Some(key) = chunk.first() {
                for _ in 0..bloom_size {
                    frames.push(key.clone());
                }
            }
        }

        // Phase 2: Repeat series
        let series_size = 5usize;
        let mut repeated = Vec::new();
        for series in frames.chunks(series_size) {
            for _ in 0..repeat_count {
                repeated.extend_from_slice(series);
            }
        }

        // Phase 3: Per-frame bloom enhancement
        let mut bloomed = Vec::with_capacity(repeated.len());
        for frame in &repeated {
            bloomed.push(self.process_frame(frame, mask, params)?);
        }

        Ok(VideoSegment {
            frames: bloomed,
            fps: input.fps,
        })
    }
}

// ─── Smear Profile ──────────────────────────────────────────────────────
// Motion transfer smearing + progressive frame drop + color shift.
// Inspired by Mosh Pro's "Smear" preset.

pub struct SmearProfile;

impl Default for SmearProfile {
    fn default() -> Self {
        Self
    }
}

impl Effect for SmearProfile {
    fn meta(&self) -> EffectMeta {
        EffectMeta {
            id: "datamoshing.profile_smear".to_string(),
            name: "Profile: Smear".to_string(),
            category: EffectCategory::Datamoshing,
            media_type: MediaType::Video,
            parameters: vec![
                ParameterDef {
                    id: "strength".to_string(),
                    name: "Smear Strength".to_string(),
                    param_type: ParamType::Slider,
                    default: json!(0.8),
                    min: Some(0.0),
                    max: Some(1.0),
                    step: Some(0.05),
                    options: None,
                },
                ParameterDef {
                    id: "drop_interval".to_string(),
                    name: "Drop Interval".to_string(),
                    param_type: ParamType::Slider,
                    default: json!(10),
                    min: Some(2.0),
                    max: Some(60.0),
                    step: Some(1.0),
                    options: None,
                },
            ],
        }
    }

    fn is_temporal(&self) -> bool {
        true
    }

    fn process_frame(
        &self,
        input: &Frame,
        _m: Option<&Mask>,
        params: &ParameterValues,
    ) -> Result<Frame> {
        let strength = params
            .get("strength")
            .and_then(|v| v.as_f64())
            .unwrap_or(0.8) as f32;
        let w = input.width as usize;
        let h = input.height as usize;
        let mut out = input.data.clone();

        // Horizontal smear: blend each row with the previous row
        if h > 1 {
            for y in 1..h {
                let prev_row = (y - 1) * w * 4;
                let curr_row = y * w * 4;
                for x in 0..w * 4 {
                    let prev_val = out[prev_row + x] as f32;
                    let curr_val = out[curr_row + x] as f32;
                    out[curr_row + x] =
                        (curr_val * (1.0 - strength) + prev_val * strength).clamp(0.0, 255.0) as u8;
                }
            }
        }

        // Color shift toward cyan/magenta
        for i in (0..out.len()).step_by(4) {
            let r = out[i] as f32;
            let g = out[i + 1] as f32;
            let b = out[i + 2] as f32;
            out[i] = (r * (1.0 - strength * 0.3)).clamp(0.0, 255.0) as u8;
            out[i + 1] = (g + strength * 30.0).clamp(0.0, 255.0) as u8;
            out[i + 2] = (b + strength * 50.0).clamp(0.0, 255.0) as u8;
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
        let drop_interval = params
            .get("drop_interval")
            .and_then(|v| v.as_u64())
            .unwrap_or(10) as usize;

        // Phase 1: Progressive frame drop (more drops toward end)
        let total = input.frames.len();
        let mut frames = Vec::new();
        for (i, frame) in input.frames.iter().enumerate() {
            let t = i as f32 / total.max(1) as f32;
            let interval = (drop_interval as f32 * (1.0 - t * 0.5)).max(2.0) as usize;
            if i % interval != 0 {
                frames.push(frame.clone());
            }
        }

        // Phase 2: Smear each frame
        let mut smeared = Vec::with_capacity(frames.len());
        for frame in &frames {
            smeared.push(self.process_frame(frame, mask, params)?);
        }

        Ok(VideoSegment {
            frames: smeared,
            fps: input.fps,
        })
    }
}

// ─── Extreme Profile ────────────────────────────────────────────────────
// I-frame removal + classic chunk repeat + shuffle + bloom.
// The most aggressive datamosh preset.

pub struct ExtremeProfile;

impl Default for ExtremeProfile {
    fn default() -> Self {
        Self
    }
}

impl Effect for ExtremeProfile {
    fn meta(&self) -> EffectMeta {
        EffectMeta {
            id: "datamoshing.profile_extreme".to_string(),
            name: "Profile: Extreme".to_string(),
            category: EffectCategory::Datamoshing,
            media_type: MediaType::Video,
            parameters: vec![ParameterDef {
                id: "aggression".to_string(),
                name: "Aggression".to_string(),
                param_type: ParamType::Slider,
                default: json!(0.9),
                min: Some(0.0),
                max: Some(1.0),
                step: Some(0.05),
                options: None,
            }],
        }
    }

    fn is_temporal(&self) -> bool {
        true
    }

    fn process_frame(
        &self,
        input: &Frame,
        _m: Option<&Mask>,
        params: &ParameterValues,
    ) -> Result<Frame> {
        let aggression = params
            .get("aggression")
            .and_then(|v| v.as_f64())
            .unwrap_or(0.9) as f32;

        // Same zero-dimension/near-empty-buffer guard as GlitchProfile above
        // -- `len.saturating_sub(3)` would otherwise hand `gen_range` an
        // empty range and panic.
        if input.data.len() <= 3 {
            return Ok(input.clone());
        }

        let mut rng = crate::effects::rng::frame_rng(input, params);
        let mut out = input.data.clone();
        let len = out.len();

        // Heavy corruption
        let corruption_count = (len as f32 * aggression * 0.1) as usize;
        for _ in 0..corruption_count {
            let i = rng.gen_range(0..len.saturating_sub(3));
            let j = rng.gen_range(0..len.saturating_sub(3));
            if i % 4 != 3 && j % 4 != 3 {
                out.swap(i, j);
            }
        }

        // Row duplication (classic-style)
        let w = input.width as usize;
        let h = input.height as usize;
        let chunk_size = (3.0 + aggression * 7.0) as usize;
        for y in 0..h {
            let row_start = y * w * 4;
            for chunk in (0..w).step_by(chunk_size) {
                let chunk_end = (chunk + chunk_size).min(w);
                let src_idx = row_start + chunk * 4;
                let r = out[src_idx];
                let g = out[src_idx + 1];
                let b = out[src_idx + 2];
                let a = out[src_idx + 3];
                for x in chunk..chunk_end {
                    let dst_idx = row_start + x * 4;
                    out[dst_idx] = r;
                    out[dst_idx + 1] = g;
                    out[dst_idx + 2] = b;
                    out[dst_idx + 3] = a;
                }
            }
        }

        // Bloom enhancement
        for i in (0..len).step_by(4) {
            for c in 0..3 {
                let v = (out[i + c] as f32 * 1.5).min(255.0) as u8;
                out[i + c] = v;
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
        let aggression = params
            .get("aggression")
            .and_then(|v| v.as_f64())
            .unwrap_or(0.9) as f32;

        // Phase 1: Aggressive I-frame removal
        let drop_interval = (15.0 - aggression * 10.0).max(2.0) as usize;
        let mut frames = Vec::new();
        for (i, frame) in input.frames.iter().enumerate() {
            if i % drop_interval != 0 {
                frames.push(frame.clone());
            }
        }

        // Phase 2: Classic chunk repeat
        let chunk_size = (3.0 + aggression * 5.0) as usize;
        let repeats = (2.0 + aggression * 4.0) as usize;
        let mut repeated = Vec::new();
        for chunk in frames.chunks(chunk_size) {
            for _ in 0..repeats {
                repeated.extend_from_slice(chunk);
            }
        }

        // Phase 3: Shuffle
        let shuffle_chunk = 4usize;
        let mut chunks: Vec<Vec<Frame>> =
            repeated.chunks(shuffle_chunk).map(|c| c.to_vec()).collect();
        let n = chunks.len();
        for i in 0..n {
            let seed = i.wrapping_mul(374761393);
            let j = (seed % (n - i).max(1)) + i;
            chunks.swap(i, j);
        }
        let shuffled = chunks.into_iter().flatten().collect::<Vec<_>>();

        // Phase 4: Per-frame extreme glitch
        let mut glitched = Vec::with_capacity(shuffled.len());
        for frame in &shuffled {
            glitched.push(self.process_frame(frame, mask, params)?);
        }

        Ok(VideoSegment {
            frames: glitched,
            fps: input.fps,
        })
    }
}

// ─── Rainbow Profile ────────────────────────────────────────────────────
// Channel swap + hue cycling + databend + rise color remapping.
// Creates a psychedelic datamosh look.

pub struct RainbowProfile;

impl Default for RainbowProfile {
    fn default() -> Self {
        Self
    }
}

impl Effect for RainbowProfile {
    fn meta(&self) -> EffectMeta {
        EffectMeta {
            id: "datamoshing.profile_rainbow".to_string(),
            name: "Profile: Rainbow".to_string(),
            category: EffectCategory::Datamoshing,
            media_type: MediaType::Video,
            parameters: vec![
                ParameterDef {
                    id: "hue_shift".to_string(),
                    name: "Hue Shift Speed".to_string(),
                    param_type: ParamType::Slider,
                    default: json!(0.5),
                    min: Some(0.0),
                    max: Some(2.0),
                    step: Some(0.05),
                    options: None,
                },
                ParameterDef {
                    id: "drop_interval".to_string(),
                    name: "Drop Interval".to_string(),
                    param_type: ParamType::Slider,
                    default: json!(12),
                    min: Some(2.0),
                    max: Some(60.0),
                    step: Some(1.0),
                    options: None,
                },
            ],
        }
    }

    fn is_temporal(&self) -> bool {
        true
    }

    fn process_frame(
        &self,
        input: &Frame,
        _m: Option<&Mask>,
        params: &ParameterValues,
    ) -> Result<Frame> {
        let hue_speed = params
            .get("hue_shift")
            .and_then(|v| v.as_f64())
            .unwrap_or(0.5) as f32;
        let w = input.width as usize;
        let h = input.height as usize;
        // Same category of bug as GlitchProfile/ExtremeProfile's corruption
        // loops: the databend row-shifting below calls
        // `rng.gen_range(0..h)`, which panics on the empty range produced by
        // a zero-height frame.
        if w == 0 || h == 0 {
            return Ok(input.clone());
        }
        let mut out = input.data.clone();

        // Rise-style color remapping with rainbow palette
        for i in (0..out.len()).step_by(4) {
            let r = out[i];
            let g = out[i + 1];
            let b = out[i + 2];
            let brightness = (r as u16 + g as u16 + b as u16) / 3;

            if brightness <= 15 {
                out[i] = 0;
                out[i + 1] = 0;
                out[i + 2] = 0;
            } else if brightness <= 60 {
                out[i] = 0;
                out[i + 1] = 184;
                out[i + 2] = 255;
            } else if brightness <= 120 {
                out[i] = 255;
                out[i + 1] = 0;
                out[i + 2] = 193;
            } else if brightness <= 180 {
                out[i] = 150;
                out[i + 1] = 0;
                out[i + 2] = 255;
            } else if brightness <= 234 {
                out[i] = 0;
                out[i + 1] = 255;
                out[i + 2] = 249;
            } else {
                out[i] = 255;
                out[i + 1] = 255;
                out[i + 2] = 255;
            }
        }

        // Channel swap with hue-speed-based rotation
        let swap_phase = (hue_speed * 3.0) as usize % 3;
        for i in (0..out.len()).step_by(4) {
            let r = out[i];
            let g = out[i + 1];
            let b = out[i + 2];
            match swap_phase {
                0 => {
                    out[i] = g;
                    out[i + 1] = b;
                    out[i + 2] = r;
                }
                1 => {
                    out[i] = b;
                    out[i + 1] = r;
                    out[i + 2] = g;
                }
                _ => {
                    out[i] = r;
                    out[i + 1] = g;
                    out[i + 2] = b;
                }
            }
        }

        // Databend-style row shifting
        let mut rng = crate::effects::rng::frame_rng(input, params);
        let bend_count = (hue_speed * 5.0) as usize;
        for _ in 0..bend_count {
            let row = rng.gen_range(0..h);
            let shift = rng.gen_range(1..(w / 4).max(2));
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
        let drop_interval = params
            .get("drop_interval")
            .and_then(|v| v.as_u64())
            .unwrap_or(12) as usize;

        // Phase 1: Drop I-frames
        let mut frames = Vec::new();
        for (i, frame) in input.frames.iter().enumerate() {
            if i % drop_interval != 0 {
                frames.push(frame.clone());
            }
        }

        // Phase 2: Apply rainbow per-frame
        let mut rainbow = Vec::with_capacity(frames.len());
        for frame in &frames {
            rainbow.push(self.process_frame(frame, mask, params)?);
        }

        Ok(VideoSegment {
            frames: rainbow,
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
                width: 4,
                height: 4,
                data: vec![i as u8; 64],
            })
            .collect();
        VideoSegment { frames, fps: 30.0 }
    }

    #[test]
    fn test_glitch_profile_frame() {
        let e = GlitchProfile;
        let f = make_frame(16, 16);
        let params = serde_json::Map::new();
        let r = e.process_frame(&f, None, &params).unwrap();
        assert_eq!(r.width, 16);
        assert_eq!(r.height, 16);
        assert_eq!(r.data.len(), f.data.len());
    }

    #[test]
    fn test_glitch_profile_video() {
        let e = GlitchProfile;
        let seg = make_segment(20);
        let mut params = serde_json::Map::new();
        params.insert("drop_interval".to_string(), json!(5));
        let r = e.process_video(&seg, None, &params).unwrap();
        assert!(r.frames.len() <= 20);
        assert!(!r.frames.is_empty());
    }

    #[test]
    fn test_bloom_profile_frame() {
        let e = BloomProfile;
        let f = make_frame(16, 16);
        let params = serde_json::Map::new();
        let r = e.process_frame(&f, None, &params).unwrap();
        assert_eq!(r.width, 16);
        assert_eq!(r.height, 16);
    }

    #[test]
    fn test_bloom_profile_video() {
        let e = BloomProfile;
        let seg = make_segment(20);
        let r = e
            .process_video(&seg, None, &serde_json::Map::new())
            .unwrap();
        assert!(!r.frames.is_empty());
    }

    #[test]
    fn test_smear_profile_frame() {
        let e = SmearProfile;
        let f = make_frame(16, 16);
        let params = serde_json::Map::new();
        let r = e.process_frame(&f, None, &params).unwrap();
        assert_eq!(r.width, 16);
        assert_eq!(r.height, 16);
        // Should differ from input due to smear
        assert_ne!(r.data, f.data);
    }

    #[test]
    fn test_smear_profile_video() {
        let e = SmearProfile;
        let seg = make_segment(20);
        let r = e
            .process_video(&seg, None, &serde_json::Map::new())
            .unwrap();
        assert!(!r.frames.is_empty());
        assert!(r.frames.len() <= 20);
    }

    #[test]
    fn test_extreme_profile_frame() {
        let e = ExtremeProfile;
        let f = make_frame(16, 16);
        let params = serde_json::Map::new();
        let r = e.process_frame(&f, None, &params).unwrap();
        assert_eq!(r.width, 16);
        assert_eq!(r.height, 16);
        assert_ne!(r.data, f.data);
    }

    #[test]
    fn test_extreme_profile_video() {
        let e = ExtremeProfile;
        let seg = make_segment(30);
        let r = e
            .process_video(&seg, None, &serde_json::Map::new())
            .unwrap();
        assert!(!r.frames.is_empty());
    }

    #[test]
    fn test_glitch_profile_minimal_frame_does_not_panic() {
        // `Frame` doesn't enforce data.len() == width*height*4, so a
        // malformed/synthetic frame (fuzzed project file, future caller)
        // can carry a near-empty byte buffer. `len.saturating_sub(3)` would
        // otherwise hand `gen_range` an empty range and panic once
        // corruption_count > 0.
        let e = GlitchProfile;
        let f = Frame {
            width: 1,
            height: 1,
            data: vec![1, 2, 3], // len == 3, deliberately malformed/truncated
        };
        let mut params = serde_json::Map::new();
        // A large, unclamped intensity maximises corruption_count so the
        // vulnerable branch would actually run if the guard were missing.
        params.insert("intensity".to_string(), json!(1000.0));
        let r = e.process_frame(&f, None, &params).unwrap();
        assert_eq!(r.data, vec![1, 2, 3]);
    }

    #[test]
    fn test_glitch_profile_zero_length_frame_does_not_panic() {
        let e = GlitchProfile;
        let f = Frame {
            width: 0,
            height: 0,
            data: Vec::new(),
        };
        let r = e.process_frame(&f, None, &serde_json::Map::new()).unwrap();
        assert!(r.data.is_empty());
    }

    #[test]
    fn test_extreme_profile_minimal_frame_does_not_panic() {
        let e = ExtremeProfile;
        let f = Frame {
            width: 1,
            height: 1,
            data: vec![1, 2, 3], // len == 3, deliberately malformed/truncated
        };
        let mut params = serde_json::Map::new();
        params.insert("aggression".to_string(), json!(1000.0));
        let r = e.process_frame(&f, None, &params).unwrap();
        assert_eq!(r.data, vec![1, 2, 3]);
    }

    #[test]
    fn test_rainbow_profile_zero_height_frame_does_not_panic() {
        // The databend row-shifting phase calls `rng.gen_range(0..h)`, which
        // panics on the empty range produced by a zero-height frame.
        let e = RainbowProfile;
        let f = Frame {
            width: 4,
            height: 0,
            data: Vec::new(),
        };
        let r = e.process_frame(&f, None, &serde_json::Map::new()).unwrap();
        assert!(r.data.is_empty());
    }

    #[test]
    fn test_rainbow_profile_frame() {
        let e = RainbowProfile;
        let f = make_frame(16, 16);
        let params = serde_json::Map::new();
        let r = e.process_frame(&f, None, &params).unwrap();
        assert_eq!(r.width, 16);
        assert_eq!(r.height, 16);
        // Rainbow remapping should change the data
        assert_ne!(r.data, f.data);
    }

    #[test]
    fn test_rainbow_profile_video() {
        let e = RainbowProfile;
        let seg = make_segment(20);
        let r = e
            .process_video(&seg, None, &serde_json::Map::new())
            .unwrap();
        assert!(!r.frames.is_empty());
        assert!(r.frames.len() <= 20);
    }
}
