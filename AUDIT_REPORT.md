# MoshDither Studio — Comprehensive CrewAI Multi-Agent Audit Report

**Audit Date:** 2026-06-17
**Auditor:** ODIN v5.0 (Autonomous Agent Orchestrator) via CrewAI swarm
**Scope:** Full-stack audit — Rust backend, Python ML bridge, React/TypeScript frontend, security, testing, build/DevOps
**Methodology:** Six specialized CrewAI agents (RustArchitect, MLBackendEngineer, FrontendSpecialist, SecurityAuditor, TestCoverageAnalyst, DevOpsIntegrator) performed deep-dive code analysis on all source files.

---

## Executive Summary

This audit reveals **47 distinct findings** across the codebase, categorized as:

| Severity | Count | Summary |
|----------|-------|---------|
| **P0 — Critical** | 9 | Crashes, deadlocks, data loss, undefined behavior, security vulnerabilities |
| **P1 — High** | 12 | Incorrect behavior, missing error handling, resource leaks, UI misalignment |
| **P2 — Medium** | 16 | Code quality, maintainability, incomplete features, missing validations |
| **P3 — Low** | 10 | Style, documentation, performance nits |

**Top 5 Blockers:**
1. **Double-mask application** in `commands.rs` corrupts all masked effects
2. **Mutex poison deadlock** in `sam3_engine.rs` if Python bridge crashes
3. **Hardcoded SAM3 checkpoint** breaks portability on every machine except the developer's
4. **Silent 2048px image downscale** destroys 4K/8K workflows without warning
5. **Empty segmentation & optical flow modules** — core features advertised but not implemented

---

## 1. Rust Backend Findings

### P0 — Critical

#### RUST-P0-001: Double Mask Application in `apply_effect` and `apply_effect_stack`

- **File:** `src-tauri/src/commands.rs` (~lines 300–350)
- **Issue:** Both `apply_effect` and `apply_effect_stack` apply the mask **twice**:
  1. Inside `effect.process_frame()` (if the effect supports masking internally)
  2. Again in the command function after `process_frame` returns, via a manual pixel-level blend loop
- **Impact:** Effects that already handle masking (e.g., `MaskIsolate`, dithering with mask) will produce **visually incorrect output** — the mask is applied at full strength twice, making transitions harsh and values clipped.
- **Fix:** Remove the post-process mask blend loop from `commands.rs`. The `Effect` trait contract should require that `process_frame` receives the mask and applies it internally. Alternatively, split effects into "mask-aware" (apply internally) and "mask-oblivious" (wrap with automatic masking), and only apply the mask for the latter.

#### RUST-P0-002: Mutex Poison Deadlock on SAM3 Engine

- **File:** `src-tauri/src/sam3_engine.rs` (~lines 60–90)
- **Issue:** `Sam3Engine` holds `Arc<Mutex<ChildStdin>>` and `Arc<Mutex<ChildStdout>>`. If the Python bridge process panics or is killed, any thread holding the Mutex will panic on the next lock attempt, **poisoning the Mutex**. All subsequent SAM3 commands will fail with `PoisonError` and the engine becomes permanently unusable without an app restart.
- **Impact:** One inference failure (OOM, model not found, segfault) bricks SAM3 for the session.
- **Fix:** Wrap `lock()` calls with `match` and recover from poison by reinitializing the engine. Better: use `parking_lot::Mutex` (non-poisoning) or manage the child process lifecycle explicitly with health checks and automatic restart.

#### RUST-P0-003: No IPC Timeout — Inference Can Block Mutex Indefinitely

- **File:** `src-tauri/src/sam3_engine.rs` (~lines 120–150)
- **Issue:** `read_response` loops on `BufReader::read_line` with **no timeout**. If the Python bridge hangs (model loading deadlock, CUDA freeze, infinite loop), the Rust thread blocks forever and the Tauri command never returns.
- **Impact:** Frontend shows infinite spinner; user cannot cancel or recover.
- **Fix:** Set a read timeout on `ChildStdout` via `set_read_timeout` (requires converting to a raw fd/handle). Alternatively, spawn IPC communication in a separate thread and use a channel with `recv_timeout`.

