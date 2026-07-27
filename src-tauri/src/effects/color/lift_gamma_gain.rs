use crate::effects::types::*;
use crate::effects::Effect;
use crate::error::Result;
use serde_json::json;

/// Lift/Gamma/Gain color grading effect.
pub struct LiftGammaGain;

fn apply_lift_gamma_gain(
    r: u8,
    g: u8,
    b: u8,
    lift: [f32; 3],
    gamma: [f32; 3],
    gain: [f32; 3],
    amount: f32,
) -> (u8, u8, u8) {
    let rf = r as f32 / 255.0;
    let gf = g as f32 / 255.0;
    let bf = b as f32 / 255.0;

    // Canonical lift/gamma/gain (video-grading style):
    //   out = ((in + lift * (1 - in)) * (1 + gain)) ^ (1 / gamma)
    // Lift raises shadows while leaving white untouched (weighted by 1-in),
    // gain scales linearly (strongest visible effect in highlights),
    // gamma bends the midtones with a power curve.
    let apply = |v: f32, l: f32, gm: f32, gn: f32| -> f32 {
        let lifted = v + l * (1.0 - v);
        let gained = lifted * (1.0 + gn);
        let safe_gamma = (gm + 1.0).max(0.01);
        gained.max(0.0).powf(1.0 / safe_gamma)
    };
    let cr = apply(rf, lift[0], gamma[0], gain[0]);
    let cg = apply(gf, lift[1], gamma[1], gain[1]);
    let cb = apply(bf, lift[2], gamma[2], gain[2]);

    // Blend with original
    let out_r = (rf * (1.0 - amount) + cr * amount) * 255.0;
    let out_g = (gf * (1.0 - amount) + cg * amount) * 255.0;
    let out_b = (bf * (1.0 - amount) + cb * amount) * 255.0;

    (
        out_r.clamp(0.0, 255.0) as u8,
        out_g.clamp(0.0, 255.0) as u8,
        out_b.clamp(0.0, 255.0) as u8,
    )
}

impl Effect for LiftGammaGain {
    fn meta(&self) -> EffectMeta {
        EffectMeta {
            id: "color.lift_gamma_gain".to_string(),
            name: "Lift / Gamma / Gain".to_string(),
            category: EffectCategory::Color,
            media_type: MediaType::Image,
            parameters: vec![
                ParameterDef {
                    id: "lift_r".to_string(),
                    name: "Lift Red".to_string(),
                    param_type: ParamType::Slider,
                    default: json!(0.0),
                    min: Some(-1.0),
                    max: Some(1.0),
                    step: Some(0.01),
                    options: None,
                },
                ParameterDef {
                    id: "lift_g".to_string(),
                    name: "Lift Green".to_string(),
                    param_type: ParamType::Slider,
                    default: json!(0.0),
                    min: Some(-1.0),
                    max: Some(1.0),
                    step: Some(0.01),
                    options: None,
                },
                ParameterDef {
                    id: "lift_b".to_string(),
                    name: "Lift Blue".to_string(),
                    param_type: ParamType::Slider,
                    default: json!(0.0),
                    min: Some(-1.0),
                    max: Some(1.0),
                    step: Some(0.01),
                    options: None,
                },
                ParameterDef {
                    id: "gamma_r".to_string(),
                    name: "Gamma Red".to_string(),
                    param_type: ParamType::Slider,
                    default: json!(0.0),
                    min: Some(-1.0),
                    max: Some(1.0),
                    step: Some(0.01),
                    options: None,
                },
                ParameterDef {
                    id: "gamma_g".to_string(),
                    name: "Gamma Green".to_string(),
                    param_type: ParamType::Slider,
                    default: json!(0.0),
                    min: Some(-1.0),
                    max: Some(1.0),
                    step: Some(0.01),
                    options: None,
                },
                ParameterDef {
                    id: "gamma_b".to_string(),
                    name: "Gamma Blue".to_string(),
                    param_type: ParamType::Slider,
                    default: json!(0.0),
                    min: Some(-1.0),
                    max: Some(1.0),
                    step: Some(0.01),
                    options: None,
                },
                ParameterDef {
                    id: "gain_r".to_string(),
                    name: "Gain Red".to_string(),
                    param_type: ParamType::Slider,
                    default: json!(0.0),
                    min: Some(-1.0),
                    max: Some(1.0),
                    step: Some(0.01),
                    options: None,
                },
                ParameterDef {
                    id: "gain_g".to_string(),
                    name: "Gain Green".to_string(),
                    param_type: ParamType::Slider,
                    default: json!(0.0),
                    min: Some(-1.0),
                    max: Some(1.0),
                    step: Some(0.01),
                    options: None,
                },
                ParameterDef {
                    id: "gain_b".to_string(),
                    name: "Gain Blue".to_string(),
                    param_type: ParamType::Slider,
                    default: json!(0.0),
                    min: Some(-1.0),
                    max: Some(1.0),
                    step: Some(0.01),
                    options: None,
                },
                ParameterDef {
                    id: "amount".to_string(),
                    name: "Amount".to_string(),
                    param_type: ParamType::Slider,
                    default: json!(1.0),
                    min: Some(0.0),
                    max: Some(1.0),
                    step: Some(0.01),
                    options: None,
                },
            ],
        }
    }

    fn process_frame(
        &self,
        input: &Frame,
        _mask: Option<&Mask>,
        params: &ParameterValues,
    ) -> Result<Frame> {
        let mut output = input.clone();
        let w = input.width as usize;
        let h = input.height as usize;

        let get_f32 =
            |key: &str| -> f32 { params.get(key).and_then(|v| v.as_f64()).unwrap_or(0.0) as f32 };

        let lift = [get_f32("lift_r"), get_f32("lift_g"), get_f32("lift_b")];
        let gamma = [get_f32("gamma_r"), get_f32("gamma_g"), get_f32("gamma_b")];
        let gain = [get_f32("gain_r"), get_f32("gain_g"), get_f32("gain_b")];
        let amount = get_f32("amount");

        for y in 0..h {
            for x in 0..w {
                let idx = (y * w + x) * 4;
                let (dr, dg, db) = apply_lift_gamma_gain(
                    input.data[idx],
                    input.data[idx + 1],
                    input.data[idx + 2],
                    lift,
                    gamma,
                    gain,
                    amount,
                );
                output.data[idx] = dr;
                output.data[idx + 1] = dg;
                output.data[idx + 2] = db;
            }
        }

        Ok(output)
    }

    fn process_video(
        &self,
        input: &VideoSegment,
        mask: Option<&Mask>,
        params: &ParameterValues,
    ) -> Result<VideoSegment> {
        let mut frames = Vec::with_capacity(input.frames.len());
        for frame in &input.frames {
            frames.push(self.process_frame(frame, mask, params)?);
        }
        Ok(VideoSegment {
            frames,
            fps: input.fps,
        })
    }
}
