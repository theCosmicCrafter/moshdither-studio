use crate::effects::types::*;
use crate::effects::Effect;
use crate::error::Result;
use serde_json::json;
use std::path::{Component, Path, PathBuf};

/// Most overlay frames we will decode from a clip.
///
/// The bundled overlays are short loops; this bounds memory for a
/// user-supplied clip without truncating anything realistic.
const MAX_OVERLAY_FRAMES: usize = 240;

/// Resolve an overlay path against the locations overlays actually live in.
///
/// Mirrors `locate_lut_file` in color/lut_grading.rs, for the same reason: the
/// frontend refers to bundled assets by web-style relative paths
/// (`overlays/burn.mp4`), which resolve against the process CWD and so do not
/// exist on disk. `composite.overlay` silently returned the frame untouched
/// because of this -- the blend code was never reached, which is why the effect
/// read as unimplemented rather than misrouted.
///
/// - dev: `<repo>/public/overlays/*` (cwd is `src-tauri` under `tauri dev`)
/// - prod: `<exe_dir>/overlays/*` (bundled as a Tauri resource)
/// - absolute paths go through the standard path guard.
fn locate_overlay_file(overlay_path: &str) -> Result<Option<PathBuf>> {
    let cleaned = overlay_path.trim_start_matches(['/', '\\']);
    if Path::new(overlay_path).is_absolute() {
        return Ok(Some(
            crate::path_guard::validate_io_path(overlay_path, true)
                .map_err(crate::error::AppError::Generic)?,
        ));
    }

    // Bundled overlays are referenced as `overlays/<file>`. Reject anything
    // outside that subtree so a compromised frontend cannot read arbitrary
    // files through a relative overlay path.
    let cleaned_path = Path::new(cleaned);
    let Some(Component::Normal(first)) = cleaned_path.components().next() else {
        return Err(crate::error::AppError::Generic(
            "Relative overlay path must start with a directory name".to_string(),
        ));
    };
    if first.to_string_lossy().to_lowercase() != "overlays" {
        return Err(crate::error::AppError::Generic(format!(
            "Relative overlay path must be inside the overlays/ directory, got: {}",
            cleaned
        )));
    }
    if cleaned_path
        .components()
        .any(|c| matches!(c, Component::ParentDir))
    {
        return Err(crate::error::AppError::Generic(
            "Path traversal is not allowed in relative overlay paths".to_string(),
        ));
    }

    let mut candidates: Vec<PathBuf> = vec![
        PathBuf::from(cleaned),
        // cwd = repo root (mosh-verify, tests)
        Path::new("public").join(cleaned),
        // cwd = src-tauri (tauri dev)
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

/// Load an overlay as RGBA frames.
///
/// The three bundled overlays are `.mp4` clips (film burn, dust, VHS static),
/// animated by design. The previous implementation called `image::open` on them,
/// which cannot decode video, so even a correctly-resolved path would have
/// failed. Stills load as a single frame and simply repeat.
fn load_overlay_frames(path: &Path) -> Result<Vec<Frame>> {
    let is_video = path.extension().is_some_and(|e| {
        let e = e.to_string_lossy().to_lowercase();
        matches!(
            e.as_str(),
            "mp4" | "mov" | "mkv" | "webm" | "avi" | "m4v" | "mpg" | "mpeg" | "wmv" | "flv"
        )
    });

    if is_video {
        let segment =
            crate::ffmpeg::decode_video(&path.to_string_lossy(), Some(MAX_OVERLAY_FRAMES))?;
        if segment.frames.is_empty() {
            return Err(crate::error::AppError::Generic(format!(
                "Overlay clip decoded to zero frames: {}",
                path.display()
            )));
        }
        return Ok(segment.frames);
    }

    let img = image::open(path)
        .map_err(|e| crate::error::AppError::Generic(format!("Failed to load overlay: {}", e)))?;
    let rgba = img.to_rgba8();
    Ok(vec![Frame {
        width: rgba.width(),
        height: rgba.height(),
        data: rgba.into_raw(),
    }])
}

/// Blend one overlay frame onto one input frame.
fn blend_frame(input: &Frame, overlay: &Frame, opacity: f32, blend_mode: u32) -> Frame {
    let iw = input.width;
    let ih = input.height;
    let ow = overlay.width.max(1);
    let oh = overlay.height.max(1);
    let mut data = input.data.clone();

    for y in 0..ih {
        for x in 0..iw {
            let src_idx = ((y * iw + x) * 4) as usize;

            // Sample overlay (stretch to fit)
            let ox = ((x as f32 / iw as f32) * (ow - 1) as f32) as u32;
            let oy = ((y as f32 / ih as f32) * (oh - 1) as f32) as u32;
            let o_idx = ((oy.min(oh - 1) * ow + ox.min(ow - 1)) * 4) as usize;
            if o_idx + 3 >= overlay.data.len() {
                continue;
            }

            let src_r = data[src_idx] as f32 / 255.0;
            let src_g = data[src_idx + 1] as f32 / 255.0;
            let src_b = data[src_idx + 2] as f32 / 255.0;
            let src_a = data[src_idx + 3] as f32 / 255.0;

            let ov_r = overlay.data[o_idx] as f32 / 255.0;
            let ov_g = overlay.data[o_idx + 1] as f32 / 255.0;
            let ov_b = overlay.data[o_idx + 2] as f32 / 255.0;
            let ov_a = overlay.data[o_idx + 3] as f32 / 255.0;

            let (mut r, mut g, mut b) = match blend_mode {
                1 => (
                    1.0 - (1.0 - src_r) * (1.0 - ov_r),
                    1.0 - (1.0 - src_g) * (1.0 - ov_g),
                    1.0 - (1.0 - src_b) * (1.0 - ov_b),
                ),
                2 => (src_r * ov_r, src_g * ov_g, src_b * ov_b),
                3 => (
                    if src_r < 0.5 {
                        2.0 * src_r * ov_r
                    } else {
                        1.0 - 2.0 * (1.0 - src_r) * (1.0 - ov_r)
                    },
                    if src_g < 0.5 {
                        2.0 * src_g * ov_g
                    } else {
                        1.0 - 2.0 * (1.0 - src_g) * (1.0 - ov_g)
                    },
                    if src_b < 0.5 {
                        2.0 * src_b * ov_b
                    } else {
                        1.0 - 2.0 * (1.0 - src_b) * (1.0 - ov_b)
                    },
                ),
                _ => (
                    src_r * (1.0 - ov_a * opacity) + ov_r * ov_a * opacity,
                    src_g * (1.0 - ov_a * opacity) + ov_g * ov_a * opacity,
                    src_b * (1.0 - ov_a * opacity) + ov_b * ov_a * opacity,
                ),
            };

            if blend_mode != 0 {
                r = src_r * (1.0 - opacity) + r * opacity;
                g = src_g * (1.0 - opacity) + g * opacity;
                b = src_b * (1.0 - opacity) + b * opacity;
            }

            data[src_idx] = (r.clamp(0.0, 1.0) * 255.0) as u8;
            data[src_idx + 1] = (g.clamp(0.0, 1.0) * 255.0) as u8;
            data[src_idx + 2] = (b.clamp(0.0, 1.0) * 255.0) as u8;
            data[src_idx + 3] = (src_a * 255.0) as u8;
        }
    }

    Frame {
        width: iw,
        height: ih,
        data,
    }
}

/// Overlay compositing: blend an overlay image on top of the input.
pub struct Overlay {
    opacity: f32,
    blend_mode: u32,
    overlay_path: String,
}

impl Overlay {
    pub fn new(opacity: f32, blend_mode: u32, overlay_path: String) -> Self {
        Self {
            opacity: opacity.clamp(0.0, 1.0),
            blend_mode,
            overlay_path,
        }
    }
}

impl Default for Overlay {
    fn default() -> Self {
        Self::new(0.5, 0, String::new())
    }
}

impl Effect for Overlay {
    fn meta(&self) -> EffectMeta {
        EffectMeta {
            id: "composite.overlay".to_string(),
            name: "Overlay".to_string(),
            category: EffectCategory::Color,
            media_type: MediaType::Both,
            parameters: vec![
                ParameterDef {
                    id: "opacity".to_string(),
                    name: "Opacity".to_string(),
                    param_type: ParamType::Slider,
                    default: json!(0.5),
                    min: Some(0.0),
                    max: Some(1.0),
                    step: Some(0.05),
                    options: None,
                },
                ParameterDef {
                    id: "blend_mode".to_string(),
                    name: "Blend Mode".to_string(),
                    param_type: ParamType::Select,
                    default: json!(0),
                    min: None,
                    max: None,
                    step: None,
                    options: Some(vec![
                        "normal".to_string(),
                        "screen".to_string(),
                        "multiply".to_string(),
                        "overlay".to_string(),
                    ]),
                },
                ParameterDef {
                    id: "overlay_path".to_string(),
                    name: "Overlay File".to_string(),
                    param_type: ParamType::Select,
                    default: json!(""),
                    min: None,
                    max: None,
                    step: None,
                    options: Some(vec![
                        "".to_string(),
                        "overlays/burn.mp4".to_string(),
                        "overlays/dust.mp4".to_string(),
                        "overlays/vhs-static.mp4".to_string(),
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
        let opacity = params
            .get("opacity")
            .and_then(|v| v.as_f64())
            .unwrap_or(self.opacity as f64) as f32;
        let blend_mode = params
            .get("blend_mode")
            .and_then(|v| v.as_u64())
            .unwrap_or(self.blend_mode as u64) as u32;
        let overlay_path = params
            .get("overlay_path")
            .and_then(|v| v.as_str())
            .unwrap_or(&self.overlay_path);

        if overlay_path.is_empty() {
            return Ok(input.clone());
        }
        let Some(resolved) = locate_overlay_file(overlay_path)? else {
            return Err(crate::error::AppError::Generic(format!(
                "Overlay file not found: {}",
                overlay_path
            )));
        };
        let frames = load_overlay_frames(&resolved)?;
        Ok(blend_frame(input, &frames[0], opacity, blend_mode))
    }

    fn process_video(
        &self,
        input: &VideoSegment,
        _mask: Option<&Mask>,
        params: &ParameterValues,
    ) -> Result<VideoSegment> {
        let opacity = params
            .get("opacity")
            .and_then(|v| v.as_f64())
            .unwrap_or(self.opacity as f64) as f32;
        let blend_mode = params
            .get("blend_mode")
            .and_then(|v| v.as_u64())
            .unwrap_or(self.blend_mode as u64) as u32;
        let overlay_path = params
            .get("overlay_path")
            .and_then(|v| v.as_str())
            .unwrap_or(&self.overlay_path);

        if overlay_path.is_empty() {
            return Ok(input.clone());
        }
        let Some(resolved) = locate_overlay_file(overlay_path)? else {
            return Err(crate::error::AppError::Generic(format!(
                "Overlay file not found: {}",
                overlay_path
            )));
        };

        // Decoded once for the whole segment rather than per frame, and cycled
        // so a short overlay loop covers a longer clip -- these assets are
        // designed to tile in time.
        let overlay_frames = load_overlay_frames(&resolved)?;

        let mut frames = Vec::with_capacity(input.frames.len());
        for (i, frame) in input.frames.iter().enumerate() {
            let ov = &overlay_frames[i % overlay_frames.len()];
            frames.push(blend_frame(frame, ov, opacity, blend_mode));
        }
        Ok(VideoSegment {
            frames,
            fps: input.fps,
        })
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn frame(w: u32, h: u32, px: [u8; 4]) -> Frame {
        Frame {
            width: w,
            height: h,
            data: px
                .iter()
                .copied()
                .cycle()
                .take((w * h * 4) as usize)
                .collect(),
        }
    }

    #[test]
    fn bundled_overlays_resolve_from_the_repo_root() {
        // The dropdown offers `overlays/<file>`, a web-style relative path.
        // Before this resolved, composite.overlay silently returned the input
        // untouched and read as an unimplemented effect.
        let found = locate_overlay_file("overlays/burn.mp4")
            .expect("resolution should not error")
            .expect("burn.mp4 ships in public/overlays and must resolve");
        assert!(
            found.exists(),
            "resolved path must exist: {}",
            found.display()
        );
    }

    #[test]
    fn a_leading_slash_is_tolerated() {
        assert!(locate_overlay_file("/overlays/dust.mp4")
            .expect("should not error")
            .is_some());
    }

    #[test]
    fn paths_outside_the_overlays_subtree_are_rejected() {
        // A compromised frontend must not be able to read arbitrary files by
        // passing a relative overlay path.
        assert!(locate_overlay_file("lut/amatorka.png").is_err());
        assert!(locate_overlay_file("secrets.env").is_err());
    }

    #[test]
    fn path_traversal_is_rejected() {
        assert!(locate_overlay_file("overlays/../../../etc/passwd").is_err());
    }

    #[test]
    fn an_empty_overlay_leaves_the_frame_untouched() {
        let e = Overlay::default();
        let input = frame(4, 4, [10, 20, 30, 255]);
        let mut p = serde_json::Map::new();
        p.insert("overlay_path".to_string(), json!(""));
        let out = e.process_frame(&input, None, &p).unwrap();
        assert_eq!(out.data, input.data, "no overlay selected must be identity");
    }

    #[test]
    fn a_missing_overlay_errors_instead_of_silently_passing_through() {
        // Silent pass-through is what made the original defect invisible.
        let e = Overlay::default();
        let input = frame(2, 2, [10, 20, 30, 255]);
        let mut p = serde_json::Map::new();
        p.insert("overlay_path".to_string(), json!("overlays/nope.mp4"));
        assert!(e.process_frame(&input, None, &p).is_err());
    }

    #[test]
    fn multiply_darkens_and_screen_brightens() {
        let base = frame(2, 2, [128, 128, 128, 255]);
        let mid = frame(2, 2, [128, 128, 128, 255]);

        let multiplied = blend_frame(&base, &mid, 1.0, 2);
        assert!(
            multiplied.data[0] < 128,
            "multiply must darken, got {}",
            multiplied.data[0]
        );

        let screened = blend_frame(&base, &mid, 1.0, 1);
        assert!(
            screened.data[0] > 128,
            "screen must brighten, got {}",
            screened.data[0]
        );
    }

    #[test]
    fn zero_opacity_is_a_no_op_for_every_blend_mode() {
        let base = frame(2, 2, [90, 140, 200, 255]);
        let ov = frame(2, 2, [255, 0, 0, 255]);
        for mode in 1..=3 {
            let out = blend_frame(&base, &ov, 0.0, mode);
            assert_eq!(
                out.data, base.data,
                "mode {mode} at opacity 0 must be identity"
            );
        }
    }

    #[test]
    fn an_overlay_smaller_than_the_frame_is_stretched_not_clipped() {
        // Sampling maps the overlay across the full frame; a 1x1 overlay must
        // therefore tint every pixel rather than only the top-left one.
        let base = frame(8, 8, [0, 0, 0, 255]);
        let ov = frame(1, 1, [255, 255, 255, 255]);
        let out = blend_frame(&base, &ov, 1.0, 1);
        assert!(
            out.data.chunks_exact(4).all(|p| p[0] == 255),
            "every pixel should have been screened to white"
        );
    }
}
