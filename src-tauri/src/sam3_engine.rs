use base64::Engine;
use child_wait_timeout::ChildWT;
use parking_lot::Mutex;
use rand::Rng;
use serde::{Deserialize, Serialize};
use std::io::{Read, Write};
use std::path::PathBuf;
use std::process::{ChildStdin, Command, Stdio};
use std::sync::mpsc::{channel, Receiver};
use std::time::Duration;
use sysinfo::{Pid, System};

#[derive(Debug, Serialize, Deserialize)]
struct Sam3Request {
    cmd: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    auth_token: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    image_b64: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    prompt: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    points: Option<Vec<[f32; 2]>>,
    #[serde(skip_serializing_if = "Option::is_none")]
    labels: Option<Vec<i32>>,
    #[serde(skip_serializing_if = "Option::is_none")]
    boxes: Option<Vec<[f32; 4]>>,
    #[serde(skip_serializing_if = "Option::is_none")]
    index: Option<usize>,
    #[serde(skip_serializing_if = "Option::is_none")]
    grid_size: Option<u32>,
    #[serde(skip_serializing_if = "Option::is_none")]
    iou_threshold: Option<f32>,
    #[serde(skip_serializing_if = "Option::is_none")]
    min_mask_region_area: Option<u32>,
    #[serde(skip_serializing_if = "Option::is_none")]
    mask_b64: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    grow: Option<i32>,
    #[serde(skip_serializing_if = "Option::is_none")]
    shrink: Option<i32>,
    #[serde(skip_serializing_if = "Option::is_none")]
    feather: Option<i32>,
    #[serde(skip_serializing_if = "Option::is_none")]
    fill_holes: Option<bool>,
    #[serde(skip_serializing_if = "Option::is_none")]
    frames: Option<Vec<String>>,
}

#[derive(Debug, Serialize, Deserialize)]
struct Sam3Response {
    status: String,
    #[serde(default)]
    message: String,
    #[serde(default)]
    width: u32,
    #[serde(default)]
    height: u32,
    #[serde(default)]
    count: usize,
    #[serde(default)]
    masks: Vec<String>,
    #[serde(default)]
    scores: Vec<f64>,
    #[serde(default)]
    frame_masks: Vec<Vec<String>>,
    #[serde(default)]
    frame_scores: Vec<Vec<f64>>,
}

/// Per-frame masks and their scores returned by the SAM3 video predictor.
pub type VideoPredictorResult = (Vec<Vec<String>>, Vec<Vec<f64>>);

/// Path to a small PID file used to detect and reap a stale SAM3 bridge left
/// behind by a previous application crash.
fn sam3_pid_file() -> PathBuf {
    std::env::temp_dir()
        .join("moshdither-studio")
        .join("sam3_bridge.pid")
}

fn write_sam3_pid(child: &std::process::Child) {
    let path = sam3_pid_file();
    if let Some(parent) = path.parent() {
        let _ = std::fs::create_dir_all(parent);
    }
    let _ = std::fs::write(&path, child.id().to_string());
}

fn remove_sam3_pid() {
    let _ = std::fs::remove_file(sam3_pid_file());
}

/// Reap any orphaned SAM3 bridge from a previous run. We only target processes
/// whose executable name contains "python" so we do not accidentally kill an
/// unrelated process referenced by a stale PID file.
fn cleanup_stale_sam3_bridge() {
    let pid_path = sam3_pid_file();
    let raw = match std::fs::read_to_string(&pid_path) {
        Ok(s) => s,
        Err(_) => return,
    };
    let pid = match raw.trim().parse::<usize>() {
        Ok(p) => p,
        Err(_) => {
            let _ = std::fs::remove_file(&pid_path);
            return;
        }
    };

    let s = System::new_all();
    if let Some(process) = s.process(Pid::from(pid)) {
        let name = process.name().to_string_lossy().to_lowercase();
        if name.contains("python") {
            eprintln!("[SAM3] Killing orphaned bridge process {} ({})", pid, name);
            if !process.kill() {
                eprintln!("[SAM3] Failed to kill orphaned bridge process {}", pid);
            }
        } else {
            eprintln!(
                "[SAM3] Stale PID file points to non-python process {} ({}), skipping",
                pid, name
            );
        }
    }
    let _ = std::fs::remove_file(&pid_path);
}

pub struct Sam3Engine {
    child: Mutex<Option<std::process::Child>>,
    stdin: Mutex<ChildStdin>,
    rx: Mutex<Receiver<String>>,
    auth_token: String,
}

