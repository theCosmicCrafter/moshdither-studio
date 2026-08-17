//! FFmpeg orchestration — decode, encode, probe, and sidecar management.

#![allow(clippy::too_many_arguments)]

use crate::commands::WatermarkSettings;
use crate::effects::types::{Frame, VideoSegment};
use crate::error::{AppError, Result};
use parking_lot::Mutex as ParkingLotMutex;
use std::collections::{HashMap, VecDeque};
use std::path::Path;
use std::process::{Command, Stdio};
use std::sync::{Arc, OnceLock};

/// Default ceiling on the number of decoded frames kept in memory.
const DEFAULT_DECODE_MAX_FRAMES: usize = 10_000;
/// Hard cap on the per-decode memory budget (bytes). We cap at 4 GiB
/// because `cmd.output()` buffers all of FFmpeg's stdout in memory before
/// we chunk it into frames, so peak memory is ~2× the raw RGBA size
/// (stdout buffer + frame Vec). A 4 GiB budget means peak ~8 GiB, which
/// is safe on most 16 GiB systems. Systems with more RAM still benefit
/// because auto-scale will pick native resolution for shorter clips.
const MAX_DECODE_MEMORY_BUDGET_BYTES: u64 = 4 * 1024 * 1024 * 1024;
/// Floor on the per-decode memory budget. Even on low-RAM systems we still
/// allow at least 1 GiB so short 1080p clips work.
const MIN_DECODE_MEMORY_BUDGET_BYTES: u64 = 1024 * 1024 * 1024;
/// Fraction of available system RAM to use as the decode budget. We use
/// 50% of *available* (not total) RAM to leave headroom for the OS, GPU
/// drivers, the WebView, the FFmpeg subprocess, and the effect-processing
/// pipeline (which clones frames during rayon parallel processing).
/// This matches the After Effects recommendation of reserving 20-30% of
/// RAM for the OS and background apps, with an extra margin because our
/// stdout-buffering pattern doubles peak memory.
const DECODE_MEMORY_FRACTION_OF_RAM: f64 = 0.50;

/// Compute the per-decode memory budget based on available system RAM.
///
/// Returns a value in bytes between [`MIN_DECODE_MEMORY_BUDGET_BYTES`] and
/// [`MAX_DECODE_MEMORY_BUDGET_BYTES`]. The budget is `total_ram * 0.60`,
/// clamped to that range. This replaces the old fixed 2 GiB cap which
/// silently truncated 4K video to ~64 frames.
fn adaptive_decode_memory_budget() -> u64 {
    use sysinfo::System;
    let mut sys = System::new();
    sys.refresh_memory();
    // Use available (not total) RAM — the OS, GPU drivers, WebView, and
    // other app components are already using much of the total. Without
    // this, a 16 GiB system reports an 8 GiB budget but the actual
    // contiguous allocation may fail at 4 GiB.
    let available = sys.available_memory();
    if available == 0 {
        // Fallback if sysinfo can't read memory (rare/sandboxed envs).
        return MIN_DECODE_MEMORY_BUDGET_BYTES;
    }
    let budget = (available as f64 * DECODE_MEMORY_FRACTION_OF_RAM) as u64;
    budget.clamp(
        MIN_DECODE_MEMORY_BUDGET_BYTES,
        MAX_DECODE_MEMORY_BUDGET_BYTES,
    )
}

/// Pick the largest scale (longest side in px) that allows decoding the
/// full clip within the memory budget. Returns `None` if the source
/// already fits at native resolution.
///
/// Standard ladder: 4K(3840) → 1440 → 1080 → 720 → 480.
/// We pick the largest rung whose per-frame size × frame count fits the
/// budget. If even 480p doesn't fit (very long clip), we return 480 and
/// let the caller decide whether to truncate or reject.
fn pick_auto_scale(src_w: u32, src_h: u32, frame_count: usize, budget_bytes: u64) -> Option<usize> {
    let rungs = [3840, 2560, 1920, 1440, 1280, 1080, 720, 480];
    let longer = src_w.max(src_h) as usize;
    // If the source already fits at native resolution, no scaling needed.
    let native_frame_bytes = (src_w as u64) * (src_h as u64) * 4;
    if native_frame_bytes.saturating_mul(frame_count as u64) <= budget_bytes {
        return None;
    }
    // Walk down the ladder; pick the first rung that fits.
    for &rung in &rungs {
        if rung >= longer {
            continue;
        }
        let scale = rung as f64 / longer as f64;
        let w = ((src_w as f64) * scale).round().max(2.0) as u64;
        let h = ((src_h as f64) * scale).round().max(2.0) as u64;
        let frame_bytes = w * h * 4;
        if frame_bytes.saturating_mul(frame_count as u64) <= budget_bytes {
            return Some(rung);
        }
    }
    // Even 480p doesn't fit — return the smallest rung and let the caller
    // truncate frame count to fit.
    Some(480)
}

/// Estimate the total frame count of a video by probing duration and fps.
///
/// We use this to decide whether to auto-downscale before decode. The
/// estimate is `ceil(duration_secs * fps)`. For most sources this is
/// exact; for VFR video it's an upper bound that's good enough for
/// memory planning.
pub fn probe_frame_count(path: &str) -> Result<usize> {
    let (_w, _h, fps) = probe_video(path)?;
    let meta = probe_metadata(path)?;
    let duration = meta.duration.unwrap_or(0.0);
    if duration <= 0.0 || fps <= 0.0 {
        return Ok(0);
    }
    Ok((duration * fps).ceil() as usize)
}

/// Decide how to decode a video given the caller's preferred processing
/// resolution and the system's memory budget.
///
/// `preferred_scale`:
///   - `None`: caller wants native resolution. We probe the source; if it
///     fits in the budget at native res, we return `None` (no scaling).
///     If not, we auto-pick a downscale rung via [`pick_auto_scale`].
///   - `Some(n)`: caller wants at most `n` px on the longest side. We
///     honor this exactly (the user picked it deliberately).
///
/// Returns the scale to pass to [`decode_video_with_options`], plus the
/// effective budget in bytes (for logging / error messages).
pub fn plan_decode(path: &str, preferred_scale: Option<usize>) -> Result<(Option<usize>, u64)> {
    let budget = adaptive_decode_memory_budget();
    if let Some(n) = preferred_scale {
        return Ok((Some(n), budget));
    }
    let (src_w, src_h, _fps) = probe_video(path)?;
    let frame_count = probe_frame_count(path)?.max(1);
    let scale = pick_auto_scale(src_w, src_h, frame_count, budget);
    Ok((scale, budget))
}

/// Locate a binary by name. Tries bundled sidecar first, then dev path, then PATH.
fn locate_binary(base: &str) -> Result<String> {
    // Check bundled binary next to executable (production — Tauri strips suffix)
    if let Ok(exe) = std::env::current_exe() {
        if let Some(dir) = exe.parent() {
            let bundled = dir.join(format!("{}.exe", base));
            if bundled.exists() {
                return Ok(bundled.to_string_lossy().to_string());
            }
        }
    }
    // Check development path (src-tauri/bin) with target triple suffix
    for name in [
        format!("{}-x86_64-pc-windows-msvc.exe", base),
        format!("{}.exe", base),
    ] {
        let dev = Path::new("bin").join(&name);
        if dev.exists() {
            return Ok(dev.to_string_lossy().to_string());
        }
    }
    // Fallback to PATH
    Ok(base.to_string())
}

/// Locate the FFmpeg binary. Tries bundled sidecar first, then PATH.
pub fn ffmpeg_binary() -> Result<String> {
    locate_binary("ffmpeg")
}

/// Locate the FFprobe binary. Tries bundled sidecar first, then PATH.
pub fn ffprobe_binary() -> Result<String> {
    locate_binary("ffprobe")
}

/// Generate a low-resolution proxy video for smooth preview editing.
/// Returns the path to the generated proxy file in the system temp directory.
pub fn generate_proxy(source_path: &str, max_width: u32, crf: u32) -> Result<String> {
    let ffmpeg = ffmpeg_binary()?;

    let (orig_width, orig_height, _fps) = probe_video(source_path)?;

    // Skip proxy if already small enough
    if orig_width <= max_width {
        return Ok(source_path.to_string());
    }

    let scale_height = (orig_height as f64 * (max_width as f64 / orig_width as f64)).round() as u32;
    // Ensure even dimensions (required by some codecs)
    let scale_height = if !scale_height.is_multiple_of(2) {
        scale_height + 1
    } else {
        scale_height
    };

    // Nested under moshdither-studio so it falls inside the Tauri asset-protocol
    // scope allowlist ($TEMP/moshdither-studio/** in tauri.conf.json) -- the
    // proxy path is fed straight into convertFileSrc() for webview playback.
    let proxy_dir = std::env::temp_dir().join("moshdither-studio").join("proxy");
    std::fs::create_dir_all(&proxy_dir).map_err(AppError::Io)?;

    let source_name = Path::new(source_path)
        .file_stem()
        .and_then(|s| s.to_str())
        .unwrap_or("proxy");
    let proxy_path = proxy_dir.join(format!("{}_proxy_{}p.mp4", source_name, max_width));

    const PROXY_TIMEOUT: std::time::Duration = std::time::Duration::from_secs(300);
    let output = output_with_timeout(
        Command::new(&ffmpeg).args([
            "-i",
            source_path,
            "-vf",
            &format!("scale={}:{}", max_width, scale_height),
            "-c:v",
            "libx264",
            "-preset",
            "fast",
            "-crf",
            &crf.to_string(),
            "-an",
            "-y",
            proxy_path.to_string_lossy().as_ref(),
        ]),
        PROXY_TIMEOUT,
    )?;

    if !output.status.success() {
        return Err(AppError::Ffmpeg(format!(
            "Proxy generation failed: {}",
            String::from_utf8_lossy(&output.stderr)
        )));
    }

    Ok(proxy_path.to_string_lossy().to_string())
}

