use base64::Engine;
use child_wait_timeout::ChildWT;
use parking_lot::Mutex;
use rand::Rng;
use serde::{Deserialize, Serialize};
use std::io::{Read, Write};
use std::path::{Path, PathBuf};
use std::process::{ChildStdin, Command, Stdio};
use std::sync::mpsc::{channel, Receiver};
use std::time::Duration;
use sysinfo::{Pid, System};
use tauri::{AppHandle, Manager};

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
    #[serde(default)]
    mask: String,
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

/// Reap any orphaned SAM3 bridge from a previous run. We only kill the process
/// if the command line or executable path proves it is the bridge or the dev
/// Python bridge script, preventing a stale PID from killing an unrelated
/// process.
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
        let exe = process
            .exe()
            .map(|p| p.to_string_lossy().to_lowercase())
            .unwrap_or_default();
        let cmd = process
            .cmd()
            .iter()
            .map(|s| s.to_string_lossy().to_lowercase())
            .collect::<Vec<_>>()
            .join(" ");
        if exe.contains("sam3-bridge")
            || exe.contains("sam3_bridge")
            || cmd.contains("sam3_bridge.py")
            || cmd.contains("sam3-bridge")
        {
            eprintln!("[SAM3] Killing orphaned bridge process {} ({})", pid, name);
            if !process.kill() {
                eprintln!("[SAM3] Failed to kill orphaned bridge process {}", pid);
            }
        } else {
            eprintln!(
                "[SAM3] Stale PID file points to non-bridge process {} ({}), skipping",
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
    /// Serializes the entire send→receive cycle so concurrent callers
    /// don't interleave requests and desync the IPC pipe.
    command_mutex: Mutex<()>,
    auth_token: String,
}

/// Locate the SAM3 bridge sidecar binary. Tauri strips the target-triple suffix
/// when it bundles `externalBin` entries, so the production filename is just
/// `sam3-bridge` (or `sam3-bridge.exe` on Windows). Dev builds can also pick up
/// a target-prefixed binary from `src-tauri/bin`.
fn locate_sam3_binary() -> Option<PathBuf> {
    let exe_dir = std::env::current_exe()
        .ok()
        .and_then(|p| p.parent().map(PathBuf::from))?;

    // Production: Tauri places the sidecar next to the executable without the target suffix.
    for name in ["sam3-bridge.exe", "sam3-bridge"] {
        let candidate = exe_dir.join(name);
        if candidate.exists() {
            return Some(candidate);
        }
    }

    // Dev: target-prefixed binaries in src-tauri/bin.
    let bin_dir = Path::new("bin");
    for name in [
        "sam3-bridge-x86_64-pc-windows-msvc.exe",
        "sam3-bridge-aarch64-apple-darwin",
        "sam3-bridge-x86_64-apple-darwin",
        "sam3-bridge-x86_64-unknown-linux-gnu",
        "sam3-bridge.exe",
        "sam3-bridge",
    ] {
        let candidate = bin_dir.join(name);
        if candidate.exists() {
            return Some(candidate);
        }
    }

    None
}

/// Resolve the project root for dev-mode Python fallback. Probes the directory
/// above the executable (target/{debug,release}), then CARGO_MANIFEST_DIR, then cwd.
fn dev_project_root() -> Option<PathBuf> {
    if let Ok(exe) = std::env::current_exe() {
        let exe_dir = exe.parent()?;
        let rel = exe_dir.join("..").join("..").join("..");
        if rel.join("src-tauri").join("tauri.conf.json").exists() {
            return rel.canonicalize().ok();
        }
    }
    if let Ok(manifest_dir) = std::env::var("CARGO_MANIFEST_DIR") {
        let p = PathBuf::from(manifest_dir);
        if p.join("tauri.conf.json").exists() {
            return p.parent().map(PathBuf::from);
        }
    }
    std::env::current_dir().ok()
}

/// Resolve the SAM3 checkpoint path. Prefers a bundled Tauri resource, then a
/// dev `models/sam3/sam3.pt` directory, then falls back to the bridge script's
/// own default (which expects `~/.moshdither/models/sam3/sam3.pt`).
fn resolve_checkpoint_path(app: &AppHandle) -> Option<PathBuf> {
    // Bundled resource, if present.
    if let Ok(resource_dir) = app.path().resource_dir() {
        let bundled = resource_dir.join("models").join("sam3").join("sam3.pt");
        if bundled.exists() {
            return Some(bundled);
        }
    }
    // Dev layout: project-root/models/sam3/sam3.pt.
    if let Some(root) = dev_project_root() {
        let dev = root.join("models").join("sam3").join("sam3.pt");
        if dev.exists() {
            return Some(dev);
        }
    }
    None
}

/// Resolve the SAM3 repo path (the directory containing the `sam3` package).
fn resolve_sam3_repo(app: &AppHandle) -> Option<PathBuf> {
    if let Ok(resource_dir) = app.path().resource_dir() {
        let bundled = resource_dir
            .join("packages")
            .join("python-backend")
            .join("sam3_repo");
        if bundled.exists() {
            return Some(bundled);
        }
    }
    if let Some(root) = dev_project_root() {
        let dev = root
            .join("packages")
            .join("python-backend")
            .join("sam3_repo");
        if dev.exists() {
            return Some(dev);
        }
    }
    None
}

impl Sam3Engine {
    pub fn new(app: &AppHandle) -> crate::error::Result<Self> {
        // Reap any zombie bridge left by a crashed previous session before we
        // start a new one and overwrite the PID file.
        cleanup_stale_sam3_bridge();

        // Try the packaged sidecar first (production / Option A).
        let mut command = if let Some(sidecar) = locate_sam3_binary() {
            let mut cmd = Command::new(&sidecar);
            // Point the sidecar at the Tauri resources for the model and the sam3 package.
            if let Some(repo) = resolve_sam3_repo(app) {
                cmd.env("SAM3_REPO", repo.as_os_str());
            }
            if let Some(checkpoint) = resolve_checkpoint_path(app) {
                cmd.env("SAM3_CHECKPOINT", checkpoint.as_os_str());
            }
            cmd
        } else {
            // Dev fallback: use a local sam3_env Python interpreter.
            let root = dev_project_root().ok_or_else(|| {
                crate::error::AppError::Generic(
                    "Could not resolve project root for SAM3 dev environment.".into(),
                )
            })?;
            let python = if cfg!(windows) {
                root.join("sam3_env").join("Scripts").join("python.exe")
            } else {
                root.join("sam3_env").join("bin").join("python")
            };
            let bridge = root.join("src-tauri").join("sam3_bridge.py");
            if !python.exists() {
                return Err(crate::error::AppError::Generic(format!(
                    "SAM3 Python not found at {}. Build the sidecar with `npm run build:sam3-sidecar` or create a sam3_env.",
                    python.display()
                )));
            }
            if !bridge.exists() {
                return Err(crate::error::AppError::Generic(format!(
                    "SAM3 bridge script not found at {}",
                    bridge.display()
                )));
            }
            let mut cmd = Command::new(&python);
            cmd.arg(&bridge);
            if let Some(repo) = resolve_sam3_repo(app) {
                cmd.env("SAM3_REPO", repo.as_os_str());
            }
            if let Some(checkpoint) = resolve_checkpoint_path(app) {
                cmd.env("SAM3_CHECKPOINT", checkpoint.as_os_str());
            }
            cmd
        };

        let mut child = command
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
                if payload_len > 512 * 1024 * 1024 {
                    eprintln!(
                        "[SAM3 Reader] frame size {} exceeds 512 MiB limit",
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
            command_mutex: Mutex::new(()),
            auth_token,
        })
    }

    fn send(&self, mut req: Sam3Request) -> crate::error::Result<Sam3Response> {
        // Serialize the entire send→receive cycle so concurrent callers
        // don't interleave requests and desync the IPC pipe.
        let _cmd_guard = self.command_mutex.lock();

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
        let line = match rx.recv_timeout(timeout) {
            Ok(line) => line,
            Err(e) => {
                drop(rx);
                // On timeout, the Python bridge may still be processing this
                // request and will write a response later. That stale response
                // would be picked up by the next send() call, desyncing the
                // pipe (reading response body bytes as a length header).
                // Drain any late-arriving response with a short grace period.
                let drain_rx = self.rx.lock();
                let _ = drain_rx.recv_timeout(Duration::from_secs(2));
                drop(drain_rx);
                return Err(crate::error::AppError::Sam3Timeout(format!(
                    "SAM3 IPC timed out after {:?} for command '{}': {}",
                    timeout, req.cmd, e
                )));
            }
        };
        drop(rx);

        let resp: Sam3Response = serde_json::from_str(&line)?;
        Ok(resp)
    }

    /// Per-command timeout budget. Video prediction is given the most time
    /// because it processes every frame through the SAM model.
    fn command_timeout(cmd: &str) -> Duration {
        match cmd {
            "video_predictor" => Duration::from_secs(600),
            "load_image" => Duration::from_secs(180),
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
            if resp.mask.is_empty() {
                Err(crate::error::AppError::Generic(
                    "postprocess_mask returned empty mask".into(),
                ))
            } else {
                Ok(resp.mask)
            }
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
    /// hang waiting for a Python process that refuses to exit. Returns any
    /// terminal error so callers can report it to the UI/logs.
    fn kill_child(child: &mut Option<std::process::Child>) -> crate::error::Result<()> {
        let Some(child) = child else {
            return Ok(());
        };
        if let Err(e) = child.kill() {
            eprintln!("[SAM3] Failed to kill bridge child: {}", e);
        }
        let wait_result = child.wait_timeout(Duration::from_secs(5));
        let status = match wait_result {
            Ok(status) => {
                eprintln!("[SAM3] Bridge child exited with status {:?}", status.code());
                Some(status)
            }
            Err(e) => {
                eprintln!("[SAM3] Bridge child wait error: {}", e);
                // Attempt one final reap; do not swallow unexpected IO errors.
                let _ = child.wait();
                return Err(crate::error::AppError::Generic(format!(
                    "SAM3 bridge shutdown failed: {}",
                    e
                )));
            }
        };
        remove_sam3_pid();
        if let Some(status) = status {
            if !status.success() && status.code() != Some(137) {
                return Err(crate::error::AppError::Generic(format!(
                    "SAM3 bridge exited with status {:?}",
                    status.code()
                )));
            }
        }
        Ok(())
    }
}

impl Drop for Sam3Engine {
    fn drop(&mut self) {
        let mut child = self.child.lock().take();
        let _ = Sam3Engine::kill_child(&mut child);
    }
}
