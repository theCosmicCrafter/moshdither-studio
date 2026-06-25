use crate::effects::types::*;
use crate::effects::Effect;
use crate::error::Result;
use serde_json::json;

#[derive(Clone)]
struct Palette {
    name: &'static str,
    colors: &'static [(u8, u8, u8)],
}

const PALETTES: &[Palette] = &[
    Palette {
        name: "PICO-8",
        colors: &[
            (0, 0, 0),
            (29, 43, 83),
            (126, 37, 83),
            (0, 135, 81),
            (171, 82, 54),
            (95, 87, 79),
            (194, 195, 199),
            (255, 241, 232),
            (255, 0, 77),
            (255, 163, 0),
            (255, 236, 39),
            (0, 228, 54),
            (41, 173, 255),
            (131, 118, 156),
            (255, 119, 168),
            (255, 204, 170),
        ],
    },
    Palette {
        name: "GameBoy",
        colors: &[(15, 56, 15), (48, 98, 48), (139, 172, 15), (155, 188, 15)],
    },
    Palette {
        name: "NES",
        colors: &[
            (0, 0, 0),
            (252, 252, 252),
            (248, 56, 0),
            (252, 160, 68),
            (248, 184, 0),
            (184, 248, 24),
            (88, 216, 84),
            (0, 184, 0),
            (0, 168, 68),
            (0, 136, 136),
            (0, 168, 212),
            (0, 112, 252),
            (0, 88, 248),
            (0, 64, 188),
            (0, 0, 128),
            (0, 0, 64),
            (0, 0, 0),
            (64, 64, 64),
            (188, 188, 188),
            (128, 0, 0),
            (252, 128, 120),
            (252, 252, 84),
            (184, 248, 24),
            (120, 216, 152),
            (88, 248, 152),
            (0, 232, 216),
            (120, 120, 252),
            (88, 168, 252),
            (128, 208, 252),
            (0, 128, 252),
            (88, 64, 252),
            (168, 0, 252),
            (32, 32, 32),
            (96, 96, 96),
            (192, 192, 192),
            (252, 0, 0),
            (252, 188, 120),
            (252, 252, 128),
            (184, 252, 88),
            (128, 252, 128),
            (88, 252, 204),
            (88, 220, 252),
            (128, 184, 252),
            (88, 152, 252),
            (128, 120, 252),
            (176, 128, 252),
            (252, 0, 252),
            (252, 128, 252),
            (64, 0, 0),
            (128, 64, 0),
            (252, 128, 0),
            (252, 252, 0),
            (128, 252, 0),
            (0, 252, 64),
            (0, 252, 128),
            (0, 252, 252),
            (0, 128, 252),
            (128, 128, 252),
            (128, 0, 252),
            (252, 0, 252),
        ],
    },
    Palette {
        name: "C64",
        colors: &[
            (0, 0, 0),
            (255, 255, 255),
            (136, 0, 0),
            (170, 255, 238),
            (204, 68, 204),
            (0, 204, 85),
            (0, 0, 170),
            (238, 238, 119),
            (221, 136, 85),
            (102, 68, 0),
            (255, 119, 119),
            (51, 51, 51),
            (119, 119, 119),
            (170, 255, 102),
            (0, 136, 255),
            (187, 187, 187),
        ],
    },
    Palette {
        name: "Atari2600",
        colors: &[
            (0, 0, 0),
            (255, 255, 255),
            (255, 0, 0),
            (255, 127, 0),
            (255, 255, 0),
            (0, 255, 0),
            (0, 255, 255),
            (0, 127, 255),
            (0, 0, 255),
            (127, 0, 255),
            (255, 0, 255),
            (255, 0, 127),
            (128, 128, 128),
            (192, 192, 192),
            (64, 64, 64),
            (96, 96, 96),
        ],
    },
    Palette {
        name: "MSX",
        colors: &[
            (0, 0, 0),
            (62, 184, 73),
            (99, 199, 216),
            (150, 72, 27),
            (122, 80, 146),
            (0, 158, 71),
            (27, 73, 144),
            (129, 196, 15),
            (176, 106, 31),
            (72, 72, 72),
            (199, 199, 199),
            (251, 70, 51),
            (200, 135, 199),
            (93, 177, 239),
            (255, 255, 255),
            (159, 159, 159),
        ],
    },
    Palette {
        name: "ZXSpectrum",
        colors: &[
            (0, 0, 0),
            (0, 0, 215),
            (215, 0, 0),
            (215, 0, 215),
            (0, 215, 0),
            (0, 215, 215),
            (215, 215, 0),
            (215, 215, 215),
            (0, 0, 0),
            (0, 0, 255),
            (255, 0, 0),
            (255, 0, 255),
            (0, 255, 0),
            (0, 255, 255),
            (255, 255, 0),
            (255, 255, 255),
        ],
    },
    Palette {
        name: "AppleII",
        colors: &[
            (0, 0, 0),
            (114, 8, 8),
            (0, 110, 31),
            (121, 112, 41),
            (0, 0, 160),
            (111, 0, 167),
            (0, 112, 165),
            (188, 188, 188),
            (96, 96, 96),
            (255, 0, 0),
            (0, 255, 0),
            (255, 255, 0),
            (0, 0, 255),
            (255, 0, 255),
            (0, 255, 255),
            (255, 255, 255),
        ],
    },
    Palette {
        name: "EGA16",
        colors: &[
            (0, 0, 0),
            (0, 0, 170),
            (0, 170, 0),
            (0, 170, 170),
            (170, 0, 0),
            (170, 0, 170),
            (170, 85, 0),
            (170, 170, 170),
            (85, 85, 85),
            (85, 85, 255),
            (85, 255, 85),
            (85, 255, 255),
            (255, 85, 85),
            (255, 85, 255),
            (255, 255, 85),
            (255, 255, 255),
        ],
    },
    Palette {
        name: "CGA",
        colors: &[
            (0, 0, 0),
            (0, 0, 170),
            (0, 170, 0),
            (0, 170, 170),
            (170, 0, 0),
            (170, 0, 170),
            (170, 85, 0),
            (170, 170, 170),
            (85, 85, 85),
            (85, 85, 255),
            (85, 255, 85),
            (85, 255, 255),
            (255, 85, 85),
            (255, 85, 255),
            (255, 255, 85),
            (255, 255, 255),
        ],
    },
    Palette {
        name: "AmigaWorkbench",
        colors: &[
            (0, 0, 0),
            (255, 255, 255),
            (247, 64, 37),
            (0, 136, 0),
            (0, 85, 255),
            (0, 170, 170),
            (255, 170, 0),
            (170, 0, 170),
            (136, 136, 136),
            (255, 119, 119),
            (119, 255, 119),
            (119, 119, 255),
            (255, 255, 119),
            (255, 119, 255),
            (119, 255, 255),
            (221, 221, 221),
        ],
    },
];

