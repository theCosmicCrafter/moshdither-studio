---
type: devlog
status: complete
session_start: "2026-07-19 03:00"
session_end: "2026-07-19 05:30"
phase: "Purple-team audit + production hardening"
subphase: null
approval: pending
summary: "Ran a defensive security/performance/architecture audit, hardened path validation, Tauri capabilities, preview memory limits, effect cache, and fixed the local security gate script."
note_created: "2026-07-19"
updated: "2026-07-19"
---

# 2026-07-19 — Purple-team audit and production hardening

## Goal

Break the app from a security, memory, and performance angle; harden the highest-risk surfaces; and leave a clear follow-up backlog for the larger architectural items.

## Audit scope

- **Security:** frontend→Rust command path safety, Tauri capability scoping, dependency CVEs, secrets leakage, local scan-gate health.
- **Memory:** whole-video decode, in-memory preview frame size, unbounded effect cache, base64 IPC overhead.
- **Performance:** image resize (image crate vs SIMD alternatives), WebGL preview VRAM, effect stack duplication.
- **Architecture:** preview/export pipeline duplication, shallow modules, god-functions.

## Work Done

### Security hardening

- Added `src-tauri/src/path_guard.rs` with `validate_io_path()`:
  - Requires absolute paths and normalizes `..` traversal.
  - Rejects known system directories (Windows: `C:\Windows`, `Program Files`, `ProgramData`, `$Recycle.Bin`; Unix: `/bin`, `/etc`, `/usr`, `/sys`, `/proc`, etc.).
  - Allows temp, `%APPDATA%`, `%LOCALAPPDATA%`, `%USERPROFILE%` / `$HOME`, and macOS `/var/folders`.
  - For output paths, requires the parent directory to exist.
  - Includes unit tests for relative paths, traversal, system dirs, and temp acceptance.
- Applied `validate_io_path()` to every command that accepts a user-facing path:
  - `load_media`, `export_video`, `apply_ffglitch`, `save_media`, `get_media_metadata`, `generate_proxy_command`.
- Tightened `src-tauri/capabilities/default.json`: removed broad user-directory globs (`$DESKTOP/**`, `$DOCUMENT/**`, `$PICTURE/**`, `$VIDEO/**`, `$DOWNLOAD/**`) and kept only app temp/data/config directories. User files are accessed through the dialog plugin and then validated in Rust.
- Enabled `assetProtocol` in `src-tauri/tauri.conf.json` with a scoped allowlist for proxy/temp/app data, and added the `protocol-asset` Tauri feature so `convertFileSrc()` for proxy videos is explicitly allowed.
- Fixed local `../tools/scan-gate.ps1`:
  - Replaced invalid PowerShell `Test-Path "..." -or "..."` with parenthesized checks.
  - Added per-scanner availability checks so missing tools produce a clear `SKIPPED` message instead of false "findings detected".

### Memory / performance hardening

- Added a 32-megapixel cap to the in-memory preview frame. `load_media` now downscales oversized stills before storing them in `AppState.current_frame`.
- Added a 256 MiB soft budget to the effect preview cache (`MAX_CACHE_BYTES`). `apply_effect_stack` evicts oldest cached intermediate frames when the budget is exceeded.
- Updated effect cache trimming function and clarified cache is a preview optimization only.

### Verification

- `cargo clippy --all-targets --all-features -- -D warnings` PASS
- `cargo test --lib` PASS (414/414)
- `cargo audit` PASS (0 vulnerabilities; 18 unmaintained-crate warnings)
- `npm audit` PASS (0 vulnerabilities)
- `npm run lint` PASS (0 warnings)
- `npx tsc --noEmit` PASS
- `npm run test` PASS (1017/1017)
- `mosh-verify verify-all` PASS (98/98)

## Findings

### Security

- No leaked secrets in source; only `.env.example` placeholders.
- `cargo audit` reports 18 unmaintained crate warnings, mostly GTK3-rs bindings (`atk`, `gdk`, `gtk`, etc.), `paste`, `proc-macro-error`, and `unic-*`. None are active CVEs today, but GTK3 is EOL and should be replaced before a long-term release.
- `validate_project_path()` existed for project JSON files but did not cover media I/O commands. The new `validate_io_path()` closes that gap.

### Memory / performance

- `decode_video()` loads the entire decoded segment into a `Vec<Frame>`. For long 4K videos this is the dominant memory risk; the existing 4 GiB guard in `export_video` is a backstop, but streaming/chunked decode is the real fix.
- Base64 IPC for every preview/export frame adds ~33% size overhead and encode/decode CPU. A binary IPC seam or shared-memory buffer is the long-term fix.
- `image::imageops::resize` is correct but slow for large frames. `fast_image_resize` (SIMD) is a drop-in candidate for preview downscale/upscale.

### Architecture

- Preview (WebGL shader) and export (Rust CPU) implement the same effects in two languages. `effectConverter.ts` manually maps Rust params to WebGL uniforms. This is a parity-bug factory; a single effect spec with generated bindings would be a major improvement.
- `EffectRegistry` is just a `HashMap`; callers reach into effect internals (`handles_masking`, `is_temporal`, `blend_mask`). A registry facade that owns pipeline orchestration would reduce coupling.
- `PreviewViewport.tsx` coordinates Rust payload shape, WebGL passes, and conversion logic — a clear god-function candidate.
- `src/lib/tauri.ts` and `src-tauri/src/effects/mod.rs` are thin pass-through modules; they could be inlined or consolidated without losing clarity.

## Follow-ups

- Stream video decode/encode rather than buffering whole segments. Candidates: `ff-decode`, `unbundle`, `video_reader-rs`.
- Replace `image::imageops::resize` with `fast_image_resize` for preview scaling; benchmark before/after.
- Add WebGL VRAM tracking in dev builds (`webgl-memory`, `@webgltools/core`) and explicit cleanup for `EffectChain` FBOs.
- Address the 18 `cargo audit` unmaintained-crate warnings; GTK3-rs in particular is EOL.
- Define a single effect-definition spec and generate Rust + WebGL parameter mappings from it.
- Add code signing and updater config to `tauri.conf.json` before public release.
