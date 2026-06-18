use thiserror::Error;

#[derive(Debug, Error)]
pub enum AppError {
    #[error("IO error: {0}")]
    Io(#[from] std::io::Error),

    #[error("Image error: {0}")]
    Image(String),

    #[error("FFmpeg error: {0}")]
    Ffmpeg(String),

    #[error("Effect not found: {0}")]
    EffectNotFound(String),

    #[error("Invalid parameter: {0}")]
    InvalidParameter(String),

    #[error("Serialization error: {0}")]
    Serialization(#[from] serde_json::Error),

    #[error("SAM3 timeout: {0}")]
    Sam3Timeout(String),

    #[error("{0}")]
    Generic(String),
}

pub type Result<T> = std::result::Result<T, AppError>;
