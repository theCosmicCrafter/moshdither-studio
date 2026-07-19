//! Path validation for user-supplied file paths.
//!
//! All paths passed from the frontend to Rust commands that perform I/O must be
//! validated before use. This prevents the frontend (or a compromised script
//! running in the webview) from tricking the backend into reading or writing
//! sensitive system files.
//!
//! The policy implemented here is intentionally conservative:
//! - Paths must be absolute.
//! - Path traversal (`..`) is normalized away and rejected if it escapes.
//! - Input paths must exist; output paths must have an existing parent directory.
//! - Paths inside known system directories are rejected.
//!
//! It does **not** restrict files to a specific project folder; users may keep
//! media on external drives or arbitrary locations. It only blocks the highest
//! risk targets (OS install directories, system binaries, device files, etc.).

use std::path::{Component, Path, PathBuf};

/// Validates a path supplied by the frontend before it is used for I/O.
///
/// `must_exist` should be `true` for input files (they must already exist) and
/// `false` for output files (only the parent directory must exist).
///
/// On success, returns a canonicalized `PathBuf` that is safe to pass to
/// FFmpeg, file writers, etc.
pub fn validate_io_path(path: &str, must_exist: bool) -> Result<PathBuf, String> {
    let allowed_roots = allowed_roots();

    let p = Path::new(path);
    if !p.is_absolute() {
        return Err(format!("Path must be absolute: {}", path));
    }

    let normalized = normalize_path(p);
    if !normalized.is_absolute() {
        return Err(format!(
            "Path became non-absolute after normalization: {}",
            path
        ));
    }

    let resolved = if must_exist {
        std::fs::canonicalize(&normalized)
            .map_err(|e| format!("Path does not exist or is inaccessible '{}': {}", path, e))?
    } else {
        let file_name = normalized
            .file_name()
            .ok_or_else(|| format!("Path has no file name: {}", path))?;
        let parent = normalized.parent().unwrap_or_else(|| Path::new("/"));
        if parent.as_os_str().is_empty() {
            return Err(format!("Output path has no parent directory: {}", path));
        }
        let canon_parent = std::fs::canonicalize(parent).map_err(|e| {
            format!(
                "Output directory does not exist or is inaccessible '{}': {}",
                parent.display(),
                e
            )
        })?;
        canon_parent.join(file_name)
    };

    if is_system_path(&resolved, &allowed_roots) {
        return Err(format!(
            "Path is in a restricted system directory: {}",
            resolved.display()
        ));
    }

    Ok(resolved)
}

/// Build the list of filesystem roots that are intentionally allowed for
/// user media and application data, even if they happen to sit under a path
/// that otherwise looks system-ish (e.g., Windows Temp under C:\Windows).
fn allowed_roots() -> Vec<PathBuf> {
    let mut roots = Vec::new();

    fn push_if_canonical(path: &Path, roots: &mut Vec<PathBuf>) {
        if let Ok(c) = path.canonicalize() {
            roots.push(c);
        }
    }

    push_if_canonical(&std::env::temp_dir(), &mut roots);

    for var in ["APPDATA", "LOCALAPPDATA", "USERPROFILE"] {
        if let Some(value) = std::env::var_os(var) {
            push_if_canonical(Path::new(&value), &mut roots);
        }
    }

    if let Ok(home) = std::env::var("HOME") {
        push_if_canonical(Path::new(&home), &mut roots);
    }

    #[cfg(not(target_os = "windows"))]
    {
        push_if_canonical(Path::new("/tmp"), &mut roots);
        push_if_canonical(Path::new("/var/tmp"), &mut roots);
    }

    roots
}

/// Normalize a path by resolving `.` and `..` without touching the filesystem.
/// Symlinks are *not* resolved here; callers should canonicalize afterwards.
fn normalize_path(path: &Path) -> PathBuf {
    let mut out = PathBuf::new();
    for component in path.components() {
        match component {
            Component::Prefix(prefix) => out.push(prefix.as_os_str()),
            Component::RootDir => out.push(std::path::MAIN_SEPARATOR.to_string()),
            Component::CurDir => {}
            Component::ParentDir => {
                let _ = out.pop();
            }
            Component::Normal(part) => out.push(part),
        }
    }
    out
}

