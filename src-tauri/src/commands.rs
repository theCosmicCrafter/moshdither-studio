use crate::effects::{EffectCategory, EffectMeta, EffectRegistry, Frame};
use crate::ffmpeg::{decode_video, encode_video};
use crate::sam3_engine::Sam3Engine;
use crate::utils::image_io::{load_image, load_image_from_memory, save_png};
use image::ImageFormat;
use serde_json::json;
use std::io::Cursor;
use std::path::Path;
use std::sync::Mutex;
use tauri::State;

/// Global application state shared across commands.
pub struct AppState {
    pub registry: Mutex<EffectRegistry>,
    pub current_frame: Mutex<Option<Frame>>,
    pub sam3: Mutex<Option<Sam3Engine>>,
}

impl Default for AppState {
    fn default() -> Self {
        Self {
            registry: Mutex::new(EffectRegistry::new()),
            current_frame: Mutex::new(None),
            sam3: Mutex::new(None),
        }
    }
}

/// Load an image or video file into the app.
#[tauri::command]
pub async fn load_media(state: State<'_, AppState>, path: String) -> std::result::Result<String, String> {
    let path_clone = path.clone();
    let frame = tauri::async_runtime::spawn_blocking(move || {
        let ext = Path::new(&path_clone)
            .extension()
            .and_then(|e| e.to_str())
            .unwrap_or("")
            .to_lowercase();

        let video_exts = ["mp4", "avi", "mov", "mkv", "webm", "m4v", "flv", "wmv", "mpeg", "mpg"];

        if video_exts.contains(&ext.as_str()) {
            // Decode first frame of video
            let segment = decode_video(&path_clone, Some(1)).map_err(|e| e.to_string())?;
            segment.frames.into_iter().next().ok_or("No frames decoded".to_string())
        } else {
            load_image(&path_clone).map_err(|e| e.to_string())
        }
    })
    .await
    .map_err(|e| format!("Task failed: {}", e))??;

    *state.current_frame.lock().unwrap() = Some(frame);
    Ok(path)
}

