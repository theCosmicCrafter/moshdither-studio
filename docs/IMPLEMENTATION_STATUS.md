# MoshDither Studio — Implementation Status Report

**Date:** July 2026
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
| 5   | MIDI control            | **Out of scope** | —                                  | Removed 2026-07-26 — see `recycling/MANIFEST.md`. MoshDither is a passive render/export tool, not a real-time instrument. |

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
| 1   | E2E tests     | No automated UI testing | **Done** — Playwright + 68 E2E tests |
| 2   | Auto-updater  | Not configured          | Tauri updater plugin                 |
| 3   | Plugin system | Not started             | Sandboxed extension architecture     |
| 4   | Cloud sync    | Not in Tauri version    | Local folder sync                    |

---

## Production-Readiness Remediation (2026-07-19)

### Completed in this pass

| #   | Item                                   | Verified                                          | Notes                                                                             |
| --- | -------------------------------------- | ------------------------------------------------- | --------------------------------------------------------------------------------- |
| 1   | React Error Boundary                   | `src/components/ErrorBoundary.tsx`, `src/App.tsx` | Root boundary with fallback UI and status-message reporting                       |
| 2   | WebGL context-loss recovery            | `src/engine/webgl2/WebGLContext.ts`               | Listeners prevent default, clear cached resources, and trigger chain reset        |
| 3   | Python dependency pinning              | `packages/python-backend/requirements.txt`        | Compatible-release specifiers for all runtime deps                                |
| 4   | Audio error surfacing                  | `src/components/AudioPanel/index.tsx`             | `loadAudioFile`/`handleAnalyzeBeats` now report `Error.message` to the status bar |
| 5   | Test `act` warnings                    | `src/components/__tests__/*.test.tsx`             | Wrapped store mutations and async settle points                                   |
| 6   | FFmpeg encode default timeout          | `src-tauri/src/ffmpeg/mod.rs`                     | `encode_video` defaults to a 10-minute bound instead of waiting forever           |
| 7   | SAM3 bridge shutdown error propagation | `src-tauri/src/sam3_engine.rs`                    | `kill_child` now returns non-success/non-timeout exit statuses as `AppError`      |

### Completed in follow-up pass

| #   | Item                                                 | Verified                                                                  | Notes                                                                                 |
| --- | ---------------------------------------------------- | ------------------------------------------------------------------------- | ------------------------------------------------------------------------------------- |
| 1   | Tauri updater config + release workflow placeholders | `.github/workflows/release.yml`, `src-tauri/tauri.conf.json`              | Public key, endpoints, and tauri-action matrix configured; signing certs still needed |
| 2   | PreviewViewport Zustand selector optimization        | `src/components/PreviewViewport.tsx`                                      | Grouped related store reads with `useShallow` to reduce playback re-renders           |
| 3   | Build-time external binary validation                | `scripts/verify-external-bins.mjs`, `package.json` `prebuild`             | Asserts `ffmpeg`, `ffprobe`, FFglitch, and SAM3 Python env before build               |
| 4   | Material Symbols font subsetting                     | `public/fonts/material-symbols-subset.css`, `subset-material-symbols.mjs` | Bundle font reduced from 3.96 MB to ~112 KB                                           |
| 5   | GTK3 warning triage and gtk4 migration plan          | `docs/adr/0005-gtk3-gtk4-migration.md`                                    | Documents transitive GTK3 `cargo audit` warnings and migration path                   |
| 6   | E2E export and SAM3 mask smoke tests                 | `tests/e2e/export-flow.spec.ts`, `tests/e2e/sam3-mask-flow.spec.ts`       | Playwright tests with mocked Tauri backend commands                                   |

### Verification

- `cargo clippy --all-targets --all-features -- -D warnings` — clean
- `cargo test --lib` — 441 tests passing
- `cargo check --bin mosh-verify` — clean
- `npm run lint` — clean
- `npm run test` — 1,024 tests passing
- `npx playwright test` — 68 E2E tests passing (`CI=1` for reliable server lifecycle)
- `npm run build` — clean
- `npm audit` — 0 vulnerabilities
- `cargo audit` — 18 allowed unmaintained/unsound warnings (GTK3, paste, proc-macro-error, unic, glib), all transitive and not actionable without upstream migrations
- `../tools/scan-gate.ps1` — 0 issues

