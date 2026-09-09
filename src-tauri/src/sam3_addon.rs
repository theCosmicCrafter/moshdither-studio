//! Download and install the SAM3 add-on (bridge sidecar + model checkpoint).
//!
//! WHY THIS EXISTS AT ALL. SAM3 needs two large files that cannot ship inside
//! the installer:
//!
//!   * the bridge sidecar, a PyInstaller bundle of PyTorch + CUDA + Meta's
//!     `sam3` package, ~2.9 GB;
//!   * the model checkpoint, ~3.2 GB.
//!
//! Neither Windows installer format will carry a file over 2 GiB. Both limits
//! were measured against this exact sidecar rather than assumed: WiX refuses it
//! with `LGHT0263 : ... file size must be less than 2147483648`, and NSIS fails
//! with `File: failed creating mmap of ...`. So the app installs small and
//! fetches the add-on on request, into `~/.moshdither/sam3` beside the
//! checkpoint directory the bridge already uses.
//!
//! TRUST BOUNDARY. This downloads an executable and puts it somewhere the app
//! will run it, so the rule is: **the manifest supplies locations, never
//! identity.** `EXPECTED_SIDECAR_SHA256` is compiled into this binary, and a
//! download whose hash does not match it is discarded, no matter what the
//! manifest says. That means a tampered or swapped manifest can waste your
//! bandwidth but cannot make the app execute a different program. The cost is
//! that shipping a new sidecar requires an app release -- which is the correct
//! trade for code we execute, and the same reasoning as
//! `src-tauri/bin/SIDECARS.json`.
//!
//! The checkpoint is data rather than code, and its hash is taken from the
//! manifest; it is still verified, so a truncated or corrupted download fails
//! loudly instead of producing baffling errors deep inside PyTorch.

use std::io::Write;
use std::path::{Path, PathBuf};

use futures_util::StreamExt;
use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};
use tauri::{AppHandle, Emitter};

use crate::error::{AppError, Result};
use crate::sam3_engine::sam3_addon_dir;

/// Where the asset manifest lives. A fixed release tag, deliberately separate
/// from the app's own release tags: the add-on changes on its own schedule and
/// a 6 GB upload should not be repeated for every app patch.
const MANIFEST_URL: &str = "https://github.com/theCosmicCrafter/moshdither-studio/releases/download/sam3-addon-v1/sam3-assets.json";

/// SHA-256 of the sidecar this build of the app expects. See the trust
/// boundary note above -- this is the identity check, and the manifest cannot
/// override it. Regenerate with `npm run sam3:publish -- --print-hash` after
/// building a new sidecar, and update it here in the same commit.
const EXPECTED_SIDECAR_SHA256: &str =
    "a1066072deda1506ad47a540170e00257ab7c3898e34d6bc44798782313dec9b";

#[cfg(windows)]
const SIDECAR_FILENAME: &str = "sam3-bridge.exe";
#[cfg(not(windows))]
const SIDECAR_FILENAME: &str = "sam3-bridge";

/// One downloadable piece. GitHub Releases caps a single asset at 2 GB on the
/// free plan, so a 2.9 GB sidecar arrives in parts and is joined here.
#[derive(Debug, Clone, Deserialize)]
pub struct AssetPart {
    pub url: String,
    pub bytes: u64,
    pub sha256: String,
}

#[derive(Debug, Clone, Deserialize)]
pub struct SidecarAsset {
    pub target: String,
    pub bytes: u64,
    pub sha256: String,
    pub parts: Vec<AssetPart>,
}

#[derive(Debug, Clone, Deserialize)]
pub struct CheckpointAsset {
    pub bytes: u64,
    pub sha256: String,
    pub parts: Vec<AssetPart>,
}

#[derive(Debug, Clone, Deserialize)]
pub struct AssetManifest {
    #[serde(rename = "schemaVersion")]
    pub schema_version: u32,
    pub sidecar: SidecarAsset,
    /// Optional. Absent means "no mirror -- let the bridge fetch the weights
    /// from Hugging Face", which needs the user's own gated access.
    #[serde(default)]
    pub checkpoint: Option<CheckpointAsset>,
}

