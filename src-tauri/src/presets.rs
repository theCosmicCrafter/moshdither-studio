//! Preset library persistence.
//!
//! Presets live in a plain JSON file under the user's Documents folder:
//!
//! ```text
//! <Documents>/MoshDither Studio/presets.json
//! ```
//!
//! Documents rather than the app data directory, deliberately. This ships as an
//! executable, so a preset library buried in `%APPDATA%` is effectively
//! invisible: users cannot find it, back it up, copy it to another machine, or
//! send one to someone else. A visible file in Documents is a thing you can drag
//! around. The previous home was browser `localStorage`, which is worse on every
//! one of those counts and is also wiped whenever the webview's data is cleared.
//!
//! Writes are atomic — serialise to a sibling temp file, then rename over the
//! target. A crash or a full disk mid-write leaves the previous library intact
//! rather than truncating it, which matters because this file is the only copy
//! of work the user cannot regenerate.

use std::fs;
use std::path::PathBuf;

use tauri::{AppHandle, Manager};

const PRESETS_DIR_NAME: &str = "MoshDither Studio";
const PRESETS_FILE_NAME: &str = "presets.json";
const TEMP_FILE_NAME: &str = "presets.json.tmp";

/// Upper bound on a preset library write.
///
/// Presets are small records — an effect stack plus a thumbnail data URL — so a
/// few MB is already thousands of them. The cap exists so a bug or a malicious
/// script in the webview cannot fill the user's disk through this command.
const MAX_PRESETS_BYTES: usize = 16 * 1024 * 1024;

/// Directory holding the preset library.
///
/// Falls back to the app data directory when the platform has no Documents
/// folder (headless CI, unusual profiles), so persistence degrades rather than
/// failing outright.
fn presets_dir(app: &AppHandle) -> PathBuf {
    app.path()
        .document_dir()
        .or_else(|_| app.path().app_data_dir())
        .unwrap_or_else(|_| PathBuf::from("."))
        .join(PRESETS_DIR_NAME)
}

fn presets_file(app: &AppHandle) -> PathBuf {
    presets_dir(app).join(PRESETS_FILE_NAME)
}

/// Absolute path to the preset library, so the UI can show the user where their
/// presets live and open the containing folder.
#[tauri::command]
pub fn get_presets_path(app: AppHandle) -> Result<String, String> {
    Ok(presets_file(&app).to_string_lossy().to_string())
}

/// Read the preset library.
///
/// Returns an empty string when the file does not exist yet. That is the normal
/// first-run state, not an error, and lets the frontend fall through to its
/// localStorage migration.
#[tauri::command]
pub fn load_presets(app: AppHandle) -> Result<String, String> {
    let path = presets_file(&app);
    if !path.exists() {
        return Ok(String::new());
    }
    fs::read_to_string(&path)
        .map_err(|e| format!("Failed to read presets from {}: {e}", path.display()))
}

/// Validate a payload before it touches the disk.
///
/// Ordering matters: both checks run before the write, so neither an oversized
/// nor a malformed payload can truncate a working library.
fn check_payload(json: &str) -> Result<(), String> {
    if json.len() > MAX_PRESETS_BYTES {
        return Err(format!(
            "Preset library is {} bytes, over the {MAX_PRESETS_BYTES} byte limit",
            json.len()
        ));
    }
    serde_json::from_str::<serde_json::Value>(json)
        .map_err(|e| format!("Refusing to write malformed preset JSON: {e}"))?;
    Ok(())
}

/// Write the preset library, atomically.
///
/// `json` is validated as parseable JSON before anything touches the disk — a
/// malformed write would otherwise destroy a working library and only surface
/// on the next launch.
#[tauri::command]
pub fn save_presets(app: AppHandle, json: String) -> Result<(), String> {
    check_payload(&json)?;

    let dir = presets_dir(&app);
    fs::create_dir_all(&dir).map_err(|e| format!("Failed to create {}: {e}", dir.display()))?;

    // Write to a temp file in the same directory, then rename. Same-directory
    // matters: a rename across filesystems is not atomic.
    let temp = dir.join(TEMP_FILE_NAME);
    fs::write(&temp, &json).map_err(|e| format!("Failed to write {}: {e}", temp.display()))?;

    let target = dir.join(PRESETS_FILE_NAME);
    fs::rename(&temp, &target).map_err(|e| {
        // Best-effort cleanup so a failed rename does not leave a stray temp file.
        let _ = fs::remove_file(&temp);
        format!("Failed to replace {}: {e}", target.display())
    })?;

    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn accepts_a_well_formed_library() {
        assert!(check_payload("[]").is_ok());
        assert!(check_payload(r#"[{"id":"a","name":"A","stack":[]}]"#).is_ok());
    }

    #[test]
    fn rejects_malformed_json_before_writing() {
        // A malformed payload must be refused rather than written, or it would
        // destroy a working library and only surface on the next launch.
        let err = check_payload("{not json").unwrap_err();
        assert!(err.contains("malformed"), "unexpected error: {err}");
    }

    #[test]
    fn rejects_a_payload_over_the_size_limit() {
        let oversized = "x".repeat(MAX_PRESETS_BYTES + 1);
        let err = check_payload(&oversized).unwrap_err();
        assert!(err.contains("limit"), "unexpected error: {err}");
    }

    #[test]
    fn checks_size_before_parsing() {
        // An oversized payload is rejected on length alone — serde never sees
        // it, so a huge malformed blob cannot burn CPU on a doomed parse.
        let oversized = "x".repeat(MAX_PRESETS_BYTES + 1);
        assert!(check_payload(&oversized).unwrap_err().contains("bytes"));
    }

    #[test]
    fn temp_file_is_a_sibling_of_the_target() {
        // Cross-filesystem renames are not atomic, so the temp file has to live
        // in the same directory as the file it replaces.
        assert_eq!(
            PathBuf::from("/a/b").join(TEMP_FILE_NAME).parent(),
            PathBuf::from("/a/b").join(PRESETS_FILE_NAME).parent()
        );
    }

    #[test]
    fn library_file_is_visible_and_portable() {
        assert_eq!(PRESETS_FILE_NAME, "presets.json");
        assert_eq!(PRESETS_DIR_NAME, "MoshDither Studio");
    }
}