/// Returns true for paths inside high-risk system locations.
///
/// This is a defense-in-depth check, not a full sandbox. The Tauri capability
/// file is the primary boundary; this function catches custom commands that
/// bypass the Tauri filesystem API.
fn is_system_path(path: &Path, allowed_roots: &[PathBuf]) -> bool {
    if allowed_roots.iter().any(|r| path.starts_with(r)) {
        return false;
    }

    let mut components = path.components().peekable();

    // Consume the Windows prefix and root directory, if present.
    while let Some(c) = components.peek() {
        if matches!(c, Component::Prefix(_) | Component::RootDir) {
            let _ = components.next();
        } else {
            break;
        }
    }

    // The first non-root component tells us which top-level directory the
    // path lives under. If there isn't one, it's a bare root (e.g., C:\, /).
    let Some(Component::Normal(first)) = components.next() else {
        return true;
    };
    let name = first.to_string_lossy().to_lowercase();

    #[cfg(target_os = "windows")]
    {
        // Windows: C:\Windows, C:\Program Files, C:\Program Files (x86),
        // C:\ProgramData, C:\$Recycle.Bin, etc.
        matches!(
            name.as_str(),
            "windows" | "program files" | "program files (x86)" | "programdata" | "$recycle.bin"
        )
    }

    #[cfg(not(target_os = "windows"))]
    {
        if name == "var" {
            // Allow macOS /private/var/folders temp paths and similar user temp
            // trees, but block other /var subdirectories (logs, lib, run, etc.).
            if let Some(Component::Normal(second)) = components.next() {
                return second.to_string_lossy().as_ref() != "folders";
            }
            true // /var itself
        } else {
            matches!(
                name.as_str(),
                "bin"
                    | "sbin"
                    | "usr"
                    | "etc"
                    | "lib"
                    | "lib64"
                    | "sys"
                    | "proc"
                    | "dev"
                    | "boot"
                    | "opt"
                    | "run"
            )
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::env;

    #[test]
    fn test_rejects_relative_path() {
        assert!(validate_io_path("relative/path.txt", true).is_err());
    }

    #[test]
    fn test_rejects_traversal_out_of_home() {
        // Path normalization should resolve the traversal, but the resolved path
        // may or may not exist; the important part is that relative paths are rejected.
        let result = validate_io_path("/home/user/../../etc/passwd", true);
        assert!(
            result.is_err(),
            "Traversal path should be rejected or non-existent: {:?}",
            result
        );
    }

    #[test]
    fn test_rejects_windows_system_dir() {
        assert!(validate_io_path(r"C:\Windows\System32\notepad.exe", false).is_err());
        assert!(validate_io_path(r"C:\Program Files\App\file.exe", false).is_err());
        assert!(validate_io_path(r"C:\ProgramData\secrets.txt", false).is_err());
    }

    #[test]
    fn test_rejects_unix_system_dir() {
        assert!(validate_io_path("/etc/passwd", false).is_err());
        assert!(validate_io_path("/usr/bin/env", false).is_err());
        assert!(validate_io_path("/bin/sh", false).is_err());
    }

    #[test]
    fn test_accepts_temp_file() {
        let temp = env::temp_dir().join("moshdither_test_path_guard.txt");
        let _ = std::fs::write(&temp, b"test");
        let result = validate_io_path(temp.to_string_lossy().as_ref(), true);
        let _ = std::fs::remove_file(&temp);
        assert!(result.is_ok(), "Temp file should be accepted: {:?}", result);
    }

    #[test]
    fn test_output_requires_existing_parent() {
        let temp = env::temp_dir();
        let out = temp.join("nonexistent_subdir/output.mp4");
        assert!(validate_io_path(out.to_string_lossy().as_ref(), false).is_err());
    }
}