#[derive(Debug, Clone, Serialize)]
pub struct AddonStatus {
    /// True when SAM3 can actually run: sidecar present AND checkpoint present.
    pub ready: bool,
    pub sidecar_installed: bool,
    pub sidecar_path: Option<String>,
    pub sidecar_bytes: Option<u64>,
    pub checkpoint_installed: bool,
    pub checkpoint_path: Option<String>,
    pub checkpoint_bytes: Option<u64>,
    /// Present when a dev environment supersedes the add-on, so the UI can say
    /// so instead of offering a 6 GB download the developer does not need.
    pub dev_override: Option<String>,
}

#[derive(Debug, Clone, Serialize)]
struct Progress<'a> {
    stage: &'a str,
    detail: &'a str,
    /// 0-100 across the whole install, not per file.
    percent: u8,
    received_bytes: u64,
    total_bytes: u64,
}

fn emit(app: &AppHandle, stage: &str, detail: &str, percent: u8, received: u64, total: u64) {
    let _ = app.emit(
        "sam3-addon-progress",
        Progress {
            stage,
            detail,
            percent,
            received_bytes: received,
            total_bytes: total,
        },
    );
}

/// `~/.moshdither/models/sam3/sam3.pt` -- the path `sam3_bridge.py` falls back
/// to when `SAM3_CHECKPOINT` is unset, kept in one place so the two cannot drift.
pub fn checkpoint_path() -> Option<PathBuf> {
    let home = std::env::var_os("USERPROFILE")
        .or_else(|| std::env::var_os("HOME"))
        .map(PathBuf::from)?;
    Some(
        home.join(".moshdither")
            .join("models")
            .join("sam3")
            .join("sam3.pt"),
    )
}

fn installed_sidecar() -> Option<PathBuf> {
    let p = sam3_addon_dir()?.join(SIDECAR_FILENAME);
    p.exists().then_some(p)
}

fn manifest_url() -> String {
    // Overridable so the flow can be exercised against a local file server
    // before a 6 GB upload exists, and so a fork can point elsewhere.
    std::env::var("MOSHDITHER_SAM3_MANIFEST").unwrap_or_else(|_| MANIFEST_URL.to_string())
}

#[tauri::command]
pub fn sam3_addon_status() -> AddonStatus {
    let sidecar = installed_sidecar();
    let ckpt = checkpoint_path().filter(|p| p.exists());

    // A developer with MOSHDITHER_SAM3_PYTHON set never needs the add-on; the
    // engine prefers that interpreter over any sidecar.
    let dev_override = std::env::var("MOSHDITHER_SAM3_PYTHON")
        .ok()
        .filter(|p| !p.is_empty() && Path::new(p).exists());

    AddonStatus {
        ready: (sidecar.is_some() || dev_override.is_some()) && ckpt.is_some(),
        sidecar_installed: sidecar.is_some(),
        sidecar_bytes: sidecar
            .as_ref()
            .and_then(|p| std::fs::metadata(p).ok())
            .map(|m| m.len()),
        sidecar_path: sidecar.map(|p| p.display().to_string()),
        checkpoint_installed: ckpt.is_some(),
        checkpoint_bytes: ckpt
            .as_ref()
            .and_then(|p| std::fs::metadata(p).ok())
            .map(|m| m.len()),
        checkpoint_path: ckpt.map(|p| p.display().to_string()),
        dev_override,
    }
}

