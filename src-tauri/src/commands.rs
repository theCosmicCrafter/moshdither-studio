#![allow(clippy::too_many_arguments)]

use crate::effects::{
    blend_mask, functional_tests::run_all_function_tests, verification::verify_all_effects, Effect,
    EffectCategory, EffectMeta, EffectRegistry, Frame, Mask,
};
use crate::ffmpeg::{
    decode_video, encode_video, extract_audio_to_wav, ffedit_binary, ffgac_binary, ffmpeg_binary,
    generate_proxy, has_audio_stream, image_to_video, probe_metadata,
};
use crate::path_guard::validate_io_path;
use crate::sam3_engine::Sam3Engine;
use crate::utils::image_io::{load_image, load_image_from_memory, save_image};
use image::ImageFormat;
use rayon::prelude::*;
use serde_json::json;
use std::io::Cursor;
use std::path::{Path, PathBuf};
use std::process::{Command, Stdio};
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::{Arc, Mutex};
use std::time::Duration;
use tauri::{Emitter, State};
use tauri_plugin_updater::UpdaterExt;

/// Maximum number of pixels kept in the in-memory preview frame. Very large
/// still images are downscaled on load so that preview/effect processing does
/// not consume unbounded RAM.
const MAX_PREVIEW_PIXELS: u64 = 32_000_000; // ~8K x 4K or 4K x 8K

/// Soft memory budget for the effect preview cache. Each cache entry stores a
/// full RGBA frame, so the cache is trimmed to stay under this limit.
const MAX_CACHE_BYTES: usize = 256 * 1024 * 1024; // 256 MiB

#[derive(Debug, Clone, serde::Deserialize, serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct WatermarkSettings {
    pub enabled: bool,
    pub watermark_type: String,
    pub text: String,
    pub image_path: Option<String>,
    pub position: String,
    pub font_size: u32,
    pub font_path: Option<String>,
    pub color: String,
    pub opacity: f64,
    pub scale: u32,
    pub rotation: u32,
}

pub struct CacheEntry {
    pub effect_id: String,
    pub params: serde_json::Map<String, serde_json::Value>,
    pub mask_b64: Option<String>,
    pub mask_mode: Option<String>,
    pub output_frame: Frame,
}

#[derive(Default)]
pub struct EffectCache {
    pub scale: Option<f32>,
    pub global_mask_b64: Option<String>,
    pub entries: Vec<CacheEntry>,
}

/// Global application state shared across commands.
pub struct AppState {
    pub registry: Arc<Mutex<EffectRegistry>>,
    pub current_frame: Mutex<Option<Frame>>,
    pub sam3: Mutex<Option<Sam3Engine>>,
    pub frame_cache: Mutex<EffectCache>,
    pub export_cancel: Arc<AtomicBool>,
    pub export_semaphore: Arc<tokio::sync::Semaphore>,
}

impl Default for AppState {
    fn default() -> Self {
        Self {
            registry: Arc::new(Mutex::new(EffectRegistry::new())),
            current_frame: Mutex::new(None),
            sam3: Mutex::new(None),
            frame_cache: Mutex::new(EffectCache::default()),
            export_cancel: Arc::new(AtomicBool::new(false)),
            export_semaphore: Arc::new(tokio::sync::Semaphore::new(1)),
        }
    }
}

/// Trim cached intermediate frames so the total byte size stays under budget.
/// Oldest entries are evicted first.
fn trim_cache_to_budget(entries: &mut Vec<CacheEntry>, budget: usize) {
    let mut total: usize = entries.iter().map(|e| e.output_frame.data.len()).sum();
    while total > budget && !entries.is_empty() {
        let removed = entries.remove(0);
        total = total.saturating_sub(removed.output_frame.data.len());
    }
}

/// Downscale a Frame so it fits within a pixel budget while preserving aspect ratio.
fn fit_to_preview_budget(frame: Frame) -> crate::error::Result<Frame> {
    let pixels = frame.width as u64 * frame.height as u64;
    if pixels <= MAX_PREVIEW_PIXELS {
        return Ok(frame);
    }
    let scale = (MAX_PREVIEW_PIXELS as f64 / pixels as f64).sqrt();
    let new_w = ((frame.width as f64 * scale) as u32).max(1);
    let new_h = ((frame.height as f64 * scale) as u32).max(1);
    let img =
        image::RgbaImage::from_raw(frame.width, frame.height, frame.data).ok_or_else(|| {
            crate::error::AppError::Generic("frame buffer does not match dimensions".to_string())
        })?;
    let resized =
        image::imageops::resize(&img, new_w, new_h, image::imageops::FilterType::Triangle);
    Ok(Frame {
        width: new_w,
        height: new_h,
        data: resized.into_raw(),
    })
}

/// Load an image or video file into the app.
#[tauri::command]
pub async fn load_media(
    state: State<'_, AppState>,
    path: String,
) -> std::result::Result<String, String> {
    let path_clone = path.clone();
    let frame =
        tauri::async_runtime::spawn_blocking(move || -> std::result::Result<Frame, String> {
            validate_io_path(&path_clone, true)?;

            let ext = Path::new(&path_clone)
                .extension()
                .and_then(|e| e.to_str())
                .unwrap_or("")
                .to_lowercase();

            let video_exts = [
                "mp4", "avi", "mov", "mkv", "webm", "m4v", "flv", "wmv", "mpeg", "mpg",
            ];

            let raw_frame = if video_exts.contains(&ext.as_str()) {
                // Decode first frame of video
                let segment = decode_video(&path_clone, Some(1)).map_err(|e| e.to_string())?;
                segment
                    .frames
                    .into_iter()
                    .next()
                    .ok_or("No frames decoded".to_string())?
            } else {
                load_image(&path_clone).map_err(|e| e.to_string())?
            };

            // Keep the in-memory preview frame within a sane pixel budget so that
            // giant stills do not blow up RAM and the effect cache.
            fit_to_preview_budget(raw_frame).map_err(|e| e.to_string())
        })
        .await
        .map_err(|e| format!("Task failed: {}", e))??;

    *state
        .current_frame
        .lock()
        .map_err(|e| format!("frame lock poisoned: {e}"))? = Some(frame);
    *state
        .frame_cache
        .lock()
        .map_err(|e| format!("cache lock poisoned: {e}"))? = EffectCache::default();
    Ok(path)
}

/// Load an image from a base64 data URL into the app.
#[tauri::command]
pub async fn load_media_from_base64(
    state: State<'_, AppState>,
    data_url: String,
) -> std::result::Result<String, String> {
    const MAX_BASE64_INPUT_LEN: usize = 100 * 1024 * 1024;
    if data_url.len() > MAX_BASE64_INPUT_LEN {
        return Err(format!(
            "Input too large: {} chars (max {} chars)",
            data_url.len(),
            MAX_BASE64_INPUT_LEN
        ));
    }

    let bytes = tauri::async_runtime::spawn_blocking(move || {
        let base64_part = if let Some(idx) = data_url.find(',') {
            &data_url[idx + 1..]
        } else {
            &data_url
        };
        base64::Engine::decode(&base64::engine::general_purpose::STANDARD, base64_part)
            .map_err(|e| format!("Invalid base64: {}", e))
    })
    .await
    .map_err(|e| format!("Task failed: {}", e))??;

    let frame = tauri::async_runtime::spawn_blocking(move || {
        load_image_from_memory(&bytes).map_err(|e| e.to_string())
    })
    .await
    .map_err(|e| format!("Task failed: {}", e))??;

    *state
        .current_frame
        .lock()
        .map_err(|e| format!("frame lock poisoned: {e}"))? = Some(frame);
    *state
        .frame_cache
        .lock()
        .map_err(|e| format!("cache lock poisoned: {e}"))? = EffectCache::default();
    Ok("loaded".to_string())
}

/// Get metadata for all available effects.
#[tauri::command]
pub fn list_effects(state: State<'_, AppState>) -> std::result::Result<Vec<EffectMeta>, String> {
    let registry = state
        .registry
        .lock()
        .map_err(|e| format!("registry lock poisoned: {e}"))?;
    Ok(registry.list())
}

/// Get effects filtered by category.
#[tauri::command]
pub fn list_effects_by_category(
    state: State<'_, AppState>,
    category: EffectCategory,
) -> std::result::Result<Vec<EffectMeta>, String> {
    let registry = state
        .registry
        .lock()
        .map_err(|e| format!("registry lock poisoned: {e}"))?;
    Ok(registry.list_by_category(category))
}

/// Run the full effect verification suite.
/// Checks every registered effect for: no-crash, non-empty output,
/// animation, and mask correctness (inside/outside modes).
/// Returns a structured JSON report.
#[tauri::command]
pub fn verify_effects(
    state: State<'_, AppState>,
) -> std::result::Result<crate::effects::verification::VerificationReport, String> {
    let registry = state
        .registry
        .lock()
        .map_err(|e| format!("registry lock poisoned: {e}"))?;
    Ok(verify_all_effects(&registry))
}

/// Run the full functional test suite.
/// Tests all major pipeline functions: image I/O, effect application,
/// stack chaining, mask blending, animation, FFmpeg, FFglitch, SAM3.
#[tauri::command]
pub fn test_all_functions(
) -> std::result::Result<crate::effects::functional_tests::FunctionTestReport, String> {
    Ok(run_all_function_tests())
}

fn decode_mask_b64(
    mask_b64: Option<&str>,
) -> std::result::Result<Option<crate::effects::Mask>, String> {
    let Some(b64) = mask_b64 else {
        return Ok(None);
    };
    let b64 = b64.trim_start_matches("data:image/png;base64,");
    let bytes = base64::Engine::decode(&base64::engine::general_purpose::STANDARD, b64)
        .map_err(|e| format!("Invalid mask base64: {}", e))?;
    let mask_img = image::load_from_memory_with_format(&bytes, ImageFormat::Png)
        .map_err(|e| format!("Invalid mask image: {}", e))?;
    let gray = mask_img.to_luma8();
    let (w, h) = gray.dimensions();
    Ok(Some(crate::effects::Mask {
        width: w,
        height: h,
        data: gray.into_raw(),
    }))
}

/// True when `effect` doesn't already blend the mask into `process_frame`
/// itself and a mask was actually supplied — i.e. the caller must save a
/// pre-effect copy of the frame and blend it in afterward.
fn needs_mask_blend(effect: &dyn Effect, mask: Option<&Mask>) -> bool {
    !effect.handles_masking() && mask.is_some()
}

/// Run one effect over a single frame, then apply the post-process mask
/// blend for effects that don't already handle masking internally
/// (mirrors the doubled-masking guard documented on `Effect::handles_masking`).
/// `mode` is the blend mode ("inside"/"outside"/"alpha"); pass "inside" for
/// call sites that don't expose a per-call mask mode.
fn process_frame_with_mask(
    effect: &dyn Effect,
    working: &Frame,
    mask: Option<&Mask>,
    params: &serde_json::Map<String, serde_json::Value>,
    mode: &str,
) -> std::result::Result<Frame, String> {
    let blend_needed = needs_mask_blend(effect, mask);
    let previous = if blend_needed {
        Some(working.clone())
    } else {
        None
    };

    let clamped_params = crate::effects::clamp_for_effect(effect, params);
    let mut result = effect
        .process_frame(working, mask, &clamped_params)
        .map_err(|e| e.to_string())?;

    if blend_needed {
        if let (Some(previous), Some(m)) = (previous.as_ref(), mask) {
            blend_mask(&mut result, previous, m, mode).map_err(|e| e.to_string())?;
        }
    }

    Ok(result)
}

#[derive(serde::Deserialize)]
pub struct EffectCall {
    pub effect_id: String,
    pub params: serde_json::Map<String, serde_json::Value>,
    pub mask_b64: Option<String>,
    #[serde(default)]
    pub mask_mode: Option<String>,
    /// Animated parameters, keyed by parameter id.
    ///
    /// The UI has offered a keyframe diamond on every numeric parameter for
    /// a long time, and the preview honoured them -- but the export payload
    /// carried one static params map per effect, so the rendered file froze
    /// every animated parameter at whatever the playhead happened to hold
    /// when Export was clicked. The animation was visible and unexportable.
    #[serde(default)]
    pub keyframes: Option<std::collections::HashMap<String, Vec<KeyframePoint>>>,
}

/// One keyframe, as the frontend stores it (`src/store/index.ts`).
#[derive(Debug, Clone, serde::Deserialize)]
pub struct KeyframePoint {
    pub time: f64,
    pub value: f64,
    #[serde(default)]
    pub easing: Option<String>,
}

/// Mirror of `applyEasing` in `src/store/index.ts`. The two must agree or
/// the exported file will not match the preview the user approved.
fn apply_easing(t: f64, easing: &str) -> f64 {
    if easing == "hold" {
        return 0.0;
    }
    let tc = if t.is_nan() { 0.0 } else { t.clamp(0.0, 1.0) };
    match easing {
        "easeIn" => tc * tc,
        "easeOut" => 1.0 - (1.0 - tc) * (1.0 - tc),
        "easeInOut" => {
            if tc < 0.5 {
                2.0 * tc * tc
            } else {
                1.0 - (-2.0 * tc + 2.0).powi(2) / 2.0
            }
        }
        // "linear" and anything unrecognised
        _ => tc,
    }
}

/// Value of one animated parameter at `time`, or None if the track is empty.
///
/// Mirror of `getKeyframeValue` in the store: hold before the first key and
/// after the last, interpolate between neighbours with the LEFT key's easing.
fn keyframe_value_at(track: &[KeyframePoint], time: f64) -> Option<f64> {
    if track.is_empty() {
        return None;
    }
    // The frontend keeps tracks sorted by time; do not assume it.
    let mut idx = 0usize;
    while idx < track.len() && track[idx].time < time {
        idx += 1;
    }
    if idx < track.len() && (track[idx].time - time).abs() < f64::EPSILON {
        return Some(track[idx].value);
    }
    if idx == 0 {
        return Some(track[0].value);
    }
    if idx >= track.len() {
        return Some(track[track.len() - 1].value);
    }
    let k1 = &track[idx - 1];
    let k2 = &track[idx];
    let span = k2.time - k1.time;
    if span <= 0.0 {
        return Some(k2.value);
    }
    let eased = apply_easing(
        (time - k1.time) / span,
        k1.easing.as_deref().unwrap_or("linear"),
    );
    Some(k1.value + (k2.value - k1.value) * eased)
}

/// Overwrite animated parameters with their value at `time`.
fn inject_keyframe_params(
    keyframes: Option<&std::collections::HashMap<String, Vec<KeyframePoint>>>,
    params: &mut serde_json::Map<String, serde_json::Value>,
    time: f64,
) -> bool {
    let Some(tracks) = keyframes else {
        return false;
    };
    let mut touched = false;
    for (param_id, track) in tracks {
        if let Some(v) = keyframe_value_at(track, time) {
            params.insert(param_id.clone(), serde_json::Value::from(v));
            touched = true;
        }
    }
    touched
}

/// Compares two effect-call params maps for cache-hit purposes. Effects
/// that don't read the implicit `time` value the frontend injects into
/// every effect's params during playback (see `Effect::uses_time_param`)
/// ignore that key entirely -- otherwise `time` genuinely changing every
/// frame would defeat this cache for every effect in the stack, including
/// perfectly static ones like a fixed Bayer dither, on every single
/// playback tick.
fn params_match_for_cache(
    effect: &dyn Effect,
    cached: &serde_json::Map<String, serde_json::Value>,
    incoming: &serde_json::Map<String, serde_json::Value>,
) -> bool {
    if effect.uses_time_param() {
        return cached == incoming;
    }
    let strip_time = |m: &serde_json::Map<String, serde_json::Value>| -> serde_json::Map<String, serde_json::Value> {
        m.iter()
            .filter(|(k, _)| k.as_str() != "time")
            .map(|(k, v)| (k.clone(), v.clone()))
            .collect()
    };
    strip_time(cached) == strip_time(incoming)
}

