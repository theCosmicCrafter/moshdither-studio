//! Conformance diagnostics for the effect registry.
//!
//! The four checks in [`crate::effects::verification`] ask *did something
//! happen* — no crash, output differs from input, output differs across time,
//! masked regions preserved. They cannot ask *did the right thing happen*, which
//! is why seven identical white-noise shaders passed them for as long as they
//! existed.
//!
//! These checks close two of those gaps:
//!
//! * **Error-energy conservation** — an error-diffusion kernel must redistribute
//!   quantisation error, not create or destroy it. Kernel weights summing to
//!   anything but 1.0 is the classic transcription bug in this family, and it is
//!   invisible to a "does the frame change" check. Atkinson is the documented
//!   exception: it distributes only 6/8, discarding 25% by design.
//! * **Pairwise distinctness** — two effect IDs producing byte-identical output
//!   means one of them is lying about what it does.
//!
//! Kernel weights are cross-checked against `references/dither_pie`, which
//! `docs/PRD.md` names as the upstream source for these kernels.

use std::collections::BTreeSet;

use crate::effects::types::{Frame, VideoSegment};
use crate::effects::EffectRegistry;

fn flat_frame(w: u32, h: u32, gray: u8) -> Frame {
    Frame {
        width: w,
        height: h,
        data: [gray, gray, gray, 255].repeat((w * h) as usize),
    }
}

