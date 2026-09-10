use crate::effects::types::*;
use crate::effects::Effect;
use crate::error::Result;
use crate::path_guard::validate_io_path;
use serde_json::json;
use std::path::{Component, Path, PathBuf};

/// Largest 3D LUT size the parser will accept. 256^3 entries ≈ 200 MB, which is
/// more than enough for real-world .cube files and prevents runaway allocation.
const MAX_CUBE_SIZE: usize = 256;

/// 3D LUT color grading using a 512x512 LUT PNG.
/// LUT layout: 8x8 grid of 64x64 tiles. Each tile = one blue slice.
/// Within tile: x=red, y=green.
pub struct LutGrading {
    amount: f32,
    lut_path: String,
}

impl LutGrading {
    pub fn new(amount: f32, lut_path: String) -> Self {
        Self {
            amount: amount.clamp(0.0, 1.0),
            lut_path,
        }
    }
}

impl Default for LutGrading {
    fn default() -> Self {
        Self::new(1.0, String::new())
    }
}

/// Resolve a LUT path against the locations LUTs actually live in.
///
/// The frontend refers to LUTs by web-style paths like `lut/amatorka.png`
/// (or `/lut/amatorka.png`). On disk they live in:
/// - dev: `<repo>/public/lut/*.png` (cwd is `src-tauri` under `tauri dev`)
/// - prod: `<exe_dir>/lut/*.png` (bundled via tauri.conf.json resources)
/// - absolute paths are validated with the standard path guard before use.
fn locate_lut_file(lut_path: &str) -> Result<Option<PathBuf>> {
    let cleaned = lut_path.trim_start_matches(['/', '\\']);
    let direct = Path::new(lut_path);
    if direct.is_absolute() {
        // Custom user LUTs must pass the same security validation as any
        // frontend-supplied file path.
        return Ok(Some(
            validate_io_path(lut_path, true).map_err(crate::error::AppError::Generic)?,
        ));
    }

    // Bundled presets are referenced as e.g. `lut/amatorka.png`. Reject any
    // path traversal or paths outside the `lut/` subtree so a compromised
    // frontend cannot read arbitrary files through a relative LUT path.
    let cleaned_path = Path::new(cleaned);
    let mut components = cleaned_path.components();
    let Some(Component::Normal(first)) = components.next() else {
        return Err(crate::error::AppError::Generic(
            "Relative LUT path must start with a directory name".to_string(),
        ));
    };
    if first.to_string_lossy().to_lowercase() != "lut" {
        return Err(crate::error::AppError::Generic(format!(
            "Relative LUT path must be inside the lut/ directory, got: {}",
            cleaned
        )));
    }
    for c in cleaned_path.components() {
        if matches!(c, Component::ParentDir) {
            return Err(crate::error::AppError::Generic(
                "Path traversal is not allowed in relative LUT paths".to_string(),
            ));
        }
    }

    let mut candidates: Vec<PathBuf> = vec![
        PathBuf::from(cleaned),
        Path::new("..").join("public").join(cleaned),
        Path::new("..").join("..").join("public").join(cleaned),
    ];
    if let Ok(exe) = std::env::current_exe() {
        if let Some(dir) = exe.parent() {
            candidates.push(dir.join(cleaned));
            candidates.push(dir.join("resources").join(cleaned));
        }
    }
    Ok(candidates.into_iter().find(|c| c.exists()))
}

/// A decoded 3D LUT, loaded once and applied to many frames.
enum LoadedLut {
    /// 512x512 PNG LUT stored as an 8×8 grid of 64×64 tiles (blue slices).
    Png { rgba: image::RgbaImage },
    /// Adobe/Iridas .cube 3D LUT parsed into a regular 3D RGB array.
    Cube { data: Vec<[f32; 3]>, size: usize },
}

