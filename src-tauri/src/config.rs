use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AppConfig {
    pub ffmpeg_path: Option<String>,
    pub preview_resolution: (u32, u32),
    pub default_export_format: String,
}

impl Default for AppConfig {
    fn default() -> Self {
        Self {
            ffmpeg_path: None,
            preview_resolution: (640, 480),
            default_export_format: "mp4".to_string(),
        }
    }
}