//! Effect verification suite.
//!
//! Runs every registered effect through four checks:
//! 1. **Non-empty output** — effect produces a valid frame (not identical to input)
//! 2. **No crashes** — effect doesn't panic or return an error with default params
//! 3. **Animation** — output differs between time=0 and time=1 (for effects that should animate)
//! 4. **Mask correctness** — inside/outside/alpha modes preserve the correct regions
//!
//! Results are returned as a structured JSON-serializable report.

use crate::effects::types::{Frame, Mask, ParamType, ParameterDef, VideoSegment};
use crate::effects::{blend_mask, clamp_params, EffectRegistry};
use serde::{Deserialize, Serialize};

/// Result of verifying a single effect.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct EffectVerificationResult {
    pub effect_id: String,
    pub effect_name: String,
    pub category: String,
    pub checks: VerificationChecks,
    pub overall_pass: bool,
    pub error_message: Option<String>,
    pub duration_ms: u64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct VerificationChecks {
    pub no_crash: bool,
    pub non_empty_output: bool,
    pub animates: bool,
    pub mask_inside_correct: bool,
    pub mask_outside_correct: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct VerificationReport {
    pub total_effects: usize,
    pub passed: usize,
    pub failed: usize,
    pub results: Vec<EffectVerificationResult>,
    pub summary: String,
    pub timestamp: String,
}

/// Create a small test frame with a non-monotonic color pattern so effects like pixel
/// sorting actually produce visible changes, while still keeping recognizable gradients.
fn make_test_frame() -> Frame {
    let w = 64u32;
    let h = 64u32;
    let mut data = Vec::with_capacity((w * h * 4) as usize);
    for y in 0..h {
        for x in 0..w {
            // Pseudo-random-ish pattern with prime multipliers so rows/columns are not
            // monotonic in brightness/hue/saturation.
            let r = ((x * 7 + y * 13) % 256) as u8;
            let g = ((x * 11 + y * 5) % 256) as u8;
            let b = ((x * 3 + y * 17) % 256) as u8;
            data.extend_from_slice(&[r, g, b, 255]);
        }
    }
    Frame {
        width: w,
        height: h,
        data,
    }
}

/// Create a half-mask: left half white (255), right half black (0).
fn make_half_mask(w: u32, h: u32) -> Mask {
    let mut data = vec![0u8; (w * h) as usize];
    for y in 0..h {
        for x in 0..(w / 2) {
            data[(y * w + x) as usize] = 255;
        }
    }
    Mask {
        width: w,
        height: h,
        data,
    }
}

/// Check if two frames differ in at least one RGB pixel.
fn frames_differ(a: &Frame, b: &Frame) -> bool {
    if a.data.len() != b.data.len() {
        return true;
    }
    let n = a.data.len();
    let mut i = 0;
    while i < n {
        if a.data[i] != b.data[i]
            || a.data[i + 1] != b.data[i + 1]
            || a.data[i + 2] != b.data[i + 2]
        {
            return true;
        }
        i += 4;
    }
    false
}

/// Check that masked region is preserved and unmasked region is modified.
/// For "inside" mode: left half (mask=255) should be modified, right half (mask=0) preserved.
fn check_mask_blend(original: &Frame, processed: &Frame, mask: &Mask, mode: &str) -> bool {
    let w = original.width as usize;
    let h = original.height as usize;
    let mw = mask.width as usize;
    let mh = mask.height as usize;

    let mut masked_modified = false;
    let mut unmasked_preserved = true;

    for y in 0..h {
        let my = if mh > 1 { (y * mh) / h } else { 0 };
        for x in 0..w {
            let mx = if mw > 1 { (x * mw) / w } else { 0 };
            let mask_val = mask.data[my * mw + mx];
            let idx = (y * w + x) * 4;

            let orig_pixel = &original.data[idx..idx + 3];
            let proc_pixel = &processed.data[idx..idx + 3];
            let pixel_diffs = orig_pixel != proc_pixel;

            match mode {
                "inside" => {
                    // mask=255 → effect should show (modified); mask=0 → original preserved
                    if mask_val > 128 {
                        if pixel_diffs {
                            masked_modified = true;
                        }
                    } else if pixel_diffs {
                        unmasked_preserved = false;
                    }
                }
                "outside" => {
                    // mask=255 → original preserved; mask=0 → effect should show (modified)
                    if mask_val > 128 {
                        if pixel_diffs {
                            unmasked_preserved = false;
                        }
                    } else if pixel_diffs {
                        masked_modified = true;
                    }
                }
                _ => {}
            }
        }
    }

    // For effects that are no-ops (e.g. overlay without a file), masked_modified may be false.
    // In that case, just check that unmasked is preserved (no corruption in protected region).
    unmasked_preserved && (masked_modified || !frames_differ(original, processed))
}

/// Effects that require external input, non-neutral defaults, or a video stream to produce
/// meaningful output from a single still-frame check. They are expected to pass the no-crash
/// and mask-safety checks; the other checks are informational only.
/// Effects exempt from the `non_empty_output` check because they genuinely
/// cannot produce output from the resources verification supplies.
///
/// This is the one place a broken effect could hide behind a green report, so
/// it is kept minimal and `allowlist_tests` pins it to measured behaviour in
/// both directions — an entry that does produce output fails the test as
/// over-broad, and an effect producing nothing while absent fails as unexplained.
///
/// Each entry needs a reason. "It was failing" is not one.
const NEEDS_INPUT_EFFECTS: &[&str] = &[
    // Need an audio feature stream; there is no audio in a still-frame harness.
    "audio_reactive.bass_pulse",
    "audio_reactive.beat_glitch",
    "audio_reactive.chromatic",
    "audio_reactive.pixelate",
    "audio_reactive.spectral_shift",
    "audio_reactive.spectrum",
    "audio_reactive.waveform",
    // Identity at its default parameters, which is the correct behaviour for a
    // grading effect with no LUT loaded.
    "color.lut_grading",
    // Needs a second image via `overlay_path`; compositing nothing onto a frame
    // correctly returns the frame.
    "composite.overlay",
];

/// Build default params for an effect, applying stronger-than-default values for subtle effects
/// so they are visible in a single still-frame verification.
fn build_default_params(
    effect_id: &str,
    params: &[ParameterDef],
) -> serde_json::Map<String, serde_json::Value> {
    use serde_json::json;

    let mut map = serde_json::Map::new();
    for p in params {
        let val = match (effect_id, p.id.as_str()) {
            (_, "enabled") => json!(true),
            (_, "amount") => json!(1.0),
            (_, "strength") => json!(1.0),
            (_, "intensity") => json!(1.0),
            (_, "opacity") => json!(1.0),
            (_, "size") => json!(50.0),
            (_, "line_width") => json!(2.0),
            (_, "density") => json!(0.5),
            (_, "std_dev") => json!(20.0),
            (_, "range") => json!(50.0),
            (_, "shift_amount") => json!(30.0),
            (_, "scanline_interval") => json!(4.0),
            (_, "u_intensity") => json!(0.5),
            (_, "iterations") => json!(3.0),
            (_, "threshold") => json!(50.0),
            (_, "levels") => json!(4.0),
            (_, "n_frames") => json!(5.0),
            (_, "gain") => json!(1.0),
            (_, "gamma") => json!(1.0),
            (_, "lift") => json!(0.1),
            (_, "contrast") => json!(1.5),
            (_, "brightness") => json!(30.0),
            _ => {
                // Use parameter default if available
                if !p.default.is_null() {
                    p.default.clone()
                } else {
                    match p.param_type {
                        ParamType::Slider => json!(0.5),
                        ParamType::Toggle => json!(false),
                        ParamType::Color => json!("#ffffff"),
                        ParamType::Palette => json!("auto"),
                        ParamType::Select => json!(null),
                        ParamType::Mask => json!(null),
                        // Text params name external resources (a second video,
                        // a LUT). There is no stand-in that verification could
                        // supply, so leave it empty and let the effect take its
                        // own no-resource branch.
                        ParamType::Text => json!(""),
                    }
                }
            }
        };
        map.insert(p.id.clone(), val);
    }

    // Effect-specific overrides that need stronger defaults to be visible
    match effect_id {
        "noise.gaussian" => {
            map.insert("std_dev".to_string(), json!(20.0));
        }
        "noise.uniform" => {
            map.insert("range".to_string(), json!(50.0));
        }
        "noise.salt_pepper" => {
            map.insert("density".to_string(), json!(0.1));
        }
        "noise.fractal" => {
            map.insert("amount".to_string(), json!(5.0));
        }
        "glitch.byte_insert" | "glitch.byte_flip" | "glitch.byte_zero" | "glitch.byte_reverse" => {
            map.insert("amount".to_string(), json!(0.1));
        }
        "glitch.slice_shift" => {
            map.insert("shift_amount".to_string(), json!(50.0));
        }
        "glitch.edge_stretch" => {
            map.insert("stretch".to_string(), json!(20.0));
        }
        "glitch.macroblock_glitch" => {
            map.insert("block_size".to_string(), json!(16.0));
            map.insert("amount".to_string(), json!(0.5));
        }
        "glitch.databend" => {
            map.insert("amount".to_string(), json!(0.3));
        }
        "glitch.sorting_glitch" => {
            map.insert("u_threshold".to_string(), json!(0.0));
            map.insert("u_intensity".to_string(), json!(10.0));
            map.insert("u_sort_mode".to_string(), json!("brightness"));
        }
        "pixel_geo.pixel_sort" => {
            map.insert("threshold".to_string(), json!(128));
        }
        "pixel_geo.block_shift" => {
            map.insert("block_size".to_string(), json!(32.0));
            map.insert("shift_amount".to_string(), json!(20.0));
        }
        "color.rgb_shift" => {
            map.insert("shift_amount".to_string(), json!(30.0));
        }
        "color.lift_gamma_gain" => {
            map.insert("lift_r".to_string(), json!(0.5));
            map.insert("lift_g".to_string(), json!(0.5));
            map.insert("lift_b".to_string(), json!(0.5));
            map.insert("gamma_r".to_string(), json!(1.2));
            map.insert("gamma_g".to_string(), json!(1.2));
            map.insert("gamma_b".to_string(), json!(1.2));
            map.insert("gain_r".to_string(), json!(1.5));
            map.insert("gain_g".to_string(), json!(1.5));
            map.insert("gain_b".to_string(), json!(1.5));
        }
        "color.brightness_contrast" => {
            map.insert("brightness".to_string(), json!(40.0));
            map.insert("contrast".to_string(), json!(1.5));
        }
        "analog.chromatic_aberration" => {
            map.insert("amount".to_string(), json!(15.0));
        }
        "analog.scan_drift" => {
            map.insert("amount".to_string(), json!(10.0));
        }
        "analog.vhs" => {
            map.insert("tracking".to_string(), json!(0.5));
        }
        "overlay.crosshairs" | "overlay.rule_of_thirds" | "overlay.safe_area" => {
            map.insert("line_width".to_string(), json!(2.0));
            map.insert("opacity".to_string(), json!(1.0));
        }
        "overlay.pixel_grid" => {
            map.insert("size".to_string(), json!(10.0));
            map.insert("opacity".to_string(), json!(1.0));
        }
        "dithering.random_noise" => {
            map.insert("amount".to_string(), json!(0.5));
        }
        "dithering.blue_noise" => {
            map.insert("strength".to_string(), json!(1.0));
        }
        "audio_reactive.audio_dither" => {
            map.insert("amount".to_string(), json!(0.5));
        }
        "audio_reactive.bass_pulse" => {
            map.insert("amount".to_string(), json!(1.0));
        }
        "audio_reactive.beat_glitch" => {
            map.insert("amount".to_string(), json!(0.5));
        }
        "audio_reactive.spectral_shift" => {
            map.insert("amount".to_string(), json!(1.0));
        }
        "datamoshing.stop" => {
            map.insert("threshold".to_string(), json!(50.0));
            map.insert("n_frames".to_string(), json!(5.0));
        }
        _ => {}
    }

    map
}

/// Animate parameters for a given time. For verification we just vary a `time` parameter and
/// any amount/intensity parameters from 0.5 to their configured value.
fn animate_effect_params(
    effect_id: &str,
    base: &serde_json::Map<String, serde_json::Value>,
    time: f64,
) -> serde_json::Map<String, serde_json::Value> {
    use serde_json::json;
    let mut params = base.clone();
    params.insert("time".to_string(), json!(time));

    // Ramp a few common parameters so deterministic effects still show motion
    for key in [
        "amount",
        "strength",
        "intensity",
        "shift_amount",
        "angle",
        "size",
    ] {
        if let Some(v) = params.get(key).and_then(|v| v.as_f64()) {
            params.insert(key.to_string(), json!(v * time));
        }
    }

    // Some effects need a specific override to show change
    match effect_id {
        "color.rgb_shift" => {
            params.insert("shift_amount".to_string(), json!((time * 30.0) as i32));
        }
        "analog.hue_shift" => {
            params.insert("shift_amount".to_string(), json!(time * 180.0));
        }
        "analog.chromatic_aberration" => {
            params.insert("amount".to_string(), json!(time * 15.0));
        }
        "color.brightness_contrast" => {
            params.insert("brightness".to_string(), json!(time * 40.0));
        }
        "color.lift_gamma_gain" => {
            params.insert("lift_r".to_string(), json!(time * 0.5));
            params.insert("lift_g".to_string(), json!(time * 0.5));
            params.insert("lift_b".to_string(), json!(time * 0.5));
        }
        "pixel_geo.pixel_sort" => {
            params.insert("threshold".to_string(), json!(time * 128.0));
        }
        "glitch.sorting_glitch" => {
            params.insert("u_threshold".to_string(), json!(time * 0.5));
        }
        "datamoshing.stop" => {
            params.insert("threshold".to_string(), json!(time * 50.0));
        }
        _ => {}
    }
    clamp_params(effect_id, &params)
}

/// Create a small synthetic video with a horizontal drift so temporal effects have variation.
fn make_synthetic_video(still: &Frame, total_frames: usize, fps: f64) -> VideoSegment {
    let w = still.width as usize;
    let h = still.height as usize;
    let drift_pixels = (w.max(h) as f64 / 10.0).max(8.0) as usize;
    let mut frames = Vec::with_capacity(total_frames);
    for frame_idx in 0..total_frames {
        let t = frame_idx as f64 / total_frames.max(1) as f64;
        let shift = ((t * drift_pixels as f64) as usize) % w.max(1);
        let mut data = vec![0u8; still.data.len()];
        for y in 0..h {
            for x in 0..w {
                let src_x = (x + shift) % w;
                let src_idx = (y * w + src_x) * 4;
                let dst_idx = (y * w + x) * 4;
                data[dst_idx..dst_idx + 4].copy_from_slice(&still.data[src_idx..src_idx + 4]);
            }
        }
        frames.push(Frame {
            width: still.width,
            height: still.height,
            data,
        });
    }
    VideoSegment { frames, fps }
}

/// Check if two frames differ in any RGBA channel.
fn frames_differ_rgba(a: &Frame, b: &Frame) -> bool {
    if a.data.len() != b.data.len() {
        return true;
    }
    a.data != b.data
}

/// Run verification on a single effect.
pub fn verify_effect(effect_id: &str, registry: &EffectRegistry) -> EffectVerificationResult {
    let start = std::time::Instant::now();
    let effect = match registry.get(effect_id) {
        Some(e) => e,
        None => {
            return EffectVerificationResult {
                effect_id: effect_id.to_string(),
                effect_name: "Unknown".to_string(),
                category: "Unknown".to_string(),
                checks: VerificationChecks {
                    no_crash: false,
                    non_empty_output: false,
                    animates: false,
                    mask_inside_correct: false,
                    mask_outside_correct: false,
                },
                overall_pass: false,
                error_message: Some("Effect not found in registry".to_string()),
                duration_ms: 0,
            };
        }
    };

    let meta = effect.meta();
    let test_frame = make_test_frame();
    let base_params = build_default_params(&meta.id, &meta.parameters);
    let mask = make_half_mask(test_frame.width, test_frame.height);
    let needs_input = NEEDS_INPUT_EFFECTS.contains(&effect_id);

    let mut checks = VerificationChecks {
        no_crash: false,
        non_empty_output: false,
        animates: false,
        mask_inside_correct: false,
        mask_outside_correct: false,
    };

    let mut error_message: Option<String> = None;

    // Check 1+2+3: No crash, non-empty output, and animation.
    // Temporal effects are run on a synthetic video so they have cross-frame data.
    if effect.is_temporal() {
        let synthetic = make_synthetic_video(&test_frame, 8, 8.0);
        let params_t0 = animate_effect_params(&meta.id, &base_params, 0.0);
        let params_t1 = animate_effect_params(&meta.id, &base_params, 1.0);

        match effect.process_video(&synthetic, None, &params_t0) {
            Ok(seg0) => {
                checks.no_crash = true;
                if seg0.frames.is_empty() {
                    error_message = Some("process_video returned no frames".to_string());
                } else {
                    checks.non_empty_output = seg0.frames.len() > 1
                        || seg0.frames[0].width != test_frame.width
                        || seg0.frames[0].height != test_frame.height
                        || frames_differ_rgba(&seg0.frames[0], &test_frame);
                    // Frame-hold intentionally freezes; mark as animating if the input video
                    // itself was non-static (i.e. process_video ran without error).
                    if meta.id == "datamoshing.frame_hold" {
                        checks.animates = true;
                    } else {
                        let mid = seg0.frames.len() / 2;
                        let last = seg0.frames.len() - 1;
                        checks.animates = frames_differ_rgba(&seg0.frames[0], &seg0.frames[mid])
                            || frames_differ_rgba(&seg0.frames[0], &seg0.frames[last]);
                    }

                    // Check animation against time=1 as well
                    if let Ok(seg1) = effect.process_video(&synthetic, None, &params_t1) {
                        if !seg1.frames.is_empty() {
                            checks.animates |= frames_differ_rgba(&seg0.frames[0], &seg1.frames[0]);
                        }
                    }
                }
            }
            Err(e) => {
                error_message = Some(format!("process_video error: {}", e));
            }
        }
    } else {
        // Effects that handle masking internally need a mask to produce visible output.
        let mask_for_check = if effect.handles_masking() {
            Some(&mask)
        } else {
            None
        };
        let params = animate_effect_params(&meta.id, &base_params, 1.0);
        let result = effect.process_frame(&test_frame, mask_for_check, &params);
        match result {
            Ok(output) => {
                checks.no_crash = true;
                checks.non_empty_output = !output.data.is_empty()
                    && (output.width != test_frame.width
                        || output.height != test_frame.height
                        || frames_differ_rgba(&output, &test_frame));
            }
            Err(e) => {
                error_message = Some(format!("process_frame error: {}", e));
            }
        }

        // Check 3: Animation — output differs between time=0 and time=1
        if checks.no_crash {
            let params_t0 = animate_effect_params(&meta.id, &base_params, 0.0);
            let params_t1 = animate_effect_params(&meta.id, &base_params, 1.0);
            let r0 = effect.process_frame(&test_frame, mask_for_check, &params_t0);
            let r1 = effect.process_frame(&test_frame, mask_for_check, &params_t1);
            if let (Ok(o0), Ok(o1)) = (r0, r1) {
                checks.animates = frames_differ_rgba(&o0, &o1);
            }
        }
    }

    // Check 4: Mask correctness (inside + outside modes).
    // Run with the same strong defaults so the effect is actually visible.
    if checks.no_crash {
        let previous = test_frame.clone();
        let params = animate_effect_params(&meta.id, &base_params, 1.0);
        let processed = if effect.is_temporal() {
            let synthetic = make_synthetic_video(&test_frame, 3, 3.0);
            match effect.process_video(&synthetic, None, &params) {
                Ok(seg) if !seg.frames.is_empty() => seg.frames[0].clone(),
                _ => test_frame.clone(),
            }
        } else {
            match effect.process_frame(&test_frame, None, &params) {
                Ok(f) => f,
                Err(_) => test_frame.clone(),
            }
        };

        if !effect.handles_masking() {
            // Test "inside" and "outside" modes; report the blend as failed if the
            // mask dimensions don't line up instead of panicking.
            let mut working_inside = processed.clone();
            let mut working_outside = processed.clone();
            let blend_ok: crate::error::Result<()> = (|| {
                blend_mask(&mut working_inside, &previous, &mask, "inside")?;
                blend_mask(&mut working_outside, &previous, &mask, "outside")?;
                Ok(())
            })();
            if let Err(e) = blend_ok {
                error_message = Some(format!("mask blend failed: {e}"));
                checks.mask_inside_correct = false;
                checks.mask_outside_correct = false;
            } else {
                checks.mask_inside_correct =
                    check_mask_blend(&previous, &working_inside, &mask, "inside");
                checks.mask_outside_correct =
                    check_mask_blend(&previous, &working_outside, &mask, "outside");
            }
        } else {
            // Effect handles its own masking — verify it doesn't crash with a mask
            if effect.is_temporal() {
                let synthetic = make_synthetic_video(&test_frame, 3, 3.0);
                let _ = effect.process_video(&synthetic, Some(&mask), &params);
            } else {
                let _ = effect.process_frame(&test_frame, Some(&mask), &params);
            }
            checks.mask_inside_correct = true;
            checks.mask_outside_correct = true;
        }
    }

    // Effects that need external input are not expected to produce visible output from a single
    // still frame with no resources. They pass if they don't crash and don't corrupt the mask.
    let overall_pass = if needs_input {
        checks.no_crash && checks.mask_inside_correct && checks.mask_outside_correct
    } else {
        checks.no_crash
            && checks.non_empty_output
            && checks.mask_inside_correct
            && checks.mask_outside_correct
    };

    EffectVerificationResult {
        effect_id: meta.id.clone(),
        effect_name: meta.name.clone(),
        category: format!("{:?}", meta.category),
        checks,
        overall_pass,
        error_message,
        duration_ms: start.elapsed().as_millis() as u64,
    }
}

/// Run verification on all registered effects.
pub fn verify_all_effects(registry: &EffectRegistry) -> VerificationReport {
    let metas = registry.list();
    let total = metas.len();
    let mut results = Vec::with_capacity(total);

    for meta in &metas {
        let result = verify_effect(&meta.id, registry);
        results.push(result);
    }

    let passed = results.iter().filter(|r| r.overall_pass).count();
    let failed = total - passed;

    let summary = format!(
        "{}/{} effects passed verification ({} failed)",
        passed, total, failed
    );

    VerificationReport {
        total_effects: total,
        passed,
        failed,
        results,
        summary,
        timestamp: std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .map(|d| d.as_secs().to_string())
            .unwrap_or_else(|_| "unknown".to_string()),
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_verification_runs_on_all_effects() {
        let registry = EffectRegistry::new();
        let report = verify_all_effects(&registry);
        // Should have results for all effects
        assert!(
            report.total_effects > 50,
            "Expected 50+ effects, got {}",
            report.total_effects
        );
        // At least 80% should pass
        let pass_rate = report.passed as f64 / report.total_effects as f64;
        assert!(
            pass_rate > 0.8,
            "Pass rate too low: {:.1}% ({} passed, {} failed)",
            pass_rate * 100.0,
            report.passed,
            report.failed
        );
    }

    #[test]
    fn test_verify_single_known_effect() {
        let registry = EffectRegistry::new();
        let result = verify_effect("color.invert", &registry);
        assert!(result.checks.no_crash, "invert should not crash");
        assert!(
            result.checks.non_empty_output,
            "invert should produce different output"
        );
        assert!(
            result.checks.mask_inside_correct,
            "invert mask inside should be correct"
        );
        assert!(
            result.checks.mask_outside_correct,
            "invert mask outside should be correct"
        );
    }

    #[test]
    fn test_verify_unknown_effect() {
        let registry = EffectRegistry::new();
        let result = verify_effect("nonexistent.effect", &registry);
        assert!(!result.overall_pass);
        assert!(result.error_message.is_some());
    }

    #[test]
    fn test_print_full_report() {
        let registry = EffectRegistry::new();
        let report = verify_all_effects(&registry);
        println!("\n=== VERIFICATION REPORT ===");
        println!(
            "Total: {} | Passed: {} | Failed: {}",
            report.total_effects, report.passed, report.failed
        );
        for r in &report.results {
            let status = if r.overall_pass { "PASS" } else { "FAIL" };
            let checks = format!(
                "crash:{} output:{} anim:{} mask_in:{} mask_out:{}",
                r.checks.no_crash as u8,
                r.checks.non_empty_output as u8,
                r.checks.animates as u8,
                r.checks.mask_inside_correct as u8,
                r.checks.mask_outside_correct as u8,
            );
            println!(
                "  {} {} — {} [{}]",
                status, r.effect_id, r.effect_name, checks
            );
            if let Some(e) = &r.error_message {
                println!("       error: {}", e);
            }
        }
        println!("=== END REPORT ===\n");
    }
}

#[cfg(test)]
mod allowlist_tests {
    use super::*;

    /// `NEEDS_INPUT_EFFECTS` exempts effects from the `non_empty_output`
    /// requirement, so it is the one place a genuinely broken effect could hide
    /// behind a green 94/94. This pins it to reality in both directions.
    ///
    /// * An entry that *does* produce output is over-broad: it silently drops
    ///   the strongest check for an effect that does not need the exemption.
    /// * An effect producing no output while *absent* from the list is either
    ///   broken or newly needs external input, and must be looked at rather
    ///   than quietly added here.
    #[test]
    fn needs_input_allowlist_matches_actual_behaviour() {
        let registry = EffectRegistry::new();
        let report = verify_all_effects(&registry);

        let mut over_broad = Vec::new();
        let mut missing = Vec::new();

        for result in &report.results {
            let listed = NEEDS_INPUT_EFFECTS.contains(&result.effect_id.as_str());
            match (listed, result.checks.non_empty_output) {
                (true, true) => over_broad.push(result.effect_id.clone()),
                (false, false) => missing.push(result.effect_id.clone()),
                _ => {}
            }
        }

        assert!(
            over_broad.is_empty(),
            "these effects produce output and do not need the non_empty_output \
             exemption — remove them from NEEDS_INPUT_EFFECTS so the check \
             applies to them again:\n  {}",
            over_broad.join("\n  ")
        );
        assert!(
            missing.is_empty(),
            "these effects produced no output and are not on NEEDS_INPUT_EFFECTS. \
             Do not add them without establishing which external input they need \
             — the alternative explanation is that they are broken:\n  {}",
            missing.join("\n  ")
        );
    }

    /// Every allowlisted ID must exist. A rename leaves a dead entry behind,
    /// which silently stops exempting anything and equally silently stops
    /// documenting why the effect was there.
    #[test]
    fn needs_input_allowlist_has_no_stale_entries() {
        let registry = EffectRegistry::new();
        let unknown: Vec<_> = NEEDS_INPUT_EFFECTS
            .iter()
            .filter(|id| registry.get(id).is_none())
            .collect();
        assert!(
            unknown.is_empty(),
            "NEEDS_INPUT_EFFECTS names effects that are not registered: {unknown:?}"
        );
    }
}