### Remaining architecture-review work

All items from the prior review pass are now complete. Recommended next steps for a public "1.0" release:

1. **Obtain code-signing certificates** and wire real signing secrets into `.github/workflows/release.yml`.
2. **Real backend E2E tests** — run export and SAM3 smoke tests against an actual built Tauri binary instead of the current Vite mock.
3. **Bundle size audit** — further split `vendor.js` and `index.js` chunks; evaluate lazy loading for heavy panels.
4. **Accessibility pass** — add ARIA labels, keyboard handlers, and visible focus rings to transport and dock controls.
5. **Dependency refresh** — pin `ort` to a stable release and plan GTK4 migration when upstream crates support it.

## Additional Production-Readiness Gaps Discovered (2026-07-20)

A follow-up sweep of the codebase and Tauri v2 / React / SAM3 best practices surfaced the following blockers and recommended solution options:

### Critical

1. **SAM3 Python bridge not packaged for distribution**
   - `Sam3Engine::new` looks for a `sam3_env` directory next to the executable, and `sam3_bridge.py` is not listed as a Tauri resource.
   - _Options:_ bundle Python as a Tauri sidecar (PyInstaller / `python-build-standalone`); or keep `install_local_environment` but resolve the venv from `app_data_dir` and bundle the bridge script + `sam3_repo` as resources; or make SAM3 an optional downloadable component.

2. **SAM3 model weights not bundled**
   - `sam3_bridge.py` expects `~/.moshdither/models/sam3/sam3.pt` and will raise if missing; `hf_hub_download` is called at runtime for the gated `facebook/sam3` checkpoint.
   - _Options:_ ship the `.pt` checkpoint as a Tauri resource and cache it in `app_data_dir`; provide a download manager UI and support `SAM3_CHECKPOINT`; handle gated HuggingFace access with a user token.

3. **Release CI `prebuild` will fail on a clean runner**
   - `scripts/verify-external-bins.mjs` requires `sam3_env` at the project root, which does not exist in GitHub Actions.
   - _Options:_ create the env in CI, or make the SAM3-env check non-fatal in CI and create it at install/runtime.

4. **Code signing / notarization certificates not configured**
   - `tauri.conf.json` and `.github/workflows/release.yml` have placeholders only.
   - _Options:_ obtain Apple Developer ID + Windows code-signing certs and wire them as GitHub secrets; generate the Tauri updater Ed25519 keypair.

### High

5. **`ort` release candidate / unused dependency** — remove or pin to a stable release; add `cargo deny` to CI.
6. **WebGL mask texture cache unbounded** — implement LRU eviction with a size limit.
7. **Inline styles / hardcoded colors** — convert to Tailwind/utilities and add a lint rule.
8. **Accessibility gaps** — add ARIA labels/roles and visible focus rings to toolbar, command palette, and dock controls.
9. **No structured logging / crash reporting** — replace `println!`/`console.log` with `tracing` and a frontend logger; optionally add Sentry behind an opt-in.
10. **E2E only exercises mocked backend** — add a Playwright project against a built Tauri binary for export and SAM3 flows.

### Medium

11. **Bundle size** — lazy-load heavy panels (EffectBrowser, Mask, Export, Timeline) and tune `manualChunks`.
12. **Feature stubs** — Spout, optical flow, and native segmentation are TODOs; either implement or gate/remove.
13. **Repo hygiene** — `mcp-servers/mosh-verify/node_modules` is not excluded by `.gitignore`.
14. **Versioning** — version is still `0.1.0` across `tauri.conf.json`, `Cargo.toml`, and `package.json`; add a bump workflow.
15. **Documentation** — README lacks first-time SAM3/Python setup and model-weight instructions.

### Low

16. **Module preload strategy** — evaluate `build.modulePreload` once lazy routes are in place.
17. **Supply-chain audits** — add `cargo deny` / `cargo vet` to CI.
18. **Onboarding UX** — extend the onboarding modal to guide users through Python/SAM3 setup.

The updated HTML preview at `C:/Users/richk/AppData/Local/Temp/moshdither-architecture-review.html` contains the same list with recommended fixes and next-step ordering.
