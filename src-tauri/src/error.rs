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

    /// The SAM3 sidecar's IPC transport is dead: a pipe write failed or the
    /// bridge's stdout channel closed because the process exited. Distinct
    /// from `Sam3Timeout` — the caller may restart the engine and retry once.
    #[error("SAM3 pipe error: {0}")]
    Sam3Pipe(String),

    /// A shared-state mutex was poisoned by a panic on another thread. The
    /// payload carries the full message including the lock name.
    #[error("{0}")]
    LockPoisoned(String),

    /// A spawned blocking task failed to join (it panicked or was cancelled).
    #[error("Task failed: {0}")]
    TaskJoin(#[from] tokio::task::JoinError),

    /// The export semaphore was closed while a command waited on it.
    #[error("Export queue error: {0}")]
    ExportQueue(#[from] tokio::sync::AcquireError),

    #[error("{0}")]
    Generic(String),
}

impl AppError {
    /// True when the failure means the SAM3 sidecar's IPC transport is dead
    /// and the engine should be restarted and retried once. A `Sam3Timeout`
    /// or a bridge-reported error is NOT a transport failure.
    pub fn is_sam3_transport_failure(&self) -> bool {
        matches!(self, AppError::Io(_) | AppError::Sam3Pipe(_))
    }
}

/// Tauri commands serialize the error payload back to the frontend; the
/// contract is a plain string, so serialize as the Display message.
impl serde::Serialize for AppError {
    fn serialize<S: serde::Serializer>(
        &self,
        serializer: S,
    ) -> std::result::Result<S::Ok, S::Error> {
        serializer.collect_str(self)
    }
}

/// A spawn_blocking/join failure reaches commands as tauri::Error: the join
/// variant means the task died, everything else keeps its own message.
impl From<tauri::Error> for AppError {
    fn from(e: tauri::Error) -> Self {
        match e {
            tauri::Error::JoinError(j) => AppError::TaskJoin(j),
            other => AppError::Generic(other.to_string()),
        }
    }
}

/// Generic poisoned-lock conversion for sites that do not need the lock's
/// name in the message; named sites go through `commands::lock_state`.
impl<T> From<std::sync::PoisonError<T>> for AppError {
    fn from(e: std::sync::PoisonError<T>) -> Self {
        AppError::LockPoisoned(format!("lock poisoned: {e}"))
    }
}

impl From<tauri_plugin_updater::Error> for AppError {
    fn from(e: tauri_plugin_updater::Error) -> Self {
        AppError::Generic(e.to_string())
    }
}

impl From<image::ImageError> for AppError {
    fn from(e: image::ImageError) -> Self {
        AppError::Image(e.to_string())
    }
}

/// Helpers that still surface plain-string errors convert losslessly:
/// `Generic` displays the message unchanged.
impl From<String> for AppError {
    fn from(e: String) -> Self {
        AppError::Generic(e)
    }
}

impl From<&str> for AppError {
    fn from(e: &str) -> Self {
        AppError::Generic(e.to_string())
    }
}

pub type Result<T> = std::result::Result<T, AppError>;
