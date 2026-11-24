//! The 25 FFglitch codec-corruption modes as first-class stack layers.
//!
//! This table is a Rust mirror of `src/lib/ffglitchModes.ts` — the two must
//! stay in agreement. The frontend renders controls from the ParameterDefs
//! produced here, and the values it collects are forwarded verbatim to
//! `mosh_cli.py` as `params`, so every id and default below matches a
//! `params.get(...)` name/default there (and, for the JS-script modes, the
//! `var X = ...` constants `configure_js_script` rewrites).
//!
//! These effects declare `pipeline() == Pipeline::Codec`: the real work is a
//! file round trip in `apply_codec_to_segment` (encode the segment to a temp
//! mp4, run the FFglitch sidecar over the bitstream, decode back), not
//! `process_frame`/`process_video`. Those stay deliberate pass-throughs —
//! same convention as `datamoshing/cross_video.rs` — so the CPU preview, the
//! per-effect frame cache, and any stray trait caller see the frames
//! unchanged rather than silently spawning the sidecar per frame.
//!
//! `is_temporal()` is true because these modes corrupt across frame
//! boundaries (motion vectors, keyframes, frame order) — it keeps the
//! frontend's video-only affordances honest even though the trait method
//! itself is a no-op.

use super::types::{
    EffectCategory, EffectMeta, Frame, Mask, MediaType, ParamType, ParameterDef, ParameterValues,
    Pipeline, VideoSegment,
};
use super::Effect;
use crate::error::Result;
use serde_json::json;