/// Load an image from a base64 data URL into the app.
#[tauri::command]
pub async fn load_media_from_base64(
    state: State<'_, AppState>,
    data_url: String,
) -> std::result::Result<String, String> {
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

fn decode_mask_b64(mask_b64: Option<String>) -> std::result::Result<Option<crate::effects::Mask>, String> {
    let Some(b64) = mask_b64 else { return Ok(None); };
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
    let mut working = frame_lock
        .as_ref()
        .ok_or("No media loaded")?
        .clone();
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
            if m.width == working.width && m.height == working.height {
                for i in 0..(working.width * working.height) as usize {
                    let mask_val = m.data[i] as f32 / 255.0;
                    let idx = i * 4;
                    for c in 0..3 {
                        let old_val = previous.data[idx + c] as f32;
                        let new_val = working.data[idx + c] as f32;
                        working.data[idx + c] = (old_val * (1.0 - mask_val) + new_val * mask_val) as u8;
                    }
                }
            }
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
}

/// Apply a stack of effects to the currently loaded image.
#[tauri::command]
pub fn apply_effect_stack(
    state: State<'_, AppState>,
    stack: Vec<EffectCall>,
    mask_b64: Option<String>,
) -> std::result::Result<String, String> {
    let frame_lock = state.current_frame.lock().unwrap();
    let mut working = frame_lock
        .as_ref()
        .ok_or("No media loaded")?
        .clone();
    drop(frame_lock);

    let global_mask = decode_mask_b64(mask_b64)?;

    let registry = state.registry.lock().unwrap();
    for call in stack {
        let effect = registry
            .get(&call.effect_id)
            .ok_or_else(|| format!("Effect '{}' not found", call.effect_id))?;
        let previous = working.clone();
        let effect_handles_mask = effect.handles_masking();

        // Per-effect mask overrides global mask
        let per_effect_mask = if let Some(ref b64) = call.mask_b64 {
            decode_mask_b64(Some(b64.clone()))?
        } else {
            None
        };
        let active_mask = per_effect_mask.as_ref().or(global_mask.as_ref());

        working = effect
            .process_frame(&working, active_mask, &call.params)
            .map_err(|e| e.to_string())?;

        // Only apply post-process mask blend for effects that don't handle masking internally.
        if !effect_handles_mask {
            if let Some(m) = active_mask {
                if m.width == working.width && m.height == working.height {
                    for i in 0..(working.width * working.height) as usize {
                        let mask_val = m.data[i] as f32 / 255.0;
                        let idx = i * 4;
                        for c in 0..3 {
                            let old_val = previous.data[idx + c] as f32;
                            let new_val = working.data[idx + c] as f32;
                            working.data[idx + c] = (old_val * (1.0 - mask_val) + new_val * mask_val) as u8;
                        }
                    }
                }
            }
        }
    }

    let img = image::RgbaImage::from_raw(working.width, working.height, working.data)
        .ok_or("Invalid frame data after processing.")?;
    let mut buf = Cursor::new(Vec::new());
    img.write_to(&mut buf, ImageFormat::Png)
        .map_err(|e| e.to_string())?;

    let b64 = base64::Engine::encode(&base64::engine::general_purpose::STANDARD, buf.into_inner());
    Ok(format!("data:image/png;base64,{}", b64))
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
#[tauri::command]
pub fn save_media(
    state: State<'_, AppState>,
    path: String,
) -> std::result::Result<String, String> {
    let frame_lock = state.current_frame.lock().unwrap();
    let frame = frame_lock.as_ref().ok_or("No media loaded")?;
    save_png(frame, &path).map_err(|e| e.to_string())?;
    Ok(path)
}

/// Export a video by decoding, applying the effect stack via `process_video`, and re-encoding.
/// Effects that implement custom `process_video` (e.g. temporal / cross-frame effects)
/// will work correctly; others fall back to per-frame `process_frame` inside their own
/// `process_video` implementation.
#[tauri::command]
pub fn export_video(
    state: State<'_, AppState>,
    source_path: String,
    output_path: String,
    stack: Vec<EffectCall>,
    mask_b64: Option<String>,
    codec: Option<String>,
    fps: Option<f64>,
    width: Option<u32>,
    height: Option<u32>,
) -> std::result::Result<String, String> {
    // Decode the full source video
    let mut segment = decode_video(&source_path, None)
        .map_err(|e| e.to_string())?;

    // Apply resolution override if specified
    if let (Some(w), Some(h)) = (width, height) {
        if w != segment.frames[0].width || h != segment.frames[0].height {
            // Resize frames to target resolution
            for frame in &mut segment.frames {
                if let Some(img) = image::RgbaImage::from_raw(frame.width, frame.height, frame.data.clone()) {
                    let resized = image::imageops::resize(&img, w, h, image::imageops::FilterType::Lanczos3);
                    frame.width = w;
                    frame.height = h;
                    frame.data = resized.into_raw();
                }
            }
        }
    }

    let global_mask = decode_mask_b64(mask_b64)?;

    // Apply the effect stack using `process_video` so temporal effects work
    let registry = state.registry.lock().unwrap();
    for call in &stack {
        let effect = registry
            .get(&call.effect_id)
            .ok_or_else(|| format!("Effect '{}' not found", call.effect_id))?;
        let previous = segment.clone();

        // Per-effect mask overrides global mask
        let per_effect_mask = if let Some(ref b64) = call.mask_b64 {
            decode_mask_b64(Some(b64.clone()))?
        } else {
            None
        };
        let active_mask = per_effect_mask.as_ref().or(global_mask.as_ref());

        segment = effect
            .process_video(&segment, active_mask, &call.params)
            .map_err(|e| e.to_string())?;

        // Post-process mask blend for effects that don't handle masking internally
        if !effect.handles_masking() {
            if let Some(m) = active_mask {
                for (i, frame) in segment.frames.iter_mut().enumerate() {
                    if m.width == frame.width && m.height == frame.height {
                        let prev = &previous.frames[i];
                        for px in 0..(frame.width * frame.height) as usize {
                            let mask_val = m.data[px] as f32 / 255.0;
                            let idx = px * 4;
                            for c in 0..3 {
                                let old_val = prev.data[idx + c] as f32;
                                let new_val = frame.data[idx + c] as f32;
                                frame.data[idx + c] = (old_val * (1.0 - mask_val) + new_val * mask_val) as u8;
                            }
                        }
                    }
                }
            }
        }
    }
    drop(registry);

    // Re-encode the processed segment
    let codec_str = codec.as_deref().unwrap_or("libx264");
    encode_video(&segment, &output_path, codec_str, fps)
        .map_err(|e| e.to_string())?;

    Ok(output_path)
}

/// Get the current image dimensions.
#[tauri::command]
pub fn get_media_info(state: State<'_, AppState>) -> std::result::Result<serde_json::Value, String> {
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
    let f32_points: Vec<[f32; 2]> = points.into_iter().map(|[x, y]| [x as f32, y as f32]).collect();
    let masks = engine.point_prompt(f32_points, labels).map_err(|e| e.to_string())?;
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
    let f32_boxes: Vec<[f32; 4]> = boxes.into_iter().map(|[x1, y1, x2, y2]| [x1 as f32, y1 as f32, x2 as f32, y2 as f32]).collect();
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
    use std::io::Cursor;
    use image::ImageFormat;

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
        img.write_to(&mut buf, ImageFormat::Png)
            .unwrap();

        let b64 = base64::Engine::encode(&base64::engine::general_purpose::STANDARD, buf.into_inner());
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
        let b64 = base64::Engine::encode(&base64::engine::general_purpose::STANDARD, buf.into_inner());
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
        assert!(effect.handles_masking(), "MaskIsolate should report it handles masking internally");
    }

    #[test]
    fn test_generic_effect_does_not_handle_masking() {
        use crate::effects::artistic::Grayscale;
        use crate::effects::types::Effect;

        let effect = Grayscale::default();
        assert!(!effect.handles_masking(), "Grayscale should not handle masking internally");
    }
}

/// Save a JSON string to a file path.
#[tauri::command]
pub async fn save_file(path: String, contents: String) -> std::result::Result<(), String> {
    std::fs::write(&path, contents).map_err(|e| e.to_string())
}

/// Read a file as a string.
#[tauri::command]
pub async fn read_file(path: String) -> std::result::Result<String, String> {
    std::fs::read_to_string(&path).map_err(|e| e.to_string())
}