/// Bounds on the duration/fps accepted by [`image_to_video`]. These stop a
/// malformed or hostile frontend value (zero, negative, NaN, or an absurdly
/// large duration) from producing a pathological FFmpeg invocation -- an
/// unbounded `-t` would just burn the timeout-guarded subprocess's full
/// budget for no benefit, and a zero/negative/non-finite value produces
/// either an empty file or an FFmpeg parse error instead of a clear one.
const MIN_STILL_ANIMATION_DURATION_SECS: f64 = 0.1;
const MAX_STILL_ANIMATION_DURATION_SECS: f64 = 600.0;
const MIN_STILL_ANIMATION_FPS: f64 = 1.0;
const MAX_STILL_ANIMATION_FPS: f64 = 120.0;

/// Validate and clamp the duration/fps requested for [`image_to_video`].
/// Pulled out as its own function so the bounds-checking logic is testable
/// without invoking FFmpeg. Rejects non-finite or non-positive values
/// outright (those are almost certainly a caller bug, not a deliberate
/// request); in-range-but-too-large values are silently clamped to the
/// nearest bound rather than rejected, matching this file's existing
/// `clamp()`-based tolerance for slightly-out-of-range UI input (e.g.
/// `wm.font_size.clamp(1, 999)` in `apply_watermark_args`).
fn validate_still_animation_params(duration_secs: f64, fps: f64) -> Result<(f64, f64)> {
    if !duration_secs.is_finite() || duration_secs <= 0.0 {
        return Err(AppError::Ffmpeg(format!(
            "duration_secs must be a positive, finite number of seconds, got {duration_secs}"
        )));
    }
    if !fps.is_finite() || fps <= 0.0 {
        return Err(AppError::Ffmpeg(format!(
            "fps must be a positive, finite frame rate, got {fps}"
        )));
    }
    let duration = duration_secs.clamp(
        MIN_STILL_ANIMATION_DURATION_SECS,
        MAX_STILL_ANIMATION_DURATION_SECS,
    );
    let fps = fps.clamp(MIN_STILL_ANIMATION_FPS, MAX_STILL_ANIMATION_FPS);
    Ok((duration, fps))
}

/// Build the FFmpeg argument vector for [`image_to_video`]. A pure function
/// (no subprocess) so the argv shape -- flag ordering, the even-dimension
/// pad filter, and where the output path lands -- is unit-testable directly,
/// mirroring `apply_watermark_args`/`find_output_arg_index` above.
fn build_image_to_video_args(
    image_path: &str,
    duration_secs: f64,
    fps: f64,
    width: u32,
    height: u32,
    output_path: &str,
) -> Vec<String> {
    let mut args: Vec<String> = vec![
        "-y".to_string(),
        "-loop".to_string(),
        "1".to_string(),
        "-i".to_string(),
        image_path.to_string(),
        "-t".to_string(),
        format!("{duration_secs}"),
        "-r".to_string(),
        format!("{fps}"),
        "-c:v".to_string(),
        "libx264".to_string(),
        "-pix_fmt".to_string(),
        "yuv420p".to_string(),
    ];

    // yuv420p requires even dimensions. Pad (rather than crop) so no source
    // pixels are lost -- mirrors encode_video's own even-dimension handling
    // further down this file.
    if !width.is_multiple_of(2) || !height.is_multiple_of(2) {
        args.push("-vf".to_string());
        args.push("pad=ceil(iw/2)*2:ceil(ih/2)*2:0:0:black".to_string());
    }

    args.push(output_path.to_string());
    args
}

/// Build a collision-resistant output filename for [`image_to_video`]. Hashes
/// the full source path (not just its file stem) so two different images
/// that happen to share a filename in different folders can't collide on the
/// same output path and silently overwrite each other's animated clip.
fn build_animated_still_filename(image_path: &str, duration_secs: f64, fps: f64) -> String {
    use std::collections::hash_map::DefaultHasher;
    use std::hash::{Hash, Hasher};
    let mut hasher = DefaultHasher::new();
    image_path.hash(&mut hasher);
    let path_hash = format!("{:016x}", hasher.finish());

    let source_name = Path::new(image_path)
        .file_stem()
        .and_then(|s| s.to_str())
        .unwrap_or("still");
    format!(
        "{}_{}_animated_{:.2}s_{:.0}fps.mp4",
        source_name, path_hash, duration_secs, fps
    )
}

/// Generate a video from a single still image by looping it for
/// `duration_secs` seconds at `fps`. This is how a still-image session
/// becomes a real multi-frame video that the video-only effect family
/// (frame_reverse, shuffle, motion_transfer, mv_effects, profiles, ...) can
/// meaningfully operate on -- those effects read/write multiple frames and
/// are structurally meaningless applied to a single still.
///
/// The source image's own dimensions are probed and used as-is (no
/// hardcoded resolution); only even-ness is corrected for, via padding, if
/// needed for `yuv420p`. Returns the path to the generated `.mp4` in the
/// system temp directory.
pub fn image_to_video(image_path: &str, duration_secs: f64, fps: f64) -> Result<String> {
    let (duration_secs, fps) = validate_still_animation_params(duration_secs, fps)?;
    let ffmpeg = ffmpeg_binary()?;

    let (width, height) = image::image_dimensions(image_path)
        .map_err(|e| AppError::Ffmpeg(format!("Could not read image dimensions: {e}")))?;

    // Nested under moshdither-studio so it falls inside the Tauri asset-protocol
    // scope allowlist, matching extract_audio_to_wav/LUT temp dirs.
    let out_dir = std::env::temp_dir()
        .join("moshdither-studio")
        .join("animated-stills");
    std::fs::create_dir_all(&out_dir).map_err(AppError::Io)?;

    let output_path = out_dir.join(build_animated_still_filename(
        image_path,
        duration_secs,
        fps,
    ));
    let output_path_str = output_path.to_string_lossy().to_string();

    let args = build_image_to_video_args(
        image_path,
        duration_secs,
        fps,
        width,
        height,
        &output_path_str,
    );

    const IMAGE_TO_VIDEO_TIMEOUT: std::time::Duration = std::time::Duration::from_secs(120);
    let output = output_with_timeout(Command::new(&ffmpeg).args(&args), IMAGE_TO_VIDEO_TIMEOUT)?;

    if !output.status.success() {
        return Err(AppError::Ffmpeg(format!(
            "FFmpeg image-to-video failed (exit {}): {}",
            output.status.code().unwrap_or(-1),
            String::from_utf8_lossy(&output.stderr)
                .chars()
                .take(2000)
                .collect::<String>()
        )));
    }

    Ok(output_path_str)
}

/// Locate the FFgac binary (FFglitch encoder). Tries bundled sidecar first, then PATH.
pub fn ffgac_binary() -> Result<String> {
    locate_binary("ffgac")
}

/// Locate the FFedit binary (FFglitch editor). Tries bundled sidecar first, then PATH.
pub fn ffedit_binary() -> Result<String> {
    locate_binary("ffedit")
}

/// Check whether FFglitch binaries (ffgac + ffedit) are available.
pub fn ffglitch_available() -> bool {
    ffgac_binary()
        .map(|p| Path::new(&p).exists())
        .unwrap_or(false)
        && ffedit_binary()
            .map(|p| Path::new(&p).exists())
            .unwrap_or(false)
}

/// Decode a video file to a sequence of raw RGBA frames.
///
/// Uses the legacy fixed-cap behavior: native resolution, up to
/// [`DEFAULT_DECODE_MAX_FRAMES`] frames, with the per-frame budget enforced
/// by `decode_video_with_options`. Prefer `decode_video_with_options` for
/// new call sites that need to handle 4K source or control the processing
/// resolution.
pub fn decode_video(path: &str, max_frames: Option<usize>) -> Result<VideoSegment> {
    decode_video_with_options(path, max_frames, None)
}