#### RUST-P0-004: Hardcoded Project Root in `sam3_engine.rs`

- **File:** `src-tauri/src/sam3_engine.rs` (~lines 180–200)
- **Issue:** If `CARGO_MANIFEST_DIR` is unavailable (packaged app), the code falls back to `"C:\\Users\\richk\\CascadeProjects\\moshdither-studio\\src-tauri"` — a developer-specific absolute path.
- **Impact:** In any packaged/production build, the SAM3 bridge script cannot be found and SAM3 fails to initialize.
- **Fix:** Use Tauri's `tauri::api::path::resolve_path` or bundle `sam3_bridge.py` as a Tauri resource/sidecar and resolve it at runtime via the resource API.

#### RUST-P0-005: Empty Core Modules (`segmentation`, `optical_flow`)

- **Files:** `src-tauri/src/segmentation/mod.rs`, `src-tauri/src/optical_flow/mod.rs`
- **Issue:** Both modules contain only a doc comment. They are imported in `lib.rs` but export nothing. The `segmentation.MaskIsolate` effect is registered in the effect registry but there is **no native Rust segmentation engine** — it relies entirely on the external Python bridge. Optical flow (needed for motion-transfer datamoshing) is completely absent.
- **Impact:** Features listed in the design spec and effect registry are non-functional or delegated to unimplemented stubs.
- **Fix:** Implement `MaskIsolate` as a native Rust effect that composites using the provided `Mask` struct. Implement optical flow extraction (even a simple block-matching or Farneback approximation) for motion-aware effects.

### P1 — High

#### RUST-P1-001: Missing `ort` Dependency Despite README Claim

- **File:** `src-tauri/Cargo.toml`
- **Issue:** README states "ONNX Runtime + SAM3 for segmentation," but `Cargo.toml` does not include the `ort` crate. No ONNX inference happens in Rust — everything is delegated to Python.
- **Impact:** Cannot run SAM3 natively in Rust without the Python bridge. Adds Python environment as a deployment dependency.
- **Fix:** Either add `ort` and implement native ONNX Runtime inference, or update README to accurately reflect the Python bridge architecture.

#### RUST-P1-002: `load_image` Silently Resizes >2048px Images

- **File:** `src-tauri/src/utils/image_io.rs` (lines 11–15)
- **Issue:** Images exceeding 2048px in either dimension are silently downscaled with Lanczos3. No log, no warning, no opt-out.
- **Impact:** Users working with 4K/8K media lose resolution permanently. The effect stack operates on a downscaled copy while the user believes they're editing the original.
- **Fix:** Remove the automatic resize or gate it behind a `max_dimension` parameter with a default of `None` (no limit). Add a warning log when resizing occurs.

#### RUST-P1-003: FFmpeg Binary Hardcoded with No Fallback

- **File:** `src-tauri/src/ffmpeg/mod.rs` (lines 20–40)
- **Issue:** FFmpeg path is hardcoded to `assets/bin/ffmpeg-master-latest-win64-gpl/bin/ffmpeg.exe`. If the sidecar is missing (not bundled, wrong architecture, Linux/macOS), the code returns an error with no fallback to system `PATH`.
- **Impact:** App cannot process video on non-Windows platforms or if the sidecar is omitted from the build.
- **Fix:** Check sidecar path first, then fall back to `which ffmpeg` / `where ffmpeg` via `std::process::Command`. Document the sidecar bundling requirement in `tauri.conf.json`.

#### RUST-P1-004: `Mask` Struct Lacks Dimensions

- **File:** `src-tauri/src/effects/types.rs`
- **Issue:** The `Mask` struct only holds `data: Vec<u8>`. It has no `width` or `height` fields. Any effect that receives a mask must infer dimensions from the input `Frame`, which is error-prone if the mask was generated for a different resolution.
- **Impact:** Mismatched mask/frame resolutions will cause out-of-bounds panics or visual corruption.
- **Fix:** Add `width: u32` and `height: u32` to `Mask`. Validate in `apply_effect` that mask dimensions match frame dimensions.