impl LoadedLut {
    fn load(lut_path: &str) -> Result<Self> {
        let resolved = locate_lut_file(lut_path)?.ok_or_else(|| {
            crate::error::AppError::Generic(format!("LUT file not found: {}", lut_path))
        })?;

        if resolved
            .extension()
            .is_some_and(|e| e.eq_ignore_ascii_case("cube"))
        {
            return Self::load_cube(&resolved);
        }

        let lut_img = image::open(&resolved)
            .map_err(|e| crate::error::AppError::Generic(format!("Failed to load LUT: {}", e)))?;
        let rgba = lut_img.to_rgba8();
        if rgba.width() != 512 || rgba.height() != 512 {
            return Err(crate::error::AppError::Generic(format!(
                "LUT must be 512x512 pixels (got {}x{})",
                rgba.width(),
                rgba.height()
            )));
        }
        Ok(Self::Png { rgba })
    }

    fn load_cube(path: &Path) -> Result<Self> {
        let text = std::fs::read_to_string(path)
            .map_err(|e| crate::error::AppError::Generic(format!("Failed to read .cube: {}", e)))?;

        let mut size: Option<usize> = None;
        let mut domain_min = [0.0f32; 3];
        let mut domain_max = [1.0f32; 3];
        let mut values: Vec<[f32; 3]> = Vec::new();

        for (line_no, raw) in text.lines().enumerate() {
            let line = raw.split('#').next().unwrap_or("").trim();
            if line.is_empty() {
                continue;
            }

            if line.eq_ignore_ascii_case("LUT_1D_SIZE") || line.starts_with("LUT_1D_SIZE ") {
                return Err(crate::error::AppError::Generic(
                    "1D .cube LUTs are not supported; use a 3D LUT".to_string(),
                ));
            }

            if line.eq_ignore_ascii_case("LUT_3D_SIZE") || line.starts_with("LUT_3D_SIZE ") {
                let mut parts = line.split_whitespace();
                parts.next();
                let s = parts.next().ok_or_else(|| {
                    crate::error::AppError::Generic("Missing LUT_3D_SIZE value".to_string())
                })?;
                size = Some(s.parse().map_err(|_| {
                    crate::error::AppError::Generic(format!(
                        "Invalid LUT_3D_SIZE at line {}",
                        line_no + 1
                    ))
                })?);
                continue;
            }

            if line.starts_with("DOMAIN_MIN") {
                let mut parts = line.split_whitespace().skip(1);
                for slot in domain_min.iter_mut() {
                    let v = parts.next().ok_or_else(|| {
                        crate::error::AppError::Generic("Incomplete DOMAIN_MIN".to_string())
                    })?;
                    *slot = v.parse().map_err(|_| {
                        crate::error::AppError::Generic(format!(
                            "Invalid DOMAIN_MIN at line {}",
                            line_no + 1
                        ))
                    })?;
                }
                continue;
            }

            if line.starts_with("DOMAIN_MAX") {
                let mut parts = line.split_whitespace().skip(1);
                for slot in domain_max.iter_mut() {
                    let v = parts.next().ok_or_else(|| {
                        crate::error::AppError::Generic("Incomplete DOMAIN_MAX".to_string())
                    })?;
                    *slot = v.parse().map_err(|_| {
                        crate::error::AppError::Generic(format!(
                            "Invalid DOMAIN_MAX at line {}",
                            line_no + 1
                        ))
                    })?;
                }
                continue;
            }

            // Skip other keywords (TITLE, etc.)
            if line.chars().next().is_some_and(|c| c.is_alphabetic()) {
                continue;
            }

            // Data line: R G B
            let mut parts = line.split_whitespace();
            let mut rgb = [0.0f32; 3];
            for slot in rgb.iter_mut() {
                let v = parts.next().ok_or_else(|| {
                    crate::error::AppError::Generic(format!("Incomplete data line {}", line_no + 1))
                })?;
                *slot = v.parse().map_err(|_| {
                    crate::error::AppError::Generic(format!(
                        "Invalid float at line {}",
                        line_no + 1
                    ))
                })?;
            }
            values.push(rgb);
        }

        let size = size.ok_or_else(|| {
            crate::error::AppError::Generic("Missing LUT_3D_SIZE in .cube file".to_string())
        })?;
        if size == 0 {
            return Err(crate::error::AppError::Generic(
                "LUT_3D_SIZE must be > 0".to_string(),
            ));
        }
        if size > MAX_CUBE_SIZE {
            return Err(crate::error::AppError::Generic(format!(
                "LUT_3D_SIZE {} exceeds maximum supported {}",
                size, MAX_CUBE_SIZE
            )));
        }

        let expected = size * size * size;
        if values.len() != expected {
            return Err(crate::error::AppError::Generic(format!(
                ".cube expects {} data lines, found {}",
                expected,
                values.len()
            )));
        }

        // Normalize output values to 0..1 using the declared output domain.
        let domain_range: [f32; 3] = [
            (domain_max[0] - domain_min[0]).max(1e-6),
            (domain_max[1] - domain_min[1]).max(1e-6),
            (domain_max[2] - domain_min[2]).max(1e-6),
        ];
        for v in values.iter_mut() {
            for i in 0..3 {
                v[i] = (v[i] - domain_min[i]) / domain_range[i];
            }
        }

        Ok(Self::Cube { data: values, size })
    }