/// Decode a video file with optional scaling and an adaptive memory budget.
///
/// `scale` controls the processing resolution:
///   - `None`: native resolution (caller is responsible for ensuring the
///     clip fits in memory, e.g. via `pick_auto_scale`).
///   - `Some(n)`: downscale so the longer side is at most `n` pixels,
///     preserving aspect ratio.
///
/// The per-decode memory budget is computed adaptively from system RAM
/// (see [`adaptive_decode_memory_budget`]). If the source would exceed
/// the budget at the requested scale, the frame count is truncated to
/// fit — but this is logged loudly so callers can detect it. Callers
/// that need to guarantee the full clip is decoded should call
/// [`pick_auto_scale`] first and pass the resulting scale here.
pub fn decode_video_with_options(
    path: &str,
    max_frames: Option<usize>,
    scale: Option<usize>,
) -> Result<VideoSegment> {
    // Resolve an explicit or default frame cap up-front.
    let requested_max = max_frames.unwrap_or(DEFAULT_DECODE_MAX_FRAMES);
    let budget = adaptive_decode_memory_budget() as usize;

    // Probe source dimensions first so we can compute the actual output
    // dimensions and verify the budget before launching FFmpeg.
    let (src_w, src_h, fps) = probe_video(path)?;
    let (width, height) = if let Some(max_dim) = scale {
        // Match ffmpeg's `scale=W:H:force_original_aspect_ratio=decrease`:
        // the longer side is clamped to max_dim, the shorter side is
        // scaled proportionally and rounded to nearest.
        let max_dim = max_dim as u32;
        if src_w >= src_h {
            let w = src_w.min(max_dim);
            let h = ((w as f64) * (src_h as f64) / (src_w as f64)).round() as u32;
            (w, h.max(2))
        } else {
            let h = src_h.min(max_dim);
            let w = ((h as f64) * (src_w as f64) / (src_h as f64)).round() as u32;
            (w.max(2), h)
        }
    } else {
        (src_w, src_h)
    };

    let frame_size = (width as usize)
        .saturating_mul(height as usize)
        .saturating_mul(4);
    if frame_size == 0 {
        return Ok(VideoSegment {
            frames: Vec::new(),
            fps,
        });
    }

    // Enforce the per-operation memory budget.
    if frame_size > budget {
        return Err(AppError::Ffmpeg(format!(
            "video frame size {}x{} ({} bytes) exceeds decode memory budget ({} bytes); \
             use a smaller --scale or process a shorter clip",
            width, height, frame_size, budget
        )));
    }
    let budget_frames = budget / frame_size;
    let max_frames = requested_max.min(budget_frames).max(1);
    if max_frames < requested_max {
        tracing::warn!(
            "Requested {} frames but only {} fit in memory budget \
             ({}x{} @ {} bytes/frame, budget {} bytes). Clip will be truncated.",
            requested_max,
            max_frames,
            width,
            height,
            frame_size,
            budget
        );
    }

    let ffmpeg = ffmpeg_binary()?;
    let mut cmd = Command::new(&ffmpeg);
    cmd.args(["-i", path]);
    // max_frames, not requested_max. ffmpeg buffers everything it decodes into
    // this process's stdout pipe, so asking for more frames than the memory
    // budget allows means peak usage is set by requested_max while only
    // max_frames survive into the returned Vec -- the budget bounded the result
    // but not the decode. Capping the encoder at the same number the budget
    // permits makes the limit real.
    cmd.args(["-frames:v", &max_frames.to_string()]);

    // Build the video filter chain: optional scale, then format=rgba.
    // `scale=W:H:force_original_aspect_ratio=decrease` scales so the longer
    // side is at most `max_dim` while preserving aspect ratio. We avoid
    // `min(W,iw)` syntax because the inner comma confuses the filter parser.
    let vf = if let Some(max_dim) = scale {
        format!(
            "scale={m}:{m}:force_original_aspect_ratio=decrease,format=rgba",
            m = max_dim
        )
    } else {
        "format=rgba".to_string()
    };
    cmd.args(["-vf", &vf]);
    cmd.args(["-f", "rawvideo", "-pix_fmt", "rgba", "pipe:1"]);

    const DECODE_TIMEOUT: std::time::Duration = std::time::Duration::from_secs(120);
    let output = output_with_timeout(&mut cmd, DECODE_TIMEOUT)?;
    if !output.status.success() {
        let stderr = String::from_utf8_lossy(&output.stderr);
        return Err(AppError::Ffmpeg(format!(
            "FFmpeg decode failed (exit {}): {}",
            output.status.code().unwrap_or(-1),
            stderr.chars().take(2000).collect::<String>()
        )));
    }

    let raw = output.stdout;
    let mut frames = Vec::with_capacity(max_frames);

    for chunk in raw.chunks_exact(frame_size) {
        if frames.len() >= max_frames {
            break;
        }
        frames.push(Frame {
            width,
            height,
            data: chunk.to_vec(),
        });
    }

    // Hitting the cap exactly almost always means the source was longer and got
    // cut. There was no signal at all before: export_video calls this with
    // max_frames = None, so a clip over DEFAULT_DECODE_MAX_FRAMES (10 000 frames
    // -- about 5.5 minutes at 30fps, 7 at 24) was silently shortened and the
    // user got a truncated file with no indication why.
    //
    // A warning is not a fix for that; it makes the loss visible. Removing the
    // limit outright is not safe either, since the decode is fully buffered in
    // memory. The real fix is streaming decode, which is a larger change.
    if frames.len() == max_frames {
        tracing::warn!(
            "Decode stopped at the {}-frame limit ({:.1}s at {:.0} fps). \
             If the source is longer, the result is TRUNCATED. Raise the limit by passing \
             max_frames, or lower memory per frame with a smaller scale.",
            max_frames,
            max_frames as f64 / fps.max(1.0),
            fps
        );
    }

    Ok(VideoSegment { frames, fps })
}

/// Encode a sequence of raw RGBA frames to a video file.
/// `codec`: "libx264" | "libx265" | "libvpx-vp9" | "prores_ks"
/// `fps_override`: optional target fps (defaults to segment fps)
/// Locate the output path argument by exact string identity, not by guessing
/// a file extension. Extension-based lookups (`a.ends_with(".mp4") || ...`)
/// broke in two ways: the extension allow-list didn't include every
/// container (e.g. .webm was missing at some call sites but not others), and
/// `position()` (first match) could match the SOURCE input's `-i <path>`
/// argument instead of the output path whenever the source happened to share
/// a listed extension and audio was included -- corrupting the argv by
/// splicing a filter flag between `-i` and the source filename. Matching the
/// known `output_path` value directly is immune to both: it can't collide
/// with a different string, and it needs no extension list at all.
fn find_output_arg_index(args: &[String], output_path: &str) -> Option<usize> {
    args.iter().rposition(|a| a == output_path)
}

fn apply_watermark_args(
    mut args: Vec<String>,
    wm: &WatermarkSettings,
    output_path: &str,
) -> Vec<String> {
    if !wm.enabled {
        return args;
    }

    fn escape_drawtext(text: &str) -> String {
        text.replace('\\', "\\\\")
            .replace('\'', "\\'")
            .replace(':', "\\:")
            .replace('{', "\\{")
            .replace('}', "\\}")
            .replace('(', "\\(")
            .replace(')', "\\)")
            .replace(';', "\\;")
            .replace('|', "\\|")
            .replace('%', "\\%")
            .replace(['\n', '\r'], " ")
    }

    fn escape_path(path: &str) -> String {
        // Comma and semicolon are filtergraph-level separators (chain
        // multiple filters / filter stages within one -vf argument) even
        // though this value is unquoted -- without escaping them, a
        // font_path containing one lets a caller splice extra FFmpeg
        // filters/options into the export's filtergraph.
        path.replace('\'', "\\'")
            .replace(':', "\\:")
            .replace(',', "\\,")
            .replace(';', "\\;")
    }

    fn to_drawtext_color(color: &str) -> &str {
        match color.to_lowercase().as_str() {
            "black" => "black",
            "red" => "red",
            "green" => "green",
            "blue" => "blue",
            "yellow" => "yellow",
            "cyan" => "cyan",
            "magenta" => "magenta",
            _ => "white",
        }
    }

    fn text_position_coords(position: &str) -> (&str, &str) {
        match position {
            "top-left" => ("10", "10"),
            "top-right" => ("w-text_w-10", "10"),
            "bottom-left" => ("10", "h-text_h-10"),
            "center" => ("(w-text_w)/2", "(h-text_h)/2"),
            _ => ("w-text_w-10", "h-text_h-10"), // bottom-right
        }
    }

    fn image_position_coords(position: &str) -> (&str, &str) {
        match position {
            "top-left" => ("10", "10"),
            "top-right" => ("W-w-10", "10"),
            "bottom-left" => ("10", "H-h-10"),
            "center" => ("(W-w)/2", "(H-h)/2"),
            _ => ("W-w-10", "H-h-10"), // bottom-right
        }
    }

    if wm.watermark_type == "text" && !wm.text.is_empty() {
        let (x, y) = text_position_coords(&wm.position);
        let alpha = ((wm.opacity * 255.0).round() as u32).clamp(0, 255);
        let alpha_hex = format!("{:02x}", alpha);
        let color = to_drawtext_color(&wm.color);
        let mut drawtext = format!(
            "drawtext=text='{}':x={}:y={}:fontsize={}:fontcolor={}@{}",
            escape_drawtext(&wm.text),
            x,
            y,
            wm.font_size.clamp(1, 999),
            color,
            alpha_hex
        );
        if let Some(font_path) = &wm.font_path {
            drawtext.push_str(&format!(":fontfile={}", escape_path(font_path)));
        }

        let vf_index = args
            .iter()
            .position(|a| a == "-vf" || a == "-filter_complex");
        if let Some(idx) = vf_index {
            if idx + 1 < args.len() {
                args[idx + 1] = format!("{},{}", args[idx + 1], drawtext);
            }
        } else {
            let insert_index = find_output_arg_index(&args, output_path);
            if let Some(idx) = insert_index {
                args.insert(idx, "-vf".to_string());
                args.insert(idx + 1, drawtext);
            } else {
                args.push("-vf".to_string());
                args.push(drawtext);
            }
        }
        return args;
    }

    if wm.watermark_type == "image" {
        if let Some(image_path) = &wm.image_path {
            let (x, y) = image_position_coords(&wm.position);
            let alpha = wm.opacity.clamp(0.0, 1.0);
            let scale = if wm.scale > 0 {
                format!("scale=-1:{}*ih/100", wm.scale.clamp(1, 100))
            } else {
                "".to_string()
            };
            let opacity_expr = if alpha < 1.0 {
                format!("format=rgba,colorchannelmixer=aa={:.2}", alpha)
            } else {
                "".to_string()
            };

            let filter = if !scale.is_empty() {
                if !opacity_expr.is_empty() {
                    format!(
                        "[1:v]{}[wm];[wm]{}[wm2];[0:v][wm2]overlay={}:{}",
                        scale, opacity_expr, x, y
                    )
                } else {
                    format!("[1:v]{}[wm];[0:v][wm]overlay={}:{}", scale, x, y)
                }
            } else if !opacity_expr.is_empty() {
                format!("[1:v]{}[wm];[0:v][wm]overlay={}:{}", opacity_expr, x, y)
            } else {
                format!("[0:v][1:v]overlay={}:{}", x, y)
            };

            // Insert image input right after first -i
            if let Some(first_input) = args.iter().position(|a| a == "-i") {
                args.insert(first_input + 2, "-i".to_string());
                args.insert(first_input + 3, image_path.clone());
            }

            let fc_index = args
                .iter()
                .position(|a| a == "-filter_complex" || a == "-vf");
            if let Some(idx) = fc_index {
                let existing = args[idx + 1].clone();
                if args[idx] == "-vf" {
                    args[idx] = "-filter_complex".to_string();
                    args[idx + 1] =
                        format!("[0:v]{}[v0];{}[v1];[v1]{}[out]", existing, filter, existing);
                } else {
                    args[idx + 1] = format!("{};{}", existing, filter);
                }
            } else {
                let insert_index = find_output_arg_index(&args, output_path);
                if let Some(idx) = insert_index {
                    args.insert(idx, "-filter_complex".to_string());
                    args.insert(idx + 1, filter);
                } else {
                    args.push("-filter_complex".to_string());
                    args.push(filter);
                }
            }

            if !args.iter().any(|a| a == "-map") {
                let output_index = find_output_arg_index(&args, output_path);
                if let Some(idx) = output_index {
                    args.insert(idx, "-map".to_string());
                    args.insert(idx + 1, "[out]".to_string());
                } else {
                    // output_path is pushed unconditionally before this fn runs
                    // (encode_video always calls args.push(path) first), so
                    // reaching here means it went missing from args entirely --
                    // a deeper bug upstream, not a routine lookup miss.
                    tracing::warn!(
                        "Output path not found in ffmpeg args while inserting watermark -map; audio/video mapping may be wrong"
                    );
                    args.push("-map".to_string());
                    args.push("[out]".to_string());
                }
            }
        }
    }

    args
}

