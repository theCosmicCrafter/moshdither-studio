//! Parameter clamping helpers.
//!
//! Every numeric effect parameter should be clamped to the min/max declared in
//! its `ParameterDef` before an effect runs. This prevents user input or
//! generated animation curves from driving effects into out-of-range values that
//! can allocate unbounded memory, loop forever, or produce nonsense output.

use std::collections::HashMap;
use std::sync::OnceLock;

use serde_json::Value;

use super::registry::EffectRegistry;
use super::types::{Effect, ParameterDef, ParameterValues};

static PARAM_RANGES: OnceLock<HashMap<String, Vec<ParameterDef>>> = OnceLock::new();

fn ranges() -> &'static HashMap<String, Vec<ParameterDef>> {
    PARAM_RANGES.get_or_init(|| EffectRegistry::new().parameter_defs())
}

/// Clamp all numeric parameters in `params` to the declared min/max ranges for
/// the given effect ID.
pub fn clamp_params(effect_id: &str, params: &ParameterValues) -> ParameterValues {
    let mut out = params.clone();
    if let Some(defs) = ranges().get(effect_id) {
        for def in defs {
            if let (Some(min), Some(max), Some(v)) = (def.min, def.max, out.get_mut(&def.id)) {
                clamp_value(v, min, max);
            }
        }
    }
    out
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
    fn test_clamps_array_elements() {
        let mut v = json!([1.5, -0.5, 0.5]);
        clamp_value(&mut v, 0.0, 1.0);
        let arr = v.as_array().unwrap();
        assert_eq!(arr[0].as_f64(), Some(1.0));
        assert_eq!(arr[1].as_f64(), Some(0.0));
        assert_eq!(arr[2].as_f64(), Some(0.5));
    }
}