/// Quantize an image to a fixed historical palette.
pub struct HistoricalPalettes;

impl Default for HistoricalPalettes {
    fn default() -> Self {
        HistoricalPalettes
    }
}

impl Effect for HistoricalPalettes {
    fn meta(&self) -> EffectMeta {
        let palette_names: Vec<String> = PALETTES.iter().map(|p| p.name.to_string()).collect();
        EffectMeta {
            id: "color.historical_palettes".to_string(),
            name: "Historical Palettes".to_string(),
            category: EffectCategory::Color,
            media_type: MediaType::Both,
            parameters: vec![
                ParameterDef {
                    id: "palette".to_string(),
                    name: "Palette".to_string(),
                    param_type: ParamType::Select,
                    default: json!(PALETTES[0].name),
                    min: None,
                    max: None,
                    step: None,
                    options: Some(palette_names),
                },
                ParameterDef {
                    id: "mix".to_string(),
                    name: "Mix".to_string(),
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
        _m: Option<&Mask>,
        params: &ParameterValues,
    ) -> Result<Frame> {
        let palette_name = params
            .get("palette")
            .and_then(|v| v.as_str())
            .unwrap_or(PALETTES[0].name);
        let palette = PALETTES
            .iter()
            .find(|p| p.name == palette_name)
            .unwrap_or(&PALETTES[0]);
        let mix = params.get("mix").and_then(|v| v.as_f64()).unwrap_or(1.0) as f32;
        let mix = mix.clamp(0.0, 1.0);
        let mut data = input.data.clone();

        for chunk in data.chunks_exact_mut(4) {
            let r = chunk[0];
            let g = chunk[1];
            let b = chunk[2];
            let (nr, ng, nb) = nearest_palette_color(r, g, b, palette.colors);
            chunk[0] = ((1.0 - mix) * r as f32 + mix * nr as f32) as u8;
            chunk[1] = ((1.0 - mix) * g as f32 + mix * ng as f32) as u8;
            chunk[2] = ((1.0 - mix) * b as f32 + mix * nb as f32) as u8;
        }

        Ok(Frame {
            width: input.width,
            height: input.height,
            data,
        })
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

fn nearest_palette_color(r: u8, g: u8, b: u8, palette: &[(u8, u8, u8)]) -> (u8, u8, u8) {
    let mut best = (0, 0, 0);
    let mut best_dist = u32::MAX;
    let dr = r as i32;
    let dg = g as i32;
    let db = b as i32;
    for (pr, pg, pb) in palette {
        let d = (dr - *pr as i32).pow(2) as u32
            + (dg - *pg as i32).pow(2) as u32
            + (db - *pb as i32).pow(2) as u32;
        if d < best_dist {
            best_dist = d;
            best = (*pr, *pg, *pb);
        }
    }
    best
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_historical_palettes() {
        let mut params = serde_json::Map::new();
        params.insert("palette".to_string(), json!("GameBoy"));
        params.insert("mix".to_string(), json!(1.0));
        let d = vec![100u8, 150, 200, 255];
        let f = Frame {
            width: 1,
            height: 1,
            data: d,
        };
        let e = HistoricalPalettes;
        let r = e.process_frame(&f, None, &params).unwrap();
        // Pixel should be mapped to one of the 4 GameBoy colors
        let (cr, cg, cb) = (r.data[0], r.data[1], r.data[2]);
        let gameboy_colors = [
            (15u8, 56u8, 15u8),
            (48, 98, 48),
            (139, 172, 15),
            (155, 188, 15),
        ];
        let is_palette = gameboy_colors
            .iter()
            .any(|(pr, pg, pb)| cr == *pr && cg == *pg && cb == *pb);
        assert!(is_palette);
    }
}