    fn apply(&self, input: &Frame, amount: f32) -> Frame {
        match self {
            Self::Png { rgba } => Self::apply_png(rgba, input, amount),
            Self::Cube { data, size } => Self::apply_cube(data, *size, input, amount),
        }
    }

    fn apply_png(lut_rgba: &image::RgbaImage, input: &Frame, amount: f32) -> Frame {
        let lut_w = lut_rgba.width();
        let lut_h = lut_rgba.height();
        let tile_count = 8u32;
        let tile_size = 64u32; // 512 / 8

        let mut data = input.data.clone();
        for chunk in data.as_chunks_mut::<4>().0.iter_mut() {
            let r = chunk[0] as f32 / 255.0;
            let g = chunk[1] as f32 / 255.0;
            let b = chunk[2] as f32 / 255.0;

            let b_slice = b * 63.0;
            let b_slice_floor = b_slice.floor().clamp(0.0, 63.0) as u32;
            let b_slice_fract = b_slice - b_slice_floor as f32;

            let tile_col = b_slice_floor % tile_count;
            let tile_row = b_slice_floor / tile_count;

            let lut_x = (tile_col * tile_size) as f32 + r * (tile_size - 1) as f32;
            let lut_y = (tile_row * tile_size) as f32 + g * (tile_size - 1) as f32;

            let sample = sample_bilinear(lut_rgba, lut_w, lut_h, lut_x, lut_y);

            // Next blue slice
            let b_slice_floor2 = (b_slice_floor + 1).min(63);
            let tile_col2 = b_slice_floor2 % tile_count;
            let tile_row2 = b_slice_floor2 / tile_count;
            let lut_x2 = (tile_col2 * tile_size) as f32 + r * (tile_size - 1) as f32;
            let lut_y2 = (tile_row2 * tile_size) as f32 + g * (tile_size - 1) as f32;
            let sample2 = sample_bilinear(lut_rgba, lut_w, lut_h, lut_x2, lut_y2);

            let final_color = [
                sample[0] * (1.0 - b_slice_fract) + sample2[0] * b_slice_fract,
                sample[1] * (1.0 - b_slice_fract) + sample2[1] * b_slice_fract,
                sample[2] * (1.0 - b_slice_fract) + sample2[2] * b_slice_fract,
            ];

            chunk[0] = ((r * (1.0 - amount) + final_color[0] * amount) * 255.0) as u8;
            chunk[1] = ((g * (1.0 - amount) + final_color[1] * amount) * 255.0) as u8;
            chunk[2] = ((b * (1.0 - amount) + final_color[2] * amount) * 255.0) as u8;
        }

        Frame {
            width: input.width,
            height: input.height,
            data,
        }
    }

