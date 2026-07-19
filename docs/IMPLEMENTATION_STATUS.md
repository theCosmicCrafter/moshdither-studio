# MoshDither Studio — Implementation Status Report

**Date:** June 2026
**Audited by:** Code-level verification against Tauri v2 codebase
**Build:** `npm run build` passes, `cargo check --lib` passes, `cargo test --lib` passes

---

## How to Read This Document

- **Done** — Code exists, compiles, and is wired into the app
- **Partial** — Code exists but has gaps: not fully wired, UI missing, or known bugs
- **Stub** — Types/interfaces exist, functions log warnings and return no-ops
- **Missing** — No code exists; purely speculative

---

## 1. Core App Infrastructure

| #   | Item                       | Status   | Verified                                            | Notes                                                                        |
| --- | -------------------------- | -------- | --------------------------------------------------- | ---------------------------------------------------------------------------- |
| 1   | Tauri v2 desktop framework | **Done** | `src-tauri/tauri.conf.json`, `src-tauri/src/lib.rs` | Tauri v2 with Rust backend, React frontend                                   |
| 2   | Zustand state management   | **Done** | `src/store/index.ts`                                | Single global store, ~660 lines, selectors throughout                        |
| 3   | Command palette            | **Done** | `src/components/CommandPalette.tsx`                 | Fuzzy search, keyboard nav, timeline/view commands                           |
| 4   | Keyboard shortcuts         | **Done** | `src/hooks/useKeyboardShortcuts.ts`                 | Transport, editing, view toggles, theme toggle (T), category switching (1-9) |
| 5   | Keyboard shortcuts editor  | **Done** | `src/components/KeyboardShortcutsEditor.tsx`        | Live binding recording, preset profiles                                      |
| 6   | Onboarding modal           | **Done** | `src/components/OnboardingModal.tsx`                | First-launch welcome                                                         |
| 7   | Drag & drop file loading   | **Done** | `src/components/AppLayout.tsx`                      | Tauri webview drag-drop API                                                  |
| 8   | Project save/load          | **Done** | `src/hooks/useProject.ts`                           | JSON serialization of state                                                  |
| 9   | Undo/redo                  | **Done** | `src/store/index.ts`                                | Past/future stacks for effect stack changes                                  |

---

## 2. Effect System

| #   | Item                    | Status   | Verified                                        | Notes                                                                                                                             |
| --- | ----------------------- | -------- | ----------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------- |
| 1   | Effect trait + registry | **Done** | `src-tauri/src/effects/types.rs`, `registry.rs` | `Effect` trait with `meta()`, `process_frame()`, `process_video()`                                                                |
| 2   | Effect stack engine     | **Done** | `src-tauri/src/effects/engine.rs`               | Sequential application, Rayon parallel for non-temporal                                                                           |
| 3   | 75+ registered effects  | **Done** | `src-tauri/src/effects/registry.rs`             | 11 categories: dithering, analog, color, composite, pixel_geo, glitch, noise, artistic, datamoshing, segmentation, audio-reactive |
| 4   | Rayon parallelization   | **Done** | `src-tauri/src/effects/engine.rs`               | `process_frames_parallel()` for export, `par_iter` for non-temporal video segments                                                |
| 5   | Effect browser UI       | **Done** | `src/components/EffectBrowser/EffectList.tsx`   | Category filtering, search, add to stack                                                                                          |
| 6   | Effect stack UI         | **Done** | `src/components/EffectStack/`                   | Reorder, toggle, duplicate, remove, parameter editing                                                                             |
| 7   | Parameter types         | **Done** | `src-tauri/src/effects/types.rs`                | Slider, select, color, toggle, range parameters                                                                                   |
| 8   | Keyframe animation      | **Done** | `src/store/index.ts`                            | Per-parameter keyframes with interpolation                                                                                        |
| 9   | Audio binding           | **Done** | `src/store/index.ts`                            | Map audio bands to effect parameters                                                                                              |

---

## 3. Preview System