fn add_metadata_args(mut args: Vec<String>, source_path: &str) -> Vec<String> {
    if args.iter().any(|a| a == "-metadata") {
        return args;
    }
    if let Ok(meta) = probe_metadata(source_path) {
        if let Some(artist) = meta.artist {
            args.push("-metadata".to_string());
            args.push(format!("artist={}", artist));
        }
        if let Some(title) = meta.title {
            args.push("-metadata".to_string());
            args.push(format!("title={}", title));
        }
        if let Some(comment) = meta.comment {
            args.push("-metadata".to_string());
            args.push(format!("comment={}", comment));
        }
        args.push("-metadata".to_string());
        args.push("encoder=MoshDither Studio".to_string());
    }
    args
}

/// Removes the file at `path` on drop unless `disarm()` was called first.
/// Used so a temp export file is cleaned up on every exit path out of
/// `encode_video` -- early `?` returns included -- without having to thread
/// a manual cleanup call through each one by hand.
struct TempFileGuard {
    path: std::path::PathBuf,
    armed: bool,
}

impl TempFileGuard {
    fn new(path: std::path::PathBuf) -> Self {
        Self { path, armed: true }
    }

    fn disarm(&mut self) {
        self.armed = false;
    }
}

impl Drop for TempFileGuard {
    fn drop(&mut self) {
        if self.armed {
            let _ = std::fs::remove_file(&self.path);
        }
    }
}