    fn apply_cube(data: &[[f32; 3]], size: usize, input: &Frame, amount: f32) -> Frame {
        let _n = size as f32;
        let mut output = input.data.clone();
        for chunk in output.as_chunks_mut::<4>().0.iter_mut() {
            let r_in = chunk[0] as f32 / 255.0;
            let g_in = chunk[1] as f32 / 255.0;
            let b_in = chunk[2] as f32 / 255.0;

            let sample = sample_trilinear(data, size, r_in, g_in, b_in).map(|c| c.clamp(0.0, 1.0));

            chunk[0] = ((r_in * (1.0 - amount) + sample[0] * amount) * 255.0) as u8;
            chunk[1] = ((g_in * (1.0 - amount) + sample[1] * amount) * 255.0) as u8;
            chunk[2] = ((b_in * (1.0 - amount) + sample[2] * amount) * 255.0) as u8;
        }

        Frame {
            width: input.width,
            height: input.height,
            data: output,
        }
    }
}

/// Extract the LUT path from params, accepting both the Rust-native `lut_path`
/// key and the frontend WebGL `tLUT` key (which uses `/lut/...` URLs).
fn lut_path_from_params<'a>(params: &'a ParameterValues, fallback: &'a str) -> &'a str {
    params
        .get("lut_path")
        .and_then(|v| v.as_str())
        .filter(|s| !s.is_empty())
        .or_else(|| {
            params
                .get("tLUT")
                .and_then(|v| v.as_str())
                .filter(|s| !s.is_empty())
        })
        .unwrap_or(fallback)
}