| #   | Item                | Status   | Verified                             | Notes                                                                     |
| --- | ------------------- | -------- | ------------------------------------ | ------------------------------------------------------------------------- |
| 1   | Preview viewport    | **Done** | `src/components/PreviewViewport.tsx` | ~1100 lines, pan/zoom, fullscreen                                         |
| 2   | WebGL2 preview      | **Done** | `src/engine/webgl2/EffectChain.ts`   | Real-time GPU rendering                                                   |
| 3   | Before/after toggle | **Done** | `src/components/Toolbar.tsx`         | Split comparison                                                          |
| 4   | HUD overlays        | **Done** | `src/components/PreviewViewport.tsx` | Crosshairs, scanlines, pixel grid, histograms, OSD stats, handle brackets |
| 5   | Safe area guides    | **Done** | `src/components/PreviewViewport.tsx` | Action-safe (90%), title-safe (80%), 3.5% margin                          |
| 6   | Rule-of-thirds grid | **Done** | `src/components/PreviewViewport.tsx` | 3x3 composition grid                                                      |
| 7   | SAM3 mask overlay   | **Done** | `src/components/PreviewViewport.tsx` | Click-to-segment, hover preview, opacity/color controls                   |

---

## 4. Masking System

| #   | Item                   | Status   | Verified                                                  | Notes                              |
| --- | ---------------------- | -------- | --------------------------------------------------------- | ---------------------------------- |
| 1   | SAM3 segmentation      | **Done** | `src-tauri/src/sam3/`, `src/components/MaskListPanel.tsx` | ONNX Runtime, click-to-segment     |
| 2   | Custom mask saving     | **Done** | `src/components/MaskListPanel.tsx`                        | Save current mask to list          |
| 3   | Mask rename            | **Done** | `src/components/MaskListPanel.tsx`                        | Inline rename for custom masks     |
| 4   | Mask duplicate         | **Done** | `src/components/MaskListPanel.tsx`                        | Copy any mask with "(copy)" suffix |
| 5   | Mask delete            | **Done** | `src/components/MaskListPanel.tsx`                        | Delete custom masks                |
| 6   | Mask visibility toggle | **Done** | `src/store/index.ts`                                      | `maskVisible` state                |
| 7   | Mask overlay rendering | **Done** | `src/components/PreviewViewport.tsx`                      | Color-coded overlay with opacity   |

---

## 5. Timeline & Transport

| #   | Item                     | Status   | Verified                                                  | Notes                                         |
| --- | ------------------------ | -------- | --------------------------------------------------------- | --------------------------------------------- |
| 1   | Timeline component       | **Done** | `src/components/Timeline.tsx`                             | Scrubber, playhead, play/pause                |
| 2   | In/out points            | **Done** | `src/store/index.ts`, `src/hooks/useKeyboardShortcuts.ts` | `[` / `]` keys, trim support                  |
| 3   | Playback speed           | **Done** | `src/components/Toolbar.tsx`                              | Variable speed control                        |
| 4   | Keyframe UI              | **Done** | `src/components/EffectStack/`                             | Visual rail, add/remove at current time       |
| 5   | Audio waveform           | **Done** | `src/components/Timeline.tsx`                             | Web Audio API decoding                        |
| 6   | Beat detection           | **Done** | `src/utils/beatDetection.ts`                              | Spectral-flux onset detection, BPM estimation |
| 7   | Beat keyframe generation | **Done** | `src/utils/beatKeyframeGenerator.ts`                      | Pulse, toggle, ramp, decay modes              |

---

## 6. Audio & MIDI

| #   | Item                    | Status      | Verified                                | Notes                                              |
| --- | ----------------------- | ----------- | --------------------------------------- | -------------------------------------------------- |
| 1   | Audio-reactive effects  | **Done**    | `src-tauri/src/effects/audio_reactive/` | BassPulse, BeatGlitch, SpectralShift, AudioDither  |
| 2   | Audio analysis          | **Done**    | `src/hooks/useAudioReactive.ts`         | AnalyserNode, bass/mid/treble extraction           |
| 3   | Audio parameter binding | **Done**    | `src/store/index.ts`                    | `AudioBinding` interface, mapping to effect params |
| 4   | Audio baking            | **Done**    | `src-tauri/src/commands.rs`             | Pre-compute audio-driven params for export         |
| 5   | MIDI control            | **Missing** | —                                       | Not implemented in Tauri version                   |

---

## 7. Export & Render

