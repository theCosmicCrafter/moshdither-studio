#![allow(clippy::too_many_arguments)]

use crate::effects::{
    blend_mask, functional_tests::run_all_function_tests, verification::verify_all_effects,
    EffectCategory, EffectMeta, EffectRegistry, Frame,
};
use crate::ffmpeg::{
    decode_video, encode_video, ffedit_binary, ffgac_binary, ffmpeg_binary, generate_proxy,
    probe_metadata,
};
use crate::sam3_engine::Sam3Engine;
use crate::utils::image_io::{load_image, load_image_from_memory, save_image};
use image::ImageFormat;
use rayon::prelude::*;
use serde_json::json;
use std::io::Cursor;
use std::path::Path;
use std::process::{Command, Stdio};
use std::sync::{Arc, Mutex};
use tauri::{Emitter, State};

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
}

impl Default for AppState {
    fn default() -> Self {
        Self {
            registry: Arc::new(Mutex::new(EffectRegistry::new())),
            current_frame: Mutex::new(None),
            sam3: Mutex::new(None),
            frame_cache: Mutex::new(EffectCache::default()),
        }
    }
}

/// Load an image or video file into the app.
#[tauri::command]
pub async fn load_media(
    state: State<'_, AppState>,
    path: String,
) -> std::result::Result<String, String> {
    let path_clone = path.clone();
    let frame = tauri::async_runtime::spawn_blocking(move || {
        let ext = Path::new(&path_clone)
            .extension()
            .and_then(|e| e.to_str())
            .unwrap_or("")
            .to_lowercase();

        let video_exts = [
            "mp4", "avi", "mov", "mkv", "webm", "m4v", "flv", "wmv", "mpeg", "mpg",
        ];

        if video_exts.contains(&ext.as_str()) {
            // Decode first frame of video
            let segment = decode_video(&path_clone, Some(1)).map_err(|e| e.to_string())?;
            segment
                .frames
                .into_iter()
                .next()
                .ok_or("No frames decoded".to_string())
        } else {
            load_image(&path_clone).map_err(|e| e.to_string())
        }
    })
    .await
    .map_err(|e| format!("Task failed: {}", e))??;

    *state.current_frame.lock().unwrap() = Some(frame);
    *state.frame_cache.lock().unwrap() = EffectCache::default();
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

    *state.current_frame.lock().unwrap() = Some(frame);
    *state.frame_cache.lock().unwrap() = EffectCache::default();
    Ok("loaded".to_string())
}

/// Get metadata for all available effects.
#[tauri::command]
pub fn list_effects(state: State<'_, AppState>) -> Vec<EffectMeta> {
    let registry = state.registry.lock().unwrap();
    registry.list()
}

/// Get effects filtered by category.
#[tauri::command]
pub fn list_effects_by_category(
    state: State<'_, AppState>,
    category: EffectCategory,
) -> Vec<EffectMeta> {
    let registry = state.registry.lock().unwrap();
    registry.list_by_category(category)
}