/// Apply a stack of effects to the currently loaded image.
/// If `preview_scale` is provided (0.0–1.0), the image is downscaled before
/// processing and upscaled after, for faster interactive preview.
#[tauri::command]
pub fn apply_effect_stack(
    state: State<'_, AppState>,
    stack: Vec<EffectCall>,
    mask_b64: Option<String>,
    preview_scale: Option<f32>,
) -> std::result::Result<String, String> {
    let frame_lock = state
        .current_frame
        .lock()
        .map_err(|e| format!("frame lock poisoned: {e}"))?;
    let original = frame_lock.as_ref().ok_or("No media loaded")?.clone();
    drop(frame_lock);

    // Downscale for preview if requested
    let (orig_w, orig_h) = (original.width, original.height);
    let scaled = if let Some(scale) = preview_scale {
        scale < 0.99 && scale > 0.01
    } else {
        false
    };
    let mut working = if scaled {
        downscale_frame(original, preview_scale.unwrap())?
    } else {
        original
    };

    // Decode masks — no need to downscale; blend_mask and process_frame
    // already handle dimension mismatches via nearest-neighbor sampling.
    let global_mask = decode_mask_b64(mask_b64.as_deref())?;

    let registry = state
        .registry
        .lock()
        .map_err(|e| format!("registry lock poisoned: {e}"))?;
    let mut use_cache = true;
    let mut new_cache = Vec::new();

    // Check if scale or global mask changed
    {
        let cache_lock = state
            .frame_cache
            .lock()
            .map_err(|e| format!("cache lock poisoned: {e}"))?;
        if cache_lock.scale != preview_scale || cache_lock.global_mask_b64 != mask_b64 {
            use_cache = false;
        }
    }

    for (i, call) in stack.into_iter().enumerate() {
        let effect = registry
            .get(&call.effect_id)
            .ok_or_else(|| format!("Effect '{}' not found", call.effect_id))?;

        if use_cache {
            let cache_lock = state
                .frame_cache
                .lock()
                .map_err(|e| format!("cache lock poisoned: {e}"))?;
            if i < cache_lock.entries.len() {
                let entry = &cache_lock.entries[i];
                if entry.effect_id == call.effect_id
                    && params_match_for_cache(effect, &entry.params, &call.params)
                    && entry.mask_b64 == call.mask_b64
                    && entry.mask_mode == call.mask_mode
                {
                    working = entry.output_frame.clone();
                    new_cache.push(CacheEntry {
                        effect_id: call.effect_id.clone(),
                        params: call.params.clone(),
                        mask_b64: call.mask_b64.clone(),
                        mask_mode: call.mask_mode.clone(),
                        output_frame: working.clone(),
                    });
                    continue;
                }
            }
        }

        use_cache = false;

        // Per-effect mask overrides global mask
        let per_effect_mask = if let Some(ref b64) = call.mask_b64 {
            decode_mask_b64(Some(b64.as_str()))?
        } else {
            None
        };
        let active_mask = per_effect_mask.as_ref().or(global_mask.as_ref());
        let mode = call.mask_mode.as_deref().unwrap_or("inside");
        working = process_frame_with_mask(effect, &working, active_mask, &call.params, mode)?;

        new_cache.push(CacheEntry {
            effect_id: call.effect_id.clone(),
            params: call.params.clone(),
            mask_b64: call.mask_b64.clone(),
            mask_mode: call.mask_mode.clone(),
            output_frame: working.clone(),
        });
    }

    // Update cache
    {
        let mut cache_lock = state
            .frame_cache
            .lock()
            .map_err(|e| format!("cache lock poisoned: {e}"))?;
        cache_lock.scale = preview_scale;
        cache_lock.global_mask_b64 = mask_b64;
        cache_lock.entries = new_cache;
        trim_cache_to_budget(&mut cache_lock.entries, MAX_CACHE_BYTES);
    }

    // Upscale back to original resolution if we downscaled
    if working.width != orig_w || working.height != orig_h {
        working = upscale_frame(working, orig_w, orig_h)?;
    }

    let img = image::RgbaImage::from_raw(working.width, working.height, working.data)
        .ok_or("Invalid frame data after processing.")?;
    let mut buf = Cursor::new(Vec::new());
    img.write_to(&mut buf, ImageFormat::Png)
        .map_err(|e| e.to_string())?;

    let b64 = base64::Engine::encode(&base64::engine::general_purpose::STANDARD, buf.into_inner());
    Ok(format!("data:image/png;base64,{}", b64))
}

/// Downscale a Frame by a factor using simple box averaging (no external deps).
/// Returns an error if the frame's raw buffer does not match its declared dimensions.
fn downscale_frame(frame: Frame, scale: f32) -> std::result::Result<Frame, String> {
    let new_w = ((frame.width as f32 * scale) as u32).max(1);
    let new_h = ((frame.height as f32 * scale) as u32).max(1);
    let data_len = frame.data.len();
    let img =
        image::RgbaImage::from_raw(frame.width, frame.height, frame.data).ok_or_else(|| {
            format!(
                "downscale_frame: invalid frame buffer ({} bytes) for {}x{}",
                data_len, frame.width, frame.height
            )
        })?;
    let resized = image::imageops::resize(
        &img,
        new_w,
        new_h,
        image::imageops::FilterType::Triangle, // bilinear — fast and good enough for preview
    );
    Ok(Frame {
        width: new_w,
        height: new_h,
        data: resized.into_raw(),
    })
}

/// Upscale a Frame back to the target dimensions.
/// Returns an error if the frame's raw buffer does not match its declared dimensions.
fn upscale_frame(frame: Frame, target_w: u32, target_h: u32) -> std::result::Result<Frame, String> {
    let data_len = frame.data.len();
    let img =
        image::RgbaImage::from_raw(frame.width, frame.height, frame.data).ok_or_else(|| {
            format!(
                "upscale_frame: invalid frame buffer ({} bytes) for {}x{}",
                data_len, frame.width, frame.height
            )
        })?;
    let resized = image::imageops::resize(
        &img,
        target_w,
        target_h,
        image::imageops::FilterType::Lanczos3, // higher quality for final display
    );
    Ok(Frame {
        width: target_w,
        height: target_h,
        data: resized.into_raw(),
    })
}

/// Get the current frame as base64 PNG.
#[tauri::command]
pub fn get_frame_data(state: State<'_, AppState>) -> std::result::Result<String, String> {
    let frame_lock = state
        .current_frame
        .lock()
        .map_err(|e| format!("frame lock poisoned: {e}"))?;
    let frame = frame_lock.as_ref().ok_or("No media loaded")?;
    let img = image::RgbaImage::from_raw(frame.width, frame.height, frame.data.clone())
        .ok_or("Invalid frame data.")?;
    let mut buf = Cursor::new(Vec::new());
    img.write_to(&mut buf, ImageFormat::Png)
        .map_err(|e| e.to_string())?;

    let b64 = base64::Engine::encode(&base64::engine::general_purpose::STANDARD, buf.into_inner());
    Ok(format!("data:image/png;base64,{}", b64))
}

/// Save the current frame to disk.
/// Supports png, jpg/jpeg, bmp, tiff via the optional `format` parameter.
#[tauri::command]
pub fn save_media(
    state: State<'_, AppState>,
    path: String,
    format: Option<String>,
    quality: Option<u8>,
) -> std::result::Result<String, String> {
    validate_io_path(&path, false)?;
    let frame_lock = state
        .current_frame
        .lock()
        .map_err(|e| format!("frame lock poisoned: {e}"))?;
    let frame = frame_lock.as_ref().ok_or("No media loaded")?;
    save_image(frame, &path, format.as_deref(), quality).map_err(|e| e.to_string())?;
    Ok(path)
}

/// Runs `stack` over `frame` in order, applying each effect's own mask
/// (falling back to `global_mask`) via `process_frame_with_mask`. Used by
/// `save_processed_image`; deliberately not shared with `apply_effect_stack`,
/// which interleaves this same per-effect logic with preview-cache lookups
/// that a one-shot save has no use for.
fn apply_stack_to_frame(
    registry: &EffectRegistry,
    frame: Frame,
    stack: &[EffectCall],
    global_mask: Option<&Mask>,
) -> std::result::Result<Frame, String> {
    let mut working = frame;
    for call in stack {
        let effect = registry
            .get(&call.effect_id)
            .ok_or_else(|| format!("Effect '{}' not found", call.effect_id))?;
        let per_effect_mask = if let Some(ref b64) = call.mask_b64 {
            decode_mask_b64(Some(b64.as_str()))?
        } else {
            None
        };
        let active_mask = per_effect_mask.as_ref().or(global_mask);
        let mode = call.mask_mode.as_deref().unwrap_or("inside");
        working = process_frame_with_mask(effect, &working, active_mask, &call.params, mode)?;
    }
    Ok(working)
}

/// Apply the effect stack to the currently loaded frame and save the result
/// to disk as a still image. Writes straight to a file instead of returning
/// a preview data URL, and does not touch the interactive-preview cache --
/// `apply_effect_stack` itself never persists its processed result anywhere
/// (it only returns a base64 PNG for the preview), so `save_media` alone
/// could only ever save the original, unprocessed frame.
#[tauri::command]
pub fn save_processed_image(
    state: State<'_, AppState>,
    stack: Vec<EffectCall>,
    mask_b64: Option<String>,
    path: String,
    format: Option<String>,
    quality: Option<u8>,
) -> std::result::Result<String, String> {
    validate_io_path(&path, false)?;

    let frame_lock = state
        .current_frame
        .lock()
        .map_err(|e| format!("frame lock poisoned: {e}"))?;
    let frame = frame_lock.as_ref().ok_or("No media loaded")?.clone();
    drop(frame_lock);

    let global_mask = decode_mask_b64(mask_b64.as_deref())?;
    let registry = state
        .registry
        .lock()
        .map_err(|e| format!("registry lock poisoned: {e}"))?;
    let working = apply_stack_to_frame(&registry, frame, &stack, global_mask.as_ref())?;
    drop(registry);

    save_image(&working, &path, format.as_deref(), quality).map_err(|e| e.to_string())?;
    Ok(path)
}

/// Export a video by decoding, applying the effect stack, and re-encoding.
/// Audio-reactive effects receive per-frame audio params when `audio_bake_json` is provided.
/// Temporal effects (datamoshing) use `process_video` for cross-frame correctness.
/// Non-temporal effects are processed frame-by-frame with audio params injected.
///
/// `processing_scale`: optional max dimension (px) for the internal decode
/// and effect-processing pipeline. `None` means "auto" — the backend picks
/// the largest resolution that fits in the adaptive memory budget. The
/// final encode is scaled to `width`/`height` (or source dimensions if
/// unspecified) regardless of the processing scale, so a 4K export can
/// still process at 1080p internally and upscale on output.
/// Hard ceiling on frames in one export, whatever the duration box says.
///
/// 30 minutes at 60 fps. The animation-length control clamps to 120 s, but the
/// transport's duration box does not, and it is what an export without an out
/// point uses -- so a typo of 12000 in that box asked for 360 000 frames.
const MAX_EXPORT_FRAMES: usize = 108_000;

#[tauri::command]
pub async fn export_video(
    state: State<'_, AppState>,
    app_handle: tauri::AppHandle,
    source_path: String,
    output_path: String,
    stack: Vec<EffectCall>,
    mask_b64: Option<String>,
    codec: Option<String>,
    fps: Option<f64>,
    width: Option<u32>,
    height: Option<u32>,
    audio_bake_json: Option<String>,
    watermark: Option<WatermarkSettings>,
    trim_start: Option<f64>,
    trim_end: Option<f64>,
    format: Option<String>,
    quality: Option<String>,
    include_audio: Option<bool>,
    processing_scale: Option<usize>,
) -> std::result::Result<String, String> {
    // Logged BEFORE validation, which is the first thing that can fail. A
    // missing source returned here with no trace at all: the log showed a clean
    // startup and nothing else, so an export that died on its first line looked
    // identical to an export that was never attempted.
    tracing::info!("export_video requested: source={source_path} output={output_path}");
    let validated_source = validate_io_path(&source_path, true).inspect_err(|e| {
        tracing::error!("export_video rejected source {source_path}: {e}");
    })?;
    let validated_output = validate_io_path(&output_path, false).inspect_err(|e| {
        tracing::error!("export_video rejected output {output_path}: {e}");
    })?;
    let registry = state.registry.clone();
    let cancel = state.export_cancel.clone();

    let source_path = validated_source.to_string_lossy().into_owned();
    let output_path = validated_output.to_string_lossy().into_owned();

    // Watermark image/font paths are also frontend-supplied file paths fed
    // straight to FFmpeg as -i / fontfile= inputs -- validate them the same
    // way as source_path/output_path so a compromised renderer (or a
    // malicious .moshdither preset) can't smuggle a UNC path or an
    // unexpected local file through the watermark fields instead.
    let watermark = watermark
        .map(|mut wm| -> std::result::Result<WatermarkSettings, String> {
            if wm.enabled {
                if let Some(p) = &wm.image_path {
                    wm.image_path = Some(validate_io_path(p, true)?.to_string_lossy().into_owned());
                }
                if let Some(p) = &wm.font_path {
                    wm.font_path = Some(validate_io_path(p, true)?.to_string_lossy().into_owned());
                }
            }
            Ok(wm)
        })
        .transpose()?;

    // Serialize expensive exports (this and apply_ffglitch both share one
    // export_cancel AtomicBool) so only one runs at a time. The permit is
    // acquired BEFORE resetting the shared cancel flag -- export_video and
    // apply_ffglitch share that flag, so resetting it while another
    // export-like operation is still running (or queued ahead of us) could
    // silently un-cancel that other job.
    let permit = state
        .export_semaphore
        .clone()
        .acquire_owned()
        .await
        .map_err(|e| format!("Export queue error: {}", e))?;
    cancel.store(false, Ordering::Relaxed);

    tauri::async_runtime::spawn_blocking(move || {
        let _permit = permit;
        export_video_blocking(
            registry,
            app_handle,
            source_path,
            output_path,
            stack,
            mask_b64,
            codec,
            fps,
            width,
            height,
            audio_bake_json,
            watermark,
            trim_start,
            trim_end,
            format,
            quality,
            include_audio,
            processing_scale,
            cancel,
        )
    })
    .await
    .map_err(|e| format!("Export task failed: {}", e))?
}

