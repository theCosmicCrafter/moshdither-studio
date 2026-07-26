//! Parameter normalisation helpers.
//!
//! Every numeric effect parameter should be clamped to the min/max declared in
//! its `ParameterDef` before an effect runs. This prevents user input or
//! generated animation curves from driving effects into out-of-range values that
//! can allocate unbounded memory, loop forever, or produce nonsense output.
//!
//! `Select` parameters are additionally resolved from index to option string —
//! see [`clamp_params`] for why the two sides of the IPC boundary disagreed.

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
/// declared min/max, and resolve `Select` parameters to their option string.
///
/// The `Select` step exists because the two sides disagree on representation.
/// The UI control in `ParameterPanel.tsx` writes the option's **index**:
///
/// ```text
/// const idx = param.options!.indexOf(e.target.value);
/// updateStackParams(entry.id, { [param.id]: idx });
/// ```
///
/// while every effect reads its selection as a string
/// (`params.get("algorithm").and_then(|v| v.as_str())`). A number never matches
/// `as_str()`, so the read silently fell through to the effect's hardcoded
/// default and the control did nothing — across all 14 `Select` parameters in
/// the registry.
///
/// Resolving here rather than in each effect fixes every one at once, and keeps
/// working whichever representation arrives: an index is mapped through
/// `options`, a string is passed through untouched. Out-of-range indices are
/// left alone so the effect falls back to its own default rather than picking an
/// arbitrary option.
pub fn clamp_params(effect_id: &str, params: &ParameterValues) -> ParameterValues {
    let mut out = params.clone();
    if let Some(defs) = ranges().get(effect_id) {
        for def in defs {
            if let (Some(min), Some(max), Some(v)) = (def.min, def.max, out.get_mut(&def.id)) {
                clamp_value(v, min, max);
            }
            if matches!(def.param_type, ParamType::Select) {
                if let (Some(options), Some(v)) = (def.options.as_ref(), out.get_mut(&def.id)) {
                    resolve_select(v, options);
                }
            }
        }
    }
    out
}

/// Replace a numeric `Select` value with the option string it indexes.
fn resolve_select(v: &mut Value, options: &[String]) {
    let Some(idx) = v.as_f64() else {
        return; // already a string, or an unusable type — leave it for the effect
    };
    if idx < 0.0 || idx.fract() != 0.0 {
        return;
    }
    if let Some(option) = options.get(idx as usize) {
        *v = Value::String(option.clone());
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

    #[test]
    fn resolves_a_select_index_to_its_option_string() {
        let options = vec!["Horizontal".to_string(), "Vertical".to_string()];
        let mut v = json!(1);
        resolve_select(&mut v, &options);
        assert_eq!(v.as_str(), Some("Vertical"));
    }

    #[test]
    fn resolves_a_select_index_serialised_as_a_float() {
        let options = vec!["a".to_string(), "b".to_string(), "c".to_string()];
        let mut v = json!(2.0);
        resolve_select(&mut v, &options);
        assert_eq!(v.as_str(), Some("c"));
    }

    #[test]
    fn leaves_a_select_string_untouched() {
        let options = vec!["Horizontal".to_string(), "Vertical".to_string()];
        let mut v = json!("Vertical");
        resolve_select(&mut v, &options);
        assert_eq!(v.as_str(), Some("Vertical"));
    }

    #[test]
    fn leaves_an_out_of_range_select_index_for_the_effect_default() {
        let options = vec!["a".to_string(), "b".to_string()];
        for bad in [json!(7), json!(-1), json!(0.5)] {
            let mut v = bad.clone();
            resolve_select(&mut v, &options);
            assert_eq!(
                v, bad,
                "{bad} should be left alone, not mapped to an option"
            );
        }
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