| #   | Item                       | Status   | Verified                               | Notes                                                   |
| --- | -------------------------- | -------- | -------------------------------------- | ------------------------------------------------------- |
| 1   | Video export (FFmpeg)      | **Done** | `src-tauri/src/commands.rs`            | `export_video` command with FFmpeg encoding             |
| 2   | Parallel export processing | **Done** | `src-tauri/src/commands.rs`            | Rayon parallel for non-temporal effects + mask blending |
| 3   | Export panel UI            | **Done** | `src/components/ExportPanel/index.tsx` | Format, codec, resolution, quality, FPS                 |
| 4   | Format support             | **Done** | `src/components/ExportPanel/index.tsx` | MP4, WebM, GIF, PNG sequence                            |
| 5   | Codec selection            | **Done** | `src/components/ExportPanel/index.tsx` | H.264, H.265, VP9, AV1, ProRes                          |
| 6   | Resolution presets         | **Done** | `src/components/ExportPanel/index.tsx` | Source, 4K, 1080p, 720p, 480p, custom                   |
| 7   | Aspect ratio lock          | **Done** | `src/components/ExportPanel/index.tsx` | Checkbox + presets: 16:9, 4:3, 1:1, 9:16, 21:9, 3:2     |
| 8   | Watermark                  | **Done** | `src/components/ExportPanel/index.tsx` | Text/image, position, opacity, size                     |
| 9   | Video trimming             | **Done** | `src-tauri/src/commands.rs`            | In/out points, filename suffix                          |
| 10  | Single-image export        | **Done** | `src-tauri/src/commands.rs`            | PNG, JPG, BMP, TIFF                                     |
| 11  | FFglitch export            | **Done** | `src/components/ExportPanel/index.tsx` | Separate FFglitch mode                                  |
| 12  | Batch export queue         | **Done** | `src/components/ExportPanel/index.tsx` | Queue management, sequential processing                 |
| 13  | Export cancel              | **Done** | `src/store/index.ts`                   | `requestExportCancel` flag                              |
| 14  | Metadata probing           | **Done** | `src-tauri/src/commands.rs`            | `probe_metadata` + `get_media_metadata`                 |

---

## 8. UI/UX

| #   | Item                      | Status   | Verified                                                     | Notes                                             |
| --- | ------------------------- | -------- | ------------------------------------------------------------ | ------------------------------------------------- |
| 1   | Dark theme (default)      | **Done** | `src/index.css`                                              | Cyber-Urban Creative System palette               |
| 2   | Light theme               | **Done** | `src/index.css`                                              | `[data-theme="light"]` CSS variable overrides     |
| 3   | Theme toggle              | **Done** | `src/components/Toolbar.tsx`, `src/components/AppLayout.tsx` | Sun/moon icon, `data-theme` attribute on `<html>` |
| 4   | Theme keyboard shortcut   | **Done** | `src/hooks/useKeyboardShortcuts.ts`                          | `T` key toggles theme                             |
| 5   | Effect category shortcuts | **Done** | `src/hooks/useKeyboardShortcuts.ts`                          | Keys 1-9 switch categories                        |
| 6   | Neumorphic UI             | **Done** | `src/index.css`                                              | Neo-flat, neo-raised, neo-pressed classes         |
| 7   | Material Symbols icons    | **Done** | Throughout components                                        | Material Symbols Outlined font                    |
| 8   | Custom scrollbars         | **Done** | `src/index.css`                                              | Themed scrollbars                                 |
| 9   | Window controls           | **Done** | `src/components/WindowControls.tsx`                          | Custom titlebar buttons                           |
| 10  | Analog click sounds       | **Done** | `src/hooks/useAnalogClickSounds.ts`                          | UI interaction audio feedback                     |

---

## 9. Spout / GPU Output

| #   | Item              | Status      | Verified                     | Notes                                                          |
| --- | ----------------- | ----------- | ---------------------------- | -------------------------------------------------------------- |
| 1   | Spout sender stub | **Stub**    | `src-tauri/src/spout/mod.rs` | `SpoutSender` struct with `#[allow(dead_code)]`, FFI not wired |
| 2   | Spout integration | **Missing** | —                            | Requires Spout SDK FFI, Windows-only                           |

---

## 10. Testing & CI/CD