impl Sam3Engine {
    pub fn new() -> crate::error::Result<Self> {
        let exe_dir = std::env::current_exe()
            .ok()
            .and_then(|p| p.parent().map(PathBuf::from))
            .unwrap_or_else(|| PathBuf::from("."));

        // Resolve project root by probing likely locations, avoiding hardcoded paths.
        let project_root = 'root: {
            if exe_dir.join("sam3_env").exists() {
                break 'root exe_dir.clone();
            }
            // Dev mode fallback: exe is typically in target/debug or target/release
            let rel = exe_dir.join("..").join("..").join("..");
            if rel.join("sam3_env").exists() {
                break 'root rel.canonicalize().unwrap_or(rel);
            }
            // Cargo manifest directory is available when running via `cargo run` / `tauri dev`
            if let Ok(manifest_dir) = std::env::var("CARGO_MANIFEST_DIR") {
                let p = PathBuf::from(manifest_dir);
                if p.join("sam3_env").exists() {
                    break 'root p;
                }
            }
            // Final fallback: current working directory
            if let Ok(cwd) = std::env::current_dir() {
                if cwd.join("sam3_env").exists() {
                    break 'root cwd;
                }
            }
            // If nothing matches, warn and fall back to cwd rather than a hardcoded path.
            eprintln!(
                "[WARN] Could not auto-resolve project root for SAM3 bridge. Searched: {:?}, {:?}, CARGO_MANIFEST_DIR, cwd. Falling back to cwd.",
                exe_dir, rel
            );
            std::env::current_dir().unwrap_or_else(|_| exe_dir.clone())
        };

        let python = project_root
            .join("sam3_env")
            .join("Scripts")
            .join("python.exe");
        let bridge = project_root.join("src-tauri").join("sam3_bridge.py");

        if !python.exists() {
            return Err(crate::error::AppError::Generic(format!(
                "Python not found at {}",
                python.display()
            )));
        }
        if !bridge.exists() {
            return Err(crate::error::AppError::Generic(format!(
                "Bridge script not found at {}",
                bridge.display()
            )));
        }

        // Reap any zombie bridge left by a crashed previous session before we
        // start a new one and overwrite the PID file.
        cleanup_stale_sam3_bridge();

        let mut child = Command::new(&python)
            .arg(&bridge)
            .stdin(Stdio::piped())
            .stdout(Stdio::piped())
            .stderr(Stdio::piped())
            .spawn()
            .map_err(|e| {
                crate::error::AppError::Generic(format!("Failed to spawn SAM3 bridge: {}", e))
            })?;

        write_sam3_pid(&child);

        let mut stdin = child
            .stdin
            .take()
            .ok_or_else(|| crate::error::AppError::Generic("Failed to capture stdin".into()))?;

        let stdout = child
            .stdout
            .take()
            .ok_or_else(|| crate::error::AppError::Generic("Failed to capture stdout".into()))?;

        let stderr = child
            .stderr
            .take()
            .ok_or_else(|| crate::error::AppError::Generic("Failed to capture stderr".into()))?;

        // Spawn a stderr reader thread so Python errors are surfaced in the Rust log
        std::thread::spawn(move || {
            use std::io::{BufRead, BufReader};
            let reader = BufReader::new(stderr);
            for line in reader.lines() {
                match line {
                    Ok(text) => eprintln!("[SAM3 Bridge stderr] {}", text),
                    Err(_) => break,
                }
            }
        });

        // Generate a random 32-byte token for auth handshake
        let auth_token: String = {
            let mut rng = rand::thread_rng();
            let bytes: Vec<u8> = (0..32).map(|_| rng.gen()).collect();
            base64::engine::general_purpose::STANDARD.encode(&bytes)
        };

        // Spawn a dedicated reader thread so we can use recv_timeout on the channel
        // instead of blocking forever on stdout.read_line.
        let (tx, rx) = channel::<String>();
        std::thread::spawn(move || {
            let mut stdout = stdout;
            let mut len_buf = [0u8; 4];
            loop {
                // Read 4-byte LE length header
                if let Err(e) = stdout.read_exact(&mut len_buf) {
                    if e.kind() != std::io::ErrorKind::UnexpectedEof {
                        eprintln!("[SAM3 Reader] read header error: {}", e);
                    }
                    break;
                }
                let payload_len = u32::from_le_bytes(len_buf) as usize;
                if payload_len > 64 * 1024 * 1024 {
                    eprintln!(
                        "[SAM3 Reader] frame size {} exceeds 64 MiB limit",
                        payload_len
                    );
                    break;
                }
                let mut payload = vec![0u8; payload_len];
                if let Err(e) = stdout.read_exact(&mut payload) {
                    eprintln!("[SAM3 Reader] read payload error: {}", e);
                    break;
                }
                let line = String::from_utf8_lossy(&payload).into_owned();
                if tx.send(line).is_err() {
                    break; // Receiver dropped — engine shutting down
                }
            }
        });

