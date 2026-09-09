//! Parameter normalisation helpers.
//!
//! Every numeric effect parameter should be clamped to the min/max declared in
//! its `ParameterDef` before an effect runs. This prevents user input or
//! generated animation curves from driving effects into out-of-range values that
//! can allocate unbounded memory, loop forever, or produce nonsense output.
//!
//! `Select` parameters are additionally normalised into the representation each
//! effect reads — see [`clamp_params`] for why the two sides of the IPC boundary
//! disagreed, and [`resolve_select`] for why that is not simply "convert to a
//! string".

use std::collections::HashMap;
use std::sync::OnceLock;

use serde_json::Value;

use super::registry::EffectRegistry;
use super::types::{Effect, ParamType, ParameterDef, ParameterValues};

static PARAM_RANGES: OnceLock<HashMap<String, Vec<ParameterDef>>> = OnceLock::new();

fn ranges() -> &'static HashMap<String, Vec<ParameterDef>> {
    PARAM_RANGES.get_or_init(|| EffectRegistry::new().parameter_defs())
}

/// Normalise `params` for the given effect: clamp numeric values to their
/// declared min/max, and put `Select` values in the representation the effect
/// actually reads.
///
/// The `Select` step exists because the two sides of the IPC boundary disagree.
/// The UI control in `ParameterPanel.tsx` always writes the option's **index**:
///
/// ```text
/// const idx = param.options!.indexOf(e.target.value);
/// updateStackParams(entry.id, { [param.id]: idx });
/// ```
///
/// while most effects read the option *name*
/// (`params.get("algorithm").and_then(|v| v.as_str())`). A number never matches
/// `as_str()`, so the read silently fell through to the effect's hardcoded
/// default and the control did nothing — across every `Select` parameter in the
/// registry.
///
/// Normalising here rather than in each effect fixes them all at once. See
/// [`resolve_select`] for why the conversion is driven by the declared default
/// rather than always producing a string: a minority of effects read the index
/// instead, and converting those would break them the same way.
pub fn clamp_params(effect_id: &str, params: &ParameterValues) -> ParameterValues {
    let mut out = params.clone();
    if let Some(defs) = ranges().get(effect_id) {
        for def in defs {
            if let (Some(min), Some(max), Some(v)) = (def.min, def.max, out.get_mut(&def.id)) {
                clamp_value(v, min, max);
            }
            if matches!(def.param_type, ParamType::Select) {
                if let (Some(options), Some(v)) = (def.options.as_ref(), out.get_mut(&def.id)) {
                    resolve_select(v, options, &def.default);
                }
            }
        }
    }
    out
}

/// Normalise a `Select` value to the representation its effect reads.
///
/// The registry uses two conventions, and both are legitimate:
///
/// * **By name** — `default: json!("jarvis_judice_ninke")`, read with
///   `as_str()`. Most effects.
/// * **By index** — `default: json!(0)`, read with `as_u64()`. Used where the
///   option list maps onto a numeric mode, such as `composite.overlay`'s
///   `blend_mode`.
///
/// The UI writes an index either way, so converting everything to a string
/// would fix the first group and break the second. The declared `default` says
/// which representation the effect expects, so normalise toward that: an index
/// is mapped through `options` when the default is a string, and a name is
/// mapped back to its index when the default is a number.
///
/// A value that cannot be resolved is left untouched, so the effect falls back
/// to its own default rather than silently acting on an arbitrary option.
fn resolve_select(v: &mut Value, options: &[String], default: &Value) {
    match default {
        Value::String(_) => {
            let Some(idx) = v.as_f64() else { return };
            if idx < 0.0 || idx.fract() != 0.0 {
                return;
            }
            if let Some(option) = options.get(idx as usize) {
                *v = Value::String(option.clone());
            }
        }
        Value::Number(_) => {
            let Some(name) = v.as_str() else { return };
            if let Some(idx) = options.iter().position(|o| o.eq_ignore_ascii_case(name)) {
                *v = Value::Number(idx.into());
            }
        }
        _ => {}
    }
}

/// Clamp parameters using an effect instance so the caller doesn't need to know
/// the effect ID ahead of time.
pub fn clamp_for_effect(effect: &dyn Effect, params: &ParameterValues) -> ParameterValues {
    clamp_params(&effect.meta().id, params)
}

fn clamp_value(v: &mut Value, min: f64, max: f64) {
    match v {
        Value::Number(n) => {
            if let Some(f) = n.as_f64() {
                if f < min || f > max {
                    *v = number_value(f.clamp(min, max));
                }
            }
        }
        // Color / vector parameters may be arrays of numbers; clamp each element.
        Value::Array(arr) => {
            for elem in arr.iter_mut() {
                clamp_value(elem, min, max);
            }
        }
        _ => {}
    }
}