impl Effect for LutGrading {
    fn meta(&self) -> EffectMeta {
        EffectMeta {
            id: "color.lut_grading".to_string(),
            name: "LUT Color Grading".to_string(),
            category: EffectCategory::Color,
            media_type: MediaType::Both,
            parameters: vec![
                ParameterDef {
                    id: "amount".to_string(),
                    name: "Amount".to_string(),
                    param_type: ParamType::Slider,
                    default: json!(1.0),
                    min: Some(0.0),
                    max: Some(1.0),
                    step: Some(0.05),
                    options: None,
                },
                ParameterDef {
                    id: "lut_path".to_string(),
                    name: "LUT File".to_string(),
                    param_type: ParamType::Select,
                    default: json!(""),
                    min: None,
                    max: None,
                    step: None,
                    options: Some(vec![
                        "".to_string(),
                        // Instagram-style presets (existing)
                        "lut/amatorka.png".to_string(),
                        "lut/brannan.png".to_string(),
                        "lut/earlybird.png".to_string(),
                        "lut/etikate.png".to_string(),
                        "lut/gotham.png".to_string(),
                        "lut/hefe.png".to_string(),
                        "lut/inkwell.png".to_string(),
                        "lut/kelvin.png".to_string(),
                        "lut/lofi.png".to_string(),
                        "lut/lookup.png".to_string(),
                        "lut/nashville.png".to_string(),
                        "lut/sutro.png".to_string(),
                        "lut/toaster.png".to_string(),
                        "lut/walden.png".to_string(),
                        "lut/xpro.png".to_string(),
                        // Film / Movie looks
                        "lut/analog_film_01.png".to_string(),
                        "lut/dramatic_01.png".to_string(),
                        "lut/motion_picture_01.png".to_string(),
                        "lut/high_contrast_01.png".to_string(),
                        "lut/cineprint_160t.png".to_string(),
                        "lut/cineprint_250d.png".to_string(),
                        "lut/cineprint_500t.png".to_string(),
                        "lut/kodak_250d.png".to_string(),
                        "lut/movie_28_days.png".to_string(),
                        "lut/movie_300.png".to_string(),
                        "lut/movie_yuma.png".to_string(),
                        // Cinematic / Creative
                        "lut/cinematica_01.png".to_string(),
                        "lut/hollywood_tones.png".to_string(),
                        "lut/back_to_future.png".to_string(),
                        "lut/futuristic_01.png".to_string(),
                        "lut/sci_fi_01.png".to_string(),
                        "lut/midnight.png".to_string(),
                        "lut/cyber_night.png".to_string(),
                        "lut/vintage_action.png".to_string(),
                        "lut/vintage_blockbuster.png".to_string(),
                    ]),
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
        let amount = params
            .get("amount")
            .and_then(|v| v.as_f64())
            .unwrap_or(self.amount as f64) as f32;
        let lut_path = lut_path_from_params(params, &self.lut_path);

        // No LUT selected is a legitimate neutral state, not an error.
        if lut_path.is_empty() {
            return Ok(input.clone());
        }

        let lut = LoadedLut::load(lut_path)?;
        Ok(lut.apply(input, amount))
    }

    fn process_video(
        &self,
        input: &VideoSegment,
        _mask: Option<&Mask>,
        params: &ParameterValues,
    ) -> Result<VideoSegment> {
        let amount = params
            .get("amount")
            .and_then(|v| v.as_f64())
            .unwrap_or(self.amount as f64) as f32;
        let lut_path = lut_path_from_params(params, &self.lut_path);

        if lut_path.is_empty() {
            return Ok(input.clone());
        }

        // Load the LUT once for the whole segment instead of once per frame.
        let lut = LoadedLut::load(lut_path)?;
        let frames = input.frames.iter().map(|f| lut.apply(f, amount)).collect();
        Ok(VideoSegment {
            frames,
            fps: input.fps,
        })
    }
}

fn sample_bilinear(lut: &image::RgbaImage, w: u32, h: u32, x: f32, y: f32) -> [f32; 3] {
    let x0 = x.floor().clamp(0.0, (w - 1) as f32) as u32;
    let y0 = y.floor().clamp(0.0, (h - 1) as f32) as u32;
    let x1 = (x0 + 1).min(w - 1);
    let y1 = (y0 + 1).min(h - 1);

    let fx = x - x0 as f32;
    let fy = y - y0 as f32;

    let p00 = lut.get_pixel(x0, y0);
    let p10 = lut.get_pixel(x1, y0);
    let p01 = lut.get_pixel(x0, y1);
    let p11 = lut.get_pixel(x1, y1);

    let mut out = [0.0f32; 3];
    for c in 0..3 {
        let v00 = p00[c] as f32 / 255.0;
        let v10 = p10[c] as f32 / 255.0;
        let v01 = p01[c] as f32 / 255.0;
        let v11 = p11[c] as f32 / 255.0;
        out[c] = v00 * (1.0 - fx) * (1.0 - fy)
            + v10 * fx * (1.0 - fy)
            + v01 * (1.0 - fx) * fy
            + v11 * fx * fy;
    }
    out
}

/// Trilinear interpolation over a regular 3D .cube LUT.
/// `data` is ordered with red fastest, then green, then blue (standard .cube layout).
fn sample_trilinear(data: &[[f32; 3]], size: usize, r: f32, g: f32, b: f32) -> [f32; 3] {
    let _n = size as f32;
    let max_idx = (size - 1) as f32;

    let r_pos = (r.clamp(0.0, 1.0) * max_idx).min(max_idx);
    let g_pos = (g.clamp(0.0, 1.0) * max_idx).min(max_idx);
    let b_pos = (b.clamp(0.0, 1.0) * max_idx).min(max_idx);

    let r0 = r_pos.floor() as usize;
    let g0 = g_pos.floor() as usize;
    let b0 = b_pos.floor() as usize;
    let r1 = (r0 + 1).min(size - 1);
    let g1 = (g0 + 1).min(size - 1);
    let b1 = (b0 + 1).min(size - 1);

    let fr = r_pos - r0 as f32;
    let fg = g_pos - g0 as f32;
    let fb = b_pos - b0 as f32;

    let idx = |r, g, b| (b * size + g) * size + r;

    let c000 = data[idx(r0, g0, b0)];
    let c100 = data[idx(r1, g0, b0)];
    let c010 = data[idx(r0, g1, b0)];
    let c110 = data[idx(r1, g1, b0)];
    let c001 = data[idx(r0, g0, b1)];
    let c101 = data[idx(r1, g0, b1)];
    let c011 = data[idx(r0, g1, b1)];
    let c111 = data[idx(r1, g1, b1)];

    let mut out = [0.0f32; 3];
    for c in 0..3 {
        let c00 = c000[c] * (1.0 - fr) + c100[c] * fr;
        let c10 = c010[c] * (1.0 - fr) + c110[c] * fr;
        let c01 = c001[c] * (1.0 - fr) + c101[c] * fr;
        let c11 = c011[c] * (1.0 - fr) + c111[c] * fr;

        let c0 = c00 * (1.0 - fg) + c10 * fg;
        let c1 = c01 * (1.0 - fg) + c11 * fg;

        out[c] = c0 * (1.0 - fb) + c1 * fb;
    }
    out
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::effects::{Effect, Frame};
    use std::io::Write;

    fn write_identity_cube(path: &Path, size: usize) {
        let mut file = std::fs::File::create(path).unwrap();
        writeln!(file, "TITLE \"Identity\"").unwrap();
        writeln!(file, "LUT_3D_SIZE {}", size).unwrap();
        writeln!(file, "DOMAIN_MIN 0.0 0.0 0.0").unwrap();
        writeln!(file, "DOMAIN_MAX 1.0 1.0 1.0").unwrap();
        for b in 0..size {
            for g in 0..size {
                for r in 0..size {
                    let rf = r as f32 / (size - 1).max(1) as f32;
                    let gf = g as f32 / (size - 1).max(1) as f32;
                    let bf = b as f32 / (size - 1).max(1) as f32;
                    writeln!(file, "{:.6} {:.6} {:.6}", rf, gf, bf).unwrap();
                }
            }
        }
    }

    #[test]
    fn cube_identity_returns_input() {
        let tmp = std::env::temp_dir().join("mosh_identity.cube");
        write_identity_cube(&tmp, 8);

        let fx = LutGrading::new(1.0, tmp.to_string_lossy().to_string());
        let input = Frame {
            width: 4,
            height: 1,
            data: (0..4)
                .flat_map(|i| [i * 64, 128, 255 - i * 64, 255])
                .collect(),
        };
        let output = fx
            .process_frame(&input, None, &ParameterValues::default())
            .unwrap();

        for (i, chunk) in output.data.as_chunks::<4>().0.iter().enumerate() {
            let expected_r = (i * 64) as u8;
            let expected_g = 128u8;
            let expected_b = (255 - i * 64) as u8;
            assert!(
                (chunk[0] as i16 - expected_r as i16).abs() <= 2,
                "R mismatch at {}: got {} expected {}",
                i,
                chunk[0],
                expected_r
            );
            assert!(
                (chunk[1] as i16 - expected_g as i16).abs() <= 2,
                "G mismatch at {}: got {} expected {}",
                i,
                chunk[1],
                expected_g
            );
            assert!(
                (chunk[2] as i16 - expected_b as i16).abs() <= 2,
                "B mismatch at {}: got {} expected {}",
                i,
                chunk[2],
                expected_b
            );
        }

        std::fs::remove_file(&tmp).ok();
    }

    #[test]
    fn cube_bad_data_count_errors() {
        let tmp = std::env::temp_dir().join("mosh_bad.cube");
        std::fs::write(&tmp, "LUT_3D_SIZE 2\n1.0 0.0 0.0\n").unwrap();
        let result = LoadedLut::load(tmp.to_string_lossy().as_ref());
        assert!(result.is_err());
        std::fs::remove_file(&tmp).ok();
    }
}