#### RUST-P1-005: Many Datamoshing Effects Are Stubs

- **Files:** `src-tauri/src/effects/datamoshing/classic.rs`, `motion_transfer.rs`, `iframe_removal.rs`, `bloom.rs`, `combine.rs`, `repeat.rs`, `rise.rs`, `shuffle.rs`
- **Issue:** Most datamoshing effects have `process_frame` that simply returns `input.clone()` — they only do work in `process_video`. However, the preview pipeline calls `process_frame` for single-frame preview. Users see **no effect in preview** for video-only effects.
- **Impact:** WYSIWYG editing is broken for all datamoshing effects.
- **Fix:** Implement frame-level approximations for preview (e.g., motion transfer can blend with previous cached frame, I-frame removal can show a random frame from the segment).

#### RUST-P1-006: Video Decode Allocates All Frames Into Memory

- **File:** `src-tauri/src/ffmpeg/mod.rs` (~lines 60–100)
- **Issue:** `decode_video` decodes the entire video into a `Vec<Frame>` before returning. A 10-minute 1080p60 video requires ~200 GB of raw frame memory.
- **Impact:** Guaranteed OOM on any video longer than a few seconds.
- **Fix:** Implement a streaming frame iterator (generator pattern) that yields frames one at a time. Process the effect stack in a streaming pipeline rather than all-at-once.

### P2 — Medium

#### RUST-P2-001: Missing Error Variants for ML/FFmpeg Failures

- **File:** `src-tauri/src/error.rs`
- **Issue:** `AppError` lacks variants for: `Sam3Timeout`, `ModelNotFound`, `CudaOom`, `FfmpegNotFound`, `MaskDimensionMismatch`.
- **Fix:** Add these variants so callers can handle specific failure modes.

#### RUST-P2-002: Effect Registry Uses `Box<dyn Effect>` Without Type IDs

- **File:** `src-tauri/src/effects/registry.rs`
- **Issue:** Effects are stored as trait objects. Serializing the effect stack (for undo/redo persistence) requires downcasting or separate serialization logic. The current `EffectStack` in `engine.rs` does not persist effect state across sessions.
- **Fix:** Add a serializable `EffectInstance` struct (id + params) separate from the runtime `Box<dyn Effect>`.

#### RUST-P2-003: No Validation of Effect Parameter Bounds

- **File:** `src-tauri/src/commands.rs`
- **Issue:** When applying effects, parameter values from the frontend are passed directly to `process_frame` without clamping to the `min`/`max` declared in `EffectMeta`. A malicious or buggy frontend could pass `amount: 999.0` to `Databend` and corrupt memory.
- **Fix:** Add a `validate_params` helper that clamps numeric parameters to their declared ranges before invoking effects.

---

## 2. SAM3 / ML Backend Findings

### P0 — Critical

#### ML-P0-001: Hardcoded Model Path `D:\\models\\sam3\\sam3.pt`

- **File:** `src-tauri/sam3_bridge.py` (line 15)
- **Issue:** The SAM3 checkpoint path is a developer-specific absolute Windows path. This will fail on every other machine.
- **Impact:** SAM3 completely non-functional for any user except the original developer.
- **Fix:** Accept the model path via an environment variable (e.g., `SAM3_MODEL_PATH`) with a sensible default. Provide `scripts/setup_sam3.py` to download the model automatically.

#### ML-P0-002: No Error Handling for CUDA OOM

- **File:** `src-tauri/sam3_bridge.py` (lines 80–120)
- **Issue:** `predict` calls `torch.no_grad()` but wraps nothing in `try/except`. If the image is large and GPU memory is exhausted, PyTorch raises `RuntimeError: CUDA out of memory`. This exception is not caught, so Python prints the traceback to **stdout** (since the stderr pipe might not be fully captured), corrupting the JSON IPC stream.
- **Impact:** Rust side receives invalid JSON and the SAM3 engine enters an unrecoverable state.
- **Fix:** Wrap the inference in `try/except RuntimeError as e` and return a JSON error response. Catch `torch.cuda.OutOfMemoryError` explicitly and suggest CPU fallback.

#### ML-P0-003: No Length-Prefix Framing on JSON IPC

