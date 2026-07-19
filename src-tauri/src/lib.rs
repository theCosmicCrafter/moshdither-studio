pub mod audio;
pub mod commands;
pub mod config;
pub mod error;

pub mod dsp;
pub mod effects;
pub mod environment;
pub mod ffmpeg;
pub mod path_guard;
pub mod sam3_engine;
pub mod spout;
pub mod utils;

use commands::{
    apply_effect, apply_effect_stack, apply_ffglitch, cancel_export, check_update, export_video,
    generate_proxy_command, get_frame_data, get_media_info, get_media_metadata, install_update,
    list_effects, list_effects_by_category, load_media, load_media_from_base64, prepare_custom_lut,
    read_file, sam3_auto_mask, sam3_box_prompt, sam3_clear, sam3_init, sam3_load_image,
    sam3_point_prompt, sam3_postprocess_mask, sam3_refine_mask, sam3_shutdown, sam3_text_prompt,
    sam3_video_predictor, save_file, save_media, test_all_functions, verify_effects, AppState,
};
use environment::{get_environment_status, install_local_environment};
use tauri::Manager;

pub fn run() {
    println!("Initializing Tauri Builder...");
    tauri::Builder::default()
        .setup(|_app| {
            println!("Tauri setup running...");
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
        .invoke_handler(tauri::generate_handler![
            load_media,
            load_media_from_base64,
            list_effects,
            list_effects_by_category,
            apply_effect,
            apply_effect_stack,
            apply_ffglitch,
            cancel_export,
            check_update,
            install_update,
            get_frame_data,
            save_media,
            export_video,
            prepare_custom_lut,
            get_media_info,
            get_media_metadata,
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
            verify_effects,
            test_all_functions,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
    println!("Tauri app running successfully");
}