pub fn encode_video(
    segment: &VideoSegment,
    path: &str,
    codec: &str,
    fps_override: Option<f64>,
    watermark: Option<&WatermarkSettings>,
    source_path: Option<&str>,
    quality: Option<&str>,
    include_audio: Option<bool>,
    trim_start: Option<f64>,
    trim_end: Option<f64>,
    output_width: Option<u32>,
    output_height: Option<u32>,
    cancel: Option<&std::sync::atomic::AtomicBool>,
    timeout: Option<std::time::Duration>,
) -> Result<()> {
    if segment.frames.is_empty() {
        return Err(AppError::Ffmpeg("No frames to encode".to_string()));
    }

    // Encode to a temp file beside the final destination, then atomically
    // rename onto it only after FFmpeg fully succeeds. Without this, a
    // cancelled, timed-out, or failed encode -- which FFmpeg (`-y`) has
    // already started writing directly to `path` -- leaves a truncated or
    // corrupt file at the user's chosen destination, silently destroying
    // whatever was there before if they picked an existing file to overwrite.
    let final_path = path;
    let dest = std::path::Path::new(final_path);
    let temp_path_buf = dest.with_file_name(format!(
        ".{}.moshdither-tmp",
        dest.file_name()
            .and_then(|f| f.to_str())
            .unwrap_or("export")
    ));
    let temp_path = temp_path_buf.to_string_lossy().into_owned();
    let path: &str = &temp_path;
    let mut temp_guard = TempFileGuard::new(temp_path_buf.clone());

    let ffmpeg = ffmpeg_binary()?;
    let first = &segment.frames[0];
    let w = first.width;
    let h = first.height;
    let fps = fps_override.unwrap_or(segment.fps);

    let encoder = match codec {
        "h264" | "libx264" => "libx264",
        "h265" | "hevc" | "libx265" => "libx265",
        "vp9" | "libvpx-vp9" => "libvpx-vp9",
        "prores" | "prores_ks" => "prores_ks",
        _ => "libx264",
    };

    let mut args: Vec<String> = vec![
        "-f".to_string(),
        "rawvideo".to_string(),
        "-pix_fmt".to_string(),
        "rgba".to_string(),
        "-s".to_string(),
        format!("{}x{}", w, h),
        "-r".to_string(),
        fps.to_string(),
        "-i".to_string(),
        "pipe:0".to_string(),
    ];

    // Add source as second input for audio (if requested)
    let audio_input_idx = if include_audio.unwrap_or(false) {
        if let Some(src) = source_path {
            // Trim audio to match video trim range
            if let Some(ts) = trim_start {
                args.push("-ss".to_string());
                args.push(ts.to_string());
            }
            if let Some(te) = trim_end {
                args.push("-t".to_string());
                args.push((te - trim_start.unwrap_or(0.0)).to_string());
            }
            args.push("-i".to_string());
            args.push(src.to_string());
            Some(1u32) // second input index
        } else {
            None
        }
    } else {
        None
    };

    // Video encoder
    args.push("-c:v".to_string());
    args.push(encoder.to_string());

    // Quality → CRF (lower = better quality)
    // VP9 uses a different CRF scale (0-63, lower = better)
    let crf = match quality {
        Some("draft") => {
            if encoder == "libvpx-vp9" {
                35
            } else {
                28
            }
        }
        Some("best") => {
            if encoder == "libvpx-vp9" {
                24
            } else {
                18
            }
        }
        _ => {
            if encoder == "libvpx-vp9" {
                30
            } else {
                23
            }
        } // "good" or default
    };
    args.push("-crf".to_string());
    args.push(crf.to_string());

    // VP9 needs -b:v 0 for CRF mode to work properly
    if encoder == "libvpx-vp9" {
        args.push("-b:v".to_string());
        args.push("0".to_string());
    }

    args.push("-r".to_string());
    args.push(fps.to_string());
    args.push("-fps_mode".to_string());
    args.push("cfr".to_string());

    args.push("-pix_fmt".to_string());
    args.push("yuv420p".to_string());

    // ProRes needs profile argument
    if encoder == "prores_ks" {
        args.push("-profile:v".to_string());
        args.push("3".to_string()); // ProRes 422 HQ
    }

    // Audio: encode from second input if present
    if audio_input_idx.is_some() {
        args.push("-c:a".to_string());
        args.push("aac".to_string());
        args.push("-shortest".to_string());
    }

    args.push("-y".to_string());
    args.push(path.to_string());

    // Apply watermark if enabled
    if let Some(wm) = watermark {
        if wm.enabled {
            args = apply_watermark_args(args, wm, path);
        }
    }

    // Fix audio stream mapping when filter_complex is used (watermark image case).
    // The watermark code may insert an extra -i (image), shifting the audio input index.
    // We need to explicitly map both video ([out]) and audio (correct input index).
    if audio_input_idx.is_some() {
        let has_filter_complex = args.iter().any(|a| a == "-filter_complex");
        let has_map = args.iter().any(|a| a == "-map");

        if has_filter_complex && has_map {
            // Count total -i inputs to find the audio source index
            let input_count = args.iter().filter(|a| *a == "-i").count();
            // Audio source is the last input (pipe:0 is input 0, watermark image may be input 1, audio is last)
            let audio_idx = (input_count - 1) as u32;
            let output_pos = find_output_arg_index(&args, path);
            if let Some(pos) = output_pos {
                args.insert(pos, "-map".to_string());
                args.insert(pos + 1, format!("{}:a", audio_idx));
            }
        }
    }

    // Preserve source metadata when available
    if let Some(src) = source_path {
        args = add_metadata_args(args, src);
    }

    // Apply resolution scale via FFmpeg filter (replaces CPU-based per-frame resize)
    if let (Some(ow), Some(oh)) = (output_width, output_height) {
        if ow != w || oh != h {
            let scale_filter = format!("scale={}:{}", ow, oh);
            let vf_pos = args.iter().position(|a| a == "-vf");
            let fc_pos = args.iter().position(|a| a == "-filter_complex");
            if let Some(pos) = vf_pos {
                // Prepend scale to existing -vf chain
                let existing = &args[pos + 1];
                args[pos + 1] = format!("{},{}", scale_filter, existing);
            } else if let Some(pos) = fc_pos {
                // Inject scale into filter_complex: [0:v]scale=W:H[bg];[bg]...
                let existing = &args[pos + 1];
                if let Some(rest) = existing.strip_prefix("[0:v]") {
                    args[pos + 1] = format!("[0:v]{}[bg];[bg]{}", scale_filter, rest);
                } else {
                    args[pos + 1] = format!("{};{}", scale_filter, existing);
                }
            } else {
                // No existing video filter — add -vf scale before output
                let out_pos = find_output_arg_index(&args, path);
                if let Some(pos) = out_pos {
                    args.insert(pos, scale_filter.clone());
                    args.insert(pos, "-vf".to_string());
                }
            }
            tracing::debug!("Applied FFmpeg scale filter: {}", scale_filter);
        }
    }

    // yuv420p requires even dimensions. Append a pad filter as the final step
    // so the encoded output has even width/height without changing the source
    // frame dimensions when they are already even.
    if !w.is_multiple_of(2) || !h.is_multiple_of(2) {
        let pad_filter = "pad=ceil(iw/2)*2:ceil(ih/2)*2:(ow-iw)/2:(oh-ih)/2:black".to_string();
        tracing::debug!("Ensuring even dimensions for {}x{}", w, h);
        if let Some(vf_pos) = args.iter().position(|a| a == "-vf") {
            args[vf_pos + 1] = format!("{}, {}", args[vf_pos + 1], pad_filter);
        } else if let Some(fc_pos) = args.iter().position(|a| a == "-filter_complex") {
            let existing = args[fc_pos + 1].clone();
            args[fc_pos + 1] = format!("{};[out]{}[out]", existing, pad_filter);
        } else {
            let out_pos = find_output_arg_index(&args, path);
            if let Some(pos) = out_pos {
                args.insert(pos, pad_filter);
                args.insert(pos, "-vf".to_string());
            }
        }
    }

    tracing::info!(
        "FFmpeg encode: {} frames, {}x{}, fps={}, codec={}",
        segment.frames.len(),
        w,
        h,
        fps,
        encoder
    );
    tracing::debug!("FFmpeg args: {}", args.join(" "));

    let mut child = Command::new(&ffmpeg)
        .args(&args)
        .stdin(Stdio::piped())
        .stderr(Stdio::piped())
        .spawn()
        .map_err(|e| AppError::Ffmpeg(format!("Failed to spawn FFmpeg: {}", e)))?;

    // Drain stderr in a separate thread so a chatty FFmpeg cannot deadlock
    // on a full stderr pipe while we are still feeding it frames.
    let stderr = child
        .stderr
        .take()
        .ok_or_else(|| AppError::Ffmpeg("Failed to open FFmpeg stderr".to_string()))?;
    let stderr_buf = Arc::new(std::sync::Mutex::new(Vec::new()));
    let mut stderr_thread: Option<std::thread::JoinHandle<()>> = Some({
        let stderr_buf = Arc::clone(&stderr_buf);
        std::thread::spawn(move || {
            use std::io::Read;
            let mut reader = std::io::BufReader::new(stderr);
            let mut buf = Vec::new();
            // Best-effort read; the pipe will close when FFmpeg exits.
            let _ = reader.read_to_end(&mut buf);
            if let Ok(mut guard) = stderr_buf.lock() {
                *guard = buf;
            }
        })
    });

    {
        use std::io::Write;
        use std::sync::atomic::Ordering;
        let mut stdin = child
            .stdin
            .take()
            .ok_or_else(|| AppError::Ffmpeg("Failed to open FFmpeg stdin".to_string()))?;
        let total = segment.frames.len();
        for (i, frame) in segment.frames.iter().enumerate() {
            if let Some(c) = cancel {
                if c.load(Ordering::Relaxed) {
                    tracing::info!("FFmpeg encode cancelled by user");
                    let _ = stdin.flush();
                    drop(stdin);
                    let _ = child.kill();
                    let _ = child.wait_timeout(std::time::Duration::from_secs(10));
                    if let Some(t) = stderr_thread.take() {
                        let _ = t.join();
                    }
                    return Err(AppError::Ffmpeg("Export cancelled by user".to_string()));
                }
            }
            if i % 50 == 0 || i == total - 1 {
                tracing::debug!("Writing frame {}/{} to FFmpeg stdin", i + 1, total);
            }
            stdin.write_all(&frame.data).map_err(AppError::Io)?;
        }
        // Close stdin so FFmpeg sees EOF and can finish encoding the final frames.
        drop(stdin);
        tracing::debug!("FFmpeg stdin closed (EOF sent), waiting for encode to finish...");
    }

    // Wait for the child with a bounded timeout (default 10 minutes). If it
    // expires, kill it so a hung encode cannot run forever.
    use child_wait_timeout::ChildWT;
    use std::io::ErrorKind;
    let timeout = timeout.unwrap_or(std::time::Duration::from_secs(600));
    let status = match child.wait_timeout(timeout) {
        Ok(status) => status,
        Err(e) if e.kind() == ErrorKind::TimedOut => {
            tracing::warn!(
                "FFmpeg encode timed out after {:?}, killing process",
                timeout
            );
            let _ = child.kill();
            let _ = child.wait_timeout(std::time::Duration::from_secs(10));
            if let Some(t) = stderr_thread.take() {
                let _ = t.join();
            }
            return Err(AppError::Ffmpeg(format!(
                "FFmpeg encode timed out after {:?}",
                timeout
            )));
        }
        Err(e) => {
            let _ = child.kill();
            if let Some(t) = stderr_thread.take() {
                let _ = t.join();
            }
            return Err(AppError::Io(e));
        }
    };

    if let Some(t) = stderr_thread.take() {
        let _ = t.join();
    }
    let stderr_bytes = stderr_buf.lock().map(|g| g.clone()).unwrap_or_default();
    if !status.success() {
        let stderr = String::from_utf8_lossy(&stderr_bytes);
        tracing::error!("FFmpeg FAILED. stderr:\n{}", stderr);
        return Err(AppError::Ffmpeg(format!(
            "FFmpeg encode failed (exit {}): {}",
            status.code().unwrap_or(-1),
            stderr.chars().take(2000).collect::<String>()
        )));
    }

    // Only now, after FFmpeg has fully and successfully finished, does the
    // final destination change -- atomically, so a reader never observes a
    // partially-written file at `final_path`. Disarm the guard first so a
    // successful rename doesn't get immediately deleted by Drop.
    temp_guard.disarm();
    if let Err(e) = std::fs::rename(&temp_path_buf, final_path) {
        let _ = std::fs::remove_file(&temp_path_buf);
        return Err(AppError::Io(e));
    }
    tracing::info!("FFmpeg encode completed successfully");
    Ok(())
}

const PROBE_CACHE_CAPACITY: usize = 128;

#[derive(Default)]
struct ProbeCache {
    entries: HashMap<String, (u32, u32, f64)>,
    order: VecDeque<String>,
}

/// Run a command to completion, piping stdout/stderr, bounded by `timeout`.
///
/// `Command::output()` has no timeout: if the child process hangs (a
/// well-documented real occurrence for ffmpeg/ffprobe on malformed or
/// truncated containers), the calling Tauri command's future never
/// resolves. That is architecturally the same "await that never settles"
/// bug already fixed once in this codebase (EffectChain.getMaskTexture's
/// unguarded `<img>` load) -- just one layer down, at a subprocess instead
/// of a DOM event. `encode_video` (below) already solves this for the
/// export path with `child.wait_timeout` plus a stderr-draining thread (so
/// a chatty process cannot deadlock on a full pipe buffer while we wait);
/// this is that same pattern, generalized for callers that don't need to
/// stream input to stdin.
fn output_with_timeout(
    cmd: &mut Command,
    timeout: std::time::Duration,
) -> Result<std::process::Output> {
    use child_wait_timeout::ChildWT;
    use std::io::{ErrorKind, Read};

    let mut child = cmd
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .spawn()
        .map_err(AppError::Io)?;

    let stdout = child
        .stdout
        .take()
        .ok_or_else(|| AppError::Ffmpeg("Failed to open child stdout".to_string()))?;
    let stderr = child
        .stderr
        .take()
        .ok_or_else(|| AppError::Ffmpeg("Failed to open child stderr".to_string()))?;

    let stdout_buf = Arc::new(std::sync::Mutex::new(Vec::new()));
    let stderr_buf = Arc::new(std::sync::Mutex::new(Vec::new()));

    let stdout_thread = {
        let buf = Arc::clone(&stdout_buf);
        std::thread::spawn(move || {
            let mut reader = std::io::BufReader::new(stdout);
            let mut data = Vec::new();
            let _ = reader.read_to_end(&mut data);
            if let Ok(mut guard) = buf.lock() {
                *guard = data;
            }
        })
    };
    let stderr_thread = {
        let buf = Arc::clone(&stderr_buf);
        std::thread::spawn(move || {
            let mut reader = std::io::BufReader::new(stderr);
            let mut data = Vec::new();
            let _ = reader.read_to_end(&mut data);
            if let Ok(mut guard) = buf.lock() {
                *guard = data;
            }
        })
    };

    let join_readers = |stdout_thread: std::thread::JoinHandle<()>,
                        stderr_thread: std::thread::JoinHandle<()>| {
        let _ = stdout_thread.join();
        let _ = stderr_thread.join();
    };

    let status = match child.wait_timeout(timeout) {
        Ok(status) => status,
        Err(e) if e.kind() == ErrorKind::TimedOut => {
            tracing::warn!("Command timed out after {:?}, killing process", timeout);
            let _ = child.kill();
            let _ = child.wait_timeout(std::time::Duration::from_secs(10));
            join_readers(stdout_thread, stderr_thread);
            return Err(AppError::Ffmpeg(format!(
                "Process timed out after {:?}",
                timeout
            )));
        }
        Err(e) => {
            let _ = child.kill();
            join_readers(stdout_thread, stderr_thread);
            return Err(AppError::Io(e));
        }
    };

    join_readers(stdout_thread, stderr_thread);
    let stdout = stdout_buf.lock().map(|g| g.clone()).unwrap_or_default();
    let stderr = stderr_buf.lock().map(|g| g.clone()).unwrap_or_default();
    Ok(std::process::Output {
        status,
        stdout,
        stderr,
    })
}