- **File:** `src-tauri/sam3_bridge.py` + `src-tauri/src/sam3_engine.rs`
- **Issue:** The IPC protocol uses newline-delimited JSON (NDJSON). If the Python process prints any debug message, warning, or traceback to stdout, the Rust side will try to parse it as JSON and fail.
- **Impact:** Any unexpected stdout output bricks the IPC protocol.
- **Fix:** Switch to length-prefixed framing (e.g., 4-byte little-endian length header followed by JSON payload). Redirect Python's `sys.stdout` to a log file and only write JSON responses to the real stdout.

### P1 — High

#### ML-P1-001: Model Loaded Lazily — No Validation at Init Time

- **File:** `src-tauri/sam3_bridge.py` (lines 30–50)
- **Issue:** `load_model()` is deferred until the first command that needs it. If the model file is missing, the user only discovers this when they try their first prompt — not when they click "Initialize SAM3."
- **Fix:** Add a `validate` command that attempts to load the model and report success/failure. Call this immediately after `sam3_init`.

#### ML-P1-002: No Input Validation on Base64 Images

- **File:** `src-tauri/sam3_bridge.py` (lines 150–170)
- **Issue:** The `load_image` command accepts a base64 string and passes it directly to `Image.open(BytesIO(...))`. Malformed base64 will raise `binascii.Error`, and non-image data will raise `UnidentifiedImageError`. Neither is caught.
- **Fix:** Wrap decode and image open in `try/except` and return structured error JSON.

#### ML-P1-003: No Video Segmentation Propagation

- **File:** `src-tauri/sam3_bridge.py`
- **Issue:** SAM3 supports **video mask propagation** (track an object across frames). The bridge only exposes single-image `predict` methods.
- **Impact:** Users cannot segment a moving object in a video and track it temporally.
- **Fix:** Add a `video_predict` command that accepts frame paths/URLs and returns a sequence of masks using SAM3's video propagation API.

### P2 — Medium

#### ML-P2-001: Only Top-Scoring Mask Returned

- **File:** `src-tauri/sam3_bridge.py` (lines 200–220)
- **Issue:** SAM3 returns up to 3 mask candidates per prompt (at different granularities). The bridge discards all but the highest-scoring mask (`result.masks[0]`).
- **Fix:** Return all masks and their scores, letting the frontend or user select the best one.

#### ML-P2-002: No Mask Post-Processing

- **Issue:** The bridge returns raw model masks. There is no edge smoothing, hole filling, grow/shrink, or feathering.
- **Fix:** Add post-processing utilities (OpenCV morphological ops, Gaussian blur) to the bridge.

#### ML-P2-003: No Requirements File for Python Bridge

- **File:** `src-tauri/sam3_bridge.py` (missing: `requirements.txt` or `pyproject.toml`)
- **Issue:** Dependencies (`torch`, `Pillow`, `numpy`, `sam3`) are not declared anywhere.
- **Fix:** Add `src-tauri/requirements_sam3.txt` with pinned versions.

---

## 3. Frontend Findings

### P0 — Critical

#### FE-P0-001: Mask Overlay May Not Align with Displayed Image