        // ── Auth handshake ─────────────────────────────────────────
        {
            let handshake = serde_json::json!({"auth_token": &auth_token });
            let payload = serde_json::to_vec(&handshake)?;
            let header = (payload.len() as u32).to_le_bytes();
            stdin.write_all(&header)?;
            stdin.write_all(&payload)?;
            stdin.flush()?;

            const AUTH_TIMEOUT: Duration = Duration::from_secs(10);
            let auth_resp = rx.recv_timeout(AUTH_TIMEOUT).map_err(|e| {
                crate::error::AppError::Sam3Timeout(format!(
                    "SAM3 auth handshake timed out after {:?}: {}",
                    AUTH_TIMEOUT, e
                ))
            })?;
            let resp: serde_json::Value = serde_json::from_str(&auth_resp)?;
            if resp.get("status").and_then(|v| v.as_str()) != Some("auth_ok") {
                return Err(crate::error::AppError::Generic(format!(
                    "SAM3 auth handshake failed: {}",
                    auth_resp
                )));
            }
        }

        Ok(Sam3Engine {
            child: Mutex::new(Some(child)),
            stdin: Mutex::new(stdin),
            rx: Mutex::new(rx),
            auth_token,
        })
    }

    fn send(&self, mut req: Sam3Request) -> crate::error::Result<Sam3Response> {
        req.auth_token = Some(self.auth_token.clone());
        let payload = serde_json::to_vec(&req)?;
        let mut stdin = self.stdin.lock();
        stdin.write_all(&(payload.len() as u32).to_le_bytes())?;
        stdin.write_all(&payload)?;
        stdin.flush()?;
        drop(stdin);

        // Commands like video prediction can legitimately take minutes, while
        // lightweight mask operations should return in seconds.
        let timeout = Self::command_timeout(&req.cmd);
        let rx = self.rx.lock();
        let line = rx.recv_timeout(timeout).map_err(|e| {
            crate::error::AppError::Sam3Timeout(format!(
                "SAM3 IPC timed out after {:?} for command '{}': {}",
                timeout, req.cmd, e
            ))
        })?;
        drop(rx);

        let resp: Sam3Response = serde_json::from_str(&line)?;
        Ok(resp)
    }

    /// Per-command timeout budget. Video prediction is given the most time
    /// because it processes every frame through the SAM model.
    fn command_timeout(cmd: &str) -> Duration {
        match cmd {
            "video_predictor" => Duration::from_secs(600),
            "load_image" => Duration::from_secs(60),
            "text_prompt" | "point_prompt" | "box_prompt" | "auto_mask" | "refine_mask"
            | "postprocess_mask" => Duration::from_secs(120),
            _ => Duration::from_secs(30),
        }
    }

    pub fn load_image(&self, image_b64: String) -> crate::error::Result<(u32, u32)> {
        let resp = self.send(Sam3Request {
            cmd: "load_image".into(),
            auth_token: None,
            image_b64: Some(image_b64),
            prompt: None,
            points: None,
            labels: None,
            boxes: None,
            index: None,
            grid_size: None,
            iou_threshold: None,
            min_mask_region_area: None,
            mask_b64: None,
            grow: None,
            shrink: None,
            feather: None,
            fill_holes: None,
            frames: None,
        })?;
        if resp.status == "ok" {
            Ok((resp.width, resp.height))
        } else {
            Err(crate::error::AppError::Generic(resp.message))
        }
    }

    pub fn text_prompt(&self, prompt: String) -> crate::error::Result<Vec<(String, f64)>> {
        let resp = self.send(Sam3Request {
            cmd: "text_prompt".into(),
            auth_token: None,
            image_b64: None,
            prompt: Some(prompt),
            points: None,
            labels: None,
            boxes: None,
            index: None,
            grid_size: None,
            iou_threshold: None,
            min_mask_region_area: None,
            mask_b64: None,
            grow: None,
            shrink: None,
            feather: None,
            fill_holes: None,
            frames: None,
        })?;
        if resp.status == "ok" {
            let mut results = Vec::with_capacity(resp.count);
            for (mask, score) in resp.masks.iter().zip(&resp.scores) {
                results.push((mask.clone(), *score));
            }
            Ok(results)
        } else {
            Err(crate::error::AppError::Generic(resp.message))
        }
    }

    pub fn point_prompt(
        &self,
        points: Vec<[f32; 2]>,
        labels: Option<Vec<i32>>,
    ) -> crate::error::Result<Vec<(String, f64)>> {
        let resp = self.send(Sam3Request {
            cmd: "point_prompt".into(),
            auth_token: None,
            image_b64: None,
            prompt: None,
            points: Some(points),
            labels,
            boxes: None,
            index: None,
            grid_size: None,
            iou_threshold: None,
            min_mask_region_area: None,
            mask_b64: None,
            grow: None,
            shrink: None,
            feather: None,
            fill_holes: None,
            frames: None,
        })?;
        if resp.status == "ok" {
            let mut results = Vec::with_capacity(resp.count);
            for (mask, score) in resp.masks.iter().zip(&resp.scores) {
                results.push((mask.clone(), *score));
            }
            Ok(results)
        } else {
            Err(crate::error::AppError::Generic(resp.message))
        }
    }

    pub fn box_prompt(&self, boxes: Vec<[f32; 4]>) -> crate::error::Result<Vec<(String, f64)>> {
        let resp = self.send(Sam3Request {
            cmd: "box_prompt".into(),
            auth_token: None,
            image_b64: None,
            prompt: None,
            points: None,
            labels: None,
            boxes: Some(boxes),
            index: None,
            grid_size: None,
            iou_threshold: None,
            min_mask_region_area: None,
            mask_b64: None,
            grow: None,
            shrink: None,
            feather: None,
            fill_holes: None,
            frames: None,
        })?;
        if resp.status == "ok" {
            let mut results = Vec::with_capacity(resp.count);
            for (mask, score) in resp.masks.iter().zip(&resp.scores) {
                results.push((mask.clone(), *score));
            }
            Ok(results)
        } else {
            Err(crate::error::AppError::Generic(resp.message))
        }
    }

    pub fn auto_mask(
        &self,
        grid_size: u32,
        iou_threshold: f32,
        min_mask_region_area: u32,
    ) -> crate::error::Result<Vec<(String, f64)>> {
        let req = Sam3Request {
            cmd: "auto_mask".into(),
            auth_token: None,
            image_b64: None,
            prompt: None,
            points: None,
            labels: None,
            boxes: None,
            index: None,
            grid_size: Some(grid_size),
            iou_threshold: Some(iou_threshold),
            min_mask_region_area: Some(min_mask_region_area),
            mask_b64: None,
            grow: None,
            shrink: None,
            feather: None,
            fill_holes: None,
            frames: None,
        };
        let resp = self.send(req)?;
        if resp.status == "ok" {
            let combined = resp.masks.into_iter().zip(resp.scores).collect();
            Ok(combined)
        } else {
            Err(crate::error::AppError::Generic(resp.message))
        }
    }

    pub fn video_predictor(
        &self,
        frames: Vec<String>,
        prompt: Option<String>,
    ) -> crate::error::Result<VideoPredictorResult> {
        let req = Sam3Request {
            cmd: "video_predictor".into(),
            auth_token: None,
            image_b64: None,
            prompt,
            points: None,
            labels: None,
            boxes: None,
            index: None,
            grid_size: None,
            iou_threshold: None,
            min_mask_region_area: None,
            mask_b64: None,
            grow: None,
            shrink: None,
            feather: None,
            fill_holes: None,
            frames: Some(frames),
        };
        let resp = self.send(req)?;
        if resp.status == "ok" {
            Ok((resp.frame_masks, resp.frame_scores))
        } else {
            Err(crate::error::AppError::Generic(resp.message))
        }
    }

    /// Refine an existing mask using additional point prompts.
    /// The Python bridge's `cmd_refine_mask` uses the mask + points to produce
    /// refined candidate masks sorted by IoU with the input mask.
    pub fn refine_mask(
        &self,
        mask_b64: String,
        points: Vec<[f32; 2]>,
        labels: Option<Vec<i32>>,
    ) -> crate::error::Result<Vec<(String, f64)>> {
        let resp = self.send(Sam3Request {
            cmd: "refine_mask".into(),
            auth_token: None,
            image_b64: None,
            prompt: None,
            points: Some(points),
            labels,
            boxes: None,
            index: None,
            grid_size: None,
            iou_threshold: None,
            min_mask_region_area: None,
            mask_b64: Some(mask_b64),
            grow: None,
            shrink: None,
            feather: None,
            fill_holes: None,
            frames: None,
        })?;
        if resp.status == "ok" {
            let mut results = Vec::with_capacity(resp.count);
            for (mask, score) in resp.masks.iter().zip(&resp.scores) {
                results.push((mask.clone(), *score));
            }
            Ok(results)
        } else {
            Err(crate::error::AppError::Generic(resp.message))
        }
    }

    pub fn postprocess_mask(
        &self,
        mask_b64: String,
        grow: i32,
        shrink: i32,
        feather: i32,
        fill_holes: bool,
    ) -> crate::error::Result<String> {
        let resp = self.send(Sam3Request {
            cmd: "postprocess_mask".into(),
            auth_token: None,
            image_b64: None,
            prompt: None,
            points: None,
            labels: None,
            boxes: None,
            index: None,
            grid_size: None,
            iou_threshold: None,
            min_mask_region_area: None,
            mask_b64: Some(mask_b64),
            grow: Some(grow),
            shrink: Some(shrink),
            feather: Some(feather),
            fill_holes: Some(fill_holes),
            frames: None,
        })?;
        if resp.status == "ok" {
            // The Python bridge returns {"mask": "data:image/png;base64,..."}
            // We extract it from the JSON string directly
            let line = serde_json::to_string(&resp)?;
            let val: serde_json::Value = serde_json::from_str(&line)?;
            val.get("mask")
                .and_then(|v| v.as_str())
                .map(|s| s.to_string())
                .ok_or_else(|| {
                    crate::error::AppError::Generic("postprocess_mask missing mask field".into())
                })
        } else {
            Err(crate::error::AppError::Generic(resp.message))
        }
    }

    pub fn clear(&self) -> crate::error::Result<()> {
        let resp = self.send(Sam3Request {
            cmd: "clear".into(),
            auth_token: None,
            image_b64: None,
            prompt: None,
            points: None,
            labels: None,
            boxes: None,
            index: None,
            grid_size: None,
            iou_threshold: None,
            min_mask_region_area: None,
            mask_b64: None,
            grow: None,
            shrink: None,
            feather: None,
            fill_holes: None,
            frames: None,
        })?;
        if resp.status == "ok" {
            Ok(())
        } else {
            Err(crate::error::AppError::Generic(resp.message))
        }
    }

    pub fn shutdown(&self) -> crate::error::Result<()> {
        // Best-effort graceful shutdown; do not abort the whole operation if the
        // bridge is already dead.
        if let Err(e) = self.send(Sam3Request {
            cmd: "shutdown".into(),
            auth_token: None,
            image_b64: None,
            prompt: None,
            points: None,
            labels: None,
            boxes: None,
            index: None,
            grid_size: None,
            iou_threshold: None,
            min_mask_region_area: None,
            mask_b64: None,
            grow: None,
            shrink: None,
            feather: None,
            fill_holes: None,
            frames: None,
        }) {
            eprintln!("[SAM3] Graceful shutdown request failed: {}", e);
        }
        let mut child = self.child.lock().take();
        Self::kill_child(&mut child)
    }

    /// Kill and reap the bridge child process with a bounded wait so we never
    /// hang waiting for a Python process that refuses to exit.
    fn kill_child(child: &mut Option<std::process::Child>) -> crate::error::Result<()> {
        let Some(child) = child else {
            return Ok(());
        };
        if let Err(e) = child.kill() {
            eprintln!("[SAM3] Failed to kill bridge child: {}", e);
        }
        match child.wait_timeout(Duration::from_secs(5)) {
            Ok(status) => eprintln!("[SAM3] Bridge child exited with status {:?}", status.code()),
            Err(e) => {
                eprintln!("[SAM3] Bridge child wait error: {}", e);
                // Attempt one final reap.
                let _ = child.wait();
            }
        }
        remove_sam3_pid();
        Ok(())
    }
}

impl Drop for Sam3Engine {
    fn drop(&mut self) {
        let mut child = self.child.lock().take();
        let _ = Sam3Engine::kill_child(&mut child);
    }
}
