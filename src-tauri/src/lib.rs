pub mod audio;
pub mod commands;
pub mod config;
pub mod error;

pub mod dsp;
pub mod effects;
pub mod ffmpeg;
pub mod optical_flow;
pub mod sam3_engine;
pub mod segmentation;
pub mod spout;
pub mod utils;

use commands::{
    apply_effect, apply_effect_stack, export_video, get_frame_data, get_media_info, list_effects,
    list_effects_by_category, load_media, load_media_from_base64, read_file, sam3_auto_mask,
    sam3_box_prompt, sam3_clear, sam3_init, sam3_load_image, sam3_point_prompt,
    sam3_postprocess_mask, sam3_shutdown, sam3_text_prompt, save_file, save_media, AppState,
};

pub fn run() {
    println!("Initializing Tauri Builder...");
    tauri::Builder::default()
        .setup(|_app| {
            println!("Tauri setup running...");
            Ok(())
        })
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_shell::init())
        .manage(AppState::default())
        .invoke_handler(tauri::generate_handler![
            load_media,
            load_media_from_base64,
            list_effects,
            list_effects_by_category,
            apply_effect,
            apply_effect_stack,
            get_frame_data,
            save_media,
            export_video,
            get_media_info,
            sam3_init,
            sam3_load_image,
            sam3_text_prompt,
            sam3_point_prompt,
            sam3_box_prompt,
            sam3_auto_mask,
            sam3_postprocess_mask,
            sam3_clear,
            sam3_shutdown,
            save_file,
            read_file,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
    println!("Tauri app running successfully");
}