fn export_video_blocking(
    registry: Arc<Mutex<EffectRegistry>>,
    app_handle: tauri::AppHandle,
    source_path: String,
    output_path: String,
    stack: Vec<EffectCall>,
    mask_b64: Option<String>,
    codec: Option<String>,
    fps: Option<f64>,
    width: Option<u32>,
    height: Option<u32>,
    audio_bake_json: Option<String>,
    watermark: Option<WatermarkSettings>,
    trim_start: Option<f64>,
    trim_end: Option<f64>,
    format: Option<String>,
    quality: Option<String>,
    include_audio: Option<bool>,
    processing_scale: Option<usize>,
    cancel: Arc<AtomicBool>,
) -> std::result::Result<String, String> {
    // Parse optional trim suffix from output filename (e.g. name_trim_0.5-2.3.mp4)
    let (mut trim_start, mut trim_end) = (trim_start, trim_end);
    if trim_start.is_none() && trim_end.is_none() {
        if let Some(stem) = std::path::Path::new(&output_path)
            .file_stem()
            .and_then(|s| s.to_str())
        {
            if let Some(idx) = stem.rfind("_trim_") {
                let range = &stem[idx + 6..];
                let parts: Vec<&str> = range.split('-').collect();
                if parts.len() == 2 {
                    if let Ok(s) = parts[0].parse::<f64>() {
                        trim_start = Some(s);
                    }
                    if let Ok(e) = parts[1].parse::<f64>() {
                        trim_end = Some(e);
                    }
                }
            }
        }
    }

    // Plan the decode: pick a processing scale that fits the adaptive
    // memory budget. This runs BEFORE decode so we don't silently truncate.
    // `processing_scale = None` means "auto" — the backend picks the
    // largest resolution that fits. `Some(n)` means the user explicitly
    // chose n px on the longest side.
    tracing::info!(
        "Planning export decode for source: {} (preferred scale: {:?})",
        source_path,
        processing_scale
    );
    let _ = app_handle.emit(
        "export-progress",
        serde_json::json!({"stage": "planning", "progress": 0}),
    );
    // A still image is decoded as ONE frame and then multiplied to fill the
    // requested duration, so the memory plan has to be made against the count
    // it will become. See plan_decode_for_frames.
    let still_target_frames = if crate::ffmpeg::probe_frame_count(&source_path).unwrap_or(0) <= 1 {
        let n = (trim_end.unwrap_or(10.0).max(0.0) * fps.unwrap_or(30.0)).round();
        Some((n.max(1.0) as usize).min(MAX_EXPORT_FRAMES))
    } else {
        None
    };
    let (decode_scale, budget_bytes) = match still_target_frames {
        Some(n) => crate::ffmpeg::plan_decode_for_frames(&source_path, processing_scale, n),
        None => crate::ffmpeg::plan_decode(&source_path, processing_scale),
    }
    .map_err(|e| e.to_string())?;
    let budget_mb = budget_bytes as f64 / (1024.0 * 1024.0);
    tracing::info!(
        "Export decode plan: scale={:?}, memory budget={:.0} MB",
        decode_scale,
        budget_mb
    );
    if let Some(s) = decode_scale {
        let message = format!(
            "Source exceeds memory budget at native resolution; \
             processing at {}p. Final encode will scale to target dimensions.",
            s
        );
        tracing::warn!("{}", message);
        let _ = app_handle.emit(
            "export-progress",
            serde_json::json!({
                "stage": "planning",
                "progress": 0,
                "warning": message,
                "downscaled_to": s
            }),
        );
    }

    // Decode the full source video
    tracing::info!("Decoding export source: {}", source_path);
    let _ = app_handle.emit(
        "export-progress",
        serde_json::json!({"stage": "decoding", "progress": 0}),
    );
    let mut segment = crate::ffmpeg::decode_video_with_options(&source_path, None, decode_scale)
        .map_err(|e| e.to_string())?;
    tracing::info!(
        "Decoded {} frames, {}x{}, fps={}",
        segment.frames.len(),
        segment.frames.first().map(|f| f.width).unwrap_or(0),
        segment.frames.first().map(|f| f.height).unwrap_or(0),
        segment.fps
    );

    // Post-decode memory report. The budget is already enforced inside
    // decode_video_with_options (it truncates frame count to fit), so this
    // is informational only — but we still warn loudly if the clip was
    // truncated so the user knows to lower the processing scale or trim.
    if let Some(first) = segment.frames.first() {
        let frame_mb = (first.data.len() as f64) / (1024.0 * 1024.0);
        let total_mb = frame_mb * segment.frames.len() as f64;
        tracing::debug!(
            "Export memory estimate: {:.1} MB per frame, {:.1} MB total for {} frames (budget {:.0} MB)",
            frame_mb,
            total_mb,
            segment.frames.len(),
            budget_mb
        );
        if total_mb > budget_mb * 0.95 {
            tracing::warn!(
                "Export decode used >=95% of memory budget. If the clip \
                 was truncated, lower the processing resolution or trim the range."
            );
        }
    }

    // Say so when the clip came back short. The decode caps frames to fit the
    // budget and logged a tracing::warn about it -- which no user ever sees, so
    // a five-minute source silently exported as four and the file just ended.
    if still_target_frames.is_none() {
        let probed = crate::ffmpeg::probe_frame_count(&source_path).unwrap_or(0);
        let decoded = segment.frames.len();
        // 2% slack: the probe is duration x fps, which is an estimate.
        if probed > 0 && decoded > 0 && (decoded as f64) < (probed as f64) * 0.98 {
            let secs = decoded as f64 / (segment.fps as f64).max(1.0);
            let message = format!(
                "This clip is too long to process at this resolution: exporting the \
                 first {:.0}s of it. Lower the processing resolution in Export \
                 settings, or set an in/out range, to cover the whole clip.",
                secs
            );
            tracing::warn!("{}", message);
            let _ = app_handle.emit(
                "export-progress",
                serde_json::json!({
                    "stage": "decoding",
                    "progress": 0,
                    "warning": message
                }),
            );
        }
    }

    // If the source is a still image (1 frame), duplicate it to fill the desired
    // duration.
    //
    // Bounded twice. The decode plan above already picked a resolution at which
    // the whole duration fits, but a user who forces a processing scale bypasses
    // that, and the duration box has no upper limit -- so the clone itself is
    // capped against the same budget here. Unbounded, this was the export crash:
    // `vec![single; 300]` of a 48 MB frame is 14.6 GB, and a failed Rust
    // allocation ABORTS rather than panicking, so nothing reached the log.
    if segment.frames.len() == 1 {
        let effective_fps = fps.unwrap_or(30.0);
        let target_duration = trim_end.unwrap_or(10.0);
        let requested_frames =
            ((target_duration * effective_fps).round().max(1.0) as usize).min(MAX_EXPORT_FRAMES);
        let frame_bytes = segment.frames[0].data.len().max(1);
        // Half the budget: the effects stage collects a second copy of the whole
        // sequence per non-temporal effect (see the rayon collect below), so the
        // decoded Vec must leave room for one more of itself.
        let max_by_budget = (((budget_bytes / 2) as usize) / frame_bytes).max(1);
        let target_frames = requested_frames.min(max_by_budget);
        if target_frames < requested_frames {
            let secs = target_frames as f64 / effective_fps.max(1.0);
            let message = format!(
                "This image is too large to animate for {:.1}s at its full size. \
                 Exporting {:.1}s instead -- lower the processing resolution in \
                 Export settings, or shorten the animation, to get the full length.",
                target_duration, secs
            );
            tracing::warn!("{}", message);
            let _ = app_handle.emit(
                "export-progress",
                serde_json::json!({
                    "stage": "decoding",
                    "progress": 0,
                    "warning": message
                }),
            );
        }
        if target_frames > 1 {
            let single = segment.frames[0].clone();
            segment.frames = vec![single; target_frames];
            segment.fps = effective_fps;
        }
    }

    // Trim frames by in/out points (seconds)
    if trim_start.is_some() || trim_end.is_some() {
        let fps = segment.fps as f64;
        let total_frames = segment.frames.len();
        let start_frame = trim_start
            .map(|s| (s.max(0.0) * fps).min(total_frames as f64) as usize)
            .unwrap_or(0);
        let end_frame = trim_end
            .map(|e| (e.max(0.0) * fps).min(total_frames as f64) as usize)
            .unwrap_or(total_frames)
            .max(start_frame);
        let frames = std::mem::take(&mut segment.frames);
        segment.frames = frames
            .into_iter()
            .skip(start_frame)
            .take(end_frame - start_frame)
            .collect();
        if segment.frames.is_empty() {
            return Err("Trim range resulted in no frames".to_string());
        }
    }

    // Resolution override is now handled by FFmpeg -vf scale in encode_video

    let global_mask = decode_mask_b64(mask_b64.as_deref())?;

    // Deserialize audio bake data if provided
    let audio_data: Option<crate::audio::AudioBakeData> =
        audio_bake_json.and_then(|json| serde_json::from_str(&json).ok());

    // Apply the effect stack
    tracing::info!("Applying {} effects for export", stack.len());
    let _ = app_handle.emit(
        "export-progress",
        serde_json::json!({"stage": "effects", "progress": 5, "total": stack.len(), "current": 0}),
    );
    let registry = registry
        .lock()
        .map_err(|e| format!("registry lock poisoned: {e}"))?;
    for (effect_idx, call) in stack.iter().enumerate() {
        let effect = registry
            .get(&call.effect_id)
            .ok_or_else(|| format!("Effect '{}' not found", call.effect_id))?;
        tracing::debug!(
            "Export effect {}/{}: {} (temporal={})",
            effect_idx + 1,
            stack.len(),
            call.effect_id,
            effect.is_temporal()
        );

        // Clamp parameters to declared min/max before any processing.
        let params = crate::effects::clamp_for_effect(effect, &call.params);

        // Per-effect mask overrides global mask
        let per_effect_mask = if let Some(ref b64) = call.mask_b64 {
            decode_mask_b64(Some(b64.as_str()))?
        } else {
            None
        };
        let active_mask = per_effect_mask.as_ref().or(global_mask.as_ref());

        // Check if mask blending is needed (avoids expensive clone)
        let needs_mask_blend = !effect.handles_masking() && active_mask.is_some();

        // Store previous frames only if needed for mask blending
        let previous_frames: Option<Vec<crate::effects::Frame>> = if needs_mask_blend {
            Some(segment.frames.clone())
        } else {
            None
        };

        if effect.is_temporal() {
            // Temporal effects: must use sequential process_video for cross-frame correctness.
            // Per-frame audio injection is meaningless here -- the effect gets the
            // whole segment at once -- so hand it the beat timeline instead, which
            // is what lets a datamosh cut on the beat rather than on a clock.
            let mut temporal_params = params.clone();
            // A temporal effect is handed the whole segment at once, so it has
            // no per-frame parameter hook. Animated parameters take their value
            // at the START of the clip rather than being ignored outright.
            if inject_keyframe_params(call.keyframes.as_ref(), &mut temporal_params, 0.0) {
                temporal_params = crate::effects::clamp_for_effect(effect, &temporal_params);
            }
            if let Some(ref audio) = audio_data {
                audio.inject_timeline_params(&mut temporal_params);
            }
            segment = effect
                .process_video(&segment, active_mask, &temporal_params)
                .map_err(|e| e.to_string())?;
        } else if audio_data.is_none() {
            // Non-temporal, no audio: parallelize frame processing with rayon
            let mask_ref = active_mask;
            let params_ref = &params;
            let keyframes_ref = call.keyframes.as_ref();
            let fps_val = segment.fps;
            let results: std::result::Result<Vec<_>, _> = segment
                .frames
                .par_iter()
                .enumerate()
                .map(|(idx, frame)| {
                    let t = idx as f64 / fps_val;
                    let mut frame_params = params_ref.clone();
                    frame_params.insert("time".to_string(), serde_json::Value::from(t));
                    // Re-clamp after injection: the clamp above ran on the static
                    // map, and a keyframe can name any value the user dragged to.
                    if inject_keyframe_params(keyframes_ref, &mut frame_params, t) {
                        frame_params = crate::effects::clamp_for_effect(effect, &frame_params);
                    }
                    effect.process_frame(frame, mask_ref, &frame_params)
                })
                .collect();
            segment.frames = results.map_err(|e| e.to_string())?;
        } else {
            // Non-temporal with audio: process frame-by-frame with per-frame audio params
            let mut frames = Vec::with_capacity(segment.frames.len());
            let fps_val = segment.fps;
            for (frame_idx, frame) in segment.frames.iter().enumerate() {
                let t = frame_idx as f64 / fps_val;
                let mut frame_params = params.clone();
                frame_params.insert("time".to_string(), serde_json::Value::from(t));
                if inject_keyframe_params(call.keyframes.as_ref(), &mut frame_params, t) {
                    frame_params = crate::effects::clamp_for_effect(effect, &frame_params);
                }
                if let Some(ref audio) = audio_data {
                    audio.inject_params(&mut frame_params, frame_idx);
                }
                frames.push(
                    effect
                        .process_frame(frame, active_mask, &frame_params)
                        .map_err(|e| e.to_string())?,
                );
            }
            segment = crate::effects::VideoSegment {
                frames,
                fps: segment.fps,
            };
        }

        // Post-process mask blend for effects that don't handle masking internally
        if let (Some(prev), Some(m)) = (previous_frames, active_mask) {
            let mode = call.mask_mode.as_deref().unwrap_or("inside");
            tracing::debug!(
                "Blending mask (mode={}) for {} frames",
                mode,
                segment.frames.len()
            );
            segment
                .frames
                .par_iter_mut()
                .enumerate()
                .try_for_each(|(i, frame)| {
                    blend_mask(frame, &prev[i], m, mode).map_err(|e| e.to_string())
                })?;
        }

        tracing::debug!("Export effect {}/{} done", effect_idx + 1, stack.len());
        let pct = 5 + ((effect_idx + 1) as f64 / stack.len() as f64 * 80.0) as u32;
        let _ = app_handle.emit("export-progress", serde_json::json!({"stage": "effects", "progress": pct, "total": stack.len(), "current": effect_idx + 1}));
    }
    drop(registry);
    tracing::info!("All effects applied, proceeding to encode");
    let _ = app_handle.emit(
        "export-progress",
        serde_json::json!({"stage": "encoding", "progress": 90}),
    );

    // Determine codec: explicit codec > format-derived > default
    let codec_str = codec.as_deref().unwrap_or({
        match format.as_deref() {
            Some("webm") => "vp9",
            // gif / apng / webp / *_seq pick their own encoder in output_spec();
            // the value here is only a fallback for the video containers.
            _ => "libx264",
        }
    });

    // Muxing the source audio track is independent of whether an audio bake was
    // supplied. This previously read `include_audio && !has_audio_bake`, which
    // made the two mutually exclusive: a bake is only produced for
    // audio-reactive work, so exactly the exports that wanted the track lost it,
    // and no combination of settings could produce reactive visuals *and* audio.
    // The bake drives per-frame effect params; this only decides whether a
    // second input is mapped in at encode time.
    let effective_include_audio = include_audio.unwrap_or(false);

    // Cap a single encode at 30 minutes. This is generous for high-resolution
    // exports while preventing a hung FFmpeg process from blocking indefinitely.
    const ENCODE_TIMEOUT: Duration = Duration::from_secs(1800);

    encode_video(
        &segment,
        &output_path,
        codec_str,
        fps,
        watermark.as_ref(),
        Some(&source_path),
        quality.as_deref(),
        Some(effective_include_audio),
        trim_start,
        trim_end,
        width,
        height,
        Some(cancel.as_ref()),
        Some(ENCODE_TIMEOUT),
        format.as_deref(),
    )
    .map_err(|e| e.to_string())?;
    let _ = app_handle.emit(
        "export-progress",
        serde_json::json!({"stage": "done", "progress": 100}),
    );

    Ok(output_path)
}

/// Request cancellation of an in-progress export. The export command polls
/// this flag while feeding frames to FFmpeg and aborts early if it is set.
#[tauri::command]
pub fn cancel_export(state: State<'_, AppState>) -> std::result::Result<(), String> {
    state.export_cancel.store(true, Ordering::Relaxed);
    Ok(())
}

/// Get metadata for a media file.
#[tauri::command]
pub fn get_media_metadata(path: String) -> std::result::Result<serde_json::Value, String> {
    validate_io_path(&path, true)?;
    let meta = probe_metadata(&path).map_err(|e| e.to_string())?;
    Ok(json!(meta))
}