/// Parse an ffprobe `r_frame_rate` string, which is typically a ratio such as
/// `30000/1001` or a decimal like `30`.
fn parse_r_frame_rate(s: &str) -> f64 {
    let parts: Vec<&str> = s.split('/').collect();
    if parts.len() == 2 {
        let num: f64 = parts[0].parse().unwrap_or(30.0);
        let den: f64 = parts[1].parse().unwrap_or(1.0);
        if den != 0.0 {
            return num / den;
        }
    }
    s.parse::<f64>().unwrap_or(30.0)
}

/// Probe video file for width, height, and fps.
/// Results are cached in-memory to avoid repeated ffprobe calls for the same file.
pub fn probe_video(path: &str) -> Result<(u32, u32, f64)> {
    static CACHE: OnceLock<ParkingLotMutex<ProbeCache>> = OnceLock::new();
    let cache = CACHE.get_or_init(|| ParkingLotMutex::new(ProbeCache::default()));
    {
        let mut cache = cache.lock();
        if let Some(entry) = cache.entries.get(path).copied() {
            if let Some(position) = cache.order.iter().position(|key| key == path) {
                cache.order.remove(position);
            }
            cache.order.push_back(path.to_string());
            return Ok(entry);
        }
    }

    let bin = ffprobe_binary()?;

    const PROBE_TIMEOUT: std::time::Duration = std::time::Duration::from_secs(30);
    let output = output_with_timeout(
        Command::new(&bin).args([
            "-v",
            "error",
            "-select_streams",
            "v:0",
            "-show_entries",
            "stream=width,height,r_frame_rate",
            "-of",
            "json",
            path,
        ]),
        PROBE_TIMEOUT,
    )?;

    if !output.status.success() {
        let stderr = String::from_utf8_lossy(&output.stderr);
        return Err(AppError::Ffmpeg(format!(
            "ffprobe failed (exit {}): {}",
            output.status.code().unwrap_or(-1),
            stderr.chars().take(2000).collect::<String>()
        )));
    }

    let raw: serde_json::Value = serde_json::from_slice(&output.stdout)
        .map_err(|e| AppError::Ffmpeg(format!("Invalid ffprobe JSON: {e}")))?;
    let stream = raw
        .get("streams")
        .and_then(|s| s.as_array())
        .and_then(|a| a.first())
        .ok_or_else(|| AppError::Ffmpeg("ffprobe returned no video streams".to_string()))?;

    let width = stream
        .get("width")
        .and_then(|v| v.as_u64())
        .ok_or_else(|| AppError::Ffmpeg("ffprobe did not return width".to_string()))?
        as u32;
    let height = stream
        .get("height")
        .and_then(|v| v.as_u64())
        .ok_or_else(|| AppError::Ffmpeg("ffprobe did not return height".to_string()))?
        as u32;
    let fps = parse_r_frame_rate(
        stream
            .get("r_frame_rate")
            .and_then(|v| v.as_str())
            .unwrap_or("30/1"),
    );

    if width == 0 || height == 0 {
        return Err(AppError::Ffmpeg(
            "Could not probe video dimensions".to_string(),
        ));
    }

    let result = (width, height, fps);
    let mut cache = cache.lock();
    if cache.entries.contains_key(path) {
        cache.order.retain(|key| key != path);
    }
    cache.entries.insert(path.to_string(), result);
    cache.order.push_back(path.to_string());
    while cache.entries.len() > PROBE_CACHE_CAPACITY {
        if let Some(oldest) = cache.order.pop_front() {
            cache.entries.remove(&oldest);
        }
    }
    Ok(result)
}

#[derive(Debug, Default, Clone, serde::Serialize, serde::Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct MediaMetadata {
    pub creation_time: Option<String>,
    pub artist: Option<String>,
    pub title: Option<String>,
    pub comment: Option<String>,
    pub encoder: Option<String>,
    pub width: Option<u32>,
    pub height: Option<u32>,
    pub duration: Option<f64>,
    pub fps: Option<f64>,
    pub bitrate: Option<u32>,
    pub codec: Option<String>,
    pub tags: Option<serde_json::Map<String, serde_json::Value>>,
}

pub fn probe_metadata(path: &str) -> Result<MediaMetadata> {
    let bin = ffprobe_binary()?;
    const PROBE_METADATA_TIMEOUT: std::time::Duration = std::time::Duration::from_secs(30);
    let output = output_with_timeout(
        Command::new(&bin).args([
            "-v",
            "error",
            "-show_entries",
            "format=tags,duration,bit_rate:stream=width,height,codec_name,r_frame_rate",
            "-of",
            "json",
            path,
        ]),
        PROBE_METADATA_TIMEOUT,
    )?;
    if !output.status.success() {
        return Err(AppError::Ffmpeg(format!(
            "FFprobe metadata failed: {}",
            String::from_utf8_lossy(&output.stderr)
        )));
    }
    let raw: serde_json::Value = serde_json::from_slice(&output.stdout)
        .map_err(|e| AppError::Ffmpeg(format!("Invalid ffprobe JSON: {e}")))?;
    let mut meta = MediaMetadata::default();
    if let Some(format) = raw.get("format").and_then(|v| v.as_object()) {
        if let Some(tags) = format.get("tags").and_then(|v| v.as_object()) {
            meta.tags = Some(tags.clone());
            meta.artist = tags
                .get("artist")
                .or_else(|| tags.get("ARTIST"))
                .and_then(|v| v.as_str().map(String::from));
            meta.title = tags
                .get("title")
                .or_else(|| tags.get("TITLE"))
                .and_then(|v| v.as_str().map(String::from));
            meta.comment = tags
                .get("comment")
                .or_else(|| tags.get("COMMENT"))
                .or_else(|| tags.get("description"))
                .and_then(|v| v.as_str().map(String::from));
            meta.encoder = tags
                .get("encoder")
                .or_else(|| tags.get("Encoder"))
                .or_else(|| tags.get("Software"))
                .and_then(|v| v.as_str().map(String::from));
            meta.creation_time = tags
                .get("creation_time")
                .or_else(|| tags.get("date"))
                .or_else(|| tags.get("DateTimeOriginal"))
                .and_then(|v| v.as_str().map(String::from));
        }
        if let Some(d) = format.get("duration").and_then(|v| v.as_str()) {
            meta.duration = d.parse().ok();
        }
        if let Some(b) = format.get("bit_rate").and_then(|v| v.as_str()) {
            meta.bitrate = b.parse().ok();
        }
    }
    if let Some(streams) = raw.get("streams").and_then(|v| v.as_array()) {
        if let Some(video) = streams.iter().find(|s| {
            s.get("width").and_then(|v| v.as_u64()).is_some()
                && s.get("height").and_then(|v| v.as_u64()).is_some()
        }) {
            meta.width = video
                .get("width")
                .and_then(|v| v.as_u64())
                .map(|v| v as u32);
            meta.height = video
                .get("height")
                .and_then(|v| v.as_u64())
                .map(|v| v as u32);
            meta.codec = video
                .get("codec_name")
                .and_then(|v| v.as_str().map(String::from));
            if let Some(rate) = video.get("r_frame_rate").and_then(|v| v.as_str()) {
                let parts: Vec<&str> = rate.split('/').collect();
                if parts.len() == 2 {
                    let num: f64 = parts[0].parse().unwrap_or(0.0);
                    let den: f64 = parts[1].parse().unwrap_or(1.0);
                    if den != 0.0 {
                        meta.fps = Some(num / den);
                    }
                }
            }
        }
    }
    Ok(meta)
}

/// Check whether a media file has an audio stream.
///
/// Returns `Ok(true)` if at least one audio stream is present, `Ok(false)`
/// if the file is video-only, or an error if ffprobe itself fails. This is
/// used by the auto-audio-extraction path to decide whether to extract
/// audio from a loaded video for audio-reactive effects.
pub fn has_audio_stream(path: &str) -> Result<bool> {
    let bin = ffprobe_binary()?;
    const HAS_AUDIO_STREAM_TIMEOUT: std::time::Duration = std::time::Duration::from_secs(30);
    let output = output_with_timeout(
        Command::new(&bin).args([
            "-v",
            "error",
            "-select_streams",
            "a",
            "-show_entries",
            "stream=codec_type",
            "-of",
            "csv=p=0",
            path,
        ]),
        HAS_AUDIO_STREAM_TIMEOUT,
    )?;
    // ffprobe prints one line per audio stream; if stdout is empty, no audio.
    let stdout = String::from_utf8_lossy(&output.stdout);
    Ok(stdout.trim().lines().any(|l| l.trim() == "audio"))
}