/// A ParameterDef template. `ParameterDef` owns `String`s/`Vec`s so it can't
/// be a const literal; these compact variants expand at `meta()` time.
enum P {
    /// (id, name, default, min, max, step) — TS `type: "number"`.
    Num(&'static str, &'static str, f64, f64, f64, f64),
    /// (id, name, default) — TS `type: "boolean"`.
    Bool(&'static str, &'static str, bool),
    /// (id, name, default, options) — TS `type: "select"`. Option strings are
    /// the values `mosh_cli.py` reads, not display labels.
    Select(&'static str, &'static str, &'static str, &'static [&'static str]),
}

const fn num(id: &'static str, name: &'static str, def: f64, min: f64, max: f64, step: f64) -> P {
    P::Num(id, name, def, min, max, step)
}

const fn boolean(id: &'static str, name: &'static str, def: bool) -> P {
    P::Bool(id, name, def)
}

// Shared knobs, mirroring the helpers in ffglitchModes.ts: the JS-script
// modes gate on a motion-vector threshold and a warm-up frame count; the AVI
// modes take a frame range.
const fn threshold(def: f64) -> P {
    num("threshold", "Threshold", def, 0.0, 100.0, 1.0)
}
const fn frame_count(def: f64) -> P {
    num("frameCount", "Start after (frames)", def, 0.0, 300.0, 1.0)
}
const fn zoom(def: f64) -> P {
    num("zoom", "Zoom", def, -100.0, 100.0, 1.0)
}
const fn start_frame(def: f64) -> P {
    num("startFrame", "From frame", def, 0.0, 5000.0, 1.0)
}
const fn end_frame(def: f64) -> P {
    num("endFrame", "To frame", def, 1.0, 5000.0, 1.0)
}

/// One row of the mode table: the mode string `mosh_cli.py` dispatches on,
/// the display name, and the knobs it reads.
struct ModeSpec {
    /// Verbatim mosh_cli.py mode string — including the space in "slam zoom"
    /// and the hyphen in "invert-reverse"; both appear literally in its
    /// `js_effects` list. The effect id is `ffglitch.{mode}`.
    mode: &'static str,
    name: &'static str,
    params: &'static [P],
}

const fn spec(mode: &'static str, name: &'static str, params: &'static [P]) -> ModeSpec {
    ModeSpec { mode, name, params }
}

// Groups from the TS table (Frame stutter / Motion vector / Movement / Time)
// are preserved as comments — EffectMeta has no group field.
static MODES: &[ModeSpec] = &[
    // ── Frame stutter ──
    spec(
        "classic",
        "Classic",
        &[
            num("start", "From (s)", 0.0, 0.0, 120.0, 0.5),
            num("end", "To (s)", 10.0, 0.5, 120.0, 0.5),
            num("p", "Repeat", 1.0, 1.0, 30.0, 1.0),
        ],
    ),
    spec(
        "classic2",
        "Classic 2",
        &[start_frame(0.0), end_frame(1000.0)],
    ),
    spec(
        "repeat",
        "Repeat",
        &[
            start_frame(0.0),
            end_frame(1000.0),
            num("p", "Repeat", 5.0, 1.0, 30.0, 1.0),
        ],
    ),
    spec(
        "glide",
        "Glide",
        &[num("p", "Glide length (frames)", 5.0, 1.0, 30.0, 1.0)],
    ),
    spec(
        "sort",
        "Sort",
        &[
            boolean("keepFirst", "Keep the first frame", true),
            boolean("reverse", "Reverse order", false),
        ],
    ),
    spec(
        "echo",
        "Echo",
        &[num("mid", "Split point", 0.5, 0.0, 1.0, 0.05)],
    ),
    spec(
        "pulse",
        "Pulse",
        &[
            num("count", "Pulses", 20.0, 1.0, 100.0, 1.0),
            num("frame", "Frame gap", 1.0, 1.0, 30.0, 1.0),
            num("kill", "Kill rate", 0.7, 0.0, 1.0, 0.05),
        ],
    ),
    // ── Motion vector ──
    spec(
        "fluid",
        "Fluid",
        &[num("fluidity", "Fluidity", 5.0, 1.0, 50.0, 1.0)],
    ),
    spec(
        "stretch",
        "Stretch",
        &[P::Select(
            "direction",
            "Direction",
            "horizontal",
            &["horizontal", "vertical"],
        )],
    ),
    spec(
        "shuffle_basic",
        "Shuffle",
        &[num("chunkSize", "Chunk size (frames)", 1.0, 1.0, 30.0, 1.0)],
    ),
    spec("rise", "Rise", &[start_frame(1.0), end_frame(100.0)]),
    spec(
        "water_bloom",
        "Water Bloom",
        &[
            num("positionFrame", "At frame", 1.0, 1.0, 5000.0, 1.0),
            num("repeatCount", "Bloom length (frames)", 20.0, 1.0, 100.0, 1.0),
        ],
    ),
    // ── Movement ──
    spec("zoom", "Zoom", &[zoom(20.0)]),
    spec("slam zoom", "Slam Zoom", &[zoom(20.0)]),
    spec(
        "shift",
        "Shift",
        &[
            threshold(98.0),
            num("origGravity", "Gravity", 5.0, -50.0, 50.0, 1.0),
            frame_count(10.0),
        ],
    ),
    spec(
        "sink",
        "Sink",
        &[num(
            "movementThreshold",
            "Movement threshold",
            3.0,
            0.0,
            50.0,
            1.0,
        )],
    ),
    spec(
        "slice",
        "Slice",
        &[
            threshold(95.0),
            num("zoom", "Slice zoom", 0.0, -100.0, 100.0, 1.0),
            frame_count(0.0),
        ],
    ),
    spec("mirror", "Mirror", &[zoom(-20.0)]),
    spec(
        "shear",
        "Shear",
        &[num("zoom", "Shear", -20.0, -100.0, 100.0, 1.0)],
    ),
    spec(
        "vibrate",
        "Vibrate",
        &[num("randomness", "Randomness", 10.0, 0.0, 100.0, 1.0)],
    ),
    // ── Time ──
    spec(
        "delay",
        "Delay",
        &[num("delay", "Delay (frames)", 20.0, 1.0, 120.0, 1.0)],
    ),
    spec(
        "buffer",
        "Buffer",
        &[
            num("delay", "Delay (frames)", 10.0, 1.0, 120.0, 1.0),
            num("feedback", "Feedback", 0.5, 0.0, 1.0, 0.05),
        ],
    ),
    spec(
        "stop",
        "Stop",
        &[threshold(95.0), frame_count(0.0)],
    ),
    spec(
        "invert-reverse",
        "Invert / Reverse",
        &[threshold(95.0), frame_count(0.0)],
    ),
    spec(
        "noise",
        "Noise",
        &[
            num("somePercentage", "Amount", 0.5, 0.0, 1.0, 0.05),
            num("multiple", "Strength", 10.0, 1.0, 50.0, 1.0),
            num("tailLength", "Tail (frames)", 20.0, 1.0, 100.0, 1.0),
        ],
    ),
];

/// The registered [`Effect`] for one [`ModeSpec`] row — a single
/// parameterised struct rather than 25 copies.
pub struct FfglitchMode {
    spec: &'static ModeSpec,
}

/// One [`FfglitchMode`] per table row, for `register_defaults`.
pub fn ffglitch_modes() -> impl Iterator<Item = FfglitchMode> {
    MODES.iter().map(|spec| FfglitchMode { spec })
}

impl Effect for FfglitchMode {
    fn meta(&self) -> EffectMeta {
        EffectMeta {
            id: format!("ffglitch.{}", self.spec.mode),
            name: self.spec.name.to_string(),
            category: EffectCategory::Datamoshing,
            media_type: MediaType::Video,
            parameters: self
                .spec
                .params
                .iter()
                .map(|p| match *p {
                    P::Num(id, name, def, min, max, step) => ParameterDef {
                        id: id.to_string(),
                        name: name.to_string(),
                        param_type: ParamType::Slider,
                        default: json!(def),
                        min: Some(min),
                        max: Some(max),
                        step: Some(step),
                        options: None,
                    },
                    P::Bool(id, name, def) => ParameterDef {
                        id: id.to_string(),
                        name: name.to_string(),
                        param_type: ParamType::Toggle,
                        default: json!(def),
                        min: None,
                        max: None,
                        step: None,
                        options: None,
                    },
                    P::Select(id, name, def, options) => ParameterDef {
                        id: id.to_string(),
                        name: name.to_string(),
                        param_type: ParamType::Select,
                        // String default: clamp_for_effect resolves the UI's
                        // index to the option name mosh_cli.py reads.
                        default: json!(def),
                        min: None,
                        max: None,
                        step: None,
                        options: Some(options.iter().map(|s| s.to_string()).collect()),
                    },
                })
                .collect(),
        }
    }

    fn pipeline(&self) -> Pipeline {
        Pipeline::Codec
    }

    fn is_temporal(&self) -> bool {
        true
    }

    /// Deliberate pass-through — see the module doc. The bitstream corruption
    /// cannot be approximated pixel-by-pixel, so the preview path shows the
    /// frame unchanged and the "Render mosh preview" affordance produces the
    /// honest version.
    fn process_frame(
        &self,
        input: &Frame,
        _mask: Option<&Mask>,
        _params: &ParameterValues,
    ) -> Result<Frame> {
        Ok(input.clone())
    }

    fn process_video(
        &self,
        input: &VideoSegment,
        _mask: Option<&Mask>,
        _params: &ParameterValues,
    ) -> Result<VideoSegment> {
        Ok(input.clone())
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::effects::EffectRegistry;

    #[test]
    fn registers_all_twenty_five_modes() {
        let registry = EffectRegistry::new();
        let ids: Vec<String> = registry
            .list()
            .into_iter()
            .map(|m| m.id)
            .filter(|id| id.starts_with("ffglitch."))
            .collect();
        assert_eq!(ids.len(), 25, "expected 25 ffglitch.* effects, got {ids:?}");
    }

    #[test]
    fn every_table_row_is_registered_by_mode_id() {
        let registry = EffectRegistry::new();
        for spec in MODES {
            let id = format!("ffglitch.{}", spec.mode);
            assert!(
                registry.get(&id).is_some(),
                "mode '{id}' missing from registry"
            );
        }
    }

    #[test]
    fn codec_effects_declare_codec_pipeline() {
        for effect in ffglitch_modes() {
            assert_eq!(effect.pipeline(), Pipeline::Codec, "{}", effect.meta().id);
            assert!(effect.is_temporal());
            let meta = effect.meta();
            assert_eq!(meta.category, EffectCategory::Datamoshing);
            assert_eq!(meta.media_type, MediaType::Video);
            assert!(meta.id.starts_with("ffglitch."));
        }
    }

    #[test]
    fn pass_through_returns_frames_unchanged() {
        let effect = ffglitch_modes().next().unwrap();
        let frame = Frame {
            width: 2,
            height: 1,
            data: vec![1, 2, 3, 4, 5, 6, 7, 8],
        };
        let out = effect
            .process_frame(&frame, None, &serde_json::Map::new())
            .unwrap();
        assert_eq!(out.data, frame.data);
    }

    #[test]
    fn pixel_effects_keep_the_pixel_default() {
        let registry = EffectRegistry::new();
        for id in [
            "color.invert",
            "dithering.bayer",
            "datamoshing.cross_video",
        ] {
            let effect = registry.get(id).expect(id);
            assert_eq!(effect.pipeline(), Pipeline::Pixel, "{id}");
        }
    }

    #[test]
    fn stretch_select_default_is_the_string_mosh_cli_reads() {
        let registry = EffectRegistry::new();
        let meta = registry.get("ffglitch.stretch").unwrap().meta();
        let direction = meta
            .parameters
            .iter()
            .find(|p| p.id == "direction")
            .expect("direction param");
        assert!(matches!(direction.param_type, ParamType::Select));
        assert_eq!(direction.default, json!("horizontal"));
        assert_eq!(
            direction.options.as_deref(),
            Some(&["horizontal".to_string(), "vertical".to_string()][..])
        );
    }
}