/// Extract the audio track from a loaded video to a temp WAV file.
///
/// Returns the path to the extracted WAV, or an error if the video has no
/// audio stream. The frontend uses this to auto-bake `AudioBakeData` for
/// audio-reactive effects when a video is loaded — matching the
/// TouchDesigner `Audio Movie CHOP` pattern where audio is auto-extracted
/// from the loaded video, no separate load required.
///
/// `max_duration_secs` optionally limits extraction to the first N seconds
/// (used to match the export trim range).
#[tauri::command]
pub fn extract_audio_from_video(
    video_path: String,
    max_duration_secs: Option<f64>,
) -> std::result::Result<String, String> {
    let validated = validate_io_path(&video_path, true)?;
    let video_path = validated.to_string_lossy().into_owned();

    // Fast path: if there's no audio stream, fail fast with a clear message
    // so the frontend can show a "no audio" warning instead of a generic error.
    if !has_audio_stream(&video_path).map_err(|e| e.to_string())? {
        return Err("Source video has no audio stream".to_string());
    }

    // Write to a per-video temp file so repeated loads overwrite cleanly.
    // Hash the path to keep filenames stable across calls for the same video.
    use std::collections::hash_map::DefaultHasher;
    use std::hash::{Hash, Hasher};
    let mut hasher = DefaultHasher::new();
    video_path.hash(&mut hasher);
    let hash = format!("{:016x}", hasher.finish());
    let out_dir = std::env::temp_dir()
        .join("moshdither-studio")
        .join("extracted-audio");
    std::fs::create_dir_all(&out_dir).map_err(|e| format!("Failed to create temp dir: {e}"))?;
    let out_path = out_dir.join(format!("{hash}.wav"));

    extract_audio_to_wav(&video_path, &out_path.to_string_lossy(), max_duration_secs)
        .map_err(|e| e.to_string())?;
    Ok(out_path.to_string_lossy().into_owned())
}

/// Get the current image dimensions.
#[tauri::command]
pub fn get_media_info(
    state: State<'_, AppState>,
) -> std::result::Result<serde_json::Value, String> {
    let frame_lock = state
        .current_frame
        .lock()
        .map_err(|e| format!("frame lock poisoned: {e}"))?;
    match frame_lock.as_ref() {
        Some(frame) => Ok(json!({
            "width": frame.width,
            "height": frame.height,
            "loaded": true
        })),
        None => Ok(json!({ "loaded": false })),
    }
}

fn lock_sam3<'a>(
    state: &'a State<'_, AppState>,
) -> std::result::Result<std::sync::MutexGuard<'a, Option<Sam3Engine>>, String> {
    state
        .sam3
        .lock()
        .map_err(|e| format!("SAM3 lock poisoned: {e}"))
}

/// Zip parallel (mask_b64, score) pairs into the `{count, masks, scores}`
/// shape shared by every SAM3 prompt command's response.
fn masks_to_json(masks: Vec<(String, f64)>) -> serde_json::Value {
    let count = masks.len();
    let (mask_b64s, scores): (Vec<String>, Vec<f64>) = masks.into_iter().unzip();
    json!({
        "count": count,
        "masks": mask_b64s,
        "scores": scores,
    })
}

fn with_sam3<F, R>(
    app: &tauri::AppHandle,
    state: &State<'_, AppState>,
    f: F,
) -> std::result::Result<R, String>
where
    F: Fn(&Sam3Engine) -> crate::error::Result<R>,
{
    let mut sam3_lock = lock_sam3(state)?;

    if sam3_lock.is_none() {
        match Sam3Engine::new(app) {
            Ok(engine) => {
                *sam3_lock = Some(engine);
            }
            Err(e) => return Err(format!("Failed to start SAM3 engine: {e}")),
        }
    }

    let engine = sam3_lock.as_ref().unwrap();
    match f(engine) {
        Ok(res) => Ok(res),
        Err(e) => {
            let err_str = e.to_string();
            // If the sidecar IPC pipe broke or died, drop the dead engine lock and attempt auto-restart
            if err_str.contains("pipe")
                || err_str.contains("closed")
                || err_str.contains("os error")
            {
                tracing::warn!(
                    "SAM3 engine pipe error detected ({err_str}), auto-restarting SAM3 engine..."
                );
                *sam3_lock = None;
                if let Ok(new_engine) = Sam3Engine::new(app) {
                    if let Ok(retry_res) = f(&new_engine) {
                        *sam3_lock = Some(new_engine);
                        return Ok(retry_res);
                    }
                    *sam3_lock = Some(new_engine);
                }
            }
            Err(err_str)
        }
    }
}

/// ── SAM3 Segmentation Commands ─────────────────────────────
#[tauri::command]
pub fn sam3_init(
    app: tauri::AppHandle,
    state: State<'_, AppState>,
) -> std::result::Result<String, String> {
    let mut sam3_lock = lock_sam3(&state)?;
    if sam3_lock.is_none() {
        match Sam3Engine::new(&app) {
            Ok(engine) => {
                *sam3_lock = Some(engine);
                Ok("SAM3 engine initialized".into())
            }
            Err(e) => Err(format!("Failed to start SAM3 engine: {}", e)),
        }
    } else {
        Ok("SAM3 engine already running".into())
    }
}

/// Load an image into SAM3 for segmentation.
#[tauri::command]
pub fn sam3_load_image(
    app: tauri::AppHandle,
    state: State<'_, AppState>,
    image_b64: String,
) -> std::result::Result<serde_json::Value, String> {
    let (w, h) = with_sam3(&app, &state, |engine| engine.load_image(image_b64.clone()))?;
    Ok(json!({ "width": w, "height": h }))
}

/// Run a text prompt on the currently loaded SAM3 image.
#[tauri::command]
pub fn sam3_text_prompt(
    app: tauri::AppHandle,
    state: State<'_, AppState>,
    prompt: String,
) -> std::result::Result<serde_json::Value, String> {
    let masks = with_sam3(&app, &state, |engine| engine.text_prompt(prompt.clone()))?;
    Ok(masks_to_json(masks))
}

/// Run a point-click prompt on the currently loaded SAM3 image.
#[tauri::command]
pub fn sam3_point_prompt(
    app: tauri::AppHandle,
    state: State<'_, AppState>,
    points: Vec<[f64; 2]>,
    labels: Option<Vec<i32>>,
) -> std::result::Result<serde_json::Value, String> {
    let f32_points: Vec<[f32; 2]> = points
        .into_iter()
        .map(|[x, y]| [x as f32, y as f32])
        .collect();
    let masks = with_sam3(&app, &state, |engine| {
        engine.point_prompt(f32_points.clone(), labels.clone())
    })?;
    Ok(masks_to_json(masks))
}

/// Run a box prompt on the currently loaded SAM3 image.
#[tauri::command]
pub fn sam3_box_prompt(
    app: tauri::AppHandle,
    state: State<'_, AppState>,
    boxes: Vec<[f64; 4]>,
) -> std::result::Result<serde_json::Value, String> {
    let f32_boxes: Vec<[f32; 4]> = boxes
        .into_iter()
        .map(|[x1, y1, x2, y2]| [x1 as f32, y1 as f32, x2 as f32, y2 as f32])
        .collect();
    let masks = with_sam3(&app, &state, |engine| engine.box_prompt(f32_boxes.clone()))?;
    Ok(masks_to_json(masks))
}

/// Run auto-mask grid generation on the currently loaded SAM3 image.
#[tauri::command]
pub fn sam3_auto_mask(
    app: tauri::AppHandle,
    state: State<'_, AppState>,
    grid_size: u32,
    iou_threshold: f32,
    min_mask_region_area: u32,
) -> std::result::Result<serde_json::Value, String> {
    let masks = with_sam3(&app, &state, |engine| {
        engine.auto_mask(grid_size, iou_threshold, min_mask_region_area)
    })?;
    Ok(masks_to_json(masks))
}

/// Run video predictor on a list of frames.
#[tauri::command]
pub fn sam3_video_predictor(
    state: State<'_, AppState>,
    frames: Vec<String>,
    prompt: Option<String>,
) -> std::result::Result<serde_json::Value, String> {
    let sam3_lock = lock_sam3(&state)?;
    let engine = sam3_lock
        .as_ref()
        .ok_or("SAM3 engine not initialized. Call sam3_init first.")?;
    let (frame_masks, frame_scores) = engine
        .video_predictor(frames, prompt)
        .map_err(|e| e.to_string())?;
    Ok(json!({
        "status": "ok",
        "frame_masks": frame_masks,
        "frame_scores": frame_scores,
    }))
}

/// Refine an existing mask by providing additional point prompts.
/// The existing mask (base64 PNG) is combined with new points to produce
/// refined candidate masks sorted by IoU with the input mask.
#[tauri::command]
pub fn sam3_refine_mask(
    app: tauri::AppHandle,
    state: State<'_, AppState>,
    mask_b64: String,
    points: Vec<[f64; 2]>,
    labels: Option<Vec<i32>>,
) -> std::result::Result<serde_json::Value, String> {
    let f32_points: Vec<[f32; 2]> = points
        .into_iter()
        .map(|[x, y]| [x as f32, y as f32])
        .collect();
    let masks = with_sam3(&app, &state, |engine| {
        engine.refine_mask(mask_b64.clone(), f32_points.clone(), labels.clone())
    })?;
    let mut result = masks_to_json(masks);
    result["status"] = json!("ok");
    Ok(result)
}

/// Post-process a single mask (grow/shrink/feather/fill holes).
#[tauri::command]
pub fn sam3_postprocess_mask(
    app: tauri::AppHandle,
    state: State<'_, AppState>,
    mask_b64: String,
    grow: i32,
    shrink: i32,
    feather: i32,
    fill_holes: bool,
) -> std::result::Result<String, String> {
    with_sam3(&app, &state, |engine| {
        engine.postprocess_mask(mask_b64.clone(), grow, shrink, feather, fill_holes)
    })
}

/// Clear SAM3 state (image + masks).
#[tauri::command]
pub fn sam3_clear(state: State<'_, AppState>) -> std::result::Result<String, String> {
    let sam3_lock = lock_sam3(&state)?;
    if let Some(engine) = sam3_lock.as_ref() {
        engine.clear().map_err(|e| e.to_string())?;
    }
    Ok("SAM3 state cleared".into())
}

/// Shutdown the SAM3 bridge process.
#[tauri::command]
pub fn sam3_shutdown(state: State<'_, AppState>) -> std::result::Result<String, String> {
    let mut sam3_lock = lock_sam3(&state)?;
    if let Some(engine) = sam3_lock.take() {
        let _ = engine.shutdown();
    }
    Ok("SAM3 engine shut down".into())
}

#[cfg(test)]
mod integration_tests {
    use super::*;
    use image::ImageFormat;
    use std::io::Cursor;

    /// Write a generated gradient PNG to a unique temp path. Returns the path.
    /// Using a generated image keeps this test cross-platform (no OS-specific assets).
    fn write_temp_test_png(w: u32, h: u32) -> std::path::PathBuf {
        let mut img = image::RgbaImage::new(w, h);
        for y in 0..h {
            for x in 0..w {
                img.put_pixel(
                    x,
                    y,
                    image::Rgba([(x % 256) as u8, (y % 256) as u8, 128, 255]),
                );
            }
        }
        let tmp = std::env::temp_dir().join(format!(
            "moshdither_test_{}_{}.png",
            std::process::id(),
            std::time::SystemTime::now()
                .duration_since(std::time::UNIX_EPOCH)
                .map(|d| d.as_nanos())
                .unwrap_or(0)
        ));
        img.save(&tmp).unwrap();
        tmp
    }

    #[test]
    fn test_load_and_convert_media() {
        let (w, h) = (16u32, 16u32);
        let tmp = write_temp_test_png(w, h);
        let frame = load_image(tmp.to_str().unwrap()).unwrap();
        let _ = std::fs::remove_file(&tmp);

        assert_eq!(frame.width, w);
        assert_eq!(frame.height, h);
        assert_eq!(frame.data.len(), (frame.width * frame.height * 4) as usize);

        let img = image::RgbaImage::from_raw(frame.width, frame.height, frame.data)
            .expect("valid frame data");
        let mut buf = Cursor::new(Vec::new());
        img.write_to(&mut buf, ImageFormat::Png).unwrap();

        let b64 =
            base64::Engine::encode(&base64::engine::general_purpose::STANDARD, buf.into_inner());
        assert!(!b64.is_empty());
        let data_url = format!("data:image/png;base64,{}", b64);
        assert!(data_url.starts_with("data:image/png;base64,"));
    }

    // ── Resize helper error handling ────────────────────────────
    // downscale_frame / upscale_frame return an error (instead of silently
    // substituting a 1x1 black frame) when the raw buffer is inconsistent
    // with the declared dimensions.

    #[test]
    fn test_downscale_frame_valid() {
        let f = Frame {
            width: 4,
            height: 4,
            data: vec![255u8; (4 * 4 * 4) as usize],
        };
        let out = downscale_frame(f, 0.5).expect("valid frame should downscale");
        assert_eq!(out.width, 2);
        assert_eq!(out.height, 2);
        assert_eq!(out.data.len(), (out.width * out.height * 4) as usize);
    }

    #[test]
    fn test_downscale_frame_invalid_buffer_errors() {
        // Buffer far too small for 10x10 RGBA (should be 400 bytes).
        let bad = Frame {
            width: 10,
            height: 10,
            data: vec![0u8; 4],
        };
        let err = downscale_frame(bad, 0.5).unwrap_err();
        assert!(err.contains("downscale_frame"));
    }

    #[test]
    fn test_upscale_frame_valid() {
        let f = Frame {
            width: 2,
            height: 2,
            data: vec![128u8; (2 * 2 * 4) as usize],
        };
        let out = upscale_frame(f, 4, 4).expect("valid frame should upscale");
        assert_eq!(out.width, 4);
        assert_eq!(out.height, 4);
        assert_eq!(out.data.len(), (out.width * out.height * 4) as usize);
    }

    #[test]
    fn test_upscale_frame_invalid_buffer_errors() {
        let bad = Frame {
            width: 10,
            height: 10,
            data: vec![0u8; 4],
        };
        let err = upscale_frame(bad, 20, 20).unwrap_err();
        assert!(err.contains("upscale_frame"));
    }

    // ── Poisoned-lock error handling ────────────────────────────
    // Command handlers map a poisoned Mutex into a `Result::Err(String)`
    // instead of panicking (which previously could crash the whole app and
    // permanently poison shared state). These tests poison an AppState mutex
    // and confirm the same `.lock().map_err(..)` pattern yields an error.

    /// Poison the given mutex by panicking while a guard is held on another thread.
    fn poison_mutex<T: Send>(m: &Mutex<T>) {
        let result = std::thread::scope(|scope| {
            scope
                .spawn(|| {
                    let _guard = m.lock().unwrap();
                    panic!("intentional poison for test");
                })
                .join()
        });
        assert!(result.is_err(), "poisoning thread should have panicked");
    }

    #[test]
    fn test_poisoned_frame_lock_maps_to_error() {
        let state = AppState::default();
        poison_mutex(&state.current_frame);

        let result: std::result::Result<_, String> = state
            .current_frame
            .lock()
            .map_err(|e| format!("frame lock poisoned: {e}"));
        match result {
            Ok(_) => panic!("expected poisoned frame lock error"),
            Err(e) => assert!(e.contains("frame lock poisoned")),
        }
    }

    #[test]
    fn test_poisoned_registry_lock_maps_to_error() {
        let state = AppState::default();
        poison_mutex(&state.registry);

        let result: std::result::Result<_, String> = state
            .registry
            .lock()
            .map_err(|e| format!("registry lock poisoned: {e}"));
        match result {
            Ok(_) => panic!("expected poisoned registry lock error"),
            Err(e) => assert!(e.contains("registry lock poisoned")),
        }
    }

    #[test]
    fn test_poisoned_sam3_lock_maps_to_error() {
        let state = AppState::default();
        poison_mutex(&state.sam3);

        let result: std::result::Result<_, String> = state
            .sam3
            .lock()
            .map_err(|e| format!("SAM3 lock poisoned: {e}"));
        match result {
            Ok(_) => panic!("expected poisoned SAM3 lock error"),
            Err(e) => assert!(e.contains("SAM3 lock poisoned")),
        }
    }

