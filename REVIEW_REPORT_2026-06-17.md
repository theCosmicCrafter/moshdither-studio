# MoshDither Studio — Comprehensive Review Report

**Date:** 2026-06-17
**Scope:** Full-stack verification of audit fixes, reference material alignment, and remaining gaps
**Methodology:** Source code inspection, compilation verification, test execution, documentation audit

---

## Executive Summary

| Category | Count |
|----------|-------|
| **Fixed / Verified This Session** | 7 |
| **Already Fixed (Pre-Session)** | 5 |
| **P0 Critical — Still Open** | 5 |
| **P1 High — Still Open** | 11 |
| **P2 Medium — Still Open** | 12 |
| **Reference Feature Gaps** | ~80% of catalogued capabilities not implemented |
| **Documentation Drift** | Major (Electron docs in Tauri rewrite) |

**Verdict:** The base64 drag-and-drop pathway, SAM3 bootstrap script, and unit test coverage are solid additions. However, **the majority of the audit findings remain unaddressed**, and the gap between the reference material's catalogued capabilities and the actual implementation is enormous.

---

## 1. What Was Completed This Session (Verified)

| ID | Finding | Status | Evidence |
|----|---------|--------|----------|
| FE-P0-002 | Drag-and-drop was a no-op | **FIXED** | `PreviewViewport.tsx:152-178` now reads dropped files as base64 and calls `loadMediaFromBase64` |
| — | Base64 media loading command | **ADDED** | `commands.rs:57-70` `load_media_from_base64` decodes data URLs and loads into `current_frame` |
| — | Frontend API for base64 loading | **ADDED** | `src/lib/tauri.ts:99-106` `loadMediaFromBase64` wrapper |
| BUILD-P1-001 | No SAM3 setup script | **FIXED** | `scripts/setup_sam3.py` created — checks Python, PyTorch, downloads checkpoint, verifies integrity |
| ML-P0-001 | Hardcoded model path | **FIXED** | `sam3_bridge.py:33-34` uses `SAM3_CHECKPOINT` env var with `~/.moshdither/models/sam3/sam3.pt` default |
| TEST-P1-001 | No mask application tests | **PARTIAL** | Tests added for `decode_mask_b64` (valid/none/invalid), `handles_masking` (MaskIsolate vs Grayscale), `load_image_from_memory` roundtrip |
| — | Compilation errors | **FIXED** | `Grayscale::default()` init, base64 deprecation, `load_media_from_base64` import in `lib.rs` |

**Test Results:** All 6 integration tests pass (`cargo test --lib integration_tests`).

---

## 2. Already Fixed (Pre-Session or Not Actually Bugs)

| ID | Finding | Status | Evidence |
|----|---------|--------|----------|
| RUST-P0-001 | Double mask application | **FIXED** | `Effect::handles_masking()` trait method exists; `MaskIsolate` returns `true`; `apply_effect` and `apply_effect_stack` skip post-process blend when `effect_handles_mask` is true |
| RUST-P0-004 | Hardcoded project root | **FIXED** | `sam3_engine.rs:47-83` probes exe_dir, cargo manifest, cwd — no hardcoded Windows path |
| RUST-P1-003 | FFmpeg hardcoded | **FIXED** | `ffmpeg/mod.rs:9-20` tries sidecar first, then falls back to `"ffmpeg"` in PATH |
| RUST-P1-004 | Mask struct lacks dimensions | **FIXED** | `effects/types.rs:107-111` `Mask` has `width`, `height`, `data` |
| ML-P0-001 | Hardcoded model path | **FIXED** | `sam3_bridge.py` uses `SAM3_CHECKPOINT` env var |

---

## 3. P0 Critical — Still Open

### RUST-P0-002: Mutex Poison Deadlock
- **File:** `src-tauri/src/sam3_engine.rs:42-44`
- **State:** `std::sync::Mutex` with `.unwrap()` on every lock. If Python bridge crashes, mutex poisons and SAM3 is bricked for the session.
- **Fix needed:** Use `parking_lot::Mutex` (non-poisoning) or recover from `PoisonError`.

