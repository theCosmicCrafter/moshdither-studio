//! Deterministic randomness for effects.
//!
//! Several effects need randomness — k-means seeding, frame shuffling, byte
//! corruption. All of them originally used `rand::thread_rng()`, which is seeded
//! from the OS and therefore produces different output on every call.
//!
//! For a passive render tool that is a correctness bug, not a stylistic choice:
//!
//! * The preview and the export run the effect separately, so they disagree —
//!   the user grades against something the exported file will never contain.
//! * Re-exporting the same project produces a different file, so a render
//!   cannot be reproduced or verified.
//! * Video output flickers, because every frame re-rolls instead of continuing
//!   a stable pattern.
//!
//! The fix is not to remove randomness but to make it *reproducible*. A seed is
//! derived from the frame content and an optional user-facing `seed` parameter,
//! so:
//!
//! * the same image and seed always give the same result,
//! * a different image gives a different pattern without the user doing
//!   anything, and
//! * the user can dial the seed to explore variations, then keep the one they
//!   want and have it survive an export.

use rand::rngs::StdRng;
use rand::SeedableRng;

use super::types::{Frame, ParameterValues};

/// Parameter effects use to vary their randomness reproducibly.
pub const SEED_PARAM: &str = "seed";

/// FNV-1a over a sample of the frame.
///
/// Sampled rather than hashed in full: a 4K frame is 33 MB, and hashing all of
/// it per effect per frame would cost more than the effects themselves. A stride
/// gives a content-dependent seed for a negligible cost, which is all this needs
/// — it is choosing a starting point, not authenticating anything.
fn frame_fingerprint(frame: &Frame) -> u64 {
    const STRIDE: usize = 997; // prime, so the sample does not align to rows
    let mut h: u64 = 0xcbf29ce484222325;
    h ^= frame.width as u64;
    h = h.wrapping_mul(0x100000001b3);
    h ^= frame.height as u64;
    h = h.wrapping_mul(0x100000001b3);
    let mut i = 0;
    while i < frame.data.len() {
        h ^= frame.data[i] as u64;
        h = h.wrapping_mul(0x100000001b3);
        i += STRIDE;
    }
    h
}

/// Seed for an effect operating on `frame`, honouring an explicit `seed` param.
pub fn frame_seed(frame: &Frame, params: &ParameterValues) -> u64 {
    let user_seed = params
        .get(SEED_PARAM)
        .and_then(|v| v.as_f64())
        .filter(|v| v.is_finite())
        .map(|v| v as i64 as u64)
        .unwrap_or(0);
    frame_fingerprint(frame) ^ user_seed.wrapping_mul(0x9e3779b97f4a7c15)
}

/// Reproducible RNG for an effect operating on `frame`.
pub fn frame_rng(frame: &Frame, params: &ParameterValues) -> StdRng {
    StdRng::seed_from_u64(frame_seed(frame, params))
}

/// Reproducible RNG from an explicit seed, for callers with no frame in hand
/// (video-level effects that reorder whole frames, for instance).
pub fn seeded_rng(seed: u64) -> StdRng {
    StdRng::seed_from_u64(seed)
}

/// Seed for a video-level operation, honouring an explicit `seed` param.
pub fn video_seed(params: &ParameterValues, fallback: u64) -> u64 {
    params
        .get(SEED_PARAM)
        .and_then(|v| v.as_f64())
        .filter(|v| v.is_finite())
        .map(|v| v as i64 as u64)
        .unwrap_or(fallback)
}

#[cfg(test)]
mod tests {
    use super::*;
    use rand::Rng;

    fn frame(w: u32, h: u32, fill: u8) -> Frame {
        Frame {
            width: w,
            height: h,
            data: vec![fill; (w * h * 4) as usize],
        }
    }

    fn draws(mut rng: StdRng) -> Vec<u32> {
        (0..8).map(|_| rng.gen_range(0..1000)).collect()
    }

    #[test]
    fn same_frame_and_params_give_the_same_sequence() {
        let f = frame(16, 16, 42);
        let p = ParameterValues::new();
        assert_eq!(draws(frame_rng(&f, &p)), draws(frame_rng(&f, &p)));
    }

    #[test]
    fn different_frames_give_different_sequences() {
        let p = ParameterValues::new();
        assert_ne!(
            draws(frame_rng(&frame(16, 16, 42), &p)),
            draws(frame_rng(&frame(16, 16, 99), &p))
        );
    }

    #[test]
    fn frame_dimensions_are_part_of_the_seed() {
        // Two frames can sample identically under the stride while being
        // different images, so width and height are folded in explicitly.
        let p = ParameterValues::new();
        assert_ne!(
            frame_seed(&frame(16, 16, 0), &p),
            frame_seed(&frame(32, 8, 0), &p)
        );
    }

    #[test]
    fn the_seed_param_varies_the_sequence_reproducibly() {
        let f = frame(16, 16, 42);
        let mut a = ParameterValues::new();
        a.insert(SEED_PARAM.into(), serde_json::json!(1));
        let mut b = ParameterValues::new();
        b.insert(SEED_PARAM.into(), serde_json::json!(2));

        assert_ne!(draws(frame_rng(&f, &a)), draws(frame_rng(&f, &b)));
        // ...and each is stable across calls, which is the whole point.
        assert_eq!(draws(frame_rng(&f, &a)), draws(frame_rng(&f, &a)));
    }

    #[test]
    fn a_float_seed_is_accepted() {
        // Sliders serialise integers as floats; as_u64() would drop them.
        let f = frame(8, 8, 1);
        let mut int_seed = ParameterValues::new();
        int_seed.insert(SEED_PARAM.into(), serde_json::json!(7));
        let mut float_seed = ParameterValues::new();
        float_seed.insert(SEED_PARAM.into(), serde_json::json!(7.0));
        assert_eq!(frame_seed(&f, &int_seed), frame_seed(&f, &float_seed));
    }

    #[test]
    fn seeded_rng_is_reproducible() {
        assert_eq!(draws(seeded_rng(12345)), draws(seeded_rng(12345)));
        assert_ne!(draws(seeded_rng(1)), draws(seeded_rng(2)));
    }
}