/// Stream one part to `dest`, hashing as it goes, and report progress against
/// the whole install rather than this part alone.
/// `on_progress` receives (bytes_done_overall, grand_total). Taking a callback
/// rather than an `AppHandle` is what lets the integration test below drive a
/// real download against a real socket -- the streaming, hashing and rejection
/// paths are the parts most worth testing, and an AppHandle cannot be built
/// outside a running app.
async fn download_part(
    client: &reqwest::Client,
    part: &AssetPart,
    dest: &Path,
    already: u64,
    grand_total: u64,
    // Send + Sync because the enclosing future crosses threads on Tauri's runtime.
    on_progress: &(dyn Fn(u64, u64) + Send + Sync),
) -> Result<u64> {
    let resp = client
        .get(&part.url)
        .send()
        .await
        .map_err(|e| AppError::Generic(format!("Download failed for {}: {e}", part.url)))?;
    if !resp.status().is_success() {
        return Err(AppError::Generic(format!(
            "Download failed for {}: HTTP {}",
            part.url,
            resp.status()
        )));
    }

    let mut file = std::fs::File::create(dest)?;
    let mut hasher = Sha256::new();
    let mut written: u64 = 0;
    let mut last_emit: u64 = 0;
    let mut stream = resp.bytes_stream();

    while let Some(chunk) = stream.next().await {
        let chunk =
            chunk.map_err(|e| AppError::Generic(format!("Transfer interrupted: {e}")))?;
        file.write_all(&chunk)?;
        hasher.update(&chunk);
        written += chunk.len() as u64;

        // Emitting per chunk would flood the webview; every 8 MiB is smooth
        // enough for a progress bar and cheap enough to ignore.
        if written - last_emit >= 8 * 1024 * 1024 {
            last_emit = written;
            on_progress(already + written, grand_total);
        }
    }
    file.flush()?;
    drop(file);

    let actual = hex(hasher.finalize().as_slice());
    if actual != part.sha256.to_lowercase() {
        let _ = std::fs::remove_file(dest);
        return Err(AppError::Generic(format!(
            "Checksum mismatch on {}.\n  expected {}\n  actual   {}\nThe download was discarded.",
            part.url, part.sha256, actual
        )));
    }
    Ok(written)
}

fn hex(bytes: &[u8]) -> String {
    bytes.iter().map(|b| format!("{b:02x}")).collect()
}

fn hash_file(path: &Path) -> Result<String> {
    let mut file = std::fs::File::open(path)?;
    let mut hasher = Sha256::new();
    std::io::copy(&mut file, &mut hasher)?;
    Ok(hex(hasher.finalize().as_slice()))
}

/// Join `parts` (in order) into `dest`, then verify the whole against `expected`.
fn join_and_verify(parts: &[PathBuf], dest: &Path, expected: &str) -> Result<()> {
    let mut out = std::fs::File::create(dest)?;
    for part in parts {
        let mut input = std::fs::File::open(part)?;
        std::io::copy(&mut input, &mut out)?;
    }
    out.flush()?;
    drop(out);

    let actual = hash_file(dest)?;
    if actual != expected.to_lowercase() {
        let _ = std::fs::remove_file(dest);
        return Err(AppError::Generic(format!(
            "Assembled file failed verification.\n  expected {expected}\n  actual   {actual}\n\
             The file was discarded and nothing was installed."
        )));
    }
    Ok(())
}

/// Gate the manifest's sidecar against the hash compiled into this build.
///
/// Separated out so it can be tested without a network or an `AppHandle`: this
/// is the check that stops a swapped manifest from choosing which executable
/// the app runs, so it is worth pinning in a test rather than trusting by eye.
fn check_offered_sidecar(offered: &str) -> Result<()> {
    if offered.to_lowercase() != EXPECTED_SIDECAR_SHA256 {
        return Err(AppError::Generic(format!(
            "The published sidecar is not the one this build expects.
  expected {}
  offered  {}

             This build will only install the sidecar it was released against. Update the app.",
            EXPECTED_SIDECAR_SHA256, offered
        )));
    }
    Ok(())
}

/// The command wrapper. `AppError` is not `Serialize`, and this project's other
/// async commands surface errors as `String` (see `commands::export_video`), so
/// match that rather than widening the error type for one caller.
#[tauri::command]
pub async fn sam3_addon_install(app: AppHandle) -> std::result::Result<AddonStatus, String> {
    install(app).await.map_err(|e| e.to_string())
}