fn detail_frame() -> Frame {
    let (w, h) = (64u32, 64u32);
    let mut data = Vec::with_capacity((w * h * 4) as usize);
    for y in 0..h {
        for x in 0..w {
            data.extend_from_slice(&[
                ((x * 7 + y * 13) % 256) as u8,
                ((x * 11 + y * 5) % 256) as u8,
                ((x * 3 + y * 17) % 256) as u8,
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

fn mean_red(f: &Frame) -> f64 {
    let sum: f64 = f.data.as_chunks::<4>().0.iter().map(|p| p[0] as f64).sum();
    sum / (f.data.len() / 4) as f64
}

/// Error-diffusion effects whose kernel weights sum to 1.0.
const ENERGY_CONSERVING: &[&str] = &[
    "dithering.floyd_steinberg",
    "dithering.burkes",
    "dithering.jarvis_judice_ninke",
    "dithering.sierra",
    "dithering.stucki",
    "dithering.error_diffusion_variants",
];

/// Measured drift for a conserving kernel on a flat field is under 1.1/255 at
/// the extremes tested, driven by error pushed off the frame edge and discarded.
/// 2.5 leaves headroom for that without admitting a mistyped weight: a single
/// wrong term shifts the mean by an order of magnitude more (see Atkinson).
const ENERGY_TOLERANCE: f64 = 2.5;

#[test]
fn error_diffusion_conserves_error_energy() {
    let reg = EffectRegistry::new();
    let empty = serde_json::Map::new();
    let mut failures = Vec::new();

    for gray in [64u8, 128, 192] {
        let input = flat_frame(128, 128, gray);
        for id in ENERGY_CONSERVING {
            let effect = reg.get(id).unwrap_or_else(|| panic!("{id} is registered"));
            let out = effect.process_frame(&input, None, &empty).expect("ok");
            let drift = mean_red(&out) - gray as f64;
            if drift.abs() > ENERGY_TOLERANCE {
                failures.push(format!(
                    "{id} at gray {gray}: mean drifted {drift:+.3}, tolerance ±{ENERGY_TOLERANCE}"
                ));
            }
        }
    }

    assert!(
        failures.is_empty(),
        "error-diffusion kernel does not conserve error energy — check the \
         weights sum to 1.0 against references/dither_pie:\n  {}",
        failures.join("\n  ")
    );
}

/// Atkinson deliberately distributes only 6/8 of its error, discarding 25%.
///
/// That is the defining characteristic of the algorithm — it is what produces
/// the blown-highlight, crushed-shadow "classic Mac" look. A well-meaning
/// "fix" making the kernel sum to 1.0 would silently turn Atkinson into a
/// slightly-different Floyd-Steinberg, so the loss is asserted rather than
/// merely tolerated.
#[test]
fn atkinson_discards_error_by_design() {
    let reg = EffectRegistry::new();
    let empty = serde_json::Map::new();
    let atkinson = reg.get("dithering.atkinson").expect("registered");

    // Discarding error pulls the result toward the midpoint: a dark field gets
    // darker, a bright field brighter.
    for (gray, expect_negative) in [(64u8, true), (192u8, false)] {
        let input = flat_frame(128, 128, gray);
        let out = atkinson.process_frame(&input, None, &empty).expect("ok");
        let drift = mean_red(&out) - gray as f64;

        assert!(
            drift.abs() > 10.0,
            "Atkinson at gray {gray} drifted only {drift:+.3}; it should discard \
             ~25% of its error. A kernel summing to 1.0 is not Atkinson."
        );
        assert_eq!(
            drift < 0.0,
            expect_negative,
            "Atkinson at gray {gray} drifted {drift:+.3}, wrong direction — \
             discarded error should push away from mid-grey"
        );
    }
}

/// Effects that legitimately return a single frame unchanged.
///
/// Each is here for a structural reason, not because it is broken:
/// * `datamoshing.*` frame-sequence effects reorder or drop whole frames and
///   have nothing to do to a single one.
/// * `audio_reactive.*` effects need an audio feature stream.
/// * `mask_isolate` needs a mask.
/// * `color.lift_gamma_gain` and `color.lut_grading` are identity at their
///   default parameters, which is correct.
/// * `composite.overlay` is identity only because no overlay is selected by
///   default (`overlay_path` is empty). Blend-mode compositing itself is
///   implemented -- normal, screen, multiply and overlay -- and is covered by
///   tests in composite/overlay.rs. This entry previously read "pending real
///   blend-mode compositing", which was wrong: the blending existed but the
///   bundled `overlays/*.mp4` paths never resolved, so the effect returned
///   early and looked unimplemented.
///
/// A new entry appearing here means an effect silently does nothing — the
/// failure mode `verification`'s `non_empty_output` check records but does not
/// fail on.
const SINGLE_FRAME_NOOPS: &[&str] = &[
    "audio_reactive.bass_pulse",
    "audio_reactive.beat_glitch",
    // Audio-reactive effects are driven entirely by the `_audio_*` params the
    // export bake injects. With no audio loaded there is nothing to react to,
    // so passing the frame through unchanged is the correct behaviour rather
    // than a silent failure -- the same reason the three above are listed.
    "audio_reactive.chromatic",
    "audio_reactive.pixelate",
    "audio_reactive.spectral_shift",
    "audio_reactive.spectrum",
    "audio_reactive.waveform",
    "color.lift_gamma_gain",
    "color.lut_grading",
    "composite.overlay",
    // Beat-synced effects are temporal and act on the beat timeline the export
    // bake supplies; a lone frame carries neither, so identity is correct here
    // in the same way it is for the frame_* entries below.
    "datamoshing.beat_hold",
    "datamoshing.beat_smear",
    "datamoshing.cross_video",
    "datamoshing.frame_hold",
    "datamoshing.frame_reverse",
    "datamoshing.frame_sort_by_size",
    "datamoshing.iframe_removal_advanced",
    "datamoshing.stop",
    "mask_isolate",
];

#[test]
fn single_frame_noops_are_the_expected_set() {
    let reg = EffectRegistry::new();
    let frame = detail_frame();
    let empty = serde_json::Map::new();

    let mut actual = BTreeSet::new();
    for meta in reg.list() {
        if let Some(effect) = reg.get(&meta.id) {
            if let Ok(out) = effect.process_frame(&frame, None, &empty) {
                if out.data == frame.data {
                    actual.insert(meta.id.clone());
                }
            }
        }
    }

    let expected: BTreeSet<String> = SINGLE_FRAME_NOOPS.iter().map(|s| s.to_string()).collect();
    let unexpected: Vec<_> = actual.difference(&expected).collect();
    let fixed: Vec<_> = expected.difference(&actual).collect();

    assert!(
        unexpected.is_empty(),
        "these effects silently do nothing to a single frame and are not \
         documented as no-ops: {unexpected:?}"
    );
    assert!(
        fixed.is_empty(),
        "these are no longer no-ops — remove them from SINGLE_FRAME_NOOPS: {fixed:?}"
    );
}

/// Every effect must produce identical output from identical input.
///
/// This is the invariant `rand::thread_rng()` violated across nine call sites.
/// For a passive render tool, non-determinism is a correctness bug rather than a
/// stylistic choice: the preview and the export run the effect separately, so
/// they disagree and the user grades against something the exported file will
/// never contain; and re-exporting the same project produces a different file,
/// so a render cannot be reproduced or verified.
///
/// Randomness itself is fine — `effects::rng` seeds it from the frame content
/// and an optional `seed` parameter, so patterns still vary between images and
/// remain under the user's control while staying reproducible.
#[test]
fn every_effect_is_deterministic() {
    let reg = EffectRegistry::new();
    let frame = detail_frame();
    let empty = serde_json::Map::new();

    let mut nondeterministic = Vec::new();
    for meta in reg.list() {
        let Some(effect) = reg.get(&meta.id) else {
            continue;
        };
        let (Ok(first), Ok(second)) = (
            effect.process_frame(&frame, None, &empty),
            effect.process_frame(&frame, None, &empty),
        ) else {
            continue;
        };
        if first.data != second.data {
            nondeterministic.push(meta.id.clone());
        }
    }

    assert!(
        nondeterministic.is_empty(),
        "these effects produced different output from identical input — preview \
         and export will disagree, and a render cannot be reproduced. Use \
         effects::rng instead of rand::thread_rng():\n  {}",
        nondeterministic.join("\n  ")
    );
}

/// Effect pairs known to produce identical output, with a reason.
const ALLOWED_DUPLICATES: &[(&str, &str, &str)] = &[
    (
        "dithering.error_diffusion_variants",
        "dithering.jarvis_judice_ninke",
        "variants defaults to the jarvis_judice_ninke kernel; see \
         dithering::output_stability_tests",
    ),
    (
        "pixel_geo.pixel_sort",
        "glitch.sorting_glitch",
        "coincident defaults, not duplicate implementations: pixel_sort's \
         threshold defaults to 128/255 and sorting_glitch's u_threshold to 0.50, \
         which land on the same sort. They diverge as soon as either is moved \
         off its default. Worth revisiting as a UX question — two effects that \
         look identical out of the box — but neither is redundant code.",
    ),
];

/// No two effects that actually modify a frame may produce identical bytes.
///
/// This is the check that would have caught the seven error-diffusion preview
/// shaders in a single run: they were one white-noise dither wearing seven
/// names, and every existing check passed them.
#[test]
fn effects_that_modify_a_frame_are_pairwise_distinct() {
    let reg = EffectRegistry::new();
    let frame = detail_frame();
    let empty = serde_json::Map::new();

    let mut outputs: Vec<(String, Vec<u8>)> = Vec::new();
    for meta in reg.list() {
        if let Some(effect) = reg.get(&meta.id) {
            if let Ok(out) = effect.process_frame(&frame, None, &empty) {
                if out.data != frame.data {
                    outputs.push((meta.id.clone(), out.data));
                }
            }
        }
    }

    let allowed = |a: &str, b: &str| {
        ALLOWED_DUPLICATES
            .iter()
            .any(|(x, y, _)| (*x == a && *y == b) || (*x == b && *y == a))
    };

    let mut collisions = Vec::new();
    for i in 0..outputs.len() {
        for j in (i + 1)..outputs.len() {
            if outputs[i].1 == outputs[j].1 && !allowed(&outputs[i].0, &outputs[j].0) {
                collisions.push(format!(
                    "{} produces identical bytes to {}",
                    outputs[i].0, outputs[j].0
                ));
            }
        }
    }

    assert!(
        collisions.is_empty(),
        "distinct effect IDs produced identical output — one of each pair is \
         not the algorithm it claims to be:\n  {}",
        collisions.join("\n  ")
    );
}

/// Frame-sequence effects must be pairwise distinct too.
///
/// `effects_that_modify_a_frame_are_pairwise_distinct` above only exercises
/// `process_frame`, so it cannot see a video effect at all. Two findings came
/// out of running every effect over a real clip, and neither was reachable from
/// the single-frame checks:
///
/// * `datamoshing.frame_sort_by_size` sorted on `Frame::data.len()`. Frames
///   arrive decoded to raw RGBA, so every frame is exactly width*height*4 bytes
///   -- every sort key was equal and the effect returned its input untouched.
/// * `datamoshing.classic` and `datamoshing.repeat` are the same algorithm with
///   renamed parameters and identical defaults.
#[test]
fn video_effects_are_pairwise_distinct() {
    let reg = EffectRegistry::new();

    // A clip whose frames genuinely differ, including in complexity, so that
    // reordering and dropping are both observable.
    let frames: Vec<Frame> = (0..8u32)
        .map(|i| {
            let (w, h) = (32u32, 32u32);
            let mut data = Vec::with_capacity((w * h * 4) as usize);
            for y in 0..h {
                for x in 0..w {
                    // Detail scales with frame index, so complexity is ordered.
                    let v = ((x * (i + 1) * 7 + y * (i + 1) * 13) % 256) as u8;
                    data.extend_from_slice(&[v, v.wrapping_add(i as u8 * 20), 255 - v, 255]);
                }
            }
            Frame {
                width: w,
                height: h,
                data,
            }
        })
        .collect();
    let segment = VideoSegment { frames, fps: 24.0 };
    let empty = serde_json::Map::new();

    let mut outputs: Vec<(String, Vec<u8>)> = Vec::new();
    for meta in reg.list() {
        let Some(effect) = reg.get(&meta.id) else {
            continue;
        };
        if !effect.is_temporal() {
            continue;
        }
        let Ok(out) = effect.process_video(&segment, None, &empty) else {
            continue;
        };
        // Flatten the whole segment: frame ORDER is the thing under test.
        let mut flat = Vec::new();
        for f in &out.frames {
            flat.extend_from_slice(&f.data);
        }
        if flat
            != segment
                .frames
                .iter()
                .flat_map(|f| f.data.clone())
                .collect::<Vec<u8>>()
        {
            outputs.push((meta.id.clone(), flat));
        }
    }

    let allowed = |a: &str, b: &str| {
        ALLOWED_VIDEO_DUPLICATES
            .iter()
            .any(|(x, y, _)| (*x == a && *y == b) || (*x == b && *y == a))
    };

    let mut collisions = Vec::new();
    for i in 0..outputs.len() {
        for j in (i + 1)..outputs.len() {
            if outputs[i].1 == outputs[j].1 && !allowed(&outputs[i].0, &outputs[j].0) {
                collisions.push(format!("{} == {}", outputs[i].0, outputs[j].0));
            }
        }
    }
    assert!(
        collisions.is_empty(),
        "distinct video effects produced identical frame sequences:\n  {}",
        collisions.join("\n  ")
    );
}

/// Video effect pairs known to produce identical output, with a reason.
///
/// Empty. `datamoshing.repeat` used to be listed here as a duplicate of
/// `datamoshing.classic`; it was removed on 2026-07-26 rather than tolerated,
/// so there is no longer a pair to exempt. Adding an entry here should require
/// the same justification a suppression does.
const ALLOWED_VIDEO_DUPLICATES: &[(&str, &str, &str)] = &[];

/// `frame_sort_by_size` must actually reorder frames.
///
/// It sorted on `Frame::data.len()`, which is constant across decoded RGBA
/// frames, so the sort was a no-op and the effect silently passed its input
/// through.
#[test]
fn frame_sort_by_size_reorders_frames() {
    let reg = EffectRegistry::new();
    let effect = reg
        .get("datamoshing.frame_sort_by_size")
        .expect("registered");

    // Deliberately fed in descending complexity so a working sort must reverse
    // them; a no-op sort would return them unchanged.
    let frames: Vec<Frame> = (0..6u32)
        .rev()
        .map(|i| {
            let (w, h) = (24u32, 24u32);
            let mut data = Vec::with_capacity((w * h * 4) as usize);
            for y in 0..h {
                for x in 0..w {
                    let v = ((x * (i + 1) * 11 + y * (i + 1) * 5) % 256) as u8;
                    data.extend_from_slice(&[v, v, v, 255]);
                }
            }
            Frame {
                width: w,
                height: h,
                data,
            }
        })
        .collect();
    let segment = VideoSegment {
        frames: frames.clone(),
        fps: 24.0,
    };

    let out = effect
        .process_video(&segment, None, &serde_json::Map::new())
        .expect("ok");

    assert_eq!(out.frames.len(), frames.len(), "no frames may be lost");

    let before: Vec<&Vec<u8>> = frames.iter().map(|f| &f.data).collect();
    let after: Vec<&Vec<u8>> = out.frames.iter().map(|f| &f.data).collect();
    assert_ne!(
        before, after,
        "frame_sort_by_size returned the input order; it is sorting on a key \
         that is identical for every decoded frame"
    );
}

/// A retired effect ID must still resolve, and must not reappear in the browser.
///
/// Removing an ID outright is not a cosmetic change: the render pipeline treats
/// an unknown ID as a hard error and aborts the whole export, so a project
/// referencing it would stop rendering entirely rather than losing one effect.
/// `EffectRegistry::ALIASES` forwards retired IDs; this pins both halves of that
/// contract.
#[test]
fn retired_effect_ids_still_resolve_but_are_not_listed() {
    let reg = EffectRegistry::new();

    // Resolves, so existing projects keep rendering.
    let aliased = reg
        .get("datamoshing.repeat")
        .expect("retired ID must still resolve or saved projects fail to render");
    assert_eq!(
        aliased.meta().id,
        "datamoshing.classic",
        "the alias should forward to the surviving effect"
    );

    // Absent from list(), so it cannot be added to a NEW project and does not
    // show up as a duplicate entry in the effect browser.
    let listed: Vec<String> = reg.list().into_iter().map(|m| m.id).collect();
    assert!(
        !listed.contains(&"datamoshing.repeat".to_string()),
        "a retired ID must not be advertised in the effect list"
    );
}

/// The surviving effect must honour the retired effect's parameter names.
///
/// `datamoshing.repeat` used `series_size` / `repeat_count`; classic uses
/// `chunk_size` / `repeats`. Without the aliases a project saved against the old
/// effect would resolve to classic and then silently ignore every value the user
/// set, falling back to defaults.
#[test]
fn retired_parameter_names_are_still_honoured() {
    let reg = EffectRegistry::new();
    let effect = reg.get("datamoshing.repeat").expect("resolves");

    let frames: Vec<Frame> = (0..6).map(|_| detail_frame()).collect();
    let segment = VideoSegment { frames, fps: 24.0 };

    // Old names.
    let mut old = serde_json::Map::new();
    old.insert("series_size".into(), serde_json::json!(3));
    old.insert("repeat_count".into(), serde_json::json!(2));

    // New names, same values.
    let mut new = serde_json::Map::new();
    new.insert("chunk_size".into(), serde_json::json!(3));
    new.insert("repeats".into(), serde_json::json!(2));

    let a = effect.process_video(&segment, None, &old).expect("ok");
    let b = effect.process_video(&segment, None, &new).expect("ok");

    assert_eq!(
        a.frames.len(),
        b.frames.len(),
        "old parameter names must produce the same result as the new ones"
    );
    assert_eq!(a.frames.len(), 12, "6 frames, chunks of 3, repeated twice");
}

/// The vertical smear from the retired effect must survive as a mode.
///
/// `datamoshing.repeat` and `datamoshing.classic` had identical `process_video`
/// but DIFFERENT `process_frame`: repeat duplicated rows downward, classic
/// repeats a pixel along a row. Consolidating on the video behaviour alone would
/// have quietly deleted the vertical look.
#[test]
fn both_smear_directions_survive_the_merge() {
    let reg = EffectRegistry::new();
    let effect = reg.get("datamoshing.classic").expect("registered");
    let frame = detail_frame();

    let mut horizontal = serde_json::Map::new();
    horizontal.insert("smear_direction".into(), serde_json::json!("horizontal"));
    let mut vertical = serde_json::Map::new();
    vertical.insert("smear_direction".into(), serde_json::json!("vertical"));

    let h = effect.process_frame(&frame, None, &horizontal).expect("ok");
    let v = effect.process_frame(&frame, None, &vertical).expect("ok");

    assert_ne!(h.data, frame.data, "horizontal smear must change the frame");
    assert_ne!(v.data, frame.data, "vertical smear must change the frame");
    assert_ne!(
        h.data, v.data,
        "the two directions must differ; if they match, the vertical branch that \
         datamoshing.repeat contributed has been lost"
    );
}

/// Threshold-driven effects must still work on a dark image.
///
/// Effects that build sortable runs from "pixels brighter than T" degenerate
/// when T is a fixed constant and the image is darker than it: almost nothing
/// qualifies, runs are a few pixels long, and the effect is mathematically
/// working while visually doing nothing.
///
/// Measured on a real photograph with mean luminance 68, `pixel_geo.pixel_sort`
/// at its old fixed default of 128 qualified 0.8% of pixels in runs averaging
/// 9px across a 2528px-wide frame. Every other check in this file passed it,
/// because "changed some pixels" and "differs from other effects" were both true.
///
/// Both effects now derive the threshold from the frame unless `auto_threshold`
/// is turned off.
#[test]
fn threshold_effects_work_on_a_dark_image() {
    let reg = EffectRegistry::new();

    // Mean luminance ~40: darker than any sensible fixed threshold, which is
    // exactly the case that used to fail.
    //
    // The values must be NON-MONOTONIC along each row. A first version used
    // (x*3 + y*5) % 60, which rises steadily left to right, so every run was
    // already in sorted order and a correct sort changed nothing -- the fixture
    // failed the effect rather than the other way round.
    let (w, h) = (128u32, 128u32);
    let mut data = Vec::with_capacity((w * h * 4) as usize);
    for y in 0..h {
        for x in 0..w {
            let scramble = (x * 37 + y * 61) % 251;
            let v = ((scramble % 60) + 10) as u8;
            data.extend_from_slice(&[v, v.saturating_add(8), v.saturating_sub(4), 255]);
        }
    }
    let dark = Frame {
        width: w,
        height: h,
        data,
    };

    for id in ["pixel_geo.pixel_sort", "glitch.sorting_glitch"] {
        let effect = reg.get(id).unwrap_or_else(|| panic!("{id} is registered"));
        let out = effect
            .process_frame(&dark, None, &serde_json::Map::new())
            .expect("ok");

        let changed = out
            .data
            .as_chunks::<4>()
            .0
            .iter()
            .zip(dark.data.as_chunks::<4>().0.iter())
            .filter(|(a, b)| {
                a[0].abs_diff(b[0])
                    .max(a[1].abs_diff(b[1]))
                    .max(a[2].abs_diff(b[2]))
                    > 8
            })
            .count();
        let pct = changed as f64 / (w * h) as f64 * 100.0;

        assert!(
            pct > 2.0,
            "{id} changed only {pct:.2}% of a dark frame. A fixed brightness \
             threshold has made it a no-op on under-exposed images -- check that \
             auto_threshold is honoured."
        );
    }
}

/// Turning auto off must hand control back to the slider.
#[test]
fn auto_threshold_can_be_disabled() {
    let reg = EffectRegistry::new();
    let effect = reg.get("pixel_geo.pixel_sort").expect("registered");
    let frame = detail_frame();

    // 255 means nothing is brighter than the threshold, so no run can form.
    let mut manual = serde_json::Map::new();
    manual.insert("auto_threshold".into(), serde_json::json!(false));
    manual.insert("threshold".into(), serde_json::json!(255));
    let pinned = effect.process_frame(&frame, None, &manual).expect("ok");

    assert_eq!(
        pinned.data, frame.data,
        "with auto off and threshold 255 no run can form, so the frame must be \
         untouched; if it changed, the slider is being ignored"
    );
}

/// Every `Select` parameter must declare a default that is a usable option.
///
/// Scope, stated precisely because an earlier version of this comment claimed
/// more: this is a STATIC check on metadata. It never invokes the effect, so it
/// cannot see whether the declared default's TYPE agrees with the accessor the
/// effect reads it with. `glitch.sorting_glitch.u_direction` declared `json!(0)`
/// against two options and read the value with `as_str()`; 0 is a perfectly
/// valid index, so this test would have passed it. That mismatch is caught
/// behaviourally by `image_select_options_are_not_all_identical`, not here.
///
/// The UI has one convention for selects: `ParameterPanel.tsx` sends the option
/// INDEX, and `clamp_params` normalises option names to indices for any select
/// whose declared default is a number. An effect that reads the parameter as
/// something other than an index therefore receives values it will misread, and
/// the failure is silent -- a control that moves but does not do what it says.
///
/// `dithering.bayer` was exactly that. Its options were the matrix sizes
/// ["2","4","8","16"] and its default was `4`, which is not an index into a
/// four-element list at all; the effect then read the index as a size, so three
/// of the four settings produced the same 2x2 screen and the two largest
/// matrices could not be selected. Every existing test passed against it,
/// because they all used the default.
///
/// Two invariants close that off:
///   - a numeric default must be in range for the option list, and
///   - a string default must actually be one of the options.
#[test]
fn every_select_default_is_a_usable_option() {
    let reg = EffectRegistry::new();
    let mut problems = Vec::new();

    for meta in reg.list() {
        for p in &meta.parameters {
            if !matches!(p.param_type, crate::effects::types::ParamType::Select) {
                continue;
            }
            let Some(options) = p.options.as_ref() else {
                problems.push(format!("{}.{}: Select with no options", meta.id, p.id));
                continue;
            };
            if options.is_empty() {
                problems.push(format!("{}.{}: Select with empty options", meta.id, p.id));
                continue;
            }
            match &p.default {
                serde_json::Value::Number(n) => {
                    let idx = n.as_f64().unwrap_or(-1.0);
                    if idx < 0.0 || idx.fract() != 0.0 || (idx as usize) >= options.len() {
                        problems.push(format!(
                            "{}.{}: default {} is not a valid index into {} options {:?}",
                            meta.id,
                            p.id,
                            n,
                            options.len(),
                            options
                        ));
                    }
                }
                serde_json::Value::String(s) => {
                    if !options.iter().any(|o| o.eq_ignore_ascii_case(s)) {
                        problems.push(format!(
                            "{}.{}: default {:?} is not one of {:?}",
                            meta.id, p.id, s, options
                        ));
                    }
                }
                other => problems.push(format!(
                    "{}.{}: Select default {} is neither an index nor an option name",
                    meta.id, p.id, other
                )),
            }
        }
    }

    assert!(
        problems.is_empty(),
        "Select parameters whose default the UI cannot round-trip:\n  {}",
        problems.join("\n  ")
    );
}

/// Selecting a different option must actually change the frame.
///
/// A select whose options all render identically is a dead control. This walks
/// every option of every image-domain select and requires at least one to differ
/// from the first -- weak enough that genuinely subtle modes pass, strong enough
/// that a wholly inert control fails. It is what caught
/// `glitch.sorting_glitch.u_direction`, which was pinned to "Horizontal".
///
/// Its limit, stated because an earlier version of this comment overstated the
/// reach: requiring only ONE option to differ means a control can be mostly dead
/// and still pass. Pre-fix `dithering.bayer` is the case in point -- indices 0-2
/// all gave a 2x2 screen and index 3 gave 4x4, so it varied, and this test would
/// NOT have reported it. Proving that a specific option selects a specific
/// behaviour needs a per-effect test; see `bayer.rs`, where the screen size is
/// pinned against the canonical matrices.
#[test]
fn image_select_options_are_not_all_identical() {
    let reg = EffectRegistry::new();
    let frame = detail_frame();
    let mut dead = Vec::new();

    for meta in reg.list() {
        let Some(effect) = reg.get(&meta.id) else {
            continue;
        };
        for p in &meta.parameters {
            if !matches!(p.param_type, crate::effects::types::ParamType::Select) {
                continue;
            }
            let Some(options) = p.options.as_ref() else {
                continue;
            };
            if options.len() < 2 {
                continue;
            }

            // Some parameters only apply when another one enables them, and
            // testing those against the defaults would call a working control
            // dead. The dithers are the case in point: `palette` and
            // `palette_source` are read only when `color_mode` is "palette"
            // (error_diffusion.rs, `if mode == ColorMode::Palette`), and
            // `color_mode` defaults to grayscale.
            //
            // Rather than excuse them, switch the gate on so the palette choice
            // is actually exercised. An enabler is only applied when the effect
            // declares that parameter, so it is inert everywhere else.
            // Gates nest: `palette` is only read when `palette_source` is
            // "preset", which is itself only read when `color_mode` is
            // "palette". Both have to be on for the named-palette list to be a
            // live control.
            const ENABLERS: &[(&str, &str)] =
                &[("color_mode", "palette"), ("palette_source", "preset")];

            // Send the option INDEX, which is what the UI sends, then clamp --
            // the same order the render pipeline uses. Clamping is what turns an
            // index into an option name for selects that declare a string
            // default, so skipping it would hand those effects a number they
            // cannot read, and every one of them would look dead.
            let render = |idx: usize| {
                let mut params = serde_json::Map::new();
                for (gate, value) in ENABLERS {
                    if *gate != p.id && meta.parameters.iter().any(|q| q.id == *gate) {
                        params.insert((*gate).to_string(), serde_json::json!(value));
                    }
                }
                params.insert(p.id.clone(), serde_json::json!(idx));
                let params = crate::effects::params::clamp_params(&meta.id, &params);
                effect
                    .process_frame(&frame, None, &params)
                    .ok()
                    .map(|f| f.data)
            };

            let Some(first) = render(0) else { continue };
            // Option 0 leaving the frame untouched means there is no baseline to
            // compare against -- typically a video-only effect, which cannot act
            // on a single frame at any setting.
            //
            // This is a real blind spot, not a covered case: it silently drops
            // the select entirely, including `datamoshing.cross_video.interleave`
            // and `composite.overlay.blend_mode`. An earlier comment here cited
            // `single_frame_noops_are_the_expected_set` as covering them, which
            // was wrong -- that test runs with EMPTY params, so it says nothing
            // about behaviour under option 0. Video-domain selects need a
            // process_video equivalent of this test.
            if first == frame.data {
                continue;
            }
            let varies = (1..options.len()).any(|i| render(i).is_some_and(|d| d != first));
            if !varies {
                dead.push(format!(
                    "{}.{} renders identically for all {} options {:?}",
                    meta.id,
                    p.id,
                    options.len(),
                    options
                ));
            }
        }
    }

    assert!(
        dead.is_empty(),
        "select controls that do nothing:\n  {}",
        dead.join("\n  ")
    );
}