/// Extract the audio track from a video file to a WAV file.
///
/// Downmixes to mono at 44.1 kHz to match the format the TS
/// `AudioFeatureExtractor` expects. If `max_duration_secs` is provided,
/// only the first N seconds are extracted (matches the export trim range).
///
/// This is the Rust-side counterpart to the TouchDesigner `Audio Movie CHOP`
/// pattern: the user loads a video, and the app auto-extracts its audio
/// track so audio-reactive effects work without a separate audio load.
pub fn extract_audio_to_wav(
    video_path: &str,
    output_wav_path: &str,
    max_duration_secs: Option<f64>,
) -> Result<()> {
    let ffmpeg = ffmpeg_binary()?;
    let mut cmd = Command::new(&ffmpeg);
    cmd.args(["-y", "-i", video_path, "-vn", "-ac", "1", "-ar", "44100"]);
    if let Some(secs) = max_duration_secs {
        if secs > 0.0 {
            cmd.args(["-t", &format!("{secs}")]);
        }
    }
    cmd.args([output_wav_path]);
    // Generous timeout since this transcodes real audio data (unlike the
    // structural-only probes above); matches encode_video's own default.
    const AUDIO_EXTRACT_TIMEOUT: std::time::Duration = std::time::Duration::from_secs(600);
    let output = output_with_timeout(&mut cmd, AUDIO_EXTRACT_TIMEOUT)?;
    if !output.status.success() {
        let stderr = String::from_utf8_lossy(&output.stderr);
        // If the source has no audio stream, ffmpeg exits non-zero with a
        // recognizable error. Distinguish this from a real failure.
        let stderr_lower = stderr.to_lowercase();
        if stderr_lower.contains("no audio streams")
            || stderr_lower.contains("could not find audio codec")
            || stderr_lower.contains("stream specifier ':a': no stream")
        {
            return Err(AppError::Ffmpeg(
                "Source video has no audio stream".to_string(),
            ));
        }
        return Err(AppError::Ffmpeg(format!(
            "FFmpeg audio extract failed (exit {}): {}",
            output.status.code().unwrap_or(-1),
            stderr.chars().take(1500).collect::<String>()
        )));
    }
    Ok(())
}

#[cfg(test)]
mod output_with_timeout_tests {
    use super::*;

    // A short, reliable "hang" for exactly `secs` seconds, without depending
    // on a shell interactively (avoids `timeout`'s console-attachment quirk
    // on Windows). `ping` is present on every Windows install by default;
    // `sleep` is present on every Linux CI image (this project's `cargo
    // test` runs on ubuntu-latest) and macOS.
    fn hang_command(secs: u32) -> Command {
        #[cfg(target_os = "windows")]
        {
            let mut cmd = Command::new("ping");
            cmd.args(["-n", &(secs + 1).to_string(), "127.0.0.1"]);
            cmd
        }
        #[cfg(not(target_os = "windows"))]
        {
            let mut cmd = Command::new("sleep");
            cmd.arg(secs.to_string());
            cmd
        }
    }

    #[test]
    fn returns_output_for_a_command_that_finishes_within_the_timeout() {
        #[cfg(target_os = "windows")]
        let mut cmd = {
            let mut c = Command::new("cmd");
            c.args(["/C", "echo hello"]);
            c
        };
        #[cfg(not(target_os = "windows"))]
        let mut cmd = {
            let mut c = Command::new("echo");
            c.arg("hello");
            c
        };

        let output = output_with_timeout(&mut cmd, std::time::Duration::from_secs(10))
            .expect("a fast, well-behaved command should succeed");
        assert!(output.status.success());
        assert!(String::from_utf8_lossy(&output.stdout).contains("hello"));
    }

    #[test]
    fn kills_a_hung_process_and_returns_an_error_instead_of_blocking_forever() {
        // This is the exact defect class the fix closes: without a timeout,
        // a hung ffmpeg/ffprobe call left the awaiting Tauri command's
        // promise unresolved forever (the same "stuck at ~0% CPU, looks
        // frozen, isn't a crash" signature diagnosed for the mask-texture
        // bug). The command below would otherwise run far longer than the
        // 1s timeout given to it here.
        let mut cmd = hang_command(30);
        let started = std::time::Instant::now();
        let result = output_with_timeout(&mut cmd, std::time::Duration::from_secs(1));
        let elapsed = started.elapsed();

        assert!(
            result.is_err(),
            "a hung process must produce a timeout error, not hang the caller"
        );
        let message = result.unwrap_err().to_string();
        assert!(
            message.contains("timed out"),
            "error should say it timed out, got: {message}"
        );
        // Generous upper bound (the 1s timeout, plus the 10s grace period
        // for the post-kill wait_timeout, plus scheduler slack) -- the point
        // isn't precise timing, it's proving this returns at all instead of
        // hanging for the full 30s the underlying process was given.
        assert!(
            elapsed < std::time::Duration::from_secs(20),
            "expected the timeout path to return well before the process's own 30s runtime, took {elapsed:?}"
        );
    }
}

#[cfg(test)]
mod output_arg_lookup_tests {
    use super::*;

    fn text_watermark(text: &str) -> WatermarkSettings {
        WatermarkSettings {
            enabled: true,
            watermark_type: "text".to_string(),
            text: text.to_string(),
            image_path: None,
            position: "bottom-right".to_string(),
            font_size: 24,
            font_path: None,
            color: "white".to_string(),
            opacity: 0.8,
            scale: 20,
            rotation: 0,
        }
    }

    fn image_watermark(image_path: &str) -> WatermarkSettings {
        WatermarkSettings {
            enabled: true,
            watermark_type: "image".to_string(),
            text: String::new(),
            image_path: Some(image_path.to_string()),
            position: "bottom-right".to_string(),
            font_size: 24,
            font_path: None,
            color: "white".to_string(),
            opacity: 1.0,
            scale: 20,
            rotation: 0,
        }
    }

    // This is the exact shape of `args` right before `apply_watermark_args`
    // runs in `encode_video` when audio is included: the source clip's `-i
    // <path>` (pushed early for the second/audio input), then encoder flags,
    // then `-y <output_path>` (pushed last). Deliberately gives the source
    // and the output the SAME extension -- the exact condition that made
    // `position()` (first match) find the wrong one.
    fn args_with_shared_extension_source_and_output(source: &str, output: &str) -> Vec<String> {
        vec![
            "-f".to_string(),
            "rawvideo".to_string(),
            "-i".to_string(),
            "pipe:0".to_string(),
            "-i".to_string(),
            source.to_string(),
            "-c:v".to_string(),
            "libx264".to_string(),
            "-c:a".to_string(),
            "aac".to_string(),
            "-y".to_string(),
            output.to_string(),
        ]
    }

    #[test]
    fn find_output_arg_index_finds_the_real_output_even_when_source_shares_its_extension() {
        let args = args_with_shared_extension_source_and_output("source.mp4", "output.mp4");
        let idx = find_output_arg_index(&args, "output.mp4");
        assert_eq!(
            idx,
            Some(args.len() - 1),
            "must match the output path itself, not the earlier source -i argument with the same extension"
        );
    }

    #[test]
    fn find_output_arg_index_is_immune_to_extensions_missing_from_any_allow_list() {
        // .avi was never in any of the old hardcoded extension lists (some
        // had .mp4/.mov/.mkv, some added .webm) -- exact-identity matching
        // needs no allow-list at all.
        let args = args_with_shared_extension_source_and_output("source.mp4", "output.avi");
        let idx = find_output_arg_index(&args, "output.avi");
        assert_eq!(idx, Some(args.len() - 1));
    }

    #[test]
    fn text_watermark_inserts_before_the_real_output_not_the_shared_extension_source() {
        // Regression test for the live bug: watermark + include_audio on a
        // source that shares the output's extension used to splice "-vf"
        // between "-i" and the source filename, corrupting that input pair.
        let args = args_with_shared_extension_source_and_output("source.mp4", "output.mp4");
        let wm = text_watermark("hello");
        let result = apply_watermark_args(args, &wm, "output.mp4");

        let vf_idx = result
            .iter()
            .position(|a| a == "-vf")
            .expect("-vf must be inserted");
        // The source "-i source.mp4" pair must be left completely intact and
        // untouched -- "-i" immediately followed by the literal source path,
        // nothing spliced between them.
        let source_i_idx = result
            .iter()
            .position(|a| a == "source.mp4")
            .expect("source path must still be present");
        assert_eq!(
            result[source_i_idx - 1],
            "-i",
            "the source input pair must stay adjacent -- got {:?} immediately before the source path",
            result[source_i_idx - 1]
        );
        // -vf must land before the real output path, not before the source.
        let output_idx = result
            .iter()
            .rposition(|a| a == "output.mp4")
            .expect("output path must still be present");
        assert!(
            vf_idx < output_idx,
            "-vf (at {vf_idx}) must be inserted before the output path (at {output_idx})"
        );
        assert!(
            vf_idx > source_i_idx,
            "-vf (at {vf_idx}) must not be spliced before/into the source -i pair (source path at {source_i_idx})"
        );
    }

