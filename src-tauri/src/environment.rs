use std::path::{Path, PathBuf};
use std::process::Stdio;
use tauri::{AppHandle, Manager};

const VENV_DIR_NAME: &str = "moshdither-env";
const ENV_CONFIG_FILE: &str = "env-config.json";

#[derive(Debug, Clone, serde::Serialize, serde::Deserialize)]
pub struct EnvStatus {
    pub mode: String,
    pub python_ok: bool,
    pub venv_ok: bool,
    pub pip_ok: bool,
    pub ffmpeg_ok: bool,
    pub ffprobe_ok: bool,
    pub ffglitch_ok: bool,
    pub python_path: Option<String>,
    pub venv_dir: Option<String>,
    pub ffmpeg_path: Option<String>,
    pub ffprobe_path: Option<String>,
    pub ffgac_path: Option<String>,
    pub ffedit_path: Option<String>,
    pub mosh_cli_path: Option<String>,
}

#[derive(Debug, Clone, serde::Serialize, serde::Deserialize)]
struct EnvConfig {
    mode: String,
}

fn app_data_dir(app: &AppHandle) -> PathBuf {
    app.path()
        .app_data_dir()
        .unwrap_or_else(|_| PathBuf::from("."))
}

fn config_path(app: &AppHandle) -> PathBuf {
    app_data_dir(app).join(ENV_CONFIG_FILE)
}

fn venv_dir(app: &AppHandle) -> PathBuf {
    app_data_dir(app).join(VENV_DIR_NAME)
}

fn venv_python(app: &AppHandle) -> PathBuf {
    venv_dir(app).join("Scripts").join("python.exe")
}

fn venv_pip(app: &AppHandle) -> PathBuf {
    venv_dir(app).join("Scripts").join("pip.exe")
}

fn load_config(app: &AppHandle) -> EnvConfig {
    let path = config_path(app);
    if let Ok(raw) = std::fs::read_to_string(&path) {
        if let Ok(cfg) = serde_json::from_str::<EnvConfig>(&raw) {
            return cfg;
        }
    }
    EnvConfig {
        mode: "unconfigured".to_string(),
    }
}

fn save_config(app: &AppHandle, mode: &str) {
    let path = config_path(app);
    let cfg = EnvConfig {
        mode: mode.to_string(),
    };
    let _ = std::fs::write(
        &path,
        serde_json::to_string_pretty(&cfg).unwrap_or_default(),
    );
}

fn python_on_path() -> Option<String> {
    for name in ["python.exe", "python3.exe", "python"] {
        if crate::proc::command(name).arg("--version").output().is_ok() {
            return Some(name.to_string());
        }
    }
    None
}

fn bundled_bin_dir(app: &AppHandle) -> PathBuf {
    app_data_dir(app).join("bin")
}

fn bundled_ffmpeg_dir(app: &AppHandle) -> PathBuf {
    bundled_bin_dir(app).join("ffmpeg")
}

fn bundled_ffglitch_dir(app: &AppHandle) -> PathBuf {
    bundled_bin_dir(app).join("ffglitch")
}

fn exe_suffix() -> &'static str {
    if cfg!(windows) {
        ".exe"
    } else {
        ""
    }
}

fn mosh_cli_path() -> Option<PathBuf> {
    let candidates = [
        Path::new("..")
            .join("..")
            .join("packages")
            .join("python-backend")
            .join("mosh_cli.py"),
        Path::new("..")
            .join("packages")
            .join("python-backend")
            .join("mosh_cli.py"),
        std::env::current_exe()
            .ok()
            .and_then(|p| p.parent().map(|p| p.to_path_buf()))
            .map(|p| {
                p.join("packages")
                    .join("python-backend")
                    .join("mosh_cli.py")
            })
            .unwrap_or_else(|| {
                Path::new("packages")
                    .join("python-backend")
                    .join("mosh_cli.py")
            }),
    ];
    for c in &candidates {
        if c.exists() {
            return Some(c.clone());
        }
    }
    None
}

