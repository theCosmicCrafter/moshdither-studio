# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added

- Project scaffolding: Tauri v2 + Vite + React + TypeScript + Tailwind CSS
- Effect system trait and registry skeleton
- Three-panel UI layout (Effect Browser, Preview, Effect Stack)
- Basic image I/O (PNG/JPEG)
- FFmpeg sidecar integration pattern
- SAM3 segmentation engine skeleton (ONNX Runtime)
- 75+ Rust effects across 11 categories (dithering, analog, color, glitch, datamoshing, noise, artistic, pixel geometry, composite, segmentation, audio-reactive)
- WebGL2 real-time preview pipeline with effect chain rendering
- Timeline with keyframe animation and audio binding
- Mask system with SAM3 segmentation and custom mask support
- Command palette with fuzzy search
- Keyboard shortcuts editor and global hotkeys
- Beat detection and keyframe generation from audio
- Metadata probing via Rust backend
- Onboarding modal for first-time users
- Watermark overlay for export
- Video trimming (in/out points, filename suffix)
- Single-image export (PNG/JPG/BMP/TIFF)
- FFglitch export mode
- Batch export queue
- Dark/light theme toggle with CSS variable theming
- Safe area guides (action-safe, title-safe) overlay on preview
- Rule-of-thirds grid overlay on preview
- Mask rename, duplicate, and delete UI controls
- Aspect ratio lock with preset ratios (16:9, 4:3, 1:1, 9:16, 21:9, 3:2) in export panel
- Keyboard shortcuts: T for theme toggle, 1-9 for effect category switching
- Spout GPU output stub (Windows)
- Project context documentation (CONTEXT.md)
- Architecture Decision Records (docs/adr/)
- Proxy media system: FFmpeg transcode to low-res proxy for smooth preview (Rust `generate_proxy` + `generate_proxy_command` Tauri command + frontend `generateProxy` wrapper)
- Proxy media UI panel with enable toggle, max width slider, CRF quality slider, and generate button
- Multi-track layering: `Track` and `BlendMode` types in store with full CRUD actions (add, remove, rename, reorder, visibility, opacity, blend mode)
- Track panel UI with per-track controls (visibility, rename, opacity slider, blend mode dropdown, reorder up/down, delete)
- 18 new store unit tests for proxy media and multi-track layering (39 total, up from 21)
- 6 new E2E tests for proxy and tracks panels
- `generate_proxy_command` mock in E2E Tauri mock

### Changed

- Effect engine now uses Rayon for parallel frame processing on non-temporal effects
- Export pipeline parallelizes non-temporal effect application and mask blending
- Zustand store extended with theme, overlay, aspect ratio, proxy media, and multi-track state
- Preview viewport HUD with toggleable overlays (crosshairs, scanlines, pixel grid, histograms, OSD stats, safe area, grid)

### Security

- Tightened Tauri filesystem capability scope in `src-tauri/capabilities/default.json`:
  removed `$HOME/**`, `$APPDATA/**`, `$APPCONFIG/**`, `$TEMP/**` and narrowed to
  common media/project directories (`$DESKTOP/**`, `$DOCUMENT/**`, `$PICTURE/**`,
  `$VIDEO/**`, `$DOWNLOAD/**`) plus app-specific subdirs under `$TEMP` and
  `$APPDATA`/`$APPCONFIG`.
- Removed unused `tauri-plugin-shell` from the Rust backend (`Cargo.toml` and
  `src-tauri/src/lib.rs`) to reduce attack surface.
- Added `src-tauri/deny.toml` for `cargo-deny` supply-chain auditing (advisories,
  licenses, sources, banned wildcards).
- Added `cargo-deny` and `npm audit --audit-level=high` jobs to
  `.github/workflows/security.yml`.
- Hardened the Tauri command surface against panics: all 29 `.lock().unwrap()`
  calls in `src-tauri/src/commands.rs` and both in `src-tauri/src/ffmpeg/mod.rs`
  now map a poisoned mutex to a `Result::Err(String)` (e.g. `"registry lock poisoned: .."`)
  instead of panicking. A panic while holding a lock no longer crashes the app or
  wedges shared state on subsequent commands.