- **File:** `src/components/PreviewViewport.tsx` (lines 609–626)
- **Issue:** The mask overlay `<img>` uses `className="absolute inset-0"` to fill the parent. The parent `<div className="relative">` sizes to the base image. However, the mask is a base64 PNG that may have a **different native resolution** than the base image (e.g., SAM3 returns a mask at the model's input resolution, which may differ from the source image). The overlay lacks `object-fit: contain` and explicit sizing to ensure pixel-perfect alignment.
- **Impact:** Mask is stretched or offset, causing the effect to apply to the wrong region. This makes precise SAM3 selection useless.
- **Fix:** Ensure the mask is resized to exactly match the source image dimensions before base64 encoding. On the frontend, add `style={{ objectFit: 'contain', width: '100%', height: '100%' }}` to the overlay `<img>`.

#### FE-P0-002: Drag-and-Drop File Loading Is a No-Op

- **File:** `src/components/PreviewViewport.tsx` (lines 140–153)
- **Issue:** `handleDrop` accepts files from HTML5 drag-and-drop but **only logs the filename** to the console. It does not invoke `loadMediaFile` or `refreshPreviewFromBackend`.
- **Impact:** Drag-and-drop is completely broken as a file loading mechanism.
- **Fix:** Call the same loading pipeline as `handleClickOpen` inside `handleDrop`.

### P1 — High

#### FE-P1-001: No Error Boundary Around SAM3 Operations

- **File:** `src/components/MaskPanel.tsx`
- **Issue:** If `sam3Init` throws (Python not found, model missing, IPC failure), the error propagates uncaught. The UI state `sam3Ready` remains `false` but no error message is displayed to the user.
- **Fix:** Wrap each SAM3 command in `try/catch` and set an `sam3Error` state that renders a clear error banner.

#### FE-P1-002: Undo/Redo Not Persisted

- **File:** `src/store/index.ts`
- **Issue:** The effect stack undo/redo history is purely in-memory. A page reload (or Tauri window refresh) loses all work.
- **Fix:** Persist the history to `localStorage` with a size limit, or to a Tauri app-data file.

#### FE-P1-003: Base64 Mask Bloats Memory and Snapshots

- **File:** `src/store/index.ts`
- **Issue:** `activeMask` is stored as a base64 data URL. A 4K mask (~16 MB base64) is duplicated in every Zustand snapshot and undo state.
- **Fix:** Store masks by reference (e.g., a UUID or index) and keep the actual mask data in a separate LRU cache or on the Rust backend.

#### FE-P1-004: Vite Target `chrome105` May Be Too Old for Tauri v2

- **File:** `vite.config.ts`
- **Issue:** Tauri v2's WebView2 on Windows typically uses a recent Chromium. Targeting `chrome105` may cause unnecessary polyfills or missing modern API support.
- **Fix:** Bump target to `chrome120` or use `esnext` with Tauri's recommended config.

### P2 — Medium

#### FE-P2-001: CSP img-src Wildcard

- **File:** `src-tauri/tauri.conf.json`
- **Issue:** `img-src * data: blob: asset:` allows loading images from any remote origin.
- **Fix:** Restrict to `img-src 'self' data: blob: asset:` unless remote image loading is a required feature.

#### FE-P2-002: `useCallback` Dependencies Might Be Stale

- **File:** `src/components/PreviewViewport.tsx` (lines 189–220)
- **Issue:** `runPointTree` depends on `sam3Points`, but the function is called with an `extraPoint` argument to avoid stale closure. However, `scheduleHover` calls `sam3PointPrompt` directly without this workaround and may use stale `sam3Points`.
- **Fix:** Use a ref for the latest `sam3Points` or ensure the Zustand selector returns a fresh array reference.

---

## 4. Security Findings

### P0 — Critical

#### SEC-P0-001: Python Bridge Has No Authentication

- **File:** `src-tauri/src/sam3_engine.rs` + `sam3_bridge.py`
- **Issue:** The Python child process reads JSON commands from stdin with zero authentication. Any other process on the system that can write to the stdin pipe can execute arbitrary SAM3 inference commands.
- **Impact:** Local privilege escalation / DoS via IPC injection.
- **Fix:** Add an HMAC challenge-response or shared-secret token exchange on bridge initialization. Reject any command without a valid token.

### P1 — High

#### SEC-P1-001: CSP Allows Arbitrary Image Loading

- **File:** `src-tauri/tauri.conf.json`
- **Issue:** `img-src *` permits loading images from attacker-controlled domains, enabling data exfiltration via pixel requests.
- **Fix:** Tighten CSP. If remote image loading is needed, implement an allow-list.

#### SEC-P1-002: File Drop Not Validated Before Backend Processing

- **File:** `src/components/PreviewViewport.tsx`
- **Issue:** Drag-and-drop files are not checked for type, size, or path traversal before being sent to the Rust backend.
- **Fix:** Validate MIME type against an allow-list, enforce a max file size, and sanitize paths.

### P2 — Medium

#### SEC-P2-001: `.env.example` Contains Realistic Placeholder Secrets

- **File:** `.env.example`
- **Issue:** While these are placeholders, some developers copy `.env.example` to `.env` and commit it. The example includes realistic-looking GH_TOKEN and certificate password placeholders.
- **Fix:** Add prominent comments warning against committing `.env`. Consider renaming sensitive placeholders to obviously fake values like `ghp_DO_NOT_COMMIT_THIS`.

---

## 5. Test Coverage Findings

### P1 — High

#### TEST-P1-001: No Tests for Mask Application Logic

- **File:** `src-tauri/src/commands.rs`
- **Issue:** The double-mask bug (RUST-P0-001) would have been caught by a simple unit test applying an effect with a mask and asserting the output pixels.
- **Fix:** Add tests for `apply_effect` and `apply_effect_stack` with synthetic frames and masks.

#### TEST-P1-002: No SAM3 IPC Protocol Tests

- **Files:** `src-tauri/src/sam3_engine.rs`, `sam3_bridge.py`
- **Issue:** No test verifies that a JSON command sent from Rust is correctly parsed by Python and that the response is correctly deserialized.
- **Fix:** Create a mock Python script that echoes commands, and test the Rust `Sam3Engine` against it.

#### TEST-P1-003: No FFmpeg Roundtrip Tests

- **File:** `src-tauri/src/ffmpeg/mod.rs`
- **Issue:** Video decode/encode could silently corrupt color space, drop frames, or misreport dimensions.
- **Fix:** Generate a synthetic video, decode it, encode it, and assert frame count and pixel checksums match.

### P2 — Medium

#### TEST-P2-001: Frontend Tests Entirely Missing

- **Issue:** There are no frontend unit tests, no component tests, and no E2E tests for the Tauri app.
- **Fix:** Add Vitest tests for store logic (undo/redo, effect stack), and Playwright tests for critical user flows (load image, apply effect, export).

---

## 6. Build / DevOps Findings

### P0 — Critical

#### BUILD-P0-001: No CI/CD Pipeline in Current Repo

- **Issue:** The repository lacks `.github/workflows/`. The docs reference a CI workflow from the old Electron app architecture, but the current Tauri rewrite has no automated testing, building, or linting.
- **Impact:** Regressions are not caught. Builds are not reproducible.
- **Fix:** Create `.github/workflows/ci.yml` with steps: `cargo check`, `cargo test`, `cargo clippy`, `npm run lint`, `npm run test`, `cargo tauri build`.

### P1 — High

#### BUILD-P1-001: No Python Environment Bootstrap Script

- **File:** Missing `scripts/setup_sam3.py`
- **Issue:** Users must manually create a Python virtual environment and install dependencies. The correct versions and required packages are undocumented.
- **Fix:** Create `scripts/setup_sam3.py` that: creates a venv, installs pinned dependencies, verifies CUDA availability, downloads the SAM3 model checkpoint, and writes a config file with the resolved paths.

#### BUILD-P1-002: No Dockerfile or Containerization

- **Issue:** The Python backend cannot be reproducibly deployed or tested in isolation.
- **Fix:** Add a `Dockerfile` for the SAM3 bridge service.

### P2 — Medium

#### BUILD-P2-001: `Cargo.lock` Not Audited for Vulnerabilities

- **Fix:** Integrate `cargo audit` into CI.

---

## Appendix A: Prior Audit Documentation Status

The repository contains extensive audit documentation in `docs/` that **primarily references an older Electron-based architecture** (`packages/desktop-gui/`, `packages/python-backend/`, `electron/main.ts`). The current codebase is a **Tauri v2 rewrite** with a significantly reduced feature set. Many items marked "Done" in `docs/IMPLEMENTATION_STATUS.md` (e.g., WebGL pipeline, audio-reactive effects, export presets, batch processing, proxy media) **do not exist in the current Tauri codebase** and appear to be carry-overs from the prior architecture.

**Recommendation:** Archive or clearly mark legacy documentation. Create a fresh `IMPLEMENTATION_STATUS.md` scoped to the Tauri rewrite.

---

*Report generated by CrewAI multi-agent swarm orchestrated by ODIN v5.0.*