/// Run the full effect verification suite.
/// Checks every registered effect for: no-crash, non-empty output,
/// animation, and mask correctness (inside/outside modes).
/// Returns a structured JSON report.
#[tauri::command]
pub fn verify_effects(
    state: State<'_, AppState>,
) -> std::result::Result<crate::effects::verification::VerificationReport, String> {
    let registry = state.registry.lock().unwrap();
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
    mask_b64: Option<String>,
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

/// Apply a single effect to the currently loaded image.
#[tauri::command]
pub fn apply_effect(
    state: State<'_, AppState>,
    effect_id: String,
    params: serde_json::Map<String, serde_json::Value>,
    mask_b64: Option<String>,
) -> std::result::Result<String, String> {
    let frame_lock = state.current_frame.lock().unwrap();
    let mut working = frame_lock.as_ref().ok_or("No media loaded")?.clone();
    drop(frame_lock);

    let mask = decode_mask_b64(mask_b64)?;

    let registry = state.registry.lock().unwrap();
    let effect = registry
        .get(&effect_id)
        .ok_or_else(|| format!("Effect '{}' not found", effect_id))?;
    let previous = working.clone();
    let effect_handles_mask = effect.handles_masking();
    working = effect
        .process_frame(&working, mask.as_ref(), &params)
        .map_err(|e| e.to_string())?;

    // Only apply post-process mask blend for effects that don't handle masking internally.
    // Mask-aware effects (e.g., MaskIsolate) already apply the mask in process_frame,
    // so applying it again would cause double-mask corruption.
    if !effect_handles_mask {
        if let Some(m) = &mask {
            blend_mask(&mut working, &previous, m, "inside");
        }
    }

    // Encode result
    let img = image::RgbaImage::from_raw(working.width, working.height, working.data)
        .ok_or("Invalid frame data after processing.")?;
    let mut buf = Cursor::new(Vec::new());
    img.write_to(&mut buf, ImageFormat::Png)
        .map_err(|e| e.to_string())?;

    let b64 = base64::Engine::encode(&base64::engine::general_purpose::STANDARD, buf.into_inner());
    Ok(format!("data:image/png;base64,{}", b64))
}

#[derive(serde::Deserialize)]
pub struct EffectCall {
    pub effect_id: String,
    pub params: serde_json::Map<String, serde_json::Value>,
    pub mask_b64: Option<String>,
    #[serde(default)]
    pub mask_mode: Option<String>,
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
    let frame_lock = state.current_frame.lock().unwrap();
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
        downscale_frame(&original, preview_scale.unwrap())
    } else {
        original.clone()
    };

    // Decode masks — no need to downscale; blend_mask and process_frame
    // already handle dimension mismatches via nearest-neighbor sampling.
    let global_mask = decode_mask_b64(mask_b64.clone())?;

    let registry = state.registry.lock().unwrap();
    let mut use_cache = true;
    let mut new_cache = Vec::new();

    // Check if scale or global mask changed
    {
        let cache_lock = state.frame_cache.lock().unwrap();
        if cache_lock.scale != preview_scale || cache_lock.global_mask_b64 != mask_b64 {
            use_cache = false;
        }
    }

    for (i, call) in stack.into_iter().enumerate() {
        if use_cache {
            let cache_lock = state.frame_cache.lock().unwrap();
            if i < cache_lock.entries.len() {
                let entry = &cache_lock.entries[i];
                if entry.effect_id == call.effect_id
                    && entry.params == call.params
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

        let effect = registry
            .get(&call.effect_id)
            .ok_or_else(|| format!("Effect '{}' not found", call.effect_id))?;
        let previous = working.clone();
        let effect_handles_mask = effect.handles_masking();

        // Per-effect mask overrides global mask
        let per_effect_mask = if let Some(ref b64) = call.mask_b64 {
            eprintln!(
                "[MASK DEBUG] Effect {}: mask_b64 present, len={}",
                call.effect_id,
                b64.len()
            );
            decode_mask_b64(Some(b64.clone()))?
        } else {
            eprintln!(
                "[MASK DEBUG] Effect {}: no per-effect mask_b64",
                call.effect_id
            );
            None
        };
        let active_mask = per_effect_mask.as_ref().or(global_mask.as_ref());

        working = effect
            .process_frame(&working, active_mask, &call.params)
            .map_err(|e| e.to_string())?;

        // Only apply post-process mask blend for effects that don't handle masking internally.
        if !effect_handles_mask {
            if let Some(m) = active_mask {
                let mode = call.mask_mode.as_deref().unwrap_or("inside");
                eprintln!(
                    "[MASK DEBUG] Effect {}: blend_mask called, mode={}, mask {}x{}",
                    call.effect_id, mode, m.width, m.height
                );
                blend_mask(&mut working, &previous, m, mode);
            } else {
                eprintln!(
                    "[MASK DEBUG] Effect {}: no active mask, skipping blend",
                    call.effect_id
                );
            }
        } else {
            eprintln!(
                "[MASK DEBUG] Effect {}: effect handles masking internally",
                call.effect_id
            );
        }

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
        let mut cache_lock = state.frame_cache.lock().unwrap();
        cache_lock.scale = preview_scale;
        cache_lock.global_mask_b64 = mask_b64;
        cache_lock.entries = new_cache;
    }

    // Upscale back to original resolution if we downscaled
    if working.width != orig_w || working.height != orig_h {
        working = upscale_frame(&working, orig_w, orig_h);
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
fn downscale_frame(frame: &Frame, scale: f32) -> Frame {
    let new_w = ((frame.width as f32 * scale) as u32).max(1);
    let new_h = ((frame.height as f32 * scale) as u32).max(1);
    let img = image::RgbaImage::from_raw(frame.width, frame.height, frame.data.clone())
        .unwrap_or_else(|| image::RgbaImage::from_raw(1, 1, vec![0, 0, 0, 255]).unwrap());
    let resized = image::imageops::resize(
        &img,
        new_w,
        new_h,
        image::imageops::FilterType::Triangle, // bilinear — fast and good enough for preview
    );
    Frame {
        width: new_w,
        height: new_h,
        data: resized.into_raw(),
    }
}

/// Upscale a Frame back to the target dimensions.
fn upscale_frame(frame: &Frame, target_w: u32, target_h: u32) -> Frame {
    let img = image::RgbaImage::from_raw(frame.width, frame.height, frame.data.clone())
        .unwrap_or_else(|| image::RgbaImage::from_raw(1, 1, vec![0, 0, 0, 255]).unwrap());
    let resized = image::imageops::resize(
        &img,
        target_w,
        target_h,
        image::imageops::FilterType::Lanczos3, // higher quality for final display
    );
    Frame {
        width: target_w,
        height: target_h,
        data: resized.into_raw(),
    }
}

/// Get the current frame as base64 PNG.
#[tauri::command]
pub fn get_frame_data(state: State<'_, AppState>) -> std::result::Result<String, String> {
    let frame_lock = state.current_frame.lock().unwrap();
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
    let frame_lock = state.current_frame.lock().unwrap();
    let frame = frame_lock.as_ref().ok_or("No media loaded")?;
    save_image(frame, &path, format.as_deref(), quality).map_err(|e| e.to_string())?;
    Ok(path)
}

/// Export a video by decoding, applying the effect stack, and re-encoding.
/// Audio-reactive effects receive per-frame audio params when `audio_bake_json` is provided.
/// Temporal effects (datamoshing) use `process_video` for cross-frame correctness.
/// Non-temporal effects are processed frame-by-frame with audio params injected.
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
) -> std::result::Result<String, String> {
    let registry = state.registry.clone();

    tauri::async_runtime::spawn_blocking(move || {
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

    // Decode the full source video
    eprintln!("[export] Decoding source: {}", source_path);
    let _ = app_handle.emit(
        "export-progress",
        serde_json::json!({"stage": "decoding", "progress": 0}),
    );
    let mut segment = decode_video(&source_path, None).map_err(|e| e.to_string())?;
    eprintln!(
        "[export] Decoded {} frames, {}x{}, fps={}",
        segment.frames.len(),
        segment.frames.first().map(|f| f.width).unwrap_or(0),
        segment.frames.first().map(|f| f.height).unwrap_or(0),
        segment.fps
    );

    // Memory guard: reject exports that would likely OOM
    if let Some(first) = segment.frames.first() {
        let frame_mb = (first.data.len() as f64) / (1024.0 * 1024.0);
        let total_mb = frame_mb * segment.frames.len() as f64;
        eprintln!(
            "[export] Memory estimate: {:.1} MB per frame, {:.1} MB total for {} frames",
            frame_mb,
            total_mb,
            segment.frames.len()
        );
        if total_mb > 4000.0 {
            let msg = format!(
                "Video too large to export safely: {:.0} MB for {} frames. Try trimming the range or lowering resolution.",
                total_mb,
                segment.frames.len()
            );
            eprintln!("[export] REJECTED: {}", msg);
            let _ = app_handle.emit(
                "export-progress",
                serde_json::json!({"stage": "error", "message": msg}),
            );
            return Err(msg);
        }
        if total_mb > 2000.0 {
            eprintln!(
                "[export] WARNING: Large memory usage ({:.0} MB). May cause OOM crash.",
                total_mb
            );
        }
    }

    // If the source is a still image (1 frame), duplicate it to fill the desired duration
    if segment.frames.len() == 1 {
        let effective_fps = fps.unwrap_or(30.0);
        let target_duration = trim_end.unwrap_or(10.0);
        let target_frames = (target_duration * effective_fps).round() as usize;
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
        segment.frames = segment.frames[start_frame..end_frame].to_vec();
        if segment.frames.is_empty() {
            return Err("Trim range resulted in no frames".to_string());
        }
    }

    // Resolution override is now handled by FFmpeg -vf scale in encode_video

    let global_mask = decode_mask_b64(mask_b64)?;

    // Track whether audio bake data was provided (before it's consumed)
    let has_audio_bake = audio_bake_json.is_some();

    // Deserialize audio bake data if provided
    let audio_data: Option<crate::audio::AudioBakeData> =
        audio_bake_json.and_then(|json| serde_json::from_str(&json).ok());

    // Apply the effect stack
    eprintln!("[export] Applying {} effects", stack.len());
    let _ = app_handle.emit(
        "export-progress",
        serde_json::json!({"stage": "effects", "progress": 5, "total": stack.len(), "current": 0}),
    );
    let registry = registry.lock().unwrap();
    for (effect_idx, call) in stack.iter().enumerate() {
        let effect = registry
            .get(&call.effect_id)
            .ok_or_else(|| format!("Effect '{}' not found", call.effect_id))?;
        eprintln!(
            "[export] Effect {}/{}: {} (temporal={})",
            effect_idx + 1,
            stack.len(),
            call.effect_id,
            effect.is_temporal()
        );

        // Per-effect mask overrides global mask
        let per_effect_mask = if let Some(ref b64) = call.mask_b64 {
            decode_mask_b64(Some(b64.clone()))?
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
            // Temporal effects: must use sequential process_video for cross-frame correctness
            segment = effect
                .process_video(&segment, active_mask, &call.params)
                .map_err(|e| e.to_string())?;
        } else if audio_data.is_none() {
            // Non-temporal, no audio: parallelize frame processing with rayon
            let mask_ref = active_mask;
            let params_ref = &call.params;
            let fps_val = segment.fps;
            let results: std::result::Result<Vec<_>, _> = segment
                .frames
                .par_iter()
                .enumerate()
                .map(|(idx, frame)| {
                    let mut frame_params = params_ref.clone();
                    frame_params.insert(
                        "time".to_string(),
                        serde_json::Value::from(idx as f64 / fps_val),
                    );
                    effect.process_frame(frame, mask_ref, &frame_params)
                })
                .collect();
            segment.frames = results.map_err(|e| e.to_string())?;
        } else {
            // Non-temporal with audio: process frame-by-frame with per-frame audio params
            let mut frames = Vec::with_capacity(segment.frames.len());
            let fps_val = segment.fps;
            for (frame_idx, frame) in segment.frames.iter().enumerate() {
                let mut frame_params = call.params.clone();
                frame_params.insert(
                    "time".to_string(),
                    serde_json::Value::from(frame_idx as f64 / fps_val),
                );
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
            eprintln!(
                "[export] Blending mask (mode={}) for {} frames",
                mode,
                segment.frames.len()
            );
            segment
                .frames
                .par_iter_mut()
                .enumerate()
                .for_each(|(i, frame)| {
                    blend_mask(frame, &prev[i], m, mode);
                });
        }

        eprintln!("[export] Effect {}/{} done", effect_idx + 1, stack.len());
        let pct = 5 + ((effect_idx + 1) as f64 / stack.len() as f64 * 80.0) as u32;
        let _ = app_handle.emit("export-progress", serde_json::json!({"stage": "effects", "progress": pct, "total": stack.len(), "current": effect_idx + 1}));
    }
    drop(registry);
    eprintln!("[export] All effects applied, proceeding to encode");
    let _ = app_handle.emit(
        "export-progress",
        serde_json::json!({"stage": "encoding", "progress": 90}),
    );

    // Determine codec: explicit codec > format-derived > default
    let codec_str = codec.as_deref().unwrap_or({
        match format.as_deref() {
            Some("webm") => "vp9",
            Some("gif") | Some("png_seq") => "libx264", // container is still mp4 for gif/png_seq
            _ => "libx264",
        }
    });

    // If include_audio is set, skip audio bake (we'll copy source audio directly)
    let effective_include_audio = include_audio.unwrap_or(false) && !has_audio_bake;

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
    )
    .map_err(|e| e.to_string())?;
    let _ = app_handle.emit(
        "export-progress",
        serde_json::json!({"stage": "done", "progress": 100}),
    );

    Ok(output_path)
}

/// Get metadata for a media file.
#[tauri::command]
pub fn get_media_metadata(path: String) -> std::result::Result<serde_json::Value, String> {
    let meta = probe_metadata(&path).map_err(|e| e.to_string())?;
    Ok(json!(meta))
}

/// Get the current image dimensions.
#[tauri::command]
pub fn get_media_info(
    state: State<'_, AppState>,
) -> std::result::Result<serde_json::Value, String> {
    let frame_lock = state.current_frame.lock().unwrap();
    match frame_lock.as_ref() {
        Some(frame) => Ok(json!({
            "width": frame.width,
            "height": frame.height,
            "loaded": true
        })),
        None => Ok(json!({ "loaded": false })),
    }
}

/// ── SAM3 Segmentation Commands ─────────────────────────────
#[tauri::command]
pub fn sam3_init(state: State<'_, AppState>) -> std::result::Result<String, String> {
    let mut sam3_lock = state.sam3.lock().unwrap();
    if sam3_lock.is_none() {
        match Sam3Engine::new() {
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
    state: State<'_, AppState>,
    image_b64: String,
) -> std::result::Result<serde_json::Value, String> {
    let sam3_lock = state.sam3.lock().unwrap();
    let engine = sam3_lock
        .as_ref()
        .ok_or("SAM3 engine not initialized. Call sam3_init first.")?;
    let (w, h) = engine.load_image(image_b64).map_err(|e| e.to_string())?;
    Ok(json!({ "width": w, "height": h }))
}

/// Run a text prompt on the currently loaded SAM3 image.
#[tauri::command]
pub fn sam3_text_prompt(
    state: State<'_, AppState>,
    prompt: String,
) -> std::result::Result<serde_json::Value, String> {
    let sam3_lock = state.sam3.lock().unwrap();
    let engine = sam3_lock
        .as_ref()
        .ok_or("SAM3 engine not initialized. Call sam3_init first.")?;
    let masks = engine.text_prompt(prompt).map_err(|e| e.to_string())?;
    let count = masks.len();
    let (mask_b64s, scores): (Vec<String>, Vec<f64>) = masks.into_iter().unzip();
    Ok(json!({
        "count": count,
        "masks": mask_b64s,
        "scores": scores,
    }))
}

/// Run a point-click prompt on the currently loaded SAM3 image.
#[tauri::command]
pub fn sam3_point_prompt(
    state: State<'_, AppState>,
    points: Vec<[f64; 2]>,
    labels: Option<Vec<i32>>,
) -> std::result::Result<serde_json::Value, String> {
    let sam3_lock = state.sam3.lock().unwrap();
    let engine = sam3_lock
        .as_ref()
        .ok_or("SAM3 engine not initialized. Call sam3_init first.")?;
    let f32_points: Vec<[f32; 2]> = points
        .into_iter()
        .map(|[x, y]| [x as f32, y as f32])
        .collect();
    let masks = engine
        .point_prompt(f32_points, labels)
        .map_err(|e| e.to_string())?;
    let count = masks.len();
    let (mask_b64s, scores): (Vec<String>, Vec<f64>) = masks.into_iter().unzip();
    Ok(json!({
        "count": count,
        "masks": mask_b64s,
        "scores": scores,
    }))
}

/// Run a box prompt on the currently loaded SAM3 image.
#[tauri::command]
pub fn sam3_box_prompt(
    state: State<'_, AppState>,
    boxes: Vec<[f64; 4]>,
) -> std::result::Result<serde_json::Value, String> {
    let sam3_lock = state.sam3.lock().unwrap();
    let engine = sam3_lock
        .as_ref()
        .ok_or("SAM3 engine not initialized. Call sam3_init first.")?;
    let f32_boxes: Vec<[f32; 4]> = boxes
        .into_iter()
        .map(|[x1, y1, x2, y2]| [x1 as f32, y1 as f32, x2 as f32, y2 as f32])
        .collect();
    let masks = engine.box_prompt(f32_boxes).map_err(|e| e.to_string())?;
    let count = masks.len();
    let (mask_b64s, scores): (Vec<String>, Vec<f64>) = masks.into_iter().unzip();
    Ok(json!({
        "count": count,
        "masks": mask_b64s,
        "scores": scores,
    }))
}

/// Run auto-mask grid generation on the currently loaded SAM3 image.
#[tauri::command]
pub fn sam3_auto_mask(
    state: State<'_, AppState>,
    grid_size: u32,
    iou_threshold: f32,
    min_mask_region_area: u32,
) -> std::result::Result<serde_json::Value, String> {
    let sam3_lock = state.sam3.lock().unwrap();
    let engine = sam3_lock
        .as_ref()
        .ok_or("SAM3 engine not initialized. Call sam3_init first.")?;
    let masks = engine
        .auto_mask(grid_size, iou_threshold, min_mask_region_area)
        .map_err(|e| e.to_string())?;
    let count = masks.len();
    let (mask_b64s, scores): (Vec<String>, Vec<f64>) = masks.into_iter().unzip();
    Ok(json!({
        "count": count,
        "masks": mask_b64s,
        "scores": scores,
    }))
}

/// Run video predictor on a list of frames.
#[tauri::command]
pub fn sam3_video_predictor(
    state: State<'_, AppState>,
    frames: Vec<String>,
    prompt: Option<String>,
) -> std::result::Result<serde_json::Value, String> {
    let sam3_lock = state.sam3.lock().unwrap();
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
    state: State<'_, AppState>,
    mask_b64: String,
    points: Vec<[f64; 2]>,
    labels: Option<Vec<i32>>,
) -> std::result::Result<serde_json::Value, String> {
    let sam3_lock = state.sam3.lock().unwrap();
    let engine = sam3_lock
        .as_ref()
        .ok_or("SAM3 engine not initialized. Call sam3_init first.")?;
    let f32_points: Vec<[f32; 2]> = points
        .into_iter()
        .map(|[x, y]| [x as f32, y as f32])
        .collect();
    let masks = engine
        .refine_mask(mask_b64, f32_points, labels)
        .map_err(|e| e.to_string())?;
    let count = masks.len();
    let (mask_b64s, scores): (Vec<String>, Vec<f64>) = masks.into_iter().unzip();
    Ok(json!({
        "status": "ok",
        "count": count,
        "masks": mask_b64s,
        "scores": scores,
    }))
}

/// Post-process a single mask (grow/shrink/feather/fill holes).
#[tauri::command]
pub fn sam3_postprocess_mask(
    state: State<'_, AppState>,
    mask_b64: String,
    grow: i32,
    shrink: i32,
    feather: i32,
    fill_holes: bool,
) -> std::result::Result<String, String> {
    let sam3_lock = state.sam3.lock().unwrap();
    let engine = sam3_lock
        .as_ref()
        .ok_or("SAM3 engine not initialized. Call sam3_init first.")?;
    engine
        .postprocess_mask(mask_b64, grow, shrink, feather, fill_holes)
        .map_err(|e| e.to_string())
}

/// Clear SAM3 state (image + masks).
#[tauri::command]
pub fn sam3_clear(state: State<'_, AppState>) -> std::result::Result<String, String> {
    let sam3_lock = state.sam3.lock().unwrap();
    if let Some(engine) = sam3_lock.as_ref() {
        engine.clear().map_err(|e| e.to_string())?;
    }
    Ok("SAM3 state cleared".into())
}

/// Shutdown the SAM3 bridge process.
#[tauri::command]
pub fn sam3_shutdown(state: State<'_, AppState>) -> std::result::Result<String, String> {
    let mut sam3_lock = state.sam3.lock().unwrap();
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

    #[test]
    fn test_load_and_convert_media() {
        let path = r"C:\Windows\Web\Wallpaper\Spotlight\img14.jpg".to_string();
        let frame = load_image(&path).unwrap();
        assert!(frame.width > 0);
        assert!(frame.height > 0);
        assert_eq!(frame.data.len(), (frame.width * frame.height * 4) as usize);

        let img = image::RgbaImage::from_raw(frame.width, frame.height, frame.data)
            .ok_or("Invalid frame data.")
            .unwrap();
        let mut buf = Cursor::new(Vec::new());
        img.write_to(&mut buf, ImageFormat::Png).unwrap();

        let b64 =
            base64::Engine::encode(&base64::engine::general_purpose::STANDARD, buf.into_inner());
        assert!(!b64.is_empty());
        let data_url = format!("data:image/png;base64,{}", b64);
        assert!(data_url.starts_with("data:image/png;base64,"));
        println!("Success! data_url length: {}", data_url.len());
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

        let mask = decode_mask_b64(Some(data_url)).unwrap();
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
        let result = decode_mask_b64(Some("not-valid-base64!!!".to_string()));
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
        blend_mask(&mut working, &previous, &mask, "inside");

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
        blend_mask(&mut working, &previous, &mask, "outside");

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
        blend_mask(&mut working, &previous, &mask, "alpha");

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

        blend_mask(&mut working, &previous, &mask, "inside");

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
        let mask = decode_mask_b64(Some(mask_b64)).unwrap().unwrap();

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
        blend_mask(&mut working, &previous, &mask, "inside");

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
            blend_mask(&mut working, &previous, &mask, "inside");
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

        blend_mask(&mut working, &previous, &mask, "inside");

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
/// Blocks system directories and enforces allowed extensions.
fn validate_project_path(path: &str, is_write: bool) -> std::result::Result<(), String> {
    let p = std::path::Path::new(path);

    let file_name = p
        .file_name()
        .and_then(|n| n.to_str())
        .ok_or_else(|| "Invalid path: no file name".to_string())?;

    let ext = p
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

    let canonical = p
        .canonicalize()
        .or_else(|_| {
            if is_write {
                if let Some(parent) = p.parent() {
                    return parent.canonicalize().map(|_| p.to_path_buf());
                }
            }
            Err(std::io::Error::new(
                std::io::ErrorKind::NotFound,
                "Path not found",
            ))
        })
        .map_err(|e| format!("Cannot resolve path: {}", e))?;

    let canonical_str = canonical.to_string_lossy().to_lowercase();
    let blocked_prefixes: &[&str] = &[
        "c:\\windows\\",
        "c:\\program files\\",
        "c:\\program files (x86)\\",
        "c:\\programdata\\",
        "/etc/",
        "/usr/",
        "/bin/",
        "/sbin/",
        "/boot/",
        "/sys/",
        "/proc/",
    ];

    for prefix in blocked_prefixes {
        if canonical_str.starts_with(prefix) {
            return Err(format!(
                "Access denied: path '{}' is in a protected system directory",
                canonical.display()
            ));
        }
    }

    if file_name.starts_with('.') {
        return Err("Access denied: hidden files are not allowed".to_string());
    }

    Ok(())
}

/// Save a JSON string to a file path.
/// Validates path safety and enforces a maximum file size.
#[tauri::command]
pub async fn save_file(path: String, contents: String) -> std::result::Result<(), String> {
    eprintln!(
        "[SAVE DEBUG] save_file called: path={}, contents_len={}",
        path,
        contents.len()
    );
    if contents.len() > PROJECT_FILE_MAX_SIZE {
        eprintln!("[SAVE DEBUG] Rejected: contents too large");
        return Err(format!(
            "File contents too large: {} bytes (max {} bytes)",
            contents.len(),
            PROJECT_FILE_MAX_SIZE
        ));
    }
    if let Err(e) = validate_project_path(&path, true) {
        eprintln!("[SAVE DEBUG] Path validation failed: {}", e);
        return Err(e);
    }
    eprintln!("[SAVE DEBUG] Path validation passed, writing file...");
    match std::fs::write(&path, contents) {
        Ok(_) => {
            eprintln!("[SAVE DEBUG] File written successfully");
            Ok(())
        }
        Err(e) => {
            eprintln!("[SAVE DEBUG] File write failed: {}", e);
            Err(e.to_string())
        }
    }
}

/// Read a file as a string.
/// Validates path safety and enforces a maximum file size.
#[tauri::command]
pub async fn read_file(path: String) -> std::result::Result<String, String> {
    validate_project_path(&path, false)?;
    let meta = std::fs::metadata(&path).map_err(|e| e.to_string())?;
    if meta.len() as usize > PROJECT_FILE_MAX_SIZE {
        return Err(format!(
            "File too large: {} bytes (max {} bytes)",
            meta.len(),
            PROJECT_FILE_MAX_SIZE
        ));
    }
    std::fs::read_to_string(&path).map_err(|e| e.to_string())
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
        if Command::new(name).arg("--version").output().is_ok() {
            return Some(name.to_string());
        }
    }
    None
}

/// Apply an FFglitch datamoshing effect by delegating to the Python mosh_cli.py.
#[tauri::command]
pub async fn apply_ffglitch(
    input_path: String,
    output_path: String,
    mode: String,
    params: serde_json::Value,
) -> std::result::Result<String, String> {
    let python = find_python()
        .ok_or("Python interpreter not found. Install sam3_env or add python to PATH")?;

    let ffgac = ffgac_binary().map_err(|e| e.to_string())?;
    let ffedit = ffedit_binary().map_err(|e| e.to_string())?;
    if !Path::new(&ffgac).exists() || !Path::new(&ffedit).exists() {
        return Err("FFglitch binaries (ffgac / ffedit) not found. Download them from ffglitch.org and place in src-tauri/bin/".to_string());
    }

    let ffmpeg = ffmpeg_binary().map_err(|e| e.to_string())?;

    let mosh_cli = locate_mosh_cli()
        .ok_or("mosh_cli.py not found. Expected at ./packages/python-backend/mosh_cli.py")?;

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

    // Run the blocking Python process on a spawn_blocking task to avoid
    // blocking the Tauri async runtime (which can cause command timeouts
    // and leave 0-byte output files).
    let temp_config_path = temp_config.to_string_lossy().to_string();
    let output_path_clone = output_path.clone();
    let result = tauri::async_runtime::spawn_blocking(move || {
        let child = Command::new(&python)
            .arg(&mosh_cli)
            .arg(&temp_config_path)
            .env("MOSHDITHER_FFGAC_PATH", &ffgac)
            .env("MOSHDITHER_FFEDIT_PATH", &ffedit)
            .env("MOSHDITHER_FFMPEG_PATH", &ffmpeg)
            .stdout(Stdio::piped())
            .stderr(Stdio::piped())
            .spawn()
            .map_err(|e| format!("Failed to spawn mosh_cli.py: {}", e))?;

        let output = child
            .wait_with_output()
            .map_err(|e| format!("Failed to wait for mosh_cli.py: {}", e))?;

        Ok::<_, String>((output, output_path_clone))
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
    let path = source_path.clone();
    tauri::async_runtime::spawn_blocking(move || {
        generate_proxy(&path, max_width, crf).map_err(|e| e.to_string())
    })
    .await
    .map_err(|e| format!("Task failed: {}", e))?
}
