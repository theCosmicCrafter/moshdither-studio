//! Output-stability guard for the error-diffusion dither family.
//!
//! These effects are reached by saved projects and by the shipped presets in
//! `src/hooks/defaultPresets.ts`, which store no parameter values and therefore
//! render at defaults. A refactor that changes default output would silently
//! alter every one of those projects, and the four checks in
//! `effects::verification` cannot detect it — they assert that an effect *does
//! something*, not that it does the same thing it did yesterday.
//!
//! The hashes below were captured before `error_diffusion::apply` was made
//! parameter-driven and must not change without a deliberate decision. If one
//! of these fails, the question is not "what is the new hash" — it is whether
//! the output change was intended.

use crate::effects::types::Frame;
use crate::effects::EffectRegistry;

/// Deterministic non-monotonic test image, matching the pattern used by
/// `effects::verification` so failures are comparable across suites.
fn test_frame() -> Frame {
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

fn fnv1a(bytes: &[u8]) -> u64 {
    let mut h: u64 = 0xcbf29ce484222325;
    for b in bytes {
        h ^= *b as u64;
        h = h.wrapping_mul(0x100000001b3);
    }
    h
}

/// `(effect id, hash of the RGBA output at default parameters)`.
const EXPECTED: &[(&str, u64)] = &[
    ("dithering.floyd_steinberg", 0x82b7fb5631ec2a9c),
    ("dithering.atkinson", 0x1969644b021c34c4),
    ("dithering.burkes", 0xc0e3d95a6edc69f4),
    ("dithering.jarvis_judice_ninke", 0xe4955024f76e425c),
    ("dithering.sierra", 0x1a53769c7bc7725c),
    ("dithering.stucki", 0xab5dc8ce4eaede15),
    ("dithering.riemersma", 0x05ff595809d7544c),
    ("dithering.error_diffusion_variants", 0xe4955024f76e425c),
];

#[test]
fn default_output_is_unchanged() {
    let reg = EffectRegistry::new();
    let frame = test_frame();
    let empty = serde_json::Map::new();

    let mut drifted = Vec::new();
    for (id, expected) in EXPECTED {
        let effect = reg.get(id).unwrap_or_else(|| panic!("{id} is registered"));
        let out = effect
            .process_frame(&frame, None, &empty)
            .unwrap_or_else(|e| panic!("{id} failed at defaults: {e}"));
        let actual = fnv1a(&out.data);
        if actual != *expected {
            drifted.push(format!("{id}: expected {expected:016x}, got {actual:016x}"));
        }
    }

    assert!(
        drifted.is_empty(),
        "default dither output changed — saved projects and shipped presets \
         will render differently:\n  {}",
        drifted.join("\n  ")
    );
}

/// The standalone Jarvis effect and `error_diffusion_variants` at its default
/// algorithm are the same kernel, so they produce identical bytes.
///
/// This is deliberate documentation of a known duplication, not an endorsement
/// of it: `error_diffusion_variants` also reproduces `atkinson`, `burkes` and
/// `stucki` exactly. If those standalone effects are ever consolidated away,
/// this test is the thing that proves the consolidation was lossless.
#[test]
fn variants_default_duplicates_the_standalone_jarvis_effect() {
    let reg = EffectRegistry::new();
    let frame = test_frame();
    let empty = serde_json::Map::new();

    let standalone = reg
        .get("dithering.jarvis_judice_ninke")
        .expect("registered")
        .process_frame(&frame, None, &empty)
        .expect("ok");
    let variants = reg
        .get("dithering.error_diffusion_variants")
        .expect("registered")
        .process_frame(&frame, None, &empty)
        .expect("ok");

    assert_eq!(standalone.data, variants.data);
}

/// Every effect built on `error_diffusion::apply` must actually honour the
/// shared parameters it advertises.
///
/// This is the guard against the failure mode that motivated the change: an
/// effect declaring a parameter that its implementation ignores. `riemersma` is
/// excluded by design — it has its own Hilbert-curve implementation, declares
/// no shared parameters, and is documented as such.
#[test]
fn advertised_parameters_actually_affect_output() {
    let reg = EffectRegistry::new();
    let frame = test_frame();

    let shared_param_users = [
        "dithering.floyd_steinberg",
        "dithering.atkinson",
        "dithering.burkes",
        "dithering.jarvis_judice_ninke",
        "dithering.sierra",
        "dithering.stucki",
        "dithering.error_diffusion_variants",
    ];

    for id in shared_param_users {
        let effect = reg.get(id).unwrap_or_else(|| panic!("{id} is registered"));
        let declared: Vec<String> = effect
            .meta()
            .parameters
            .iter()
            .map(|p| p.id.clone())
            .collect();
        let baseline = effect
            .process_frame(&frame, None, &serde_json::Map::new())
            .expect("ok");

        for (param, value) in [
            ("levels", serde_json::json!(8)),
            ("color_mode", serde_json::json!("rgb")),
            ("serpentine", serde_json::json!(false)),
        ] {
            assert!(
                declared.iter().any(|d| d == param),
                "{id} should declare the shared parameter '{param}'"
            );
            let mut params = serde_json::Map::new();
            params.insert(param.to_string(), value);
            let changed = effect.process_frame(&frame, None, &params).expect("ok");
            assert_ne!(
                baseline.data, changed.data,
                "{id} declares '{param}' but changing it does not affect output"
            );
        }
    }
}

/// `riemersma` deliberately carries no parameters. If someone adds the shared
/// definitions to it without also teaching its Hilbert loop to honour them,
/// this fails — the same lie the other test guards against, from the other
/// direction.
#[test]
fn riemersma_declares_no_parameters_it_cannot_honour() {
    let reg = EffectRegistry::new();
    let params = reg
        .get("dithering.riemersma")
        .expect("registered")
        .meta()
        .parameters;
    assert!(
        params.is_empty(),
        "riemersma quantises with a hardcoded binary threshold and ignores \
         params; declaring {:?} would advertise controls that do nothing",
        params.iter().map(|p| &p.id).collect::<Vec<_>>()
    );
}