fn copy_bundled_ffmpeg(app: &AppHandle) -> Result<(), String> {
    let out_dir = bundled_ffmpeg_dir(app);
    std::fs::create_dir_all(&out_dir).map_err(|e| e.to_string())?;

    let ffmpeg_out = out_dir.join(format!("ffmpeg{}", exe_suffix()));
    let ffprobe_out = out_dir.join(format!("ffprobe{}", exe_suffix()));
    if ffmpeg_out.exists() && ffprobe_out.exists() {
        return Ok(());
    }

    // Try the bundled binaries in src-tauri/bin
    let candidates = [
        Path::new("bin").join(format!("ffmpeg-x86_64-pc-windows-msvc{}", exe_suffix())),
        Path::new("bin").join(format!("ffmpeg{}", exe_suffix())),
        Path::new("src-tauri")
            .join("bin")
            .join(format!("ffmpeg-x86_64-pc-windows-msvc{}", exe_suffix())),
        Path::new("src-tauri")
            .join("bin")
            .join(format!("ffmpeg{}", exe_suffix())),
    ];
    let ffprobe_candidates = [
        Path::new("bin").join(format!("ffprobe-x86_64-pc-windows-msvc{}", exe_suffix())),
        Path::new("bin").join(format!("ffprobe{}", exe_suffix())),
        Path::new("src-tauri")
            .join("bin")
            .join(format!("ffprobe-x86_64-pc-windows-msvc{}", exe_suffix())),
        Path::new("src-tauri")
            .join("bin")
            .join(format!("ffprobe{}", exe_suffix())),
    ];

    for src in &candidates {
        if src.exists() && !ffmpeg_out.exists() {
            std::fs::copy(src, &ffmpeg_out).map_err(|e| e.to_string())?;
            break;
        }
    }
    for src in &ffprobe_candidates {
        if src.exists() && !ffprobe_out.exists() {
            std::fs::copy(src, &ffprobe_out).map_err(|e| e.to_string())?;
            break;
        }
    }

    if !ffmpeg_out.exists() || !ffprobe_out.exists() {
        return Err("FFmpeg/FFprobe binaries not found in bundle".to_string());
    }
    Ok(())
}

fn copy_bundled_ffglitch(app: &AppHandle) -> Result<(), String> {
    let out_dir = bundled_ffglitch_dir(app);
    std::fs::create_dir_all(&out_dir).map_err(|e| e.to_string())?;

    let ffgac_out = out_dir.join(format!("ffgac{}", exe_suffix()));
    let ffedit_out = out_dir.join(format!("ffedit{}", exe_suffix()));
    if ffgac_out.exists() && ffedit_out.exists() {
        return Ok(());
    }

    let candidates = [
        Path::new("bin").join(format!("ffgac-x86_64-pc-windows-msvc{}", exe_suffix())),
        Path::new("bin").join(format!("ffgac{}", exe_suffix())),
        Path::new("src-tauri")
            .join("bin")
            .join(format!("ffgac-x86_64-pc-windows-msvc{}", exe_suffix())),
        Path::new("src-tauri")
            .join("bin")
            .join(format!("ffgac{}", exe_suffix())),
    ];
    let ffedit_candidates = [
        Path::new("bin").join(format!("ffedit-x86_64-pc-windows-msvc{}", exe_suffix())),
        Path::new("bin").join(format!("ffedit{}", exe_suffix())),
        Path::new("src-tauri")
            .join("bin")
            .join(format!("ffedit-x86_64-pc-windows-msvc{}", exe_suffix())),
        Path::new("src-tauri")
            .join("bin")
            .join(format!("ffedit{}", exe_suffix())),
    ];

    for src in &candidates {
        if src.exists() && !ffgac_out.exists() {
            std::fs::copy(src, &ffgac_out).map_err(|e| e.to_string())?;
            break;
        }
    }
    for src in &ffedit_candidates {
        if src.exists() && !ffedit_out.exists() {
            std::fs::copy(src, &ffedit_out).map_err(|e| e.to_string())?;
            break;
        }
    }

    if !ffgac_out.exists() || !ffedit_out.exists() {
        return Err("FFglitch binaries not found in bundle".to_string());
    }
    Ok(())
}