async fn install(app: AppHandle) -> Result<AddonStatus> {
    let dir = sam3_addon_dir()
        .ok_or_else(|| AppError::Generic("Could not resolve a home directory".into()))?;
    std::fs::create_dir_all(&dir)?;

    let client = reqwest::Client::builder()
        .user_agent(concat!("MoshDitherStudio/", env!("CARGO_PKG_VERSION")))
        .build()
        .map_err(|e| AppError::Generic(format!("Could not create HTTP client: {e}")))?;

    let url = manifest_url();
    emit(&app, "manifest", "Fetching the asset list", 0, 0, 0);
    let manifest: AssetManifest = client
        .get(&url)
        .send()
        .await
        .map_err(|e| {
            AppError::Generic(format!(
                "Could not reach the SAM3 asset list at {url}: {e}\n\n\
                 If this release has not published the add-on yet, build the sidecar locally \
                 with `npm run build:sam3-sidecar` instead."
            ))
        })?
        .error_for_status()
        .map_err(|e| AppError::Generic(format!("SAM3 asset list unavailable: {e}")))?
        .text()
        .await
        .map_err(|e| AppError::Generic(format!("Could not read the SAM3 asset list: {e}")))
        .and_then(|body| {
            serde_json::from_str(&body).map_err(|e| {
                AppError::Generic(format!("SAM3 asset list is not valid JSON: {e}"))
            })
        })?;

    if manifest.schema_version != 1 {
        return Err(AppError::Generic(format!(
            "SAM3 asset list uses schema version {}, which this build does not understand. \
             Update MoshDither Studio.",
            manifest.schema_version
        )));
    }

    // Refuse before spending gigabytes, not after.
    check_offered_sidecar(&manifest.sidecar.sha256)?;

    let ckpt_path = checkpoint_path()
        .ok_or_else(|| AppError::Generic("Could not resolve a home directory".into()))?;
    let need_sidecar = installed_sidecar().is_none();
    let need_ckpt = !ckpt_path.exists() && manifest.checkpoint.is_some();

    let mut grand_total = 0u64;
    if need_sidecar {
        grand_total += manifest.sidecar.bytes;
    }
    if need_ckpt {
        grand_total += manifest.checkpoint.as_ref().map(|c| c.bytes).unwrap_or(0);
    }
    let mut done: u64 = 0;

    let staging = dir.join("staging");
    std::fs::create_dir_all(&staging)?;

    if need_sidecar {
        let mut parts = Vec::new();
        for (i, part) in manifest.sidecar.parts.iter().enumerate() {
            let dest = staging.join(format!("sidecar.part{i}"));
            let label = format!(
                "Segmentation engine — part {} of {}",
                i + 1,
                manifest.sidecar.parts.len()
            );
            emit(&app, "sidecar", &label, pct(done, grand_total), done, grand_total);
            done += download_part(&client, part, &dest, done, grand_total, &|d, t| {
                emit(&app, "sidecar", &label, pct(d, t), d, t)
            })
            .await?;
            parts.push(dest);
        }

        emit(&app, "sidecar", "Verifying", pct(done, grand_total), done, grand_total);
        // Assemble beside the final name, then rename, so an interrupted run
        // never leaves a half-written executable where the engine will find it.
        let assembled = staging.join(SIDECAR_FILENAME);
        join_and_verify(&parts, &assembled, EXPECTED_SIDECAR_SHA256)?;
        std::fs::rename(&assembled, dir.join(SIDECAR_FILENAME))?;
        for p in parts {
            let _ = std::fs::remove_file(p);
        }
    }

    if need_ckpt {
        let ckpt = manifest.checkpoint.as_ref().expect("checked above");
        if let Some(parent) = ckpt_path.parent() {
            std::fs::create_dir_all(parent)?;
        }
        let mut parts = Vec::new();
        for (i, part) in ckpt.parts.iter().enumerate() {
            let dest = staging.join(format!("ckpt.part{i}"));
            let label = format!("Model weights — part {} of {}", i + 1, ckpt.parts.len());
            emit(&app, "checkpoint", &label, pct(done, grand_total), done, grand_total);
            done += download_part(&client, part, &dest, done, grand_total, &|d, t| {
                emit(&app, "checkpoint", &label, pct(d, t), d, t)
            })
            .await?;
            parts.push(dest);
        }
        emit(&app, "checkpoint", "Verifying", pct(done, grand_total), done, grand_total);
        let assembled = staging.join("sam3.pt.partial");
        join_and_verify(&parts, &assembled, &ckpt.sha256)?;
        std::fs::rename(&assembled, &ckpt_path)?;
        for p in parts {
            let _ = std::fs::remove_file(p);
        }
    }

    let _ = std::fs::remove_dir_all(&staging);
    emit(&app, "done", "SAM3 is ready", 100, grand_total, grand_total);
    Ok(sam3_addon_status())
}