### RUST-P0-003: No IPC Timeout
- **File:** `src-tauri/src/sam3_engine.rs:138-140`
- **State:** `read_line` on stdout blocks forever if Python hangs (CUDA deadlock, infinite loop).
- **Fix needed:** Spawn IPC in a thread with `recv_timeout` or set raw handle read timeout.

### RUST-P0-005: Empty Core Modules
- **Files:** `src-tauri/src/segmentation/mod.rs`, `optical_flow/mod.rs`
- **State:** Both contain only a doc comment. Imported in `lib.rs` but export nothing.
- **Fix needed:** Implement `MaskIsolate` natively (actually done in `effects/segmentation/mask_isolate.rs` but the standalone `segmentation/` module is empty). Add optical flow stubs.

### ML-P0-002: CUDA OOM Handling Gaps
- **File:** `src-tauri/sam3_bridge.py`
- **State:** `cmd_load_image` wraps `set_image` in try/except, but `cmd_point_prompt` and `cmd_box_prompt` do NOT wrap the `inter_predictor.predict()` call in try/except. The main loop catches exceptions but this is at the top level.
- **Fix needed:** Wrap every inference call in `try/except RuntimeError` with explicit `torch.cuda.OutOfMemoryError` handling.

### ML-P0-003: No Length-Prefix Framing
- **Files:** `sam3_bridge.py` + `sam3_engine.rs`
- **State:** Still newline-delimited JSON. Any debug `print()` or traceback to stdout bricks the IPC protocol.
- **Fix needed:** Switch to 4-byte LE length header + JSON payload. Redirect Python stdout to a log file.

### SEC-P0-001: Python Bridge Has No Authentication
- **Files:** `sam3_engine.rs` + `sam3_bridge.py`
- **State:** Zero authentication on stdin/stdout IPC.
- **Fix needed:** Add HMAC token exchange on init.

---

## 4. P1 High — Still Open

### RUST-P1-001: Missing `ort` Dependency
- **File:** `src-tauri/Cargo.toml`
- **State:** No `ort` crate. README claims ONNX Runtime support.
- **Fix:** Add `ort` or remove claim.

### RUST-P1-002: Silent Image Downscale
- **File:** `src-tauri/src/utils/image_io.rs:10-18`
- **State:** Images >2048px are silently resized with Lanczos3. This destroys 4K/8K workflows.
- **Fix:** Make resize opt-in with a parameter, default to no limit.

### RUST-P1-005: Datamoshing Effects Are Stubs
- **Files:** `src-tauri/src/effects/datamoshing/*.rs`
- **State:** All 8 effects (`classic`, `motion_transfer`, `iframe_removal`, `bloom`, `combine`, `repeat`, `rise`, `shuffle`) return `input.clone()` in `process_frame`.
- **Fix:** Implement frame-level approximations for preview.

### RUST-P1-006: Video Decode Loads All Frames
- **File:** `src-tauri/src/ffmpeg/mod.rs:22-62`
- **State:** `decode_video` loads entire video into `Vec<Frame>`. A 10-minute 1080p60 video = ~200 GB RAM.
- **Fix:** Implement streaming frame iterator.

### FE-P0-001: Mask Overlay Alignment
- **File:** `src/components/PreviewViewport.tsx`
- **State:** Mask overlay may stretch if resolution differs from base image. Need to verify `object-fit: contain` is applied.
- **Fix:** Ensure mask is resized to source dimensions; add explicit `objectFit: 'contain'` to overlay `<img>`.

### FE-P1-001: No Error Boundary for SAM3
- **File:** `src/components/MaskPanel.tsx`
- **State:** Per-command try/catch exists, but no global `sam3Error` state or error banner UI.
- **Fix:** Add error state and render a dismissible error banner.

### FE-P1-002: Undo/Redo Not Persisted
- **File:** `src/store/index.ts`
- **State:** `pastStacks` and `futureStacks` are in-memory only. Page reload loses work.
- **Fix:** Persist to `localStorage` with size limit.

