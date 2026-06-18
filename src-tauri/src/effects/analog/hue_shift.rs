use crate::effects::types::*;
use crate::effects::Effect;
use crate::error::Result;
use serde_json::json;

/// Hue shift — rotate the hue of each pixel by a fixed angle.
pub struct HueShift {
    degrees: f32,
}

impl HueShift {
    pub fn new(degrees: f32) -> Self { Self { degrees: degrees.rem_euclid(360.0) } }
}

impl Default for HueShift {
    fn default() -> Self { Self::new(90.0) }
}

impl Effect for HueShift {
    fn meta(&self) -> EffectMeta {
        EffectMeta {
            id: "analog.hue_shift".to_string(),
            name: "Hue Shift".to_string(),
            category: EffectCategory::Analog,
            media_type: MediaType::Both,
            parameters: vec![
                ParameterDef {
                    id: "degrees".to_string(),
                    name: "Degrees".to_string(),
                    param_type: ParamType::Slider,
                    default: json!(90.0),
                    min: Some(0.0),
                    max: Some(360.0),
                    step: Some(1.0),
                    options: None,
                },
            ],
        }
    }

    fn process_frame(&self, input: &Frame, _m: Option<&Mask>, params: &ParameterValues) -> Result<Frame> {
        let deg = params.get("degrees").and_then(|v| v.as_f64()).unwrap_or(self.degrees as f64) as f32;
        let mut data = input.data.clone();
        for chunk in data.chunks_exact_mut(4) {
            let (h, s, v) = rgb_to_hsv(chunk[0], chunk[1], chunk[2]);
            let new_h = (h + deg / 360.0).rem_euclid(1.0);
            let (r, g, b) = hsv_to_rgb(new_h, s, v);
            chunk[0] = r; chunk[1] = g; chunk[2] = b;
        }
        Ok(Frame { width: input.width, height: input.height, data })
    }

    fn process_video(&self, input: &VideoSegment, mask: Option<&Mask>, params: &ParameterValues) -> Result<VideoSegment> {
        let mut frames = Vec::with_capacity(input.frames.len());
        for frame in &input.frames { frames.push(self.process_frame(frame, mask, params)?); }
        Ok(VideoSegment { frames, fps: input.fps })
    }
}

fn rgb_to_hsv(r: u8, g: u8, b: u8) -> (f32, f32, f32) {
    let rf = r as f32 / 255.0;
    let gf = g as f32 / 255.0;
    let bf = b as f32 / 255.0;
    let max = rf.max(gf).max(bf);
    let min = rf.min(gf).min(bf);
    let d = max - min;
    let h = if d < 0.0001 { 0.0 } else if max == rf { ((gf - bf) / d).rem_euclid(6.0) / 6.0 }
        else if max == gf { ((bf - rf) / d + 2.0) / 6.0 }
        else { ((rf - gf) / d + 4.0) / 6.0 };
    let s = if max < 0.0001 { 0.0 } else { d / max };
    (h, s, max)
}

fn hsv_to_rgb(h: f32, s: f32, v: f32) -> (u8, u8, u8) {
    let i = (h * 6.0).floor() as i32;
    let f = h * 6.0 - i as f32;
    let p = v * (1.0 - s);
    let q = v * (1.0 - f * s);
    let t = v * (1.0 - (1.0 - f) * s);
    let (r, g, b) = match i % 6 {
        0 => (v, t, p), 1 => (q, v, p), 2 => (p, v, t),
        3 => (p, q, v), 4 => (t, p, v), _ => (v, p, q),
    };
    ((r * 255.0) as u8, (g * 255.0) as u8, (b * 255.0) as u8)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_hue_shift_changes_colors() {
        let d = vec![255u8, 0, 0, 255]; // pure red
        let f = Frame { width: 1, height: 1, data: d };
        let e = HueShift::new(120.0);
        let r = e.process_frame(&f, None, &serde_json::Map::new()).unwrap();
        assert!(r.data[1] > 200); // shifted toward green
    }
}