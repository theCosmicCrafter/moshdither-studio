pub mod audio;
pub mod commands;
pub mod config;
pub mod crash;
pub mod error;
pub mod window_commands;

pub mod dsp;
pub mod effects;
pub mod environment;
pub mod ffmpeg;
pub mod path_guard;
pub mod presets;
pub mod sam3_engine;
pub mod utils;

use commands::{
    animate_still_as_video, apply_effect_stack, apply_ffglitch, cancel_export, check_update,
    export_video, extract_audio_from_video, generate_proxy_command, get_frame_data, get_media_info,
    get_media_metadata, install_update, list_effects, list_effects_by_category, load_media,
    load_media_from_base64, prepare_custom_lut, read_file, remove_export_temp, sam3_auto_mask,
    sam3_box_prompt, sam3_clear, sam3_init, sam3_load_image, sam3_point_prompt,
    sam3_postprocess_mask, sam3_refine_mask, sam3_shutdown, sam3_text_prompt, sam3_video_predictor,
    save_file, save_media, save_processed_image, test_all_functions, verify_effects, AppState,
};
use environment::{get_environment_status, install_local_environment};
// Only used inside the macOS/Windows-gated window-vibrancy setup below; on
// Linux neither cfg branch compiles, which would leave these imports (and the
// `window` binding around them) unused under `-D warnings`. CI runs on Linux
// and this project's own dev machine is Windows-only, so this class of
// platform-specific warning has no local signal at all -- clean locally says
// nothing about a target this machine never builds for.
#[cfg(any(target_os = "macos", target_os = "windows"))]
use tauri::utils::config::WindowEffectsConfig;
#[cfg(any(target_os = "macos", target_os = "windows"))]
use tauri::window::Effect;
use tauri::Manager;
use window_commands::{dock_window_appbar, get_monitor_info, snap_to_edge, undock_window_appbar};

pub fn run() {
    tracing::info!("Initializing Tauri Builder...");
    tauri::Builder::default()
        .setup(|app| {
            tracing::info!("Tauri setup complete.");
            // `app` is only read inside the macOS/Windows-gated block below; on
            // every other target that block is stripped entirely, which would
            // otherwise leave the closure's `app` parameter unused under
            // `-D warnings` (the same class of bug window_commands.rs hit).
            let _ = &app;
            #[cfg(any(target_os = "macos", target_os = "windows"))]
            if let Some(window) = app.get_webview_window("main") {
                #[cfg(target_os = "macos")]
                let _ = window.set_effects(WindowEffectsConfig {
                    effects: vec![Effect::HudWindow],
                    state: None,
                    radius: Some(16.0),
                    color: None,
                });

                #[cfg(target_os = "windows")]
                let _ = window.set_effects(WindowEffectsConfig {
                    effects: vec![Effect::Acrylic, Effect::Mica],
                    state: None,
                    radius: None,
                    color: None,
                });
            }
            Ok(())
        })
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_updater::Builder::new().build())
        .manage(AppState::default())
        .on_window_event(|window, event| {
            if matches!(event, tauri::WindowEvent::CloseRequested { .. }) {
                let app = window.app_handle();
                let state = app.state::<AppState>();
                if let Ok(mut sam3) = state.sam3.lock() {
                    if let Some(engine) = sam3.as_mut() {
                        let _ = engine.shutdown();
                    }
                };
            }
        })
        // Seven of these are registered but never invoked from the frontend.
        // They are recorded here so a later audit does not mistake them for
        // broken wiring, and so nobody adopts one expecting it to be the
        // established path:
        //
        //   get_environment_status / install_local_environment
        //       A Python-environment setup flow that was never built a UI. The
        //       need is real -- SAM3 and the FFglitch export both require Python
        //       and neither tells the user when it is missing -- but wiring it
        //       means designing that flow, not just calling these.
        //   get_monitor_info
        //       Exists so edge-snapping can compute proximity locally instead of
        //       an IPC round-trip per move event. useWindowEdgeSnap never
        //       adopted it. A perf refinement, not a fault.
        //   list_effects_by_category
        //       Superseded: the UI fetches list_effects once and filters
        //       client-side.
        //   sam3_refine_mask
        //       A genuine SAM3 capability (refine an existing mask with new
        //       points) that MaskPanel does not expose yet.
        //   save_media
        //       Saves the CURRENT frame. The frontend wants the PROCESSED frame
        //       and calls save_processed_image instead. Not a duplicate, just
        //       rarely what anyone wants.
        //   test_all_functions
        //       Development diagnostic, driven from mosh-verify rather than the
        //       app.
        //
        // Every registered command is callable from the webview, so unused ones
        // are IPC surface for no benefit. They are kept rather than removed
        // because each represents intended functionality; drop the registration
        // (not the function) if that trade stops being worth it.
        .invoke_handler(tauri::generate_handler![
            presets::get_presets_path,
            presets::load_presets,
            presets::save_presets,
            load_media,
            load_media_from_base64,
            list_effects,
            list_effects_by_category,
            apply_effect_stack,
            apply_ffglitch,
            remove_export_temp,
            cancel_export,
            check_update,
            install_update,
            get_frame_data,
            save_media,
            save_processed_image,
            export_video,
            prepare_custom_lut,
            get_media_info,
            get_media_metadata,
            extract_audio_from_video,
            sam3_init,
            sam3_load_image,
            sam3_text_prompt,
            sam3_point_prompt,
            sam3_box_prompt,
            sam3_auto_mask,
            sam3_refine_mask,
            sam3_postprocess_mask,
            sam3_clear,
            sam3_shutdown,
            sam3_video_predictor,
            save_file,
            read_file,
            get_environment_status,
            install_local_environment,
            generate_proxy_command,
            animate_still_as_video,
            verify_effects,
            test_all_functions,
            get_monitor_info,
            snap_to_edge,
            dock_window_appbar,
            undock_window_appbar,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
    tracing::info!("Tauri app running successfully");
}
