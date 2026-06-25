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

### Fixed

- SpoutSender unused fields warning suppressed with `#[allow(dead_code)]`
- Historical palette accuracy for dithering effects
- Missing brightness/contrast/gamma/saturation effects
- Missing dithering algorithms (False Floyd-Steinberg, Steven Pigeon, Sierra variants)
- VHS effect enhancements (tracking errors, scan curve, chromatic aberration, color bleed)
- Frame manipulation datamoshing (reverse, sort by size, hold)
- I-frame removal variants for datamoshing
- Slice size variability and repeat slices (SliceShiftAdvanced)

## [0.1.0] - 2026-06-15

### Added

- Initial project setup and documentation.
