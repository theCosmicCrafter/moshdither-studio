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

use crate::effects::types::Frame;
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
    let sum: f64 = f.data.chunks_exact(4).map(|p| p[0] as f64).sum();
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
/// * `composite.overlay` is a known no-op pending real blend-mode compositing
///   (see effectConverter.ts and HARDENING_PLAN).
///
/// A new entry appearing here means an effect silently does nothing — the
/// failure mode `verification`'s `non_empty_output` check records but does not
/// fail on.
const SINGLE_FRAME_NOOPS: &[&str] = &[
    "audio_reactive.bass_pulse",
    "audio_reactive.beat_glitch",
    "audio_reactive.spectral_shift",
    "color.lift_gamma_gain",
    "color.lut_grading",
    "composite.overlay",
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