    // ── Purple-team / adversarial regression tests ──────────────
    // Confirm the command surface degrades to errors (never panics) on
    // hostile or malformed input.

    #[test]
    fn test_unknown_effect_id_not_in_registry() {
        // apply_effect / apply_effect_stack map a missing id to an error via
        // registry.get(..).ok_or(..). Confirm the lookup returns None (not panic).
        let reg = EffectRegistry::new();
        assert!(reg.get("totally.bogus.effect.id").is_none());
    }

    #[test]
    fn test_params_match_for_cache_ignores_time_for_effects_that_dont_use_it() {
        // Reproduces the "dithering looks choppy" bug directly: the frontend
        // injects a per-frame `time` value into every effect's params during
        // playback, even for effects (like a plain Bayer dither) that never
        // read it. Without this, a changing time value alone would defeat
        // the cache for every static effect on every playback tick.
        let reg = EffectRegistry::new();
        let bayer = reg
            .get("dithering.bayer")
            .expect("dithering.bayer should be registered");

        let mut a = serde_json::Map::new();
        a.insert("threshold".to_string(), json!(128));
        a.insert("time".to_string(), json!(0.0));

        let mut b = a.clone();
        b.insert("time".to_string(), json!(1.5));
        assert!(
            params_match_for_cache(bayer, &a, &b),
            "a static effect's cache-key comparison must ignore a changing time value"
        );

        let mut c = a.clone();
        c.insert("threshold".to_string(), json!(200));
        assert!(
            !params_match_for_cache(bayer, &a, &c),
            "a real (non-time) param change must still be treated as a cache miss"
        );
    }

    #[test]
    fn test_params_match_for_cache_respects_time_for_effects_that_use_it() {
        let reg = EffectRegistry::new();
        let databend = reg
            .get("glitch.databend")
            .expect("glitch.databend should be registered");

        let mut a = serde_json::Map::new();
        a.insert("time".to_string(), json!(0.0));
        let mut b = a.clone();
        b.insert("time".to_string(), json!(1.5));

        assert!(
            !params_match_for_cache(databend, &a, &b),
            "a genuinely time-based effect's changing time value must still be a cache miss"
        );
        assert!(params_match_for_cache(databend, &a, &a.clone()));
    }

    fn solid_frame(width: u32, height: u32, rgba: [u8; 4]) -> Frame {
        let mut data = Vec::with_capacity((width * height * 4) as usize);
        for _ in 0..(width * height) {
            data.extend_from_slice(&rgba);
        }
        Frame {
            width,
            height,
            data,
        }
    }

    #[test]
    fn test_apply_stack_to_frame_actually_modifies_pixels() {
        // This is what save_processed_image relies on to save the
        // effects-applied result rather than a silent copy of the original --
        // apply_effect_stack itself never persists its output anywhere, so a
        // regression here would make "Save Image" save the untouched source.
        let reg = EffectRegistry::new();
        let frame = solid_frame(4, 4, [128, 128, 128, 255]);
        let stack = vec![EffectCall {
            effect_id: "dithering.bayer".to_string(),
            params: serde_json::Map::new(),
            mask_b64: None,
            mask_mode: None,
            keyframes: None,
        }];

        let result = apply_stack_to_frame(&reg, frame.clone(), &stack, None)
            .expect("bayer dither should succeed on a valid frame");

        assert_eq!(result.width, frame.width);
        assert_eq!(result.height, frame.height);
        assert_ne!(
            result.data, frame.data,
            "a dither effect must actually change the frame's pixel data"
        );
    }

    #[test]
    fn test_apply_stack_to_frame_empty_stack_returns_original_frame() {
        let reg = EffectRegistry::new();
        let frame = solid_frame(2, 2, [10, 20, 30, 255]);
        let result = apply_stack_to_frame(&reg, frame.clone(), &[], None)
            .expect("an empty stack should be a no-op, not an error");
        assert_eq!(result.data, frame.data);
    }

    #[test]
    fn test_apply_stack_to_frame_unknown_effect_id_errors() {
        let reg = EffectRegistry::new();
        let frame = solid_frame(2, 2, [0, 0, 0, 255]);
        let stack = vec![EffectCall {
            effect_id: "totally.bogus.effect.id".to_string(),
            params: serde_json::Map::new(),
            mask_b64: None,
            mask_mode: None,
            keyframes: None,
        }];
        let result = apply_stack_to_frame(&reg, frame, &stack, None);
        assert!(
            result.is_err(),
            "an unknown effect id must error, not panic"
        );
    }

    #[test]
    fn test_decode_mask_b64_valid_base64_but_not_png_errors() {
        // Well-formed base64 whose bytes are not a PNG must error, not panic.
        let junk = base64::Engine::encode(
            &base64::engine::general_purpose::STANDARD,
            b"not a png file",
        );
        let data_url = format!("data:image/png;base64,{}", junk);
        assert!(decode_mask_b64(Some(data_url.as_str())).is_err());
    }

    #[test]
    fn test_load_image_from_memory_rejects_garbage() {
        // Non-image bytes fed to the base64 media loader must error gracefully.
        assert!(load_image_from_memory(b"\x00\x01\x02 definitely not an image").is_err());
    }

    #[test]
    fn test_blend_mask_with_mismatched_dimensions_does_not_panic() {
        use crate::effects::color::Invert;
        use crate::effects::{blend_mask, Effect};

        // 2x2 frame with a 1x1 mask (mismatched dims). blend_mask samples via
        // nearest-neighbor and must not panic or corrupt the buffer length.
        let frame = make_test_frame(
            2,
            2,
            &[
                (10, 10, 10, 255),
                (20, 20, 20, 255),
                (30, 30, 30, 255),
                (40, 40, 40, 255),
            ],
        );
        let mask = crate::effects::types::Mask {
            width: 1,
            height: 1,
            data: vec![255],
        };
        let effect = Invert::default();
        let previous = frame.clone();
        let mut working = effect
            .process_frame(&frame, None, &serde_json::Map::new())
            .unwrap();
        blend_mask(&mut working, &previous, &mask, "inside").unwrap();
        assert_eq!(working.data.len(), frame.data.len());
    }

    #[test]
    fn test_effect_extreme_out_of_range_params_do_not_panic() {
        use crate::effects::color::Invert;
        use crate::effects::Effect;

        let frame = make_test_frame(2, 1, &[(100, 100, 100, 255), (150, 150, 150, 255)]);
        let mut params = serde_json::Map::new();
        params.insert("amount".to_string(), serde_json::json!(1e9));
        params.insert("scale".to_string(), serde_json::json!(-42.0));
        params.insert("intensity".to_string(), serde_json::json!(f64::MAX));
        // Absurd parameters must be clamped/ignored, never panic.
        let out = Invert::default().process_frame(&frame, None, &params);
        assert!(out.is_ok());
    }

    #[test]
    fn test_decode_mask_b64_valid() {
        // Create a 2x2 grayscale mask (PNG)
        let mut img = image::GrayImage::new(2, 2);
        img.put_pixel(0, 0, image::Luma([255]));
        img.put_pixel(1, 0, image::Luma([0]));
        img.put_pixel(0, 1, image::Luma([128]));
        img.put_pixel(1, 1, image::Luma([64]));

        let mut buf = Cursor::new(Vec::new());
        img.write_to(&mut buf, ImageFormat::Png).unwrap();
        let b64 =
            base64::Engine::encode(&base64::engine::general_purpose::STANDARD, buf.into_inner());
        let data_url = format!("data:image/png;base64,{}", b64);

        let mask = decode_mask_b64(Some(data_url.as_str())).unwrap();
        assert!(mask.is_some());
        let m = mask.unwrap();
        assert_eq!(m.width, 2);
        assert_eq!(m.height, 2);
        assert_eq!(m.data[0], 255);
        assert_eq!(m.data[1], 0);
        assert_eq!(m.data[2], 128);
        assert_eq!(m.data[3], 64);
    }

    #[test]
    fn test_decode_mask_b64_none() {
        let mask = decode_mask_b64(None).unwrap();
        assert!(mask.is_none());
    }

    #[test]
    fn test_decode_mask_b64_invalid() {
        let result = decode_mask_b64(Some("not-valid-base64!!!"));
        assert!(result.is_err());
    }

    #[test]
    fn test_mask_isolate_handles_masking() {
        use crate::effects::segmentation::MaskIsolate;
        use crate::effects::types::Effect;

        let effect = MaskIsolate;
        assert!(
            effect.handles_masking(),
            "MaskIsolate should report it handles masking internally"
        );
    }

    #[test]
    fn test_generic_effect_does_not_handle_masking() {
        use crate::effects::artistic::Grayscale;
        use crate::effects::types::Effect;

        let effect = Grayscale::default();
        assert!(
            !effect.handles_masking(),
            "Grayscale should not handle masking internally"
        );
    }

    // ── End-to-end mask integration tests ───────────────────────
    // These simulate the full apply_effect pipeline: run effect → blend with mask.
    // They verify that only masked pixels are affected by the effect.

    /// Helper: encode a grayscale mask as a base64 PNG data URL.
    fn encode_mask_b64(width: u32, height: u32, values: &[u8]) -> String {
        let mut img = image::GrayImage::new(width, height);
        for y in 0..height {
            for x in 0..width {
                let idx = (y * width + x) as usize;
                img.put_pixel(x, y, image::Luma([values[idx]]));
            }
        }
        let mut buf = Cursor::new(Vec::new());
        img.write_to(&mut buf, ImageFormat::Png).unwrap();
        let b64 =
            base64::Engine::encode(&base64::engine::general_purpose::STANDARD, buf.into_inner());
        format!("data:image/png;base64,{}", b64)
    }

    /// Helper: create a test frame with specific RGBA pixels.
    fn make_test_frame(w: u32, h: u32, pixels: &[(u8, u8, u8, u8)]) -> Frame {
        let data: Vec<u8> = pixels
            .iter()
            .flat_map(|(r, g, b, a)| [*r, *g, *b, *a])
            .collect();
        Frame {
            width: w,
            height: h,
            data,
        }
    }

    #[test]
    fn test_invert_with_inside_mask_only_affects_masked_pixels() {
        use crate::effects::color::Invert;
        use crate::effects::{blend_mask, Effect};

        // 2x1 image: pixel 0 = (100,100,100), pixel 1 = (200,200,200)
        let frame = make_test_frame(2, 1, &[(100, 100, 100, 255), (200, 200, 200, 255)]);
        let mask = crate::effects::types::Mask {
            width: 2,
            height: 1,
            data: vec![255, 0], // pixel 0 masked, pixel 1 not
        };

        // Run Invert effect (doesn't handle masking internally)
        let effect = Invert::default();
        let previous = frame.clone();
        let mut working = effect
            .process_frame(&frame, None, &serde_json::Map::new())
            .unwrap();

        // Apply mask blend with "inside" mode
        blend_mask(&mut working, &previous, &mask, "inside").unwrap();

        // Pixel 0: mask=255 → inverted (255-100=155)
        assert_eq!(working.data[0], 155);
        assert_eq!(working.data[1], 155);
        assert_eq!(working.data[2], 155);
        // Pixel 1: mask=0 → original (200)
        assert_eq!(working.data[4], 200);
        assert_eq!(working.data[5], 200);
        assert_eq!(working.data[6], 200);
    }

    #[test]
    fn test_invert_with_outside_mask_only_affects_unmasked_pixels() {
        use crate::effects::color::Invert;
        use crate::effects::{blend_mask, Effect};

        let frame = make_test_frame(2, 1, &[(100, 100, 100, 255), (200, 200, 200, 255)]);
        let mask = crate::effects::types::Mask {
            width: 2,
            height: 1,
            data: vec![255, 0], // pixel 0 masked, pixel 1 not
        };

        let effect = Invert::default();
        let previous = frame.clone();
        let mut working = effect
            .process_frame(&frame, None, &serde_json::Map::new())
            .unwrap();

        // Apply mask blend with "outside" mode
        blend_mask(&mut working, &previous, &mask, "outside").unwrap();

        // Pixel 0: mask=255 → original (100) — outside mode preserves masked area
        assert_eq!(working.data[0], 100);
        // Pixel 1: mask=0 → inverted (255-200=55) — outside mode affects unmasked area
        assert_eq!(working.data[4], 55);
    }

    #[test]
    fn test_invert_with_alpha_mask_scales_effect() {
        use crate::effects::color::Invert;
        use crate::effects::{blend_mask, Effect};

        let frame = make_test_frame(2, 1, &[(100, 100, 100, 255), (100, 100, 100, 255)]);
        let mask = crate::effects::types::Mask {
            width: 2,
            height: 1,
            data: vec![255, 128], // pixel 0 full, pixel 1 half
        };

        let effect = Invert::default();
        let previous = frame.clone();
        let mut working = effect
            .process_frame(&frame, None, &serde_json::Map::new())
            .unwrap();

        // Invert produces 155 for input 100
        // Apply alpha mode: working = effect_output * mask_val
        blend_mask(&mut working, &previous, &mask, "alpha").unwrap();

        // Pixel 0: mask=255 → 155 * 1.0 = 155
        assert_eq!(working.data[0], 155);
        // Pixel 1: mask=128 → 155 * (128/255) ≈ 78
        let expected = (155.0f32 * (128.0f32 / 255.0f32)).round() as u8;
        assert_eq!(working.data[4], expected);
    }

    #[test]
    fn test_grayscale_with_inside_mask_preserves_color_outside_mask() {
        use crate::effects::artistic::Grayscale;
        use crate::effects::{blend_mask, Effect};

        // 2x1 image: pixel 0 = red, pixel 1 = green
        let frame = make_test_frame(2, 1, &[(255, 0, 0, 255), (0, 255, 0, 255)]);
        let mask = crate::effects::types::Mask {
            width: 2,
            height: 1,
            data: vec![255, 0], // only pixel 0 masked
        };

        let effect = Grayscale::default();
        let previous = frame.clone();
        let mut working = effect
            .process_frame(&frame, None, &serde_json::Map::new())
            .unwrap();

        blend_mask(&mut working, &previous, &mask, "inside").unwrap();

        // Pixel 0: mask=255 → grayscale (luminance of red ≈ 76)
        // Grayscale converts to luminance: 0.299*255 ≈ 76
        assert_eq!(working.data[0], working.data[1]); // R == G
        assert_eq!(working.data[1], working.data[2]); // G == B
                                                      // Pixel 1: mask=0 → original green (0, 255, 0)
        assert_eq!(working.data[4], 0);
        assert_eq!(working.data[5], 255);
        assert_eq!(working.data[6], 0);
    }

    #[test]
    fn test_full_pipeline_decode_mask_then_blend() {
        use crate::effects::color::Invert;
        use crate::effects::{blend_mask, Effect};

        // Create a 4x1 mask: [255, 128, 0, 255] via base64 PNG
        let mask_b64 = encode_mask_b64(4, 1, &[255, 128, 0, 255]);
        let mask = decode_mask_b64(Some(mask_b64.as_str())).unwrap().unwrap();

        // Create a 4x1 frame: all pixels = (100, 150, 200)
        let frame = Frame {
            width: 4,
            height: 1,
            data: vec![
                100, 150, 200, 255, 100, 150, 200, 255, 100, 150, 200, 255, 100, 150, 200, 255,
            ],
        };

        // Run Invert
        let effect = Invert::default();
        let previous = frame.clone();
        let mut working = effect
            .process_frame(&frame, None, &serde_json::Map::new())
            .unwrap();

        // Blend with decoded mask using "inside" mode
        blend_mask(&mut working, &previous, &mask, "inside").unwrap();

        // Invert(100,150,200) = (155,105,55)
        // Pixel 0: mask=255 → fully inverted
        assert_eq!(working.data[0], 155);
        assert_eq!(working.data[1], 105);
        assert_eq!(working.data[2], 55);
        // Pixel 1: mask=128 → blend: old*(1-0.502) + new*0.502
        let mv = 128.0f32 / 255.0f32;
        let r = (100.0 * (1.0 - mv) + 155.0 * mv).round() as u8;
        let g = (150.0 * (1.0 - mv) + 105.0 * mv).round() as u8;
        let b = (200.0 * (1.0 - mv) + 55.0 * mv).round() as u8;
        assert_eq!(working.data[4], r);
        assert_eq!(working.data[5], g);
        assert_eq!(working.data[6], b);
        // Pixel 2: mask=0 → original unchanged
        assert_eq!(working.data[8], 100);
        assert_eq!(working.data[9], 150);
        assert_eq!(working.data[10], 200);
        // Pixel 3: mask=255 → fully inverted
        assert_eq!(working.data[12], 155);
        assert_eq!(working.data[13], 105);
        assert_eq!(working.data[14], 55);
    }

