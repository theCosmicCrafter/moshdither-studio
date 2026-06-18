//! Spout real-time GPU output — Windows-only GPU texture sharing.
//!
//! # Architecture
//! 1. Rust backend creates a Spout sender via the Spout2 C++ SDK.
//! 2. WebGL renders frames to an offscreen FBO.
//! 3. Rust reads back GPU texture via `glReadPixels` or shared GL/D3D texture.
//! 4. Spout sender publishes the texture for external apps (Resolume, OBS, etc).
//!
//! # Prerequisites
//! - `spout2` crate (or custom FFI bindings to `Spout2.dll`)
//! - `windows` crate for HWND/D3D interop
//!
//! # Integration Path
//! ```text
//! Frontend: enableSpout() ──► Tauri IPC ──► Rust: create_sender()
//!                                                    │
//! WebGL render loop ◄─── FBO readback ◄─── Spout::sendTexture()
//! ```

use crate::error::{AppError, Result};

/// Spout sender state.
pub struct SpoutSender {
    name: String,
    width: u32,
    height: u32,
    // active: bool, // populated when FFI is wired
}

impl SpoutSender {
    pub fn new(name: &str, width: u32, height: u32) -> Self {
        Self {
            name: name.to_string(),
            width,
            height,
        }
    }

    /// Initialize the Spout sender. Placeholder until FFI is wired.
    pub fn initialize(&mut self) -> Result<()> {
        // TODO: Call Spout SDK CreateSender(name, width, height, shareHandle)
        // This requires linking against Spout2.dll or using a Rust wrapper.
        println!("Spout sender '{}' initialized (stub)", self.name);
        Ok(())
    }

    /// Send a GPU texture. Placeholder.
    pub fn send_texture(&self, _texture_id: u32) -> Result<()> {
        // TODO: Call Spout SDK SendTexture(texture_id, target, width, height, ...)
        Ok(())
    }

    /// Release the sender. Placeholder.
    pub fn release(&mut self) {
        // TODO: Call Spout SDK ReleaseSender()
        println!("Spout sender '{}' released (stub)", self.name);
    }
}

/// Global sender instance (managed by Tauri state).
static mut SPOUT_SENDER: Option<SpoutSender> = None;

/// Create a new Spout sender.
pub fn create_spout_sender(name: &str, width: u32, height: u32) -> Result<()> {
    let mut sender = SpoutSender::new(name, width, height);
    sender.initialize()?;
    unsafe {
        SPOUT_SENDER = Some(sender);
    }
    Ok(())
}

/// Send the current framebuffer to Spout.
pub fn spout_send_frame() -> Result<()> {
    unsafe {
        if let Some(ref sender) = SPOUT_SENDER {
            // In production: read the active WebGL FBO texture ID
            // and pass it to sender.send_texture(texture_id)
            sender.send_texture(0)?;
            Ok(())
        } else {
            Err(AppError::Ffmpeg("Spout sender not initialized".to_string()))
        }
    }
}

/// Destroy the Spout sender.
pub fn destroy_spout_sender() {
    unsafe {
        if let Some(ref mut sender) = SPOUT_SENDER {
            sender.release();
        }
        SPOUT_SENDER = None;
    }
}