| #   | Item                   | Status   | Verified                        | Notes                                                                      |
| --- | ---------------------- | -------- | ------------------------------- | -------------------------------------------------------------------------- |
| 1   | ESLint                 | **Done** | `package.json`                  | `npm run lint` with zero warnings target                                   |
| 2   | TypeScript checking    | **Done** | `tsconfig.json`                 | `tsc -b` passes                                                            |
| 3   | Rust type checking     | **Done** | `src-tauri/Cargo.toml`          | `cargo check --lib` passes                                                 |
| 4   | Unit tests (Vitest)    | **Done** | `src/store/index.test.ts`       | 21 tests: theme, stack, undo/redo, overlays, aspect ratio                  |
| 5   | E2E tests (Playwright) | **Done** | `tests/e2e/`                    | 4 spec files: app-launch, theme-toggle, effect-browser, keyboard-shortcuts |
| 6   | Tauri API mock         | **Done** | `tests/e2e/mocks/tauri-mock.ts` | Stubs invoke() with canned responses for browser-only E2E                  |
| 7   | GitHub Actions CI      | **Done** | `.github/workflows/ci.yml`      | 3 jobs: frontend, e2e, rust                                                |

---

## 11. Documentation

| #   | Item                          | Status   | Verified                         | Notes                                              |
| --- | ----------------------------- | -------- | -------------------------------- | -------------------------------------------------- |
| 1   | CONTEXT.md                    | **Done** | `CONTEXT.md`                     | Project overview, tech stack, architecture         |
| 2   | Architecture Decision Records | **Done** | `docs/adr/`                      | 4 ADRs: Tauri v2, Rust+Rayon, Zustand, CSS theming |
| 3   | CHANGELOG.md                  | **Done** | `CHANGELOG.md`                   | Full unreleased changelog                          |
| 4   | PRD                           | **Done** | `docs/PRD.md`                    | Product requirements document                      |
| 5   | Implementation status         | **Done** | `docs/IMPLEMENTATION_STATUS.md`  | This document                                      |
| 6   | UI/UX improvement plan        | **Done** | `docs/UI_UX_IMPROVEMENT_PLAN.md` | 4-sprint roadmap                                   |

---

## 12. Backend Hardening

| #   | Item                         | Status   | Verified                          | Notes                                                                                                  |
| --- | ---------------------------- | -------- | --------------------------------- | ------------------------------------------------------------------------------------------------------ |
| 1   | Parameter clamping           | **Done** | `src-tauri/src/effects/params.rs` | `clamp_value` helper + per-effect `clamp_for_effect` used before every `process_frame`/`process_video` |
| 2   | Video decode memory bounding | **Done** | `src-tauri/src/ffmpeg/mod.rs`     | `DEFAULT_DECODE_MAX_FRAMES` + 2 GiB memory budget, prevents unbounded raw frame buffers                |
| 3   | ffprobe JSON parsing         | **Done** | `src-tauri/src/ffmpeg/mod.rs`     | `probe_video` parses JSON `streams[0]` instead of ad-hoc line parsing                                  |
| 4   | Panic-safe probe cache       | **Done** | `src-tauri/src/ffmpeg/mod.rs`     | `parking_lot::Mutex` cache (no poisoning), bounded by `PROBE_CACHE_CAPACITY`                           |
| 5   | `blend_mask` validation      | **Done** | `src-tauri/src/effects/engine.rs` | Returns `Result` on dimension mismatch and mismatched frame dimensions                                 |
| 6   | Serialized expensive exports | **Done** | `src-tauri/src/commands.rs`       | `tokio::sync::Semaphore` in `AppState`; `export_video` acquires one permit                             |

---

## Top Priority Gaps

### P0 — Critical (Completed)

| #   | Item                         | Why                                       | Notes                                            |
| --- | ---------------------------- | ----------------------------------------- | ------------------------------------------------ |
| 1   | Frontend test infrastructure | No unit/component tests for Tauri version | **Done** — Vitest + 39 store tests               |
| 2   | CI/CD pipeline               | No automated builds or checks             | **Done** — GitHub Actions: frontend + e2e + rust |

### P1 — High Impact (Completed)

| #   | Item                 | Why                              | Notes                                            |
| --- | -------------------- | -------------------------------- | ------------------------------------------------ |
| 1   | Proxy media          | Not implemented in Tauri version | **Done** — FFmpeg transcode + Tauri command + UI |
| 2   | Multi-track layering | Single track only                | **Done** — Store tracks array, TrackPanel UI     |

### P2 — Polish

| #   | Item          | Why                     | Notes                                |
| --- | ------------- | ----------------------- | ------------------------------------ |
| 1   | E2E tests     | No automated UI testing | **Done** — Playwright + 20 E2E tests |
| 2   | Auto-updater  | Not configured          | Tauri updater plugin                 |
| 3   | Plugin system | Not started             | Sandboxed extension architecture     |
| 4   | Cloud sync    | Not in Tauri version    | Local folder sync                    |