fn run_command(cmd: &str, args: &[&str]) -> Result<(), String> {
    let output = crate::proc::command(cmd)
        .args(args)
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .output()
        .map_err(|e| format!("Failed to run {}: {}", cmd, e))?;
    if !output.status.success() {
        return Err(format!(
            "Command failed: {} {}\n{}",
            cmd,
            args.join(" "),
            String::from_utf8_lossy(&output.stderr)
        ));
    }
    Ok(())
}

fn python_requirements_path() -> Option<PathBuf> {
    let candidates = [
        Path::new("packages")
            .join("python-backend")
            .join("requirements.txt"),
        Path::new("..")
            .join("packages")
            .join("python-backend")
            .join("requirements.txt"),
        Path::new("..")
            .join("..")
            .join("packages")
            .join("python-backend")
            .join("requirements.txt"),
    ];
    for c in &candidates {
        if c.exists() {
            return Some(c.clone());
        }
    }
    None
}

/// Check the current Python/binary environment status.
#[tauri::command]
pub async fn get_environment_status(app: AppHandle) -> std::result::Result<EnvStatus, String> {
    let cfg = load_config(&app);
    let venv_dir = venv_dir(&app);
    let venv_py = venv_python(&app);
    let venv_pip = venv_pip(&app);
    let ffmpeg_dir = bundled_ffmpeg_dir(&app);
    let ffglitch_dir = bundled_ffglitch_dir(&app);
    let ffmpeg = ffmpeg_dir.join(format!("ffmpeg{}", exe_suffix()));
    let ffprobe = ffmpeg_dir.join(format!("ffprobe{}", exe_suffix()));
    let ffgac = ffglitch_dir.join(format!("ffgac{}", exe_suffix()));
    let ffedit = ffglitch_dir.join(format!("ffedit{}", exe_suffix()));

    let python_path = if cfg.mode == "local" {
        venv_py.to_string_lossy().to_string()
    } else {
        python_on_path().unwrap_or_else(|| "python".to_string())
    };

    let status = EnvStatus {
        mode: cfg.mode.clone(),
        python_ok: python_on_path().is_some(),
        venv_ok: venv_dir.exists(),
        pip_ok: venv_pip.exists(),
        ffmpeg_ok: ffmpeg.exists(),
        ffprobe_ok: ffprobe.exists(),
        ffglitch_ok: ffgac.exists() && ffedit.exists(),
        python_path: Some(python_path),
        venv_dir: Some(venv_dir.to_string_lossy().to_string()),
        ffmpeg_path: Some(ffmpeg.to_string_lossy().to_string()),
        ffprobe_path: Some(ffprobe.to_string_lossy().to_string()),
        ffgac_path: Some(ffgac.to_string_lossy().to_string()),
        ffedit_path: Some(ffedit.to_string_lossy().to_string()),
        mosh_cli_path: mosh_cli_path().map(|p| p.to_string_lossy().to_string()),
    };
    Ok(status)
}

/// Install a local Python environment in the app data directory.
#[tauri::command]
pub async fn install_local_environment(app: AppHandle) -> std::result::Result<EnvStatus, String> {
    save_config(&app, "local");

    let system_python = python_on_path().ok_or("Python not found on PATH")?;
    let venv = venv_dir(&app);
    let py = venv_python(&app);
    let pip = venv_pip(&app);

    if !venv.exists() {
        run_command(&system_python, &["-m", "venv", &venv.to_string_lossy()])?;
    }
    if !py.exists() {
        return Err(format!(
            "venv created but python not found at {}",
            py.display()
        ));
    }

    run_command(
        &py.to_string_lossy(),
        &["-m", "pip", "install", "--upgrade", "pip"],
    )?;

    if let Some(reqs) = python_requirements_path() {
        run_command(
            &pip.to_string_lossy(),
            &["install", "-r", &reqs.to_string_lossy()],
        )?;
    } else {
        // Minimal fallback set for mosh_cli.py (numpy/Pillow are transitive
        // deps of the DatamoshLib.FFG_effects modules it imports)
        run_command(&pip.to_string_lossy(), &["install", "numpy", "Pillow"])?;
    }

    copy_bundled_ffmpeg(&app)?;
    copy_bundled_ffglitch(&app)?;

    save_config(&app, "local");
    get_environment_status(app).await
}