fn pct(done: u64, total: u64) -> u8 {
    if total == 0 {
        0
    } else {
        ((done as f64 / total as f64) * 100.0).min(99.0) as u8
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn expected_sidecar_hash_is_a_sha256() {
        // A typo here would only surface after a multi-gigabyte download, so
        // pin the shape as well as the value.
        assert_eq!(EXPECTED_SIDECAR_SHA256.len(), 64);
        assert!(EXPECTED_SIDECAR_SHA256
            .chars()
            .all(|c| c.is_ascii_hexdigit() && !c.is_ascii_uppercase()));
    }

    #[test]
    fn manifest_parses_with_and_without_a_checkpoint() {
        // The checkpoint is optional: without a mirror the bridge falls back to
        // Hugging Face, and the manifest must still load.
        let without = r#"{
            "schemaVersion": 1,
            "sidecar": {"target":"x86_64-pc-windows-msvc","bytes":1,"sha256":"ab",
                        "parts":[{"url":"https://e/x","bytes":1,"sha256":"ab"}]}
        }"#;
        let m: AssetManifest = serde_json::from_str(without).expect("parses without checkpoint");
        assert!(m.checkpoint.is_none());
        assert_eq!(m.sidecar.parts.len(), 1);

        let with = r#"{
            "schemaVersion": 1,
            "sidecar": {"target":"t","bytes":1,"sha256":"ab","parts":[]},
            "checkpoint": {"bytes":2,"sha256":"cd","parts":[{"url":"https://e/y","bytes":2,"sha256":"cd"}]}
        }"#;
        let m: AssetManifest = serde_json::from_str(with).expect("parses with checkpoint");
        assert_eq!(m.checkpoint.expect("present").parts.len(), 1);
    }

    #[test]
    fn join_rejects_a_mismatched_assembly_and_leaves_nothing_behind() {
        let tmp = std::env::temp_dir().join("moshdither-addon-join-test");
        let _ = std::fs::create_dir_all(&tmp);
        let a = tmp.join("a");
        let b = tmp.join("b");
        std::fs::write(&a, b"hello ").expect("write a");
        std::fs::write(&b, b"world").expect("write b");
        let out = tmp.join("joined");

        // Wrong hash: the assembled file must be removed, not left in place for
        // the engine to execute.
        let err = join_and_verify(&[a.clone(), b.clone()], &out, &"0".repeat(64));
        assert!(err.is_err());
        assert!(!out.exists(), "a failed assembly must not survive");

        // Right hash: "hello world".
        let good = hex(Sha256::digest(b"hello world").as_slice());
        join_and_verify(&[a, b], &out, &good).expect("matching hash installs");
        assert_eq!(std::fs::read(&out).expect("read"), b"hello world");
        let _ = std::fs::remove_dir_all(&tmp);
    }

    /// Serve `body` once over a real socket and return its URL.
    ///
    /// Hand-rolled rather than pulling in a test HTTP server: the point is to
    /// exercise reqwest's streaming path against something real, and that needs
    /// about twenty lines of TcpListener rather than a new dependency.
    fn serve_once(body: Vec<u8>) -> String {
        use std::io::{Read, Write as _};
        use std::net::TcpListener;
        let listener = TcpListener::bind("127.0.0.1:0").expect("bind");
        let addr = listener.local_addr().expect("addr");
        std::thread::spawn(move || {
            if let Ok((mut sock, _)) = listener.accept() {
                let mut scratch = [0u8; 2048];
                let _ = sock.read(&mut scratch); // consume the request line/headers
                let head = format!(
                    "HTTP/1.1 200 OK
Content-Length: {}
Connection: close

",
                    body.len()
                );
                let _ = sock.write_all(head.as_bytes());
                let _ = sock.write_all(&body);
                let _ = sock.flush();
            }
        });
        format!("http://{addr}/asset")
    }

    #[test]
    fn downloads_over_http_verify_content_and_reject_tampering() {
        // Big enough to cross the 8 MiB progress threshold, so the callback path
        // is exercised rather than skipped.
        let body: Vec<u8> = (0..10_000_000u32).map(|i| (i % 251) as u8).collect();
        let good = hex(Sha256::digest(&body).as_slice());
        let tmp = std::env::temp_dir().join("moshdither-addon-http-test");
        let _ = std::fs::create_dir_all(&tmp);

        let rt = tokio::runtime::Builder::new_current_thread()
            .enable_all()
            .build()
            .expect("runtime");

        rt.block_on(async {
            let client = reqwest::Client::new();

            // Happy path: bytes land intact and progress is reported.
            let seen = std::sync::Mutex::new(Vec::new());
            let dest = tmp.join("ok.bin");
            let part = AssetPart {
                url: serve_once(body.clone()),
                bytes: body.len() as u64,
                sha256: good.clone(),
            };
            let n = download_part(&client, &part, &dest, 0, body.len() as u64, &|d, t| {
                seen.lock().expect("lock").push((d, t));
            })
            .await
            .expect("download succeeds");
            assert_eq!(n, body.len() as u64);
            assert_eq!(std::fs::read(&dest).expect("read"), body);
            assert!(
                !seen.lock().expect("lock").is_empty(),
                "progress must be reported for a multi-megabyte transfer"
            );

            // Tampered path: the served bytes no longer match the manifest hash,
            // so the file must be refused AND removed -- a rejected download that
            // stays on disk is the bug worth guarding against.
            let mut bad = body.clone();
            bad[0] ^= 0xff;
            let dest_bad = tmp.join("bad.bin");
            let part_bad = AssetPart {
                url: serve_once(bad),
                bytes: body.len() as u64,
                sha256: good.clone(),
            };
            let err = download_part(&client, &part_bad, &dest_bad, 0, 0, &|_, _| {})
                .await
                .expect_err("must reject a hash mismatch");
            assert!(err.to_string().contains("Checksum mismatch"), "{err}");
            assert!(!dest_bad.exists(), "a rejected download must not be left behind");
        });

        let _ = std::fs::remove_dir_all(&tmp);
    }

    #[test]
    fn a_manifest_cannot_substitute_a_different_sidecar() {
        // The whole trust model: locations come from the manifest, identity does
        // not. Anything but the compiled-in hash is refused before a byte moves.
        assert!(check_offered_sidecar(EXPECTED_SIDECAR_SHA256).is_ok());
        assert!(check_offered_sidecar(&EXPECTED_SIDECAR_SHA256.to_uppercase()).is_ok());
        let err = check_offered_sidecar(&"f".repeat(64)).expect_err("must refuse");
        let msg = err.to_string();
        assert!(msg.contains("not the one this build expects"), "{msg}");
        assert!(msg.contains(EXPECTED_SIDECAR_SHA256), "error must name what it wanted");
    }


    #[test]
    fn pct_never_reports_complete_before_the_final_emit() {
        assert_eq!(pct(0, 0), 0);
        assert_eq!(pct(0, 100), 0);
        assert_eq!(pct(50, 100), 50);
        // Capped at 99 so the bar cannot show 100% while verification is still
        // running -- the last 100 comes from the explicit "done" emit.
        assert_eq!(pct(100, 100), 99);
    }
}
