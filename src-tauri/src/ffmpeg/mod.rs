//! FFmpeg orchestration — decode, encode, probe, and sidecar management.

use crate::effects::types::{Frame, VideoSegment};
use crate::error::{AppError, Result};
use std::path::Path;
use std::process::{Command, Stdio};

/// Locate the FFmpeg binary. Tries bundled sidecar first, then PATH.
pub fn ffmpeg_binary() -> Result<String> {
    // Check bundled binary next to executable (production)
    if let Ok(exe) = std::env::current_exe() {
        if let Some(dir) = exe.parent() {
            let bundled = dir.join("ffmpeg.exe");
            if bundled.exists() {
                return Ok(bundled.to_string_lossy().to_string());
            }
        }
    }
    // Check development path (src-tauri/bin)
    let dev = Path::new("bin").join("ffmpeg.exe");
    if dev.exists() {
        return Ok(dev.to_string_lossy().to_string());
    }
    // Fallback to PATH
    Ok("ffmpeg".to_string())
}

/// Locate the FFprobe binary. Tries bundled sidecar first, then PATH.
pub fn ffprobe_binary() -> Result<String> {
    if let Ok(exe) = std::env::current_exe() {
        if let Some(dir) = exe.parent() {
            let bundled = dir.join("ffprobe.exe");
            if bundled.exists() {
                return Ok(bundled.to_string_lossy().to_string());
            }
        }
    }
    let dev = Path::new("bin").join("ffprobe.exe");
    if dev.exists() {
        return Ok(dev.to_string_lossy().to_string());
    }
    Ok("ffprobe".to_string())
}

/// Decode a video file to a sequence of raw RGBA frames.
pub fn decode_video(path: &str, max_frames: Option<usize>) -> Result<VideoSegment> {
    let ffmpeg = ffmpeg_binary()?;
    let mut cmd = Command::new(&ffmpeg);
    cmd.args([
        "-i",
        path,
        "-vf",
        "format=rgba",
        "-f",
        "rawvideo",
        "-pix_fmt",
        "rgba",
        "pipe:1",
    ])
    .stdout(Stdio::piped())
    .stderr(Stdio::null());

    let output = cmd.output().map_err(AppError::Io)?;
    if !output.status.success() {
        return Err(AppError::Ffmpeg(format!(
            "FFmpeg decode failed: {}",
            String::from_utf8_lossy(&output.stderr)
        )));
    }

    // Probe dimensions
    let (width, height, fps) = probe_video(path)?;
    let frame_size = (width * height * 4) as usize;
    let raw = output.stdout;
    let mut frames = Vec::new();

    for chunk in raw.chunks_exact(frame_size) {
        if max_frames.map(|m| frames.len() >= m).unwrap_or(false) {
            break;
        }
        frames.push(Frame {
            width,
            height,
            data: chunk.to_vec(),
        });
    }

    Ok(VideoSegment { frames, fps })
}

/// Encode a sequence of raw RGBA frames to a video file.
pub fn encode_video(segment: &VideoSegment, path: &str) -> Result<()> {
    if segment.frames.is_empty() {
        return Err(AppError::Ffmpeg("No frames to encode".to_string()));
    }

    let ffmpeg = ffmpeg_binary()?;
    let first = &segment.frames[0];
    let w = first.width;
    let h = first.height;

    let mut child = Command::new(&ffmpeg)
        .args([
            "-f",
            "rawvideo",
            "-pix_fmt",
            "rgba",
            "-s",
            &format!("{}x{}", w, h),
            "-r",
            &segment.fps.to_string(),
            "-i",
            "pipe:0",
            "-c:v",
            "libx264",
            "-pix_fmt",
            "yuv420p",
            "-y",
            path,
        ])
        .stdin(Stdio::piped())
        .stderr(Stdio::null())
        .spawn()
        .map_err(AppError::Io)?;

    {
        let stdin = child
            .stdin
            .as_mut()
            .ok_or_else(|| AppError::Ffmpeg("Failed to open FFmpeg stdin".to_string()))?;
        for frame in &segment.frames {
            std::io::Write::write_all(stdin, &frame.data).map_err(AppError::Io)?;
        }
    }

    let status = child.wait().map_err(AppError::Io)?;
    if !status.success() {
        return Err(AppError::Ffmpeg("FFmpeg encode failed".to_string()));
    }
    Ok(())
}

/// Probe video file for width, height, and fps.
pub fn probe_video(path: &str) -> Result<(u32, u32, f64)> {
    let bin = ffprobe_binary()?;

    let output = Command::new(&bin)
        .args([
            "-v",
            "error",
            "-select_streams",
            "v:0",
            "-show_entries",
            "stream=width,height,r_frame_rate",
            "-of",
            "default=noprint_wrappers=1",
            path,
        ])
        .output()
        .map_err(AppError::Io)?;

    let text = String::from_utf8_lossy(&output.stdout);
    let mut width = 0u32;
    let mut height = 0u32;
    let mut fps = 30.0f64;

    for line in text.lines() {
        if let Some(v) = line.strip_prefix("width=") {
            width = v
                .parse()
                .map_err(|_| AppError::Ffmpeg("Invalid width".to_string()))?;
        } else if let Some(v) = line.strip_prefix("height=") {
            height = v
                .parse()
                .map_err(|_| AppError::Ffmpeg("Invalid height".to_string()))?;
        } else if let Some(v) = line.strip_prefix("r_frame_rate=") {
            let parts: Vec<&str> = v.split('/').collect();
            if parts.len() == 2 {
                let num: f64 = parts[0].parse().unwrap_or(30.0);
                let den: f64 = parts[1].parse().unwrap_or(1.0);
                fps = num / den;
            }
        }
    }

    if width == 0 || height == 0 {
        return Err(AppError::Ffmpeg(
            "Could not probe video dimensions".to_string(),
        ));
    }

    Ok((width, height, fps))
}