fn number_value(f: f64) -> Value {
    serde_json::Number::from_f64(f)
        .map(Value::Number)
        .unwrap_or_else(|| Value::Number(serde_json::Number::from(f as i64)))
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    #[test]
    fn test_clamps_above_max_and_below_min() {
        let mut params = ParameterValues::new();
        params.insert("amount".to_string(), json!(5.0));
        params.insert("count".to_string(), json!(-10.0));

        clamp_value(params.get_mut("amount").unwrap(), 0.0, 1.0);
        clamp_value(params.get_mut("count").unwrap(), 1.0, 100.0);

        assert_eq!(params["amount"].as_f64(), Some(1.0));
        assert_eq!(params["count"].as_f64(), Some(1.0));
    }

    #[test]
    fn test_leaves_in_range_values_unchanged() {
        let mut v = json!(0.5);
        clamp_value(&mut v, 0.0, 1.0);
        assert_eq!(v.as_f64(), Some(0.5));
    }

    fn opts() -> Vec<String> {
        vec!["Horizontal".to_string(), "Vertical".to_string()]
    }

    // --- effects that read the option name (declared default is a string) ---

    #[test]
    fn resolves_a_select_index_to_its_option_string() {
        let mut v = json!(1);
        resolve_select(&mut v, &opts(), &json!("Horizontal"));
        assert_eq!(v.as_str(), Some("Vertical"));
    }

    #[test]
    fn resolves_a_select_index_serialised_as_a_float() {
        let options = vec!["a".to_string(), "b".to_string(), "c".to_string()];
        let mut v = json!(2.0);
        resolve_select(&mut v, &options, &json!("a"));
        assert_eq!(v.as_str(), Some("c"));
    }

    #[test]
    fn leaves_a_select_string_untouched_when_the_effect_reads_names() {
        let mut v = json!("Vertical");
        resolve_select(&mut v, &opts(), &json!("Horizontal"));
        assert_eq!(v.as_str(), Some("Vertical"));
    }

    #[test]
    fn leaves_an_out_of_range_select_index_for_the_effect_default() {
        for bad in [json!(7), json!(-1), json!(0.5)] {
            let mut v = bad.clone();
            resolve_select(&mut v, &opts(), &json!("Horizontal"));
            assert_eq!(
                v, bad,
                "{bad} should be left alone, not mapped to an option"
            );
        }
    }

    // --- effects that read the index (declared default is a number) ---
    //
    // composite.overlay's blend_mode is the live example: ParamType::Select with
    // `default: json!(0)`, read via as_u64(). Converting it to a string would
    // make the control silently do nothing — the same bug this normalisation
    // exists to prevent, in the other direction.

    #[test]
    fn leaves_a_select_index_untouched_when_the_effect_reads_indices() {
        let mut v = json!(1);
        resolve_select(&mut v, &opts(), &json!(0));
        assert_eq!(v.as_u64(), Some(1));
    }

    #[test]
    fn resolves_a_select_name_to_its_index_when_the_effect_reads_indices() {
        let mut v = json!("Vertical");
        resolve_select(&mut v, &opts(), &json!(0));
        assert_eq!(v.as_u64(), Some(1));
    }

    #[test]
    fn an_unknown_select_name_is_left_for_the_effect_default() {
        let mut v = json!("Diagonal");
        resolve_select(&mut v, &opts(), &json!(0));
        assert_eq!(v.as_str(), Some("Diagonal"));
    }

    #[test]
    fn index_reading_effects_survive_the_pipeline() {
        // End-to-end against the real registry: composite.overlay must still
        // receive blend_mode as a number it can read with as_u64().
        let mut params = ParameterValues::new();
        params.insert("blend_mode".to_string(), json!(2));
        let out = clamp_params("composite.overlay", &params);
        assert_eq!(
            out["blend_mode"].as_u64(),
            Some(2),
            "blend_mode must stay numeric — composite.overlay reads it with as_u64()"
        );
    }

    /// End-to-end through the real registry: the Select control writes an index,
    /// and the effect must receive the option string it reads with `as_str()`.
    #[test]
    fn select_index_survives_the_pipeline_for_a_real_effect() {
        let mut params = ParameterValues::new();
        // error_diffusion_variants declares `algorithm`; index 8 is "atkinson".
        params.insert("algorithm".to_string(), json!(8));
        let out = clamp_params("dithering.error_diffusion_variants", &params);
        assert_eq!(
            out["algorithm"].as_str(),
            Some("atkinson"),
            "a Select index must reach the effect as the option string it reads"
        );
    }

    #[test]
    fn test_clamps_array_elements() {
        let mut v = json!([1.5, -0.5, 0.5]);
        clamp_value(&mut v, 0.0, 1.0);
        let arr = v.as_array().unwrap();
        assert_eq!(arr[0].as_f64(), Some(1.0));
        assert_eq!(arr[1].as_f64(), Some(0.0));
        assert_eq!(arr[2].as_f64(), Some(0.5));
    }
}