    #[test]
    fn font_path_with_a_comma_is_escaped_so_it_cannot_inject_an_extra_filter() {
        // FFmpeg's filtergraph syntax treats an unescaped comma as a filter
        // separator even inside one -vf argument string. A font_path
        // containing a comma must not be able to splice a second filter in.
        let args = vec![
            "-f".to_string(),
            "rawvideo".to_string(),
            "-i".to_string(),
            "pipe:0".to_string(),
            "-c:v".to_string(),
            "libx264".to_string(),
            "-y".to_string(),
            "output.mp4".to_string(),
        ];
        let mut wm = text_watermark("hello");
        wm.font_path = Some("C:/fonts/evil.ttf,drawbox=0:0:10:10:red".to_string());
        let result = apply_watermark_args(args, &wm, "output.mp4");

        let vf_idx = result
            .iter()
            .position(|a| a == "-vf")
            .expect("-vf must be inserted");
        let filter_value = &result[vf_idx + 1];
        assert!(
            filter_value.contains("evil.ttf\\,drawbox"),
            "the comma in font_path must be backslash-escaped so FFmpeg treats it as a literal character, not a filter separator; got: {filter_value}"
        );
        assert!(
            !filter_value.contains("evil.ttf,drawbox"),
            "an unescaped comma would let font_path splice a second filter (drawbox) into the filtergraph; got: {filter_value}"
        );
    }

    #[test]
    fn image_watermark_map_fallback_still_maps_output_when_lookup_somehow_misses() {
        // args deliberately does NOT contain the literal output_path string,
        // simulating the "should be unreachable" case the fallback guards.
        let args = vec![
            "-i".to_string(),
            "pipe:0".to_string(),
            "-filter_complex".to_string(),
            "[0:v][1:v]overlay=0:0".to_string(),
        ];
        let wm = image_watermark("logo.png");
        let result = apply_watermark_args(args, &wm, "output.mp4");
        assert!(
            result.windows(2).any(|w| w[0] == "-map" && w[1] == "[out]"),
            "must still push a -map [out] fallback instead of silently dropping the mapping, got {result:?}"
        );
    }
}

#[cfg(test)]
mod image_to_video_tests {
    use super::*;

    #[test]
    fn validate_rejects_zero_or_negative_duration() {
        assert!(validate_still_animation_params(0.0, 30.0).is_err());
        assert!(validate_still_animation_params(-5.0, 30.0).is_err());
    }

    #[test]
    fn validate_rejects_zero_or_negative_fps() {
        assert!(validate_still_animation_params(5.0, 0.0).is_err());
        assert!(validate_still_animation_params(5.0, -1.0).is_err());
    }

    #[test]
    fn validate_rejects_non_finite_values() {
        assert!(validate_still_animation_params(f64::NAN, 30.0).is_err());
        assert!(validate_still_animation_params(f64::INFINITY, 30.0).is_err());
        assert!(validate_still_animation_params(5.0, f64::NAN).is_err());
        assert!(validate_still_animation_params(5.0, f64::INFINITY).is_err());
    }

    #[test]
    fn validate_passes_through_in_range_values_unchanged() {
        let (d, f) = validate_still_animation_params(5.0, 30.0)
            .expect("in-range duration/fps must be accepted");
        assert_eq!(d, 5.0);
        assert_eq!(f, 30.0);
    }

    #[test]
    fn validate_clamps_duration_and_fps_to_their_bounds_instead_of_rejecting() {
        // Deliberately way outside both bounds -- must clamp, not error, so
        // a slightly-too-enthusiastic UI value degrades gracefully instead
        // of failing the whole operation.
        let (d, f) = validate_still_animation_params(100_000.0, 100_000.0)
            .expect("out-of-range-but-positive values must be clamped, not rejected");
        assert_eq!(d, MAX_STILL_ANIMATION_DURATION_SECS);
        assert_eq!(f, MAX_STILL_ANIMATION_FPS);

        let (d, f) = validate_still_animation_params(0.0001, 0.0001)
            .expect("tiny-but-positive values must be clamped up to the floor, not rejected");
        assert_eq!(d, MIN_STILL_ANIMATION_DURATION_SECS);
        assert_eq!(f, MIN_STILL_ANIMATION_FPS);
    }

    #[test]
    fn build_args_includes_loop_duration_fps_and_output_path() {
        let args = build_image_to_video_args("in.png", 5.0, 30.0, 100, 100, "out.mp4");
        assert!(
            args.windows(2).any(|w| w[0] == "-loop" && w[1] == "1"),
            "must loop the single input frame: {args:?}"
        );
        assert!(
            args.windows(2).any(|w| w[0] == "-i" && w[1] == "in.png"),
            "must pass the source image as -i: {args:?}"
        );
        assert!(
            args.windows(2).any(|w| w[0] == "-t" && w[1] == "5"),
            "must cap output length with -t <duration>: {args:?}"
        );
        assert!(
            args.windows(2).any(|w| w[0] == "-r" && w[1] == "30"),
            "must set the output frame rate with -r <fps>: {args:?}"
        );
        assert!(
            args.windows(2)
                .any(|w| w[0] == "-pix_fmt" && w[1] == "yuv420p"),
            "must encode as yuv420p for broad player/codec compatibility: {args:?}"
        );
        assert_eq!(
            args.last().map(String::as_str),
            Some("out.mp4"),
            "the output path must be the final argument: {args:?}"
        );
    }

    #[test]
    fn build_args_omits_pad_filter_for_already_even_dimensions() {
        let args = build_image_to_video_args("in.png", 5.0, 30.0, 100, 200, "out.mp4");
        assert!(
            !args.iter().any(|a| a == "-vf"),
            "even width and height need no padding filter: {args:?}"
        );
    }

    #[test]
    fn build_args_adds_pad_filter_for_odd_width_or_height() {
        let odd_width = build_image_to_video_args("in.png", 5.0, 30.0, 101, 200, "out.mp4");
        let vf_idx = odd_width
            .iter()
            .position(|a| a == "-vf")
            .expect("odd width must trigger a pad filter to reach even dimensions");
        assert!(
            odd_width[vf_idx + 1].starts_with("pad="),
            "the -vf value must be a pad filter: {:?}",
            odd_width[vf_idx + 1]
        );

        let odd_height = build_image_to_video_args("in.png", 5.0, 30.0, 100, 201, "out.mp4");
        assert!(
            odd_height.iter().any(|a| a == "-vf"),
            "odd height must also trigger a pad filter: {odd_height:?}"
        );
    }

    #[test]
    fn animated_still_filename_differs_for_different_source_paths_with_the_same_stem() {
        let a = build_animated_still_filename("C:/folderA/photo.jpg", 5.0, 30.0);
        let b = build_animated_still_filename("C:/folderB/photo.jpg", 5.0, 30.0);
        assert_ne!(
            a, b,
            "two different images that merely share a file stem must not collide on the same output filename"
        );
    }

    #[test]
    fn animated_still_filename_is_deterministic_for_the_same_source_and_params() {
        let a = build_animated_still_filename("C:/folder/photo.jpg", 5.0, 30.0);
        let b = build_animated_still_filename("C:/folder/photo.jpg", 5.0, 30.0);
        assert_eq!(
            a, b,
            "repeat calls with the same source+params should reuse the same filename (bounded, not accumulating)"
        );
    }

    #[test]
    fn animated_still_filename_differs_for_different_params_on_the_same_source() {
        let a = build_animated_still_filename("C:/folder/photo.jpg", 5.0, 30.0);
        let b = build_animated_still_filename("C:/folder/photo.jpg", 10.0, 30.0);
        assert_ne!(
            a, b,
            "different duration/fps on the same source must not collide on the same output filename"
        );
    }
}

#[cfg(test)]
mod temp_file_guard_tests {
    use super::*;

    #[test]
    fn drop_removes_the_file_while_still_armed() {
        let path = std::env::temp_dir().join("moshdither_test_temp_file_guard_armed.txt");
        std::fs::write(&path, b"partial encode").expect("failed to write test fixture");
        {
            let _guard = TempFileGuard::new(path.clone());
            assert!(
                path.exists(),
                "fixture should exist while the guard is alive"
            );
        }
        assert!(
            !path.exists(),
            "an armed guard must delete its file on drop -- this is what protects a cancelled/timed-out/failed export from leaving a stray temp file behind"
        );
    }

    #[test]
    fn disarm_prevents_deletion_on_drop() {
        let path = std::env::temp_dir().join("moshdither_test_temp_file_guard_disarmed.txt");
        std::fs::write(&path, b"finished encode").expect("failed to write test fixture");
        {
            let mut guard = TempFileGuard::new(path.clone());
            guard.disarm();
        }
        assert!(
            path.exists(),
            "a disarmed guard must NOT delete its file on drop -- this is what lets a successfully renamed export survive"
        );
        let _ = std::fs::remove_file(&path);
    }

    #[test]
    fn drop_does_not_panic_when_the_file_is_already_gone() {
        // Mirrors the real success path: the temp file gets renamed away
        // (moved) before the guard drops. Even without an explicit disarm,
        // a missing file must not panic -- remove_file's error is swallowed.
        let path = std::env::temp_dir().join("moshdither_test_temp_file_guard_missing.txt");
        let _ = std::fs::remove_file(&path); // ensure it doesn't exist
        drop(TempFileGuard::new(path));
    }
}