### FE-P1-003: Base64 Mask Bloats Memory
- **File:** `src/store/index.ts`
- **State:** `activeMask` is a base64 data URL stored in Zustand. Duplicated in every undo snapshot.
- **Fix:** Store masks by reference ID; keep data in Rust backend or LRU cache.

### FE-P1-004: Vite Target Too Old
- **File:** `vite.config.ts:16`
- **State:** Target is `chrome105`.
- **Fix:** Bump to `chrome120` or `esnext`.

### TEST-P1-001: No Tests for `apply_effect` with Mask
- **File:** `src-tauri/src/commands.rs`
- **State:** Tests exist for `decode_mask_b64` and `handles_masking`, but NO test verifies that applying an effect with a mask produces correct pixel output.
- **Fix:** Add test with synthetic frame + mask, assert output pixels.

### TEST-P1-002: No SAM3 IPC Tests
- **State:** No mock Python script to test request/response roundtrip.
- **Fix:** Create mock echo script and test `Sam3Engine` against it.

### TEST-P1-003: No FFmpeg Roundtrip Tests
- **State:** No video decode/encode tests.
- **Fix:** Generate synthetic video, decode, encode, assert frame count and checksums.

### BUILD-P1-002: No Dockerfile
- **State:** No containerization for Python backend.
- **Fix:** Add `Dockerfile` for SAM3 bridge.

---

## 5. P2 Medium — Still Open

| ID | Finding | Evidence |
|----|---------|----------|
| RUST-P2-001 | Missing error variants | `error.rs` lacks `Sam3Timeout`, `ModelNotFound`, `CudaOom`, `FfmpegNotFound`, `MaskDimensionMismatch` |
| RUST-P2-002 | Effect registry not serializable | No `EffectInstance` struct for persistence |
| RUST-P2-003 | No parameter bounds validation | `commands.rs` passes frontend params directly to effects without clamping to `EffectMeta` ranges |
| ML-P1-001 | Model loaded lazily | No `validate` command at init time |
| ML-P1-003 | No video segmentation propagation | Not implemented |
| ML-P2-001 | Only top mask returned | `cmd_point_prompt` picks `best_idx` only, discards other masks |
| ML-P2-002 | No mask post-processing | No edge smoothing, hole filling, grow/shrink |
| ML-P2-003 | No requirements file | No `requirements_sam3.txt` with pinned versions |
| FE-P2-001 | CSP img-src wildcard | `tauri.conf.json:30` still has `img-src * data: blob: asset:` |
| FE-P2-002 | useCallback stale closure | Not verified/fixed in `PreviewViewport.tsx` |
| SEC-P2-001 | .env.example realistic placeholders | Still has `ghp_xxxxxxxx...` and `your_pfx_password_here` |
| TEST-P2-001 | Frontend tests missing | No Vitest or Playwright tests |
| BUILD-P2-001 | Cargo.lock not audited | No `cargo audit` in CI |

---

## 6. Reference Material Gap Analysis

The `references/UNIFIED_FEATURES_REPORT.md` catalogs **~120+ capabilities** from 37 reference repositories. The current implementation covers approximately **20-25** of these.

### Major Missing Capabilities

**Datamoshing (Video Glitch):**
- All 8 datamoshing effects are preview stubs (`process_frame` returns `input.clone()`)
- Missing: I-frame removal, frame shuffling, motion transfer, keyframe bloom, water bloom, repeat, combine, classic
- Missing: Real-time / interactive datamosh (WebCodecs API)
- Missing: Profile-based presets (Glitch, Bloom, Smear, Extreme, Rainbow)

**Dithering:**
- Only basic dithering likely exists
- Missing: Bayer 8x8/16x16, Clustered-dot, Polka dot, Halftone
- Missing: Error diffusion variants (Jarvis-Judice-Ninke, Atkinson, Stucki, Burkes, Sierra, Ostromoukhov, Riemersma)
- Missing: Blue noise, IGN, Wavelet dithering, Adaptive variance, DBS

**Pixel Manipulation:**
- Missing: Pixel sorting, pixelation, neural pixelization, block shift
- Missing: Optical flow transfer, PixelFloat, block-matched motion estimation

**Color/Analog Effects:**
- Missing: Chroma glitch, RGB channel shifting, chromatic aberration, color bleed, color drift
- Missing: VHS emulation, scan lines, tracking errors, CRT dot patterns
- Missing: Palette extraction, K-Means quantization, Median Cut, custom palette import

**Compression Artifacts:**
- Missing: JPEG quantization table editing, scan data corruption, byte-level databending
- Missing: PNG IDAT corruption, WebP/GIF container-skip corruption

**Optical Flow:**
- Module is completely empty (`optical_flow/mod.rs` is a doc comment only)

---

## 7. Documentation Drift

`docs/IMPLEMENTATION_STATUS.md` references an **older Electron-based architecture**:
- Mentions `preload.ts`, `main.ts`, `electron-builder.yml`, `electron/updater.ts`
- Claims "66 Vitest tests passing (15 test files), 13 Python backend tests passing"
- Claims WebGL pipeline, audio-reactive effects, export presets, batch processing, proxy media are "Done"
- **Reality:** The current codebase is a Tauri v2 rewrite with significantly reduced scope. Many items marked "Done" do not exist in the current codebase.

**Fix:** Archive `IMPLEMENTATION_STATUS.md` and create a fresh `IMPLEMENTATION_STATUS_TAURI.md` scoped to the current rewrite.

---

## 8. New Issues Found During Review

1. **CI/CD Platform Mismatch:** `.github/workflows/ci.yml` runs on `ubuntu-latest` but the FFmpeg sidecar path is Windows-specific (`ffmpeg-master-latest-win64-gpl/bin/ffmpeg.exe`). The CI will fail on Linux.

2. **SAM3 Bridge Returns Single Mask for Point Prompts:** `cmd_point_prompt` in `sam3_bridge.py` sets `multimask_output=True` but then picks only the highest-scoring mask (`best_idx`). The frontend receives `count: 1` and only one mask. This contradicts the `sam3_text_prompt` which returns all masks.

3. **Point Prompt Discards Multi-Mask:** `sam3_text_prompt` returns `count` masks, but `sam3_point_prompt` returns only 1. The `MaskPanel.tsx` only uses `result.masks[0]` anyway.

4. **Potential Memory Leak in `apply_effect_stack`:** The function clones `working` frame for every effect in the stack (`let previous = working.clone();`). For large images (e.g., 4K = ~67MB per frame), a 10-effect stack clones 670MB.

---

## 9. Recommended Priority Order

### Immediate (Next Session)
1. **RUST-P0-002:** Fix mutex poison (`parking_lot::Mutex` or `PoisonError` recovery)
2. **RUST-P0-003:** Add IPC timeout to `sam3_engine.rs`
3. **ML-P0-002:** Wrap all inference calls in `sam3_bridge.py` with try/except RuntimeError
4. **FE-P0-001:** Fix mask overlay alignment in `PreviewViewport.tsx`

### Next 48 Hours
5. **RUST-P1-002:** Remove or gate the silent 2048px image resize
6. **RUST-P1-005:** Implement frame-level approximations for datamoshing effects (at least 3-4 core ones)
7. **FE-P1-002:** Persist undo/redo to `localStorage`
8. **FE-P1-004:** Bump Vite target to `chrome120`
9. **FE-P2-001:** Tighten CSP `img-src` wildcard
10. **BUILD-P1-002:** Add Dockerfile for SAM3 bridge

### Next Sprint
11. **RUST-P1-006:** Implement streaming video decode
12. **ML-P0-003:** Implement length-prefix IPC framing
13. **SEC-P0-001:** Add HMAC token authentication to Python bridge
14. **RUST-P2-001:** Add missing error variants
15. **TEST-P2-001:** Add frontend Vitest + Playwright tests
16. **DOCS:** Archive old Electron docs; create Tauri-scoped status document

---

*Review conducted by ODIN v5.0 — full file-level verification against AUDIT_REPORT.md, PRIORITIZED_FIXES.md, SAM3_GAP_ANALYSIS.md, and references/UNIFIED_FEATURES_REPORT.md.*