#[cfg(test)]
mod slider_range_tests {
    use crate::effects::types::ParamType;
    use crate::effects::EffectRegistry;

    /// Every slider must be usable: the default inside the range, and the
    /// advertised maximum actually reachable.
    ///
    /// These are the invariants an audit of all 164 sliders turned up. They are
    /// cheap to state and were not stated anywhere, so `optical_flow.alpha`
    /// shipped with min 0.01 and step 0.05 -- landing on 1.96 and never
    /// reaching its own declared max of 2.0.
    #[test]
    fn every_slider_has_a_usable_range() {
        let registry = EffectRegistry::new();
        let mut problems: Vec<String> = Vec::new();

        for meta in registry.list() {
            for p in &meta.parameters {
                if !matches!(p.param_type, ParamType::Slider) {
                    continue;
                }
                let (Some(min), Some(max)) = (p.min, p.max) else {
                    problems.push(format!("{}.{}: slider with no min/max", meta.id, p.id));
                    continue;
                };
                if max <= min {
                    problems.push(format!("{}.{}: empty range [{min}..{max}]", meta.id, p.id));
                    continue;
                }
                let Some(d) = p.default.as_f64() else {
                    continue;
                };
                if d < min || d > max {
                    problems.push(format!(
                        "{}.{}: default {d} outside [{min}..{max}]",
                        meta.id, p.id
                    ));
                }
                if let Some(step) = p.step {
                    if step <= 0.0 {
                        problems.push(format!("{}.{}: step {step} is not positive", meta.id, p.id));
                        continue;
                    }
                    // The max must land on a step boundary, or the top of the
                    // range cannot be reached from the input's arrows.
                    let steps = (max - min) / step;
                    if (steps.round() - steps).abs() > 1e-6 {
                        problems.push(format!(
                            "{}.{}: step {step} does not divide [{min}..{max}] -- \
                             max unreachable (stops at {:.4})",
                            meta.id,
                            p.id,
                            min + steps.floor() * step
                        ));
                    }
                    if steps < 2.0 {
                        problems.push(format!(
                            "{}.{}: step {step} gives only {steps:.0} positions across \
                             [{min}..{max}]",
                            meta.id, p.id
                        ));
                    }
                }
            }
        }

        assert!(
            problems.is_empty(),
            "sliders with unusable ranges:\n  {}",
            problems.join("\n  ")
        );
    }

    /// A default sitting at an end of its range is legitimate -- a wet/dry mix
    /// belongs at 100%, an optional extra at 0 -- so this does not fail. It
    /// records the list, so a NEW one shows up in a diff and gets a moment's
    /// thought rather than passing unseen.
    #[test]
    fn defaults_at_range_ends_are_accounted_for() {
        let registry = EffectRegistry::new();
        let mut at_end = Vec::new();
        for meta in registry.list() {
            for p in &meta.parameters {
                if !matches!(p.param_type, ParamType::Slider) {
                    continue;
                }
                let (Some(min), Some(max), Some(d)) = (p.min, p.max, p.default.as_f64()) else {
                    continue;
                };
                if d <= min || d >= max {
                    at_end.push(format!("{}.{}", meta.id, p.id));
                }
            }
        }
        at_end.sort();
        // All 26 reviewed individually, and every one is deliberate:
        //   * 10x dithering `levels` = 2  -- 1-bit dithering, the classic look
        //   * 5x wet/dry `amount`/`mix`/`intensity` = 1.0 -- apply fully, then
        //     dial back, which is how a grade or LUT is normally presented
        //   * 3x analog.vhs extras = 0 -- optional artefacts, off by default;
        //     VHS at defaults already changes 87% of pixels without them
        //   * 2x every_nth_beat = 1 -- "every beat" IS the minimum
        //   * 2x iframe frame indices = 0 -- frame zero
        //   * sorting_glitch.u_intensity = 10 -- saturating: 10 is "fully
        //     sorted", so there is nothing above it to leave headroom for
        //   * spectrum.bar_count = 7 -- there are exactly 7 frequency bands
        //   * pixelate.min_block = 1, slice_shift repeat = 0 -- minimum/off
        // Raise this only after checking what the new one actually is.
        assert!(
            at_end.len() <= 26,
            "{} sliders now default to an end of their range; review the new ones:\n  {}",
            at_end.len(),
            at_end.join("\n  ")
        );
    }
}