- Purple-team regression tests added for malformed/non-image base64, unknown effect
  IDs, out-of-range effect parameters, mismatched-dimension masks, and poisoned-lock
  recovery.

### Fixed

- `list_effects` and `list_effects_by_category` now return `Result<Vec<EffectMeta>, String>`
  and surface a registry-lock error instead of panicking.
- `downscale_frame`/`upscale_frame` now return an error when the frame buffer is
  inconsistent with its declared dimensions, instead of silently substituting a
  1x1 black frame.
- Removed hot-path debug logging: the five `[MASK DEBUG]` and the `[SAVE DEBUG]`
  `eprintln!` calls were deleted. Meaningful `[export]` progress logs are retained.
- Clippy is now clean under `-D warnings`: fixed `unnecessary_sort_by` in
  `frame_manipulation.rs`, `useless_conversion` and `type_complexity` in `sam3_engine.rs`.
- Frontend `no-explicit-any` cleanup: `MIDIController.ts` now uses `@types/webmidi`
  (`WebMidi.MIDIAccess`, `WebMidi.MIDIMessageEvent`) and drops the file-wide
  `eslint-disable`.
- Replaced the hardcoded Windows-only image path in the `commands.rs` test module
  with a generated in-memory PNG so the test runs cross-platform.
- SpoutSender unused fields warning suppressed with `#[allow(dead_code)]`
- Historical palette accuracy for dithering effects
- Missing brightness/contrast/gamma/saturation effects
- Missing dithering algorithms (False Floyd-Steinberg, Steven Pigeon, Sierra variants)
- VHS effect enhancements (tracking errors, scan curve, chromatic aberration, color bleed)
- Frame manipulation datamoshing (reverse, sort by size, hold)
- I-frame removal variants for datamoshing
- Slice size variability and repeat slices (SliceShiftAdvanced)
- Reset `UNPACK_FLIP_Y_WEBGL` before LUT texture upload in
  `src/engine/lut/loader.ts` to prevent LUT images from being flipped by
  leftover pixel-store state (port of the old `feature/production-audit-fixes`
  fix to the current WebGL2 engine).

### Changed

- Upgraded build toolchain: `vite` 5.3.3 → 8.1.5, `vitest` 1.6.0 → 4.1.10,
  `@vitejs/plugin-react` 4.3.1 → 6.0.3, and added `esbuild` as an explicit dev
  dependency. This resolves `npm audit` HIGH/CRITICAL findings and brings the
  project onto the current Vite 8 / Rolldown build pipeline.
- Added `[lib]` crate-type declaration to `src-tauri/Cargo.toml` for Tauri v2
  mobile/desktop parity (`rlib`, `staticlib`, `cdylib`).
- Bumped pre-commit hook versions via `pre-commit autoupdate`:
  `gitleaks` 8.21.2 → 8.30.0, `semgrep` 1.82.0 → 1.165.0, `bandit` 1.8.3 →
  1.9.4, `pip-audit` 2.8.0 → 2.10.1.

### Fixed

- `vite.config.ts` `manualChunks` converted from an object to a function to
  satisfy Vite 8 / Rolldown output option validation.
- `vite.config.ts` build `target` changed from per-platform `chrome105`/`safari13`
  to `es2022` to avoid esbuild destructuring-lowering errors with Vite 8.
- `src/lib/mediaLoading.e2e.test.ts` `Image` mock made constructable for
  Vitest 4 (`vi.fn(function () { return mockImg; })`).
- Ran `cargo fmt` across the `src-tauri` crate so `cargo fmt -- --check`
  passes in CI.
- Updated `SECURITY.md` to reference the consolidated agent-skill directory
  (`.codeium/windsurf/skills/security/`) instead of the old `.claude/skills/security/`
  path.

## [0.1.0] - 2026-06-15

### Added

- Initial project setup and documentation.