    #[test]
    fn test_mask_isolate_in_pipeline_does_not_double_blend() {
        use crate::effects::segmentation::MaskIsolate;
        use crate::effects::{blend_mask, Effect};

        // 2x1 image: both pixels (100, 100, 100, 255)
        let frame = make_test_frame(2, 1, &[(100, 100, 100, 255), (100, 100, 100, 255)]);
        let mask = crate::effects::types::Mask {
            width: 2,
            height: 1,
            data: vec![255, 0],
        };

        // Run MaskIsolate — it handles masking internally
        let effect = MaskIsolate;
        let previous = frame.clone();
        let mut working = effect
            .process_frame(&frame, Some(&mask), &serde_json::Map::new())
            .unwrap();

        // Because handles_masking() == true, the pipeline should NOT call blend_mask.
        // Verify the effect's own output: pixel 0 alpha=255, pixel 1 alpha=0
        assert_eq!(working.data[3], 255); // pixel 0 alpha preserved
        assert_eq!(working.data[7], 0); // pixel 1 alpha zeroed

        // Simulate the pipeline check: only blend if effect doesn't handle masking
        if !effect.handles_masking() {
            blend_mask(&mut working, &previous, &mask, "inside").unwrap();
        }

        // After pipeline: MaskIsolate output should be unchanged (no double-blend)
        assert_eq!(working.data[3], 255);
        assert_eq!(working.data[7], 0);
        // RGB should be unchanged
        assert_eq!(working.data[0], 100);
        assert_eq!(working.data[4], 100);
    }

    #[test]
    fn test_multi_effect_stack_with_mask_on_second_effect() {
        use crate::effects::color::Invert;
        use crate::effects::{blend_mask, Effect};

        // 2x1 image: pixel 0 = (50, 50, 50), pixel 1 = (200, 200, 200)
        let mut frame = make_test_frame(2, 1, &[(50, 50, 50, 255), (200, 200, 200, 255)]);
        let mask = crate::effects::types::Mask {
            width: 2,
            height: 1,
            data: vec![255, 0], // only pixel 0 masked
        };

        // First effect: Invert (no mask) — inverts both pixels
        let invert = Invert::default();
        frame = invert
            .process_frame(&frame, None, &serde_json::Map::new())
            .unwrap();
        // After invert: pixel 0 = (205, 205, 205), pixel 1 = (55, 55, 55)

        // Second effect: Invert again, but with mask blend "inside"
        let previous = frame.clone();
        let mut working = invert
            .process_frame(&frame, None, &serde_json::Map::new())
            .unwrap();
        // After second invert: pixel 0 = (50, 50, 50), pixel 1 = (200, 200, 200)

        blend_mask(&mut working, &previous, &mask, "inside").unwrap();

        // Pixel 0: mask=255 → second invert applied (50, 50, 50)
        assert_eq!(working.data[0], 50);
        // Pixel 1: mask=0 → stays as first invert result (55, 55, 55)
        assert_eq!(working.data[4], 55);
    }
}

/// Maximum allowed file size for read_file / save_file (10 MB).
const PROJECT_FILE_MAX_SIZE: usize = 10 * 1024 * 1024;

/// Allowed file extensions for project save/load.
const ALLOWED_PROJECT_EXTS: &[&str] = &["moshdither", "json"];

/// Validate that a file path is safe for project read/write operations.
/// Delegates to path_guard for canonicalization, UNC blocking, and system path checks,
/// and enforces allowed project extensions.
fn validate_project_path(
    path: &str,
    is_write: bool,
) -> std::result::Result<std::path::PathBuf, String> {
    let resolved = crate::path_guard::validate_io_path(path, !is_write)?;

    let file_name = resolved
        .file_name()
        .and_then(|n| n.to_str())
        .ok_or_else(|| "Invalid path: no file name".to_string())?;

    if file_name.starts_with('.') {
        return Err("Access denied: hidden files are not allowed".to_string());
    }

    let ext = resolved
        .extension()
        .and_then(|e| e.to_str())
        .map(|e| e.to_lowercase())
        .unwrap_or_default();

    if !ALLOWED_PROJECT_EXTS.contains(&ext.as_str()) {
        return Err(format!(
            "File extension '.{}' not allowed. Permitted: {}",
            ext,
            ALLOWED_PROJECT_EXTS.join(", ")
        ));
    }

    Ok(resolved)
}

/// Save a JSON string to a file path.
/// Validates path safety and enforces a maximum file size.
#[tauri::command]
pub async fn save_file(path: String, contents: String) -> std::result::Result<(), String> {
    if contents.len() > PROJECT_FILE_MAX_SIZE {
        return Err(format!(
            "File contents too large: {} bytes (max {} bytes)",
            contents.len(),
            PROJECT_FILE_MAX_SIZE
        ));
    }
    let valid_path = validate_project_path(&path, true)?;
    std::fs::write(&valid_path, contents).map_err(|e| e.to_string())
}

/// Read a file as a string.
/// Validates path safety and enforces a maximum file size.
#[tauri::command]
pub async fn read_file(path: String) -> std::result::Result<String, String> {
    let valid_path = validate_project_path(&path, false)?;
    let meta = std::fs::metadata(&valid_path).map_err(|e| e.to_string())?;
    if meta.len() as usize > PROJECT_FILE_MAX_SIZE {
        return Err(format!(
            "File too large: {} bytes (max {} bytes)",
            meta.len(),
            PROJECT_FILE_MAX_SIZE
        ));
    }
    std::fs::read_to_string(&valid_path).map_err(|e| e.to_string())
}

/// Maximum size for a user-supplied custom LUT (PNG or .cube).
const LUT_MAX_SIZE: u64 = 50 * 1024 * 1024;
const ALLOWED_LUT_EXTS: &[&str] = &["png", "cube"];

/// Copies a user-selected custom LUT into the app's temporary LUT directory.
///
/// The Tauri asset protocol is scoped to `$TEMP/moshdither-studio/**`, so files
/// outside that directory cannot be previewed directly from the webview.
/// This command validates the source path and copies it into the allowed scope,
/// returning the destination path to use for both WebGL preview and the Rust
/// export pipeline.
#[tauri::command]
pub async fn prepare_custom_lut(path: String) -> std::result::Result<String, String> {
    let validated = validate_io_path(&path, true)?;

    let ext = validated
        .extension()
        .and_then(|e| e.to_str())
        .map(|e| e.to_lowercase())
        .unwrap_or_default();
    if !ALLOWED_LUT_EXTS.contains(&ext.as_str()) {
        return Err(format!("Unsupported LUT extension: .{}", ext));
    }

    let meta = std::fs::metadata(&validated).map_err(|e| e.to_string())?;
    if meta.len() > LUT_MAX_SIZE {
        return Err(format!(
            "LUT file too large: {} bytes (max {} bytes)",
            meta.len(),
            LUT_MAX_SIZE
        ));
    }

    let file_name = validated
        .file_name()
        .and_then(|n| n.to_str())
        .ok_or_else(|| "Invalid LUT file name".to_string())?;
    let dest_dir = std::env::temp_dir().join("moshdither-studio").join("luts");
    std::fs::create_dir_all(&dest_dir).map_err(|e| e.to_string())?;
    let dest = dest_dir.join(file_name);
    std::fs::copy(&validated, &dest).map_err(|e| e.to_string())?;

    Ok(dest.to_string_lossy().into_owned())
}

/// Information about an available updater release.
#[derive(serde::Serialize)]
pub struct UpdateInfo {
    pub version: String,
    pub date: Option<String>,
    pub body: Option<String>,
    pub url: String,
    pub signature: String,
}

/// Check whether a newer signed release is available from the configured
/// updater endpoint.
#[tauri::command]
pub async fn check_update(
    app: tauri::AppHandle,
) -> std::result::Result<Option<UpdateInfo>, String> {
    let updater = app.updater().map_err(|e| e.to_string())?;
    match updater.check().await.map_err(|e| e.to_string())? {
        Some(update) => Ok(Some(UpdateInfo {
            version: update.version,
            date: update.date.map(|d| d.to_string()),
            body: update.body,
            url: update.download_url.to_string(),
            signature: update.signature,
        })),
        None => Ok(None),
    }
}

/// Download, verify, and install the latest signed update, then restart the app.
#[tauri::command]
pub async fn install_update(app: tauri::AppHandle) -> std::result::Result<String, String> {
    let updater = app.updater().map_err(|e| e.to_string())?;
    match updater.check().await.map_err(|e| e.to_string())? {
        Some(update) => {
            update
                .download_and_install(|_chunk, _total| {}, || {})
                .await
                .map_err(|e| e.to_string())?;
            app.restart();
        }
        None => Ok("up to date".to_string()),
    }
}

/// Locate the Python mosh_cli.py bridge script.
/// Tries workspace root (dev), then executable directory (production).
fn locate_mosh_cli() -> Option<std::path::PathBuf> {
    let candidates = [
        // Dev layout: repo root from src-tauri/target/debug/
        Path::new("..")
            .join("..")
            .join("packages")
            .join("python-backend")
            .join("mosh_cli.py"),
        // Dev layout: running from src-tauri/
        Path::new("..")
            .join("packages")
            .join("python-backend")
            .join("mosh_cli.py"),
        // Production layout: resources/packages/python-backend/mosh_cli.py
        std::env::current_exe()
            .ok()
            .and_then(|p| p.parent().map(|p| p.to_path_buf()))
            .map(|p| {
                p.join("packages")
                    .join("python-backend")
                    .join("mosh_cli.py")
            })
            .unwrap_or_else(|| {
                Path::new("packages")
                    .join("python-backend")
                    .join("mosh_cli.py")
            }),
    ];
    for c in &candidates {
        if c.exists() {
            return Some(c.clone());
        }
    }
    None
}

/// Locate the bundled datamosh sidecar. Tauri strips the target-triple suffix
/// from `externalBin` entries, so in a real install it sits next to the app as
/// `mosh-cli.exe`; a dev checkout has the suffixed build in `src-tauri/bin`.
///
/// This exists because datamoshing used to need a Python interpreter AND numpy
/// on the user's machine, and the installer shipped neither -- so the app's
/// signature feature worked for developers and failed for everyone else.
fn locate_mosh_sidecar() -> Option<PathBuf> {
    if let Ok(exe) = std::env::current_exe() {
        if let Some(dir) = exe.parent() {
            for name in ["mosh-cli.exe", "mosh-cli"] {
                let candidate = dir.join(name);
                if candidate.exists() {
                    return Some(candidate);
                }
            }
        }
    }
    for name in [
        "mosh-cli-x86_64-pc-windows-msvc.exe",
        "mosh-cli-aarch64-apple-darwin",
        "mosh-cli-x86_64-apple-darwin",
        "mosh-cli-x86_64-unknown-linux-gnu",
        "mosh-cli.exe",
        "mosh-cli",
    ] {
        let candidate = Path::new("bin").join(name);
        if candidate.exists() {
            return Some(candidate);
        }
    }
    None
}

/// Locate a Python interpreter for running the FFglitch bridge script.
/// Prefers the bundled sam3_env venv, then system PATH.
fn find_python() -> Option<String> {
    if let Ok(exe) = std::env::current_exe() {
        if let Some(dir) = exe.parent() {
            if let Some(root) = dir.parent() {
                let venv = root.join("sam3_env").join("Scripts").join("python.exe");
                if venv.exists() {
                    return Some(venv.to_string_lossy().to_string());
                }
            }
        }
    }
    for name in ["python.exe", "python3.exe", "python"] {
        if crate::proc::command(name).arg("--version").output().is_ok() {
            return Some(name.to_string());
        }
    }
    None
}

