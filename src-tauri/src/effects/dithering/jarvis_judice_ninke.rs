use crate::effects::types::*;
use crate::effects::Effect;
use crate::error::Result;

/// Jarvis-Judice-Ninke error diffusion.
pub struct JarvisJudiceNinke;

impl JarvisJudiceNinke {
    pub fn new() -> Self { Self }
}

impl Default for JarvisJudiceNinke {
    fn default() -> Self { Self::new() }
}

impl Effect for JarvisJudiceNinke {
    fn meta(&self) -> EffectMeta {
        EffectMeta {
            id: "dithering.jarvis_judice_ninke".to_string(),
            name: "Jarvis-Judice-Ninke".to_string(),
            category: EffectCategory::Dithering,
            media_type: MediaType::Image,
            parameters: vec![],
        }
    }

    fn process_frame(&self, input: &Frame, _m: Option<&Mask>, _p: &ParameterValues) -> Result<Frame> {
        let w = input.width as usize;
        let h = input.height as usize;
        let mut buf: Vec<f32> = input.data.iter().map(|&v| v as f32).collect();

        for y in 0..h {
            for x in 0..w {
                let idx = (y * w + x) * 4;
                for c in 0..3 {
                    let old = buf[idx + c];
                    let new = if old > 127.0 { 255.0 } else { 0.0 };
                    let err = old - new;
                    buf[idx + c] = new;

                    let distr = [
                        (1isize, 0, 7.0 / 48.0), (2, 0, 5.0 / 48.0),
                        (-2, 1, 3.0 / 48.0), (-1, 1, 5.0 / 48.0),
                        (0, 1, 7.0 / 48.0), (1, 1, 5.0 / 48.0), (2, 1, 3.0 / 48.0),
                        (-2, 2, 1.0 / 48.0), (-1, 2, 3.0 / 48.0),
                        (0, 2, 5.0 / 48.0), (1, 2, 3.0 / 48.0), (2, 2, 1.0 / 48.0),
                    ];
                    for (dx, dy, factor) in distr {
                        let nx = x as isize + dx;
                        let ny = y as isize + dy;
                        if nx >= 0 && nx < w as isize && ny >= 0 && ny < h as isize {
                            let nidx = (ny as usize * w + nx as usize) * 4 + c;
                            buf[nidx] += err * factor;
                        }
                    }
                }
            }
        }

        let data = buf.iter().map(|&v| v.clamp(0.0, 255.0) as u8).collect();
        Ok(Frame { width: input.width, height: input.height, data })
    }

    fn process_video(&self, input: &VideoSegment, mask: Option<&Mask>, params: &ParameterValues) -> Result<VideoSegment> {
        let mut frames = Vec::with_capacity(input.frames.len());
        for frame in &input.frames { frames.push(self.process_frame(frame, mask, params)?); }
        Ok(VideoSegment { frames, fps: input.fps })
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    fn gray(w: u32, h: u32, g: u8) -> Frame {
        let mut d = Vec::with_capacity((w*h*4) as usize);
        for _ in 0..(w*h) { d.extend_from_slice(&[g,g,g,255]); }
        Frame { width: w, height: h, data: d }
    }

    #[test]
    fn test_produces_pattern() {
        let e = JarvisJudiceNinke::new();
        let r = e.process_frame(&gray(16,16,128), None, &serde_json::Map::new()).unwrap();
        let mut hb = false; let mut hw = false;
        for i in 0..r.data.len()/4 {
            if r.data[i*4]==0 { hb=true; }
            if r.data[i*4]==255 { hw=true; }
        }
        assert!(hb && hw);
    }
}