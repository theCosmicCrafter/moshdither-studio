# MoshDither Studio — Prioritized Fixes

**Generated:** 2026-06-17
**Methodology:** All findings from `AUDIT_REPORT.md` ranked by: (1) user impact severity, (2) fix complexity, (3) risk of regression.

---

## P0 — Critical (Fix Before Any Release)

| ID | Finding | File | Fix Complexity | Action |
|----|---------|------|--------------|--------|
| RUST-P0-001 | Double mask application corrupts all masked effects | `src-tauri/src/commands.rs` | 30 min | Remove post-process mask blend; let effects handle masking internally or wrap only mask-oblivious effects. |
| RUST-P0-002 | Mutex poison deadlock if Python bridge crashes | `src-tauri/src/sam3_engine.rs` | 1 hr | Use `parking_lot::Mutex` (non-poisoning) or recover from `PoisonError` by restarting the child process. |
| RUST-P0-003 | No IPC timeout — inference blocks forever | `src-tauri/src/sam3_engine.rs` | 2 hr | Add `read_timeout` on stdout or spawn IPC in thread with `recv_timeout`. |
| RUST-P0-004 | Hardcoded project root breaks packaged builds | `src-tauri/src/sam3_engine.rs` | 30 min | Resolve bridge script via Tauri resource API instead of `CARGO_MANIFEST_DIR`. |
| RUST-P0-005 | Empty `segmentation` and `optical_flow` modules | `src-tauri/src/segmentation/mod.rs`, `optical_flow/mod.rs` | 4 hr | Implement `MaskIsolate` native effect. Add basic optical flow stub (Farneback or block matching) for motion transfer preview. |
| ML-P0-001 | Hardcoded model path `D:\models\sam3\sam3.pt` | `src-tauri/sam3_bridge.py` | 15 min | Read `SAM3_MODEL_PATH` env var; fallback to user-data dir. Provide setup script. |
| ML-P0-002 | No CUDA OOM handling — traceback corrupts IPC | `src-tauri/sam3_bridge.py` | 30 min | Wrap `predict` in `try/except RuntimeError`; return structured error JSON. Redirect Python stdout to log file. |
| ML-P0-003 | No length-prefix framing on JSON IPC | `src-tauri/sam3_bridge.py` + `sam3_engine.rs` | 2 hr | Switch to 4-byte LE length header + JSON payload. Ensure only JSON is written to stdout. |
| SEC-P0-001 | Python bridge has no authentication | `src-tauri/src/sam3_engine.rs` | 1 hr | Add HMAC token exchange on init; validate token on every command. |
| BUILD-P0-001 | No CI/CD pipeline | Root | 2 hr | Create `.github/workflows/ci.yml` with cargo test, clippy, and frontend vitest. |

---

## P1 — High (Fix Within 48 Hours)

| ID | Finding | File | Fix Complexity | Action |
|----|---------|------|--------------|--------|
| RUST-P1-001 | Missing `ort` dep despite README claim | `src-tauri/Cargo.toml` | 5 min | Either add `ort` crate or update README to remove ONNX claim. |
| RUST-P1-002 | Silent image downscale >2048px | `src-tauri/src/utils/image_io.rs` | 15 min | Make resize opt-in; default to no resize. Add warning log. |
| RUST-P1-003 | FFmpeg hardcoded with no fallback | `src-tauri/src/ffmpeg/mod.rs` | 30 min | Try sidecar first, then fall back to system `PATH`. |
| RUST-P1-004 | `Mask` struct lacks dimensions | `src-tauri/src/effects/types.rs` | 15 min | Add `width`/`height` to `Mask`; validate against frame in `commands.rs`. |
| RUST-P1-005 | Datamoshing effects are preview stubs | `src-tauri/src/effects/datamoshing/*.rs` | 3 hr | Implement frame-level approximations for each video effect so preview shows meaningful output. |
| RUST-P1-006 | Video decode loads all frames into RAM | `src-tauri/src/ffmpeg/mod.rs` | 4 hr | Refactor to a streaming iterator; process frames one at a time. |
| FE-P0-001 | Mask overlay may not align with image | `src/components/PreviewViewport.tsx` | 1 hr | Resize mask to source dimensions before base64. Add `object-fit: contain` to overlay. |
| FE-P0-002 | Drag-and-drop is a no-op | `src/components/PreviewViewport.tsx` | 15 min | Wire `handleDrop` to invoke the same loading pipeline as file picker. |
| FE-P1-001 | No error boundary for SAM3 ops | `src/components/MaskPanel.tsx` | 30 min | Add `try/catch` around each SAM3 command; render error banner on failure. |
| FE-P1-002 | Undo/redo not persisted | `src/store/index.ts` | 1 hr | Persist effect stack history to `localStorage` or Tauri app-data with size limit. |
| FE-P1-003 | Base64 mask bloats memory | `src/store/index.ts` | 2 hr | Store masks by reference ID; keep actual data in Rust backend or LRU cache. |
| TEST-P1-001 | No mask application tests | `src-tauri/src/commands.rs` | 1 hr | Write unit tests for `apply_effect` with synthetic frame + mask. |
| TEST-P1-002 | No SAM3 IPC protocol tests | `src-tauri/src/sam3_engine.rs` | 1 hr | Mock Python echo script; test request/response roundtrip. |
| TEST-P1-003 | No FFmpeg roundtrip tests | `src-tauri/src/ffmpeg/mod.rs` | 2 hr | Generate synthetic video, decode, encode, assert checksums. |
| BUILD-P1-001 | No SAM3 setup script | Missing `scripts/setup_sam3.py` | 2 hr | Create script: venv creation, dependency install, model download, CUDA check. |
| BUILD-P1-002 | No Dockerfile for Python backend | Root | 1 hr | Add `Dockerfile` with CUDA runtime and pinned Python deps. |

---

## P2 — Medium (Ticket for Next Sprint)

| ID | Finding | File | Fix Complexity | Action |
|----|---------|------|--------------|--------|
| RUST-P2-001 | Missing error variants | `src-tauri/src/error.rs` | 15 min | Add `Sam3Timeout`, `ModelNotFound`, `CudaOom`, `FfmpegNotFound`, `MaskDimensionMismatch`. |
| RUST-P2-002 | Effect registry not serializable | `src-tauri/src/effects/registry.rs` | 2 hr | Add `EffectInstance` struct (id + params) for persistence. |
| RUST-P2-003 | No parameter bounds validation | `src-tauri/src/commands.rs` | 30 min | Add `validate_params` helper that clamps to `EffectMeta` ranges. |
| ML-P1-001 | Model loaded lazily — no init validation | `src-tauri/sam3_bridge.py` | 30 min | Add `validate` command; call during `sam3_init`. |
| ML-P1-002 | No input validation on base64 images | `src-tauri/sam3_bridge.py` | 15 min | Wrap base64 decode and image open in `try/except`. |
| ML-P1-003 | No video segmentation propagation | `src-tauri/sam3_bridge.py` | 4 hr | Add `video_predict` command using SAM3 video propagation. |
| ML-P2-001 | Only top mask returned | `src-tauri/sam3_bridge.py` | 30 min | Return all 3 mask candidates + scores. |
| ML-P2-002 | No mask post-processing | `src-tauri/sam3_bridge.py` | 2 hr | Add OpenCV morphological ops and edge smoothing. |
| ML-P2-003 | No requirements file | `src-tauri/` | 15 min | Add `requirements_sam3.txt` with pinned versions. |
| FE-P1-004 | Vite target `chrome105` may be too old | `vite.config.ts` | 5 min | Bump to `chrome120`. |
| FE-P2-001 | CSP img-src wildcard | `src-tauri/tauri.conf.json` | 15 min | Restrict to `'self' data: blob: asset:`. |
| FE-P2-002 | `useCallback` stale closure in hover | `src/components/PreviewViewport.tsx` | 30 min | Use ref for latest `sam3Points` or fix selector. |
| SEC-P2-001 | `.env.example` has realistic placeholder secrets | `.env.example` | 5 min | Rename placeholders to obviously fake values. |
| TEST-P2-001 | Frontend tests entirely missing | `src/` | 8 hr | Add Vitest tests for store and Playwright for E2E. |
| BUILD-P2-001 | `Cargo.lock` not audited for vulnerabilities | Root | 15 min | Add `cargo audit` step to CI. |

---

## P3 — Low (Backlog / Polish)

| ID | Finding | File | Action |
|----|---------|------|--------|
| RUST-P2-003 (style) | Inline tests mixed with source | `src-tauri/src/` | Move tests to `tests/` directory for cleaner separation. |
| FE-P2-001 (style) | Inline styles in multiple components | Various | Migrate to Tailwind classes to enable CSP tightening. |
| DOCS | Legacy Electron docs mixed with Tauri rewrite | `docs/` | Archive old docs; create fresh Tauri-scoped status doc. |

---

## Fix Dependency Graph

```
ML-P0-001 (model path)  ──→  BUILD-P1-001 (setup script)
       │
       └──→  ML-P0-002 (OOM handling)
              │
              └──→  RUST-P0-002 (mutex poison)
                     │
                     └──→  RUST-P0-003 (IPC timeout)

RUST-P0-001 (double mask) ──→  TEST-P1-001 (mask tests)
       │
       └──→  RUST-P1-004 (Mask dimensions)

BUILD-P0-001 (CI/CD)  ──→  TEST-P1-002 (IPC tests)
       │
       └──→  TEST-P1-003 (FFmpeg tests)
              │
              └──→  RUST-P1-006 (streaming decode)
```

---

*Prioritized by ODIN v5.0 CrewAI swarm.*