/// Spawn `cmd`, polling for completion while checking `cancel` and an
/// overall `timeout`, instead of a single blocking `wait_with_output()`.
///
/// This is the mechanism that makes FFglitch cancellable and un-hangable
/// (see `run_ffglitch_subprocess` below), factored out on its own so it can
/// be exercised directly with an arbitrary command rather than only through
/// a full mosh_cli.py invocation. Mirrors `ffmpeg::output_with_timeout`
/// (stdout/stderr drained on separate threads while waiting, so a chatty
/// process cannot deadlock on a full pipe buffer) with the addition of the
/// cancel check, since this is the one subprocess path in the app a user
/// can proactively cancel mid-run rather than only time out.
fn run_cancellable(
    cmd: &mut Command,
    cancel: &AtomicBool,
    timeout: Duration,
    poll_interval: Duration,
) -> std::result::Result<std::process::Output, String> {
    use child_wait_timeout::ChildWT;
    use std::io::{ErrorKind, Read};

    let mut child = cmd
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .spawn()
        .map_err(|e| format!("Failed to spawn process: {}", e))?;

    let stdout = child
        .stdout
        .take()
        .ok_or_else(|| "Failed to open child stdout".to_string())?;
    let stderr = child
        .stderr
        .take()
        .ok_or_else(|| "Failed to open child stderr".to_string())?;
    let stdout_buf = Arc::new(Mutex::new(Vec::new()));
    let stderr_buf = Arc::new(Mutex::new(Vec::new()));
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

    let started = std::time::Instant::now();
    let status = loop {
        if cancel.load(Ordering::Relaxed) {
            let _ = child.kill();
            let _ = child.wait_timeout(Duration::from_secs(10));
            join_readers(stdout_thread, stderr_thread);
            return Err("Cancelled by user".to_string());
        }
        if started.elapsed() > timeout {
            let _ = child.kill();
            let _ = child.wait_timeout(Duration::from_secs(10));
            join_readers(stdout_thread, stderr_thread);
            return Err(format!("Process timed out after {:?}", timeout));
        }
        match child.wait_timeout(poll_interval) {
            Ok(status) => break status,
            Err(e) if e.kind() == ErrorKind::TimedOut => continue,
            Err(e) => {
                let _ = child.kill();
                join_readers(stdout_thread, stderr_thread);
                return Err(format!("Failed to wait for process: {}", e));
            }
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

/// FFglitch (mosh_cli.py, which itself shells out to ffgac/ffedit/ffmpeg
/// across multiple passes) has no built-in bound on how long it can run.
/// Without `run_cancellable`'s poll loop, a hung/stuck run could not be
/// cancelled (via `cancel`, the same `AtomicBool` `cancel_export` sets --
/// reused here so the one Cancel button in the UI works for both real
/// export and FFglitch) or force-killed after an overall timeout -- the
/// same "await that can never resolve" defect class as the mask-texture
/// freeze already fixed, plus a Cancel button with no actual path to the
/// subprocess it claimed to cancel.
/// `program` is either the bundled `mosh-cli` sidecar (in which case `script` is
/// None, because the entry point is compiled in) or a Python interpreter (in
/// which case `script` is `mosh_cli.py`).
fn run_ffglitch_subprocess(
    program: &str,
    script: Option<&Path>,
    temp_config_path: &str,
    ffgac: &str,
    ffedit: &str,
    ffmpeg: &str,
    cancel: &AtomicBool,
) -> std::result::Result<std::process::Output, String> {
    // Generous: raw-frame extraction plus two ffglitch passes plus re-encode
    // can legitimately take a while on a long/high-res clip. Doubled versus
    // the export path's own ENCODE_TIMEOUT (1800s) since FFglitch does more
    // total subprocess work per clip than a single ffmpeg encode.
    const FFGLITCH_TIMEOUT: Duration = Duration::from_secs(3600);
    const POLL_INTERVAL: Duration = Duration::from_millis(250);

    let mut command = crate::proc::command(program);
    if let Some(script) = script {
        command.arg(script);
    }
    run_cancellable(
        command
            .arg(temp_config_path)
            .env("MOSHDITHER_FFGAC_PATH", ffgac)
            .env("MOSHDITHER_FFEDIT_PATH", ffedit)
            .env("MOSHDITHER_FFMPEG_PATH", ffmpeg),
        cancel,
        FFGLITCH_TIMEOUT,
        POLL_INTERVAL,
    )
    .map_err(|e| format!("FFglitch: {e}"))
}

/// `"params": null` reaches mosh_cli.py as `None`, and its very first
/// `params.get(...)` raises `'NoneType' object has no attribute 'get'`. The
/// preview command passed exactly that for every mode, so "Preview this
/// mode" failed on all of them. An object -- empty or not -- is what the
/// script expects, and an empty one means "every knob at its default".
fn ffglitch_params_or_empty(params: serde_json::Value) -> serde_json::Value {
    match params {
        serde_json::Value::Object(_) => params,
        _ => serde_json::json!({}),
    }
}

/// Validates the extra file-path parameters that the motion_transfer/combine
/// modes forward to mosh_cli.py (params.motionUrl / params.combineVideos).
/// mosh_cli.py feeds these straight into FFglitch/ffmpeg as further input
/// files, with no validation on either side of the IPC boundary -- unlike
/// input_path/output_path, which are already checked. Returns Err on the
/// first path that fails the path_guard check; all other modes are left
/// untouched since they carry no file-path params. combineVideos mirrors
/// Python's own "media://" prefix stripping (mosh_cli.py) so this validates
/// the actual filesystem path Python will use, not the prefixed string.
fn validate_ffglitch_extra_paths(
    mode: &str,
    params: &serde_json::Value,
) -> std::result::Result<(), String> {
    if mode == "motion_transfer" {
        if let Some(url) = params.get("motionUrl").and_then(|v| v.as_str()) {
            validate_io_path(url, true)?;
        }
    } else if mode == "combine" {
        let videos: Vec<String> = match params.get("combineVideos") {
            Some(serde_json::Value::String(s)) => vec![s.clone()],
            Some(serde_json::Value::Array(items)) => items
                .iter()
                .filter_map(|v| v.as_str().map(str::to_string))
                .collect(),
            _ => Vec::new(),
        };
        for video in &videos {
            let stripped = video.strip_prefix("media://").unwrap_or(video);
            if !stripped.is_empty() {
                validate_io_path(stripped, true)?;
            }
        }
    }
    Ok(())
}

/// Longest frontend log line accepted, so a runaway loop in the webview cannot
/// fill the disk through this command.
const MAX_FRONTEND_LOG_LEN: usize = 4096;

/// Record a message from the frontend in the app's log file.
///
/// Release builds detach the console and ship no devtools, so anything the
/// webview logged went nowhere: an export that failed in the frontend -- before
/// it ever reached a Rust command -- left the log file showing only a clean
/// startup, which is exactly the state that made one such failure impossible to
/// investigate. Warnings and errors are forwarded here so both halves of the app
/// leave evidence in the same place.
#[tauri::command]
pub fn log_frontend(level: String, message: String) {
    let msg: String = message.chars().take(MAX_FRONTEND_LOG_LEN).collect();
    match level.as_str() {
        "error" => tracing::error!(target: "frontend", "{msg}"),
        "warn" => tracing::warn!(target: "frontend", "{msg}"),
        _ => tracing::info!(target: "frontend", "{msg}"),
    }
}

/// Marks the intermediate file written by a two-stage export (render the effect
/// stack, then datamosh the result). The name is checked before deletion, so
/// this command cannot be turned into an arbitrary file remover.
pub const EXPORT_TEMP_MARKER: &str = ".moshdither-fx-tmp.";

/// Delete an intermediate file produced by a two-stage export.
///
/// Deliberately narrow: it refuses any path whose file name does not carry
/// `EXPORT_TEMP_MARKER`, so a bug or a compromised webview cannot use it to
/// delete a user's media. Failure to clean up is not fatal to an export, so the
/// caller is expected to ignore the error rather than fail the job over it.
#[tauri::command]
pub fn remove_export_temp(path: String) -> std::result::Result<(), String> {
    let validated = validate_io_path(&path, true)?;
    let name = validated
        .file_name()
        .and_then(|n| n.to_str())
        .unwrap_or_default();
    if !name.contains(EXPORT_TEMP_MARKER) {
        return Err(format!(
            "Refusing to remove {name}: not a MoshDither export intermediate"
        ));
    }
    std::fs::remove_file(&validated).map_err(|e| e.to_string())
}

/// Apply an FFglitch datamoshing effect by delegating to the Python mosh_cli.py.
/// Render a SHORT moshed clip so a datamosh mode can be seen before committing.
///
/// FFglitch modes corrupt the compressed bitstream, so unlike every other effect
/// in this app they genuinely cannot be shown live -- there is nothing to
/// display until the file is re-encoded. That constraint is real. What did NOT
/// follow from it, and was simply a bad choice, is that the 34 modes were
/// therefore invisible until the user was already in the Export dialog: you met
/// them at save time or never.
///
/// This trims a couple of seconds out of the source and moshes only that, which
/// takes seconds instead of minutes and makes the modes browsable. The result
/// is cached per (source, mode, seconds) so flicking back and forth through the
/// list is instant after the first look.
#[tauri::command]
pub async fn preview_ffglitch(
    state: State<'_, AppState>,
    input_path: String,
    mode: String,
    start_secs: Option<f64>,
    duration_secs: Option<f64>,
    params: Option<serde_json::Value>,
) -> std::result::Result<String, String> {
    let validated = validate_io_path(&input_path, true)?;
    let source = validated.to_string_lossy().into_owned();
    let params = ffglitch_params_or_empty(params.unwrap_or(serde_json::Value::Null));
    let params_key = params.to_string();
    // Two seconds is enough to read a datamosh -- the smear needs a handful of
    // P-frames, not a whole clip -- and short enough that browsing modes stays
    // interactive.
    let seconds = duration_secs.unwrap_or(2.0).clamp(0.5, 10.0);
    let start = start_secs.unwrap_or(0.0).max(0.0);

    let dir = std::env::temp_dir()
        .join("moshdither-studio")
        .join("mosh-preview");
    std::fs::create_dir_all(&dir).map_err(|e| format!("Could not create preview dir: {e}"))?;

    // Keyed by everything that changes the result, so a cache hit is always the
    // right clip. The source path is hashed rather than embedded: it can be long,
    // and it can contain characters a filename cannot.
    let key = {
        use std::hash::{Hash, Hasher};
        let mut h = std::collections::hash_map::DefaultHasher::new();
        source.hash(&mut h);
        mode.hash(&mut h);
        format!("{start:.2}").hash(&mut h);
        format!("{seconds:.2}").hash(&mut h);
        // The knobs change the picture as much as the mode does.
        params_key.hash(&mut h);
        h.finish()
    };
    let out = dir.join(format!("mosh-preview-{key:016x}.mp4"));
    if out.exists() {
        if let Ok(m) = std::fs::metadata(&out) {
            if m.len() > 0 {
                return Ok(out.to_string_lossy().into_owned());
            }
        }
    }

    // Trim first. Moshing two seconds instead of the whole clip is the entire
    // point; handing the full source to the datamosher would be as slow as a
    // real export.
    let ffmpeg = ffmpeg_binary().map_err(|e| e.to_string())?;
    let trimmed = dir.join(format!("src-{key:016x}.mp4"));
    let trim = crate::proc::command(&ffmpeg)
        .args(["-v", "error", "-y", "-ss"])
        .arg(start.to_string())
        .arg("-i")
        .arg(&source)
        .args(["-t"])
        .arg(seconds.to_string())
        // Re-encode rather than stream-copy: a copy starts at the previous
        // keyframe and can hand the datamosher a clip with no P-frames to work
        // with, which is exactly the input that makes a mode produce nothing.
        .args([
            "-c:v", "libx264", "-preset", "veryfast", "-pix_fmt", "yuv420p", "-an",
        ])
        .arg(&trimmed)
        .output()
        .map_err(|e| format!("Could not run ffmpeg for the preview trim: {e}"))?;
    if !trim.status.success() {
        return Err(format!(
            "Could not trim a preview segment: {}",
            String::from_utf8_lossy(&trim.stderr)
                .lines()
                .last()
                .unwrap_or("unknown error")
        ));
    }

    let result = apply_ffglitch(
        state,
        trimmed.to_string_lossy().into_owned(),
        out.to_string_lossy().into_owned(),
        mode,
        params,
    )
    .await;
    let _ = std::fs::remove_file(&trimmed);
    result
}

#[tauri::command]
pub async fn apply_ffglitch(
    state: State<'_, AppState>,
    input_path: String,
    output_path: String,
    mode: String,
    params: serde_json::Value,
) -> std::result::Result<String, String> {
    let validated_input = validate_io_path(&input_path, true)?;
    let validated_output = validate_io_path(&output_path, false)?;
    let input_path = validated_input.to_string_lossy().into_owned();
    let output_path = validated_output.to_string_lossy().into_owned();
    let params = ffglitch_params_or_empty(params);

    validate_ffglitch_extra_paths(&mode, &params)?;

    // Prefer the bundled sidecar: it carries its own interpreter and numpy, so
    // datamoshing works on a machine with no Python at all. The interpreter
    // path stays as the dev fallback (and as an escape hatch if someone wants
    // to run a modified mosh_cli.py).
    let sidecar = locate_mosh_sidecar();
    let (program, script) = match &sidecar {
        Some(exe) => (exe.to_string_lossy().into_owned(), None),
        None => {
            let python = find_python().ok_or(
                "Datamoshing is unavailable: the datamosh component (mosh-cli) is missing and no \
                 compatible Python interpreter was found. Please reinstall the application.",
            )?;
            let cli = locate_mosh_cli().ok_or(
                "mosh_cli.py not found. Expected at ./packages/python-backend/mosh_cli.py",
            )?;
            (python, Some(cli))
        }
    };

    let ffgac = ffgac_binary().map_err(|e| e.to_string())?;
    let ffedit = ffedit_binary().map_err(|e| e.to_string())?;
    if !Path::new(&ffgac).exists() || !Path::new(&ffedit).exists() {
        return Err("FFglitch binaries (ffgac / ffedit) not found. Download them from ffglitch.org and place in src-tauri/bin/".to_string());
    }

    let ffmpeg = ffmpeg_binary().map_err(|e| e.to_string())?;

    let config = serde_json::json!({
        "input": input_path,
        "output": output_path,
        "mode": mode,
        "params": params,
    });

    let temp_config = std::env::temp_dir().join(format!(
        "ffglitch_config_{}_{}_{}.json",
        std::process::id(),
        rand::random::<u32>(),
        std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .map(|d| d.as_nanos())
            .unwrap_or(0)
    ));
    std::fs::write(&temp_config, config.to_string()).map_err(|e| e.to_string())?;

    // Serialize against export_video (this file, ~line 615): the two
    // commands share one export_cancel AtomicBool, so without this permit a
    // concurrently-running export_video and apply_ffglitch could reset or
    // trigger each other's cancel signal. Acquire the permit BEFORE
    // resetting the flag so a stale `true` left over from a previously
    // cancelled operation can't immediately abort this new one, and so this
    // reset can't race a still-running or queued export_video call.
    let permit = state
        .export_semaphore
        .clone()
        .acquire_owned()
        .await
        .map_err(|e| format!("Export queue error: {}", e))?;
    let cancel = state.export_cancel.clone();
    cancel.store(false, Ordering::Relaxed);

    // Run the blocking Python process on a spawn_blocking task to avoid
    // blocking the Tauri async runtime (which can cause command timeouts
    // and leave 0-byte output files).
    let temp_config_path = temp_config.to_string_lossy().to_string();
    let output_path_clone = output_path.clone();
    let result = tauri::async_runtime::spawn_blocking(move || {
        let _permit = permit;
        run_ffglitch_subprocess(
            &program,
            script.as_deref(),
            &temp_config_path,
            &ffgac,
            &ffedit,
            &ffmpeg,
            &cancel,
        )
        .map(|output| (output, output_path_clone))
    })
    .await
    .map_err(|e| format!("Task failed: {}", e))?;

    let _ = std::fs::remove_file(&temp_config);

    let (output, output_path) = result?;

    if !output.status.success() {
        // Clean up 0-byte output file if it was created
        let op = Path::new(&output_path);
        if op.exists() {
            if let Ok(meta) = std::fs::metadata(op) {
                if meta.len() == 0 {
                    let _ = std::fs::remove_file(op);
                }
            }
        }
        return Err(format!(
            "FFglitch failed: {}",
            String::from_utf8_lossy(&output.stderr)
        ));
    }

    // Verify the output file exists and has non-zero size
    let op = Path::new(&output_path);
    match std::fs::metadata(op) {
        Ok(meta) if meta.len() > 0 => Ok(output_path),
        Ok(_) => {
            // 0-byte file — remove it and report error with stderr
            let _ = std::fs::remove_file(op);
            Err(format!(
                "FFglitch produced a 0-byte output file. stderr: {}",
                String::from_utf8_lossy(&output.stderr)
            ))
        }
        Err(_) => Err(format!(
            "FFglitch completed but output file was not created. stderr: {}",
            String::from_utf8_lossy(&output.stderr)
        )),
    }
}

/// Generate a low-resolution proxy video for smooth preview editing.
/// Returns the proxy file path (or the original path if no proxy needed).
#[tauri::command]
pub async fn generate_proxy_command(
    source_path: String,
    max_width: u32,
    crf: u32,
) -> std::result::Result<String, String> {
    let validated = validate_io_path(&source_path, true)?;
    let path = validated.to_string_lossy().into_owned();
    tauri::async_runtime::spawn_blocking(move || {
        generate_proxy(&path, max_width, crf).map_err(|e| e.to_string())
    })
    .await
    .map_err(|e| format!("Task failed: {}", e))?
}

/// Turn a currently-loaded still image into a real multi-frame video by
/// looping its single frame for `duration_secs` at `fps`, then returns the
/// generated file's path so the frontend can load it back in through the
/// normal video-loading path (`load_media`). This is what lets the
/// video-only effect family (frame_reverse, shuffle, motion_transfer, ...)
/// operate on what started out as a still image.
#[tauri::command]
pub async fn animate_still_as_video(
    image_path: String,
    duration_secs: f64,
    fps: f64,
) -> std::result::Result<String, String> {
    let validated = validate_io_path(&image_path, true)?;
    let path = validated.to_string_lossy().into_owned();
    tauri::async_runtime::spawn_blocking(move || {
        image_to_video(&path, duration_secs, fps).map_err(|e| e.to_string())
    })
    .await
    .map_err(|e| format!("Task failed: {}", e))?
}

#[cfg(test)]
mod project_path_tests {
    use super::*;
    use std::fs;

    fn temp_project(name: &str) -> std::path::PathBuf {
        let p = std::env::temp_dir().join(name);
        fs::write(&p, b"{}").expect("write temp project file");
        p
    }

    #[test]
    fn accepts_allowed_project_extensions() {
        for name in [
            "mosh_guard_ok.moshdither",
            "mosh_guard_ok.json",
            "mosh_guard_ok.JSON",
        ] {
            let p = temp_project(name);
            let result = validate_project_path(p.to_string_lossy().as_ref(), false);
            let _ = fs::remove_file(&p);
            assert!(result.is_ok(), "{} should be accepted: {:?}", name, result);
        }
    }

    #[test]
    fn rejects_disallowed_extensions() {
        // The extension allowlist is the main thing limiting the blast radius
        // of read_file/save_file, so it needs direct coverage.
        for name in [
            "mosh_guard_bad.exe",
            "mosh_guard_bad.dll",
            "mosh_guard_bad.txt",
            "mosh_guard_bad",
        ] {
            let p = temp_project(name);
            let result = validate_project_path(p.to_string_lossy().as_ref(), false);
            let _ = fs::remove_file(&p);
            assert!(result.is_err(), "{} should be rejected", name);
        }
    }

    #[test]
    fn rejects_hidden_files() {
        let p = temp_project(".mosh_guard_hidden.json");
        let result = validate_project_path(p.to_string_lossy().as_ref(), false);
        let _ = fs::remove_file(&p);
        assert!(
            result.is_err(),
            "hidden files should be rejected: {:?}",
            result
        );
    }

    #[test]
    fn rejects_relative_paths() {
        assert!(validate_project_path("project.json", false).is_err());
        assert!(validate_project_path("../project.json", true).is_err());
    }

    #[test]
    fn rejects_system_directories() {
        // Regression guard: the previous implementation compared against
        // lowercase "c:\\windows\\" prefixes, but std::fs::canonicalize returns
        // verbatim paths like \\?\C:\Windows\..., so the check never fired on
        // the primary target platform.
        #[cfg(target_os = "windows")]
        {
            assert!(validate_project_path(r"C:\Windows\System32\config.json", true).is_err());
            assert!(validate_project_path(r"C:\ProgramData\secrets.json", true).is_err());
        }
        #[cfg(not(target_os = "windows"))]
        {
            assert!(validate_project_path("/etc/config.json", true).is_err());
            assert!(validate_project_path("/usr/share/app.json", true).is_err());
        }
    }

    #[test]
    fn returns_canonicalized_path_for_io() {
        // save_file/read_file must operate on the returned PathBuf rather than
        // the caller-supplied string, so the returned value has to be usable.
        let p = temp_project("mosh_guard_roundtrip.json");
        let resolved = validate_project_path(p.to_string_lossy().as_ref(), false)
            .expect("temp project file should validate");
        assert!(resolved.is_absolute());
        assert_eq!(
            resolved.extension().and_then(|e| e.to_str()),
            Some("json"),
            "extension should survive canonicalization"
        );
        let _ = fs::remove_file(&p);
    }

    #[cfg(target_os = "windows")]
    #[test]
    fn rejects_unc_project_paths() {
        assert!(validate_project_path(r"\\attacker\share\project.json", true).is_err());
    }
}

#[cfg(test)]
mod run_cancellable_tests {
    use super::*;

    // A short, reliable "hang" for exactly `secs` seconds, without depending
    // on a shell interactively (avoids `timeout`'s console-attachment quirk
    // on Windows). `ping` is present on every Windows install by default;
    // `sleep` is present on every Linux CI image (this project's `cargo
    // test` runs on ubuntu-latest) and macOS.
    fn hang_command(secs: u32) -> Command {
        #[cfg(target_os = "windows")]
        {
            let mut cmd = crate::proc::command("ping");
            cmd.args(["-n", &(secs + 1).to_string(), "127.0.0.1"]);
            cmd
        }
        #[cfg(not(target_os = "windows"))]
        {
            let mut cmd = crate::proc::command("sleep");
            cmd.arg(secs.to_string());
            cmd
        }
    }

    fn fast_command() -> Command {
        #[cfg(target_os = "windows")]
        {
            let mut c = crate::proc::command("cmd");
            c.args(["/C", "echo hello"]);
            c
        }
        #[cfg(not(target_os = "windows"))]
        {
            let mut c = crate::proc::command("echo");
            c.arg("hello");
            c
        }
    }

    #[test]
    fn returns_output_for_a_command_that_finishes_quickly() {
        let cancel = AtomicBool::new(false);
        let mut cmd = fast_command();
        let output = run_cancellable(
            &mut cmd,
            &cancel,
            Duration::from_secs(10),
            Duration::from_millis(50),
        )
        .expect("a fast, well-behaved command should succeed");
        assert!(output.status.success());
        assert!(String::from_utf8_lossy(&output.stdout).contains("hello"));
    }

    #[test]
    fn kills_a_hung_process_on_timeout_instead_of_blocking_forever() {
        // This is the exact defect class the FFglitch fix closes: without a
        // bound, a hung subprocess left the awaiting Tauri command's promise
        // unresolved forever (the same "stuck at ~0% CPU, looks frozen,
        // isn't a crash" signature diagnosed for the mask-texture bug).
        let cancel = AtomicBool::new(false);
        let mut cmd = hang_command(30);
        let started = std::time::Instant::now();
        let result = run_cancellable(
            &mut cmd,
            &cancel,
            Duration::from_secs(1),
            Duration::from_millis(50),
        );
        let elapsed = started.elapsed();

        assert!(
            result.is_err(),
            "a hung process must error, not hang the caller"
        );
        assert!(result.unwrap_err().contains("timed out"));
        assert!(
            elapsed < std::time::Duration::from_secs(20),
            "expected the timeout path to return well before the process's own 30s runtime, took {elapsed:?}"
        );
    }

    #[test]
    fn stops_a_running_process_when_cancel_flag_is_set() {
        // This is the other half of the FFglitch fix: the Cancel button used
        // to only reset local UI state while the subprocess kept running
        // untouched. Confirms flipping the same AtomicBool cancel_export
        // sets actually stops an in-progress run, well before its own
        // timeout or natural completion.
        let cancel = Arc::new(AtomicBool::new(false));
        let cancel_setter = Arc::clone(&cancel);
        std::thread::spawn(move || {
            std::thread::sleep(Duration::from_millis(300));
            cancel_setter.store(true, Ordering::Relaxed);
        });

        let mut cmd = hang_command(30);
        let started = std::time::Instant::now();
        let result = run_cancellable(
            &mut cmd,
            &cancel,
            Duration::from_secs(30),
            Duration::from_millis(50),
        );
        let elapsed = started.elapsed();

        assert!(
            result.is_err(),
            "a cancelled process must error, not hang the caller"
        );
        assert!(result.unwrap_err().contains("Cancelled"));
        assert!(
            elapsed < std::time::Duration::from_secs(20),
            "expected cancellation to stop the process well before its own 30s runtime, took {elapsed:?}"
        );
    }
}

#[cfg(test)]
mod ffglitch_extra_path_tests {
    use super::*;
    use std::fs;

    fn temp_media(name: &str) -> std::path::PathBuf {
        let p = std::env::temp_dir().join(name);
        fs::write(&p, b"fake media").expect("write temp media fixture");
        p
    }

    #[test]
    fn motion_transfer_accepts_an_existing_motion_url() {
        let p = temp_media("mosh_ffglitch_guard_motion_ok.mp4");
        let params = serde_json::json!({ "motionUrl": p.to_string_lossy() });
        let result = validate_ffglitch_extra_paths("motion_transfer", &params);
        let _ = fs::remove_file(&p);
        assert!(
            result.is_ok(),
            "existing motionUrl should be accepted: {result:?}"
        );
    }

    #[test]
    fn motion_transfer_rejects_a_motion_url_that_does_not_exist() {
        let missing = std::env::temp_dir().join("mosh_ffglitch_guard_motion_missing.mp4");
        let params = serde_json::json!({ "motionUrl": missing.to_string_lossy() });
        let result = validate_ffglitch_extra_paths("motion_transfer", &params);
        assert!(
            result.is_err(),
            "a motionUrl pointing at a nonexistent file must be rejected before reaching Python"
        );
    }

    #[test]
    fn combine_accepts_existing_videos_and_strips_the_media_prefix_before_checking() {
        let a = temp_media("mosh_ffglitch_guard_combine_a.mp4");
        let b = temp_media("mosh_ffglitch_guard_combine_b.mp4");
        // Mirrors mosh_cli.py's own "media://" prefix stripping.
        let prefixed = format!("media://{}", b.to_string_lossy());
        let params = serde_json::json!({ "combineVideos": [a.to_string_lossy(), prefixed] });
        let result = validate_ffglitch_extra_paths("combine", &params);
        let _ = fs::remove_file(&a);
        let _ = fs::remove_file(&b);
        assert!(
            result.is_ok(),
            "existing combineVideos entries, including a media://-prefixed one, should be accepted: {result:?}"
        );
    }

    #[test]
    fn combine_rejects_a_video_that_does_not_exist() {
        let a = temp_media("mosh_ffglitch_guard_combine_real.mp4");
        let missing = std::env::temp_dir().join("mosh_ffglitch_guard_combine_missing.mp4");
        let params = serde_json::json!({ "combineVideos": [a.to_string_lossy(), missing.to_string_lossy()] });
        let result = validate_ffglitch_extra_paths("combine", &params);
        let _ = fs::remove_file(&a);
        assert!(
            result.is_err(),
            "a combineVideos entry pointing at a nonexistent file must be rejected before reaching Python"
        );
    }

    #[test]
    fn other_modes_are_left_untouched_even_with_bogus_path_like_params() {
        // Modes like "fluid"/"stretch"/"classic" carry no file-path params,
        // so validation must not reach into params for them at all -- even
        // a nonsense/malicious-looking value here must not cause a reject.
        let params = serde_json::json!({ "motionUrl": "C:\\nonexistent\\evil.mp4" });
        let result = validate_ffglitch_extra_paths("fluid", &params);
        assert!(
            result.is_ok(),
            "modes without file-path params must not validate unrelated fields: {result:?}"
        );
    }
}

#[cfg(test)]
mod ffglitch_params_tests {
    use super::ffglitch_params_or_empty;

    /// Null is what the preview used to send; a bare number or string is what a
    /// hand-edited preset could send. All of them must become an object,
    /// because mosh_cli.py calls .get() on it before anything else.
    #[test]
    fn non_objects_become_an_empty_object() {
        for bad in [
            serde_json::Value::Null,
            serde_json::json!(3),
            serde_json::json!("zoom"),
            serde_json::json!([1, 2]),
        ] {
            assert_eq!(ffglitch_params_or_empty(bad), serde_json::json!({}));
        }
    }

    #[test]
    fn objects_pass_through_untouched() {
        let p = serde_json::json!({ "zoom": 80, "keepFirst": false });
        assert_eq!(ffglitch_params_or_empty(p.clone()), p);
    }
}

#[cfg(test)]
mod keyframe_export_tests {
    use super::*;

    fn kf(time: f64, value: f64, easing: &str) -> KeyframePoint {
        KeyframePoint {
            time,
            value,
            easing: Some(easing.to_string()),
        }
    }

    /// These numbers come from the TypeScript the preview uses
    /// (`applyEasing` / `getKeyframeValue` in src/store/index.ts). If the two
    /// implementations drift, the exported file stops matching the preview the
    /// user approved -- which is the whole point of exporting keyframes at all.
    #[test]
    fn easing_curves_match_the_frontend() {
        for (name, t, expected) in [
            ("linear", 0.25, 0.25),
            ("easeIn", 0.5, 0.25),
            ("easeOut", 0.5, 0.75),
            ("easeInOut", 0.25, 0.125),
            ("easeInOut", 0.75, 0.875),
            ("hold", 0.99, 0.0),
        ] {
            assert!(
                (apply_easing(t, name) - expected).abs() < 1e-9,
                "{name} at {t}: expected {expected}, got {}",
                apply_easing(t, name)
            );
        }
    }

    #[test]
    fn easing_clamps_out_of_range_and_nan_like_the_frontend() {
        assert_eq!(apply_easing(-5.0, "linear"), 0.0);
        assert_eq!(apply_easing(5.0, "linear"), 1.0);
        assert_eq!(apply_easing(f64::NAN, "linear"), 0.0);
        // An easing name this build does not know must behave as linear, not panic.
        assert!((apply_easing(0.4, "bounce-out-elastic") - 0.4).abs() < 1e-9);
    }

    #[test]
    fn a_value_is_held_before_the_first_key_and_after_the_last() {
        let track = [kf(1.0, 10.0, "linear"), kf(3.0, 30.0, "linear")];
        assert_eq!(keyframe_value_at(&track, 0.0), Some(10.0));
        assert_eq!(keyframe_value_at(&track, 99.0), Some(30.0));
        assert_eq!(keyframe_value_at(&track, 1.0), Some(10.0));
        assert_eq!(keyframe_value_at(&track, 3.0), Some(30.0));
    }

    #[test]
    fn a_value_interpolates_between_neighbours_with_the_left_keys_easing() {
        let track = [kf(0.0, 0.0, "linear"), kf(2.0, 100.0, "linear")];
        assert_eq!(keyframe_value_at(&track, 1.0), Some(50.0));

        // "hold" on the LEFT key freezes it until the right key is reached.
        let held = [kf(0.0, 0.0, "hold"), kf(2.0, 100.0, "linear")];
        assert_eq!(keyframe_value_at(&held, 1.9), Some(0.0));
        assert_eq!(keyframe_value_at(&held, 2.0), Some(100.0));
    }

    #[test]
    fn an_empty_or_degenerate_track_is_survivable() {
        assert_eq!(keyframe_value_at(&[], 1.0), None);
        // Two keys at the same instant must not divide by zero.
        let same = [kf(1.0, 5.0, "linear"), kf(1.0, 9.0, "linear")];
        assert!(keyframe_value_at(&same, 1.0).is_some());
    }

    #[test]
    fn injection_overwrites_only_the_animated_parameters() {
        let mut tracks = std::collections::HashMap::new();
        tracks.insert(
            "amount".to_string(),
            vec![kf(0.0, 0.0, "linear"), kf(2.0, 100.0, "linear")],
        );
        let mut params = serde_json::Map::new();
        params.insert("amount".to_string(), serde_json::Value::from(7.0));
        params.insert("other".to_string(), serde_json::Value::from(3.0));

        assert!(inject_keyframe_params(Some(&tracks), &mut params, 1.0));
        assert_eq!(params["amount"], serde_json::Value::from(50.0));
        assert_eq!(
            params["other"],
            serde_json::Value::from(3.0),
            "an un-keyframed parameter must be left alone"
        );

        // No keyframes at all: nothing touched, and the caller can skip re-clamping.
        let mut untouched = serde_json::Map::new();
        untouched.insert("amount".to_string(), serde_json::Value::from(7.0));
        assert!(!inject_keyframe_params(None, &mut untouched, 1.0));
        assert_eq!(untouched["amount"], serde_json::Value::from(7.0));
    }

    /// The payload must survive a frontend that sends no `keyframes` key at all
    /// -- every preview call still does.
    #[test]
    fn an_effect_call_without_keyframes_still_deserializes() {
        let call: EffectCall =
            serde_json::from_str(r#"{"effect_id":"dithering.bayer","params":{},"mask_b64":null}"#)
                .expect("payloads without keyframes must still parse");
        assert!(call.keyframes.is_none());
    }

    #[test]
    fn an_effect_call_with_keyframes_deserializes() {
        let call: EffectCall = serde_json::from_str(
            r#"{"effect_id":"dithering.bayer","params":{},"mask_b64":null,
                "keyframes":{"amount":[{"time":0,"value":1,"easing":"linear"},
                                       {"time":2,"value":9,"easing":"easeIn"}]}}"#,
        )
        .expect("parses");
        let tracks = call.keyframes.expect("present");
        assert_eq!(tracks["amount"].len(), 2);
        assert_eq!(keyframe_value_at(&tracks["amount"], 0.0), Some(1.0));
    }
}
