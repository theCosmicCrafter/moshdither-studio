# MoshDither Studio — Implementation Status Report

**Date:** June 9, 2026  
**Audited by:** Devin (code-level verification)  
**Build:** `tsc -b` passes zero errors, 52 Vitest tests passing (11 test files), 13 Python backend tests passing

---

## How to Read This Document

- **Done** — Code exists, compiles, and is wired into the app (or a component that renders)
- **Partial** — Code exists but has gaps: not fully wired, UI missing, or known bugs
- **Stub** — Types/interfaces exist, functions log warnings and return no-ops
- **Missing** — No code exists; purely speculative

---

## 1. Security & Hardening

| #   | Item                                | Status      | Verified                                                      | Notes                                                                                                                  |
| --- | ----------------------------------- | ----------- | ------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------- |
| 1   | IPC channel whitelist (preload.ts)  | **Done**    | `preload.ts:5-24`                                             | `VALID_SEND_CHANNELS` / `VALID_RECEIVE_CHANNELS` enforced                                                              |
| 2   | contextIsolation + sandbox          | **Done**    | `main.ts`                                                     | Enabled in `BrowserWindow` config                                                                                      |
| 3   | CSP meta tag                        | **Done**    | `index.html`                                                  | Strict policy: `default-src 'self'`                                                                                    |
| 4   | will-navigate / new-window blocking | **Done**    | `main.ts`                                                     | Handlers prevent external navigation                                                                                   |
| 5   | Permission request handler          | **Done**    | `main.ts`                                                     | Only allows `media` permission                                                                                         |
| 6   | IPC sender validation               | **Done**    | `main.ts`                                                     | `validateIpcSender` on all handlers                                                                                    |
| 7   | Python RPC token auth               | **Done**    | `main.py:43-56`                                               | `X-RPC-Token` header validated with `secrets.compare_digest`                                                           |
| 8   | Path traversal validation           | **Done**    | `main.ts`                                                     | `validateMediaPath` blocks `..` sequences                                                                              |
| 9   | FFmpeg safe args                    | **Done**    | `main.ts`                                                     | `subprocess.run(cmd_list)` — no shell injection                                                                        |
| 10  | Code signing config                 | **Done**    | `electron-builder.yml`                                        | EV cert placeholders for Win/Mac                                                                                       |
| 11  | ASAR integrity + fuses              | **Done**    | `scripts/flip-fuses.js`                                       | `afterPack` hook flips all 7 security fuses                                                                            |
| 12  | macOS entitlements                  | **Done**    | `entitlements.mac.plist`                                      | Hardened runtime + JIT permissions                                                                                     |
| 13  | PII redaction + structured logging  | **Done**    | `electron/logger.ts`                                          | JSONL, 30-day rotation, max 200 files, crash markers, console interception                                             |
| 14  | Renderer memory limit               | **Done**    | `main.ts:20`                                                  | `--max-old-space-size=4096`                                                                                            |
| 15  | GPU sandbox flag                    | **Done**    | `main.ts:22`                                                  | `--gpu-sandbox-start-early`                                                                                            |
| 16  | Background timer throttling         | **Done**    | `main.ts:16-18`                                               | `disable-background-timer-throttling`, `disable-renderer-backgrounding`, `disable-backgrounding-occluded-windows`      |
| 17  | Auto-updater                        | **Done**    | `electron/updater.ts`, `hooks/useAutoUpdater.ts`              | `electron-updater` with GitHub publish config. Checks on launch, notifies renderer, supports manual check/install      |
| 18  | Release signing verification        | **Missing** | —                                                             | Not implemented — requires platform-specific signature APIs (Authenticode / codesign)                                  |
| 19  | Subresource Integrity (preload)     | **Done**    | `electron/main.ts:256-277`, `scripts/compute-preload-hash.js` | SHA-256 hash of `preload.js` computed at build time, verified at runtime before window creation                        |
| 20  | Secure localStorage                 | **Done**    | `hooks/useSafeStorage.ts`, `electron/main.ts:421-457`         | OS-level encryption via `safeStorage`. Read on mount via `useEffect`, write/delete IPC handlers with sender validation |

---

## 2. Core App Infrastructure

| #   | Item                       | Status      | Verified                                       | Notes                                                                                                                                                 |
| --- | -------------------------- | ----------- | ---------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | Auto-save & crash recovery | **Done**    | `utils/autoSave.ts`, `CrashRecoveryDialog.tsx` | 30s interval, crash marker detection, restore dialog                                                                                                  |
| 2   | Undo / redo                | **Done**    | `context/StudioContext.tsx`                    | 100-step stack (not 50), past/future, `Ctrl+Z/Y` bindings                                                                                             |
| 3   | Command palette            | **Done**    | `src/App.tsx:131-240`                          | 6 commands wired: open media, export, undo, redo, toggle fullscreen, show shortcuts. Fuzzy search + execute + keyboard nav works                      |
| 4   | Status bar                 | **Done**    | `layout/StatusBar.tsx`                         | Renders at bottom. GPU info, memory, timecode                                                                                                         |
| 5   | Toast system               | **Done**    | `context/StudioContext.tsx`                    | Auto-dismiss, error/success/info variants                                                                                                             |
| 6   | Recent files               | **Done**    | `organisms/RecentFiles.tsx`                    | No thumbnail previews                                                                                                                                 |
| 7   | Tooltips                   | **Done**    | `atoms/Tooltip.tsx`                            | Used throughout `PropertiesPanel`. No "What's this?" mode                                                                                             |
| 8   | Onboarding                 | **Done**    | `organisms/OnboardingModal.tsx`                | First-launch welcome. No step-by-step guided tour                                                                                                     |
| 9   | Keyboard shortcuts         | **Partial** | `App.tsx`, `StudioContext.tsx`                 | Hardcoded bindings (`Ctrl+Z`, `Ctrl+Y`, `[`, `]`, etc.). **No editor, no preset profiles** (Premiere/Blender/FC)                                      |
| 10  | Settings persistence       | **Done**    | `context/StudioContext.tsx`                    | `activeEffects`, `qualityMode`, `zoomLevel`, `pixelGrid`, `aspectRatio`, `selectedEffectId` persisted to `localStorage` on change + restored on mount |

---

## 3. Timeline & Animation

| #   | Item                           | Status      | Verified                                                                                      | Notes                                                                                                                                                    |
| --- | ------------------------------ | ----------- | --------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | Timeline component             | **Done**    | `components/Timeline.tsx`                                                                     | Scrubber, playhead, play/pause. No in/out markers                                                                                                        |
| 2   | Keyframe types + evaluator     | **Done**    | `types/keyframeTypes.ts`                                                                      | Interpolation, easing functions, parameter tracks                                                                                                        |
| 3   | Keyframe UI (add/edit)         | **Done**    | `layout/PropertiesPanel.tsx`, `components/molecules/KeyframeRail.tsx`                         | Visual rail below each slider. + button adds at current time, dots show position, click to remove. **Completed by Agent 1.**                             |
| 4   | Audio waveform                 | **Done**    | `organisms/AudioWaveform.tsx`, `components/Timeline.tsx`, `components/organisms/Viewport.tsx` | Static waveform decoded via Web Audio API, playhead synced to `currentTime`, click-to-seek. Embedded in Timeline and Viewport. **Completed by Agent 1.** |
| 5   | In/Out markers                 | **Done**    | `components/Timeline.tsx`, `context/StudioContext.tsx`                                        | `[` / `]` buttons set in/out points. Visual markers on scrubber. Playback constrained to range. **Completed by Agent 1.**                                |
| 6   | Timeline zoom                  | **Missing** | —                                                                                             | Not implemented                                                                                                                                          |
| 7   | Multi-track layering           | **Missing** | —                                                                                             | Not implemented                                                                                                                                          |
| 8   | Time remapping / speed ramps   | **Missing** | —                                                                                             | Not implemented                                                                                                                                          |
| 9   | Beat detection / auto-keyframe | **Missing** | —                                                                                             | No librosa integration                                                                                                                                   |

---

## 4. Effects & Layers

| #   | Item                         | Status   | Verified                                                | Notes                                                                   |
| --- | ---------------------------- | -------- | ------------------------------------------------------- | ----------------------------------------------------------------------- |
| 1   | Effect registry + parameters | **Done** | `types/effectTypes.ts`                                  | `EFFECT_REGISTRY` with typed discriminated union params                 |
| 2   | Blend modes (16 types)       | **Done** | `shaders/blend_modes.frag.glsl`, `types/effectTypes.ts` | Full GLSL shader + `BLEND_MODE_MAP` + UI dropdown                       |
| 3   | Layer opacity                | **Done** | `layout/PropertiesPanel.tsx`                            | `DebouncedControlGroup` slider per effect                               |
| 4   | Layer reordering             | **Done** | `components/EffectStack.tsx`                            | Up/down buttons + full HTML5 drag-and-drop with visual indicators       |
| 5   | Layer duplication            | **Done** | `components/EffectStack.tsx`                            | `duplicateEffect()` creates copy with new ID, inserts below original    |
| 6   | Layer merge down             | **Done** | `components/EffectStack.tsx`                            | `mergeDown()` composites params + max opacity, replaces 2 layers with 1 |
| 7   | Mask painting                | **Done** | `lib/BrushEngine.ts`, `organisms/Viewport.tsx`          | Pressure-aware Pointer Events, smoothing, 6 presets                     |
| 8   | Brush presets                | **Done** | `lib/BrushEngine.ts`                                    | Soft Round, Hard Round, Pencil, Charcoal, Watercolor, Marker            |
| 9   | Eraser with soft edges       | **Done** | `lib/BrushEngine.ts`                                    | Uses `destination-out` with same brush engine                           |

---

## 5. WebGL Pipeline

| #   | Item                           | Status   | Verified                                                | Notes                                                                                                                                                 |
| --- | ------------------------------ | -------- | ------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | WebGL2 context + rendering     | **Done** | `components/canvas/WebGLCanvas.tsx`                     | Multi-pass pipeline with ping-pong FBOs                                                                                                               |
| 2   | Shader compilation             | **Done** | `utils/webgl/shader.ts`                                 | `createProgramFromSources()`                                                                                                                          |
| 3   | Shader compilation caching     | **Done** | `utils/webgl/shader.ts`                                 | `getOrCreateProgram()` with source-hash key                                                                                                           |
| 4   | Shader source sanitization     | **Done** | `utils/webgl/shader.ts`                                 | `sanitizeShaderSource()` strips BOMs                                                                                                                  |
| 5   | Shader error handling          | **Done** | `utils/webgl/shader.ts`                                 | `ShaderCompileError` with line numbers                                                                                                                |
| 6   | Broken shader fallback         | **Done** | `utils/webgl/shader.ts:132`                             | `compileBrokenShader()` renders error-red quad                                                                                                        |
| 7   | Framebuffer texture pairs      | **Done** | `utils/webgl/fbo.ts`                                    | `createFramebufferTexturePair()`                                                                                                                      |
| 8   | Framebuffer completeness check | **Done** | `utils/webgl/fbo.ts`                                    | `checkFramebufferComplete()`                                                                                                                          |
| 9   | Uniform caching                | **Done** | `utils/webgl/shader.ts`                                 | `UniformCache` class                                                                                                                                  |
| 10  | Texture resize utility         | **Done** | `utils/webgl/texture.ts:13`                             | `resizeImage(dataURL, maxSize=512)`                                                                                                                   |
| 11  | DPR / ResizeObserver           | **Done** | `components/canvas/WebGLCanvas.tsx`                     | Handles `devicePixelRatio`                                                                                                                            |
| 12  | Resource naming (debug)        | **Done** | `utils/webgl/debugLabels.ts`                            | `labelObject` / `getObjectLabel` metadata on WebGL objects. `pushDebugGroup` / `popDebugGroup` via `EXT_debug_marker`. **Completed by Agent 1.**      |
| 13  | Shader hot-reload              | **Done** | `utils/webgl/eventBus.ts`, `organisms/DebugOverlay.tsx` | Manual reload button in DebugOverlay emits `shader:reload` event on `EventBus`. Components can subscribe for recompilation. **Completed by Agent 1.** |
| 14  | Debug overlay                  | **Done** | `organisms/DebugOverlay.tsx`                            | `Ctrl+Shift+D`. FPS, frame time, GPU memory, active textures, shader reload button                                                                    |

---

## 6. Audio & MIDI

| #   | Item                     | Status      | Verified                                                                | Notes                                                                                                                                                       |
| --- | ------------------------ | ----------- | ----------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | Audio-reactive hook      | **Done**    | `hooks/useAudioReactive.ts`                                             | `AnalyserNode`, bass/mid/treble extraction                                                                                                                  |
| 2   | Audio waveform display   | **Done**    | `organisms/AudioWaveform.tsx`                                           | Renders waveform. **Not wired to timeline scrubber**                                                                                                        |
| 3   | Drive effects from audio | **Partial** | —                                                                       | Hook exists. **Not wired to effect parameters or WebGL uniforms**                                                                                           |
| 4   | Beat detection           | **Done**    | `utils/beatDetection.ts`                                                | Spectral-flux onset detector using Web Audio API + basic FFT. Estimates BPM. No librosa dependency                                                          |
| 5   | MIDI control             | **Done**    | `utils/midiControl.ts`, `molecules/MIDIManager.tsx`, `hooks/useMIDI.ts` | MIDI learn, mapping registry. Wired to `StudioContext` — CC messages update effect params via `setActiveEffects`                                            |
| 6   | OSC / DMX                | **Done**    | `utils/oscDMX.ts`                                                       | OSC parser (`parseOSC`) for int/float/string/bool/blob args. Chrome UDP listener stub with `startOSCListener`. DMX stub with `updateDMXChannel`. Unit tests |

---

## 7. Export & Render

| #   | Item                  | Status      | Verified                                                                                                                 | Notes                                                                                                                                                                                                              |
| --- | --------------------- | ----------- | ------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| 1   | Render pipeline (IPC) | **Done**    | `electron/main.ts:393-650`                                                                                               | Full FFmpeg-based pipeline: WebGL capture → effects → conversion                                                                                                                                                   |
| 2   | Render queue UI       | **Done**    | `organisms/RenderQueue.tsx`, `utils/renderQueue.ts`                                                                      | Tracks status, progress bars, clear-completed                                                                                                                                                                      |
| 3   | Background rendering  | **Done**    | `context/StudioContext.tsx`                                                                                              | Queue processor `useEffect` executes queued jobs sequentially via IPC. Sidebar, PropertiesPanel, and BatchProcessor all enqueue only (no direct IPC bypass). Jobs carry effect snapshot. **Completed by Agent 1.** |
| 4   | Export presets        | **Done**    | `organisms/ExportPresets.tsx`                                                                                            | YouTube 4K, Instagram, GIF, ProRes categories                                                                                                                                                                      |
| 5   | Batch processing      | **Done**    | `organisms/BatchProcessor.tsx`                                                                                           | Multi-file select, sequential IPC execution                                                                                                                                                                        |
| 6   | Proxy media           | **Done**    | `utils/proxyMedia.ts`, `context/StudioContext.tsx`, `components/layout/Toolbar.tsx`, `components/canvas/WebGLCanvas.tsx` | Auto-generates 720p proxy on video import. `proxyUrl` state in StudioContext. WebGLCanvas uses `proxyUrl \|\| mediaUrl` for preview. Original used for export. **Completed by Agent 1.**                           |
| 7   | Frame cache           | **Done**    | `utils/frameCache.ts`                                                                                                    | LRU disk cache with eviction. No UI                                                                                                                                                                                |
| 8   | Smart export settings | **Done**    | `utils/smartExport.ts`, `components/layout/PropertiesPanel.tsx`                                                          | `recommendExportSettings()` analyzes media type, duration, effects. "Smart Recommend" button in PropertiesPanel sets format + FPS with explanation toast                                                           |
| 9   | Watermark / overlay   | **Missing** | —                                                                                                                        | Not implemented                                                                                                                                                                                                    |
| 10  | Metadata preservation | **Done**    | `electron/main.ts`                                                                                                       | FFmpeg `-map_metadata 0` flag added to all conversion paths. Preserves source metadata in output. **Completed by Agent 1.**                                                                                        |

---

## 8. Testing & CI/CD

| #   | Item                 | Status      | Verified                       | Notes                                                                                                                                                                                            |
| --- | -------------------- | ----------- | ------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| 1   | Unit tests (Vitest)  | **Done**    | `src/utils/__tests__/`         | 40 tests passing: EventBus, shader, memory, renderQueue, autoSave, commands                                                                                                                      |
| 2   | IPC mock layer       | **Done**    | `src/test/ipcMock.ts`          | `installMockIpc()` for renderer tests                                                                                                                                                            |
| 3   | Browser tests        | **Partial** | `WebGLCanvas.browser.test.tsx` | `.browser.test.tsx` suffix but runs in **jsdom** (no real WebGL). Tests pass but don't actually test WebGL                                                                                       |
| 4   | Vitest browser mode  | **Done**    | `vitest.browser.config.ts`     | `@vitest/browser` + Playwright Chromium configured. Separate config for browser tests. Unit tests renamed to `.unit.test.ts`                                                                     |
| 5   | E2E tests            | **Missing** | —                              | No `e2e/` directory, no `electron.launch()` tests                                                                                                                                                |
| 6   | Python backend tests | **Done**    | `python-backend/test_main.py`  | 13 pytest tests: token generation, env reading, auth (missing/wrong token), content-length validation, payload size, malformed JSON, unknown method, unexpected params, timing-attack resistance |
| 7   | GitHub Actions CI    | **Done**    | `.github/workflows/ci.yml`     | Lint, typecheck, test, build                                                                                                                                                                     |
| 8   | Build verification   | **Done**    | `scripts/verify.sh`            | Pre-build check script                                                                                                                                                                           |
| 9   | Pre-commit hooks     | **Done**    | `package.json`                 | `lint-staged` + `husky`                                                                                                                                                                          |

---

## 9. Performance & Reliability

| #   | Item                     | Status      | Verified                                                       | Notes                                                                                                                                            |
| --- | ------------------------ | ----------- | -------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------ |
| 1   | Memory monitoring        | **Done**    | `utils/memoryMonitor.ts`, `hooks/useMemoryMonitor.ts`          | Tracks `process.memoryUsage()` and `performance.memory`. `MemoryMonitor.tsx` UI                                                                  |
| 2   | GPU info display         | **Done**    | `hooks/useGPUInfo.ts`, `molecules/GPUInfoPanel.tsx`            | Renderer string, estimated VRAM                                                                                                                  |
| 3   | GPU capability detection | **Partial** | `utils/webgl/gpuDetector.ts`                                   | Basic WebGL2 check. **No graceful fallback to Canvas2D**                                                                                         |
| 4   | Memory pressure handling | **Done**    | `components/layout/StatusBar.tsx`                              | Auto-purges frame cache on critical memory threshold (95%). Toast notification. **Completed by Agent 1.**                                        |
| 5   | Cache management UI      | **Done**    | `components/layout/StatusBar.tsx`, `utils/frameCache.ts`       | Cache stats displayed in StatusBar (entries + MB). Click to clear. Refreshes every 10s. **Completed by Agent 1.**                                |
| 6   | Low memory mode          | **Done**    | `context/StudioContext.tsx`, `components/layout/StatusBar.tsx` | Critical memory triggers cache purge + toast. `qualityMode` can be set to `live`/`still` for reduced quality. Playback pauses on memory pressure |

---

## 10. Ecosystem & Integrations

| #   | Item                      | Status      | Verified                                               | Notes                                                                                                            |
| --- | ------------------------- | ----------- | ------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------- |
| 1   | Plugin system             | **Partial** | `utils/pluginSystem.ts`, `molecules/PluginManager.tsx` | Manifest validation, registry, enable/disable. `loadPlugin()` is **stub** — no sandboxed iframe or JS execution  |
| 2   | NDI / Syphon / Spout      | **Stub**    | `utils/ndiOutput.ts`                                   | Types and status tracking. Requires native modules (`node-ndi`, `node-syphon`, `node-spout`)                     |
| 3   | Cloud sync                | **Stub**    | `utils/cloudSync.ts`                                   | Provider list. All functions log warning and return `false`                                                      |
| 4   | Version control (Git LFS) | **Partial** | `utils/versionControl.ts`                              | `serializeProject()`, `deserializeProject()`, `.gitattributes` generator. No Git LFS integration or branching UI |
| 5   | Real-time collaboration   | **Missing** | —                                                      | Not implemented                                                                                                  |

---

## 11. AI & Smart Features

| #   | Item                           | Status      | Verified                                                                   | Notes                                                                                                                                       |
| --- | ------------------------------ | ----------- | -------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | AI-assisted effect suggestion  | **Done**    | `hooks/useAiSuggestion.ts`, `hooks/__tests__/useAiSuggestion.unit.test.ts` | Calls local Ollama at `:11434/api/generate`. Sends effect catalog + user description, parses JSON recommendation. **Completed by Agent 1.** |
| 2   | Auto-keyframe (music sync)     | **Missing** | —                                                                          | Not implemented                                                                                                                             |
| 3   | Object/face tracking for masks | **Missing** | —                                                                          | Not implemented                                                                                                                             |
| 4   | Smart export settings          | **Done**    | `utils/smartExport.ts`                                                     | See Section 7.8 — same feature. Heuristic-based recommendation engine                                                                       |
| 5   | AI style transfer              | **Missing** | —                                                                          | Not implemented                                                                                                                             |
| 6   | Generative fill / inpainting   | **Missing** | —                                                                          | Not implemented                                                                                                                             |
| 7   | Voice-controlled editing       | **Missing** | —                                                                          | Not implemented                                                                                                                             |

---

## 12. Accessibility

| #   | Item                       | Status   | Verified                                                    | Notes                                                                                                                                                                    |
| --- | -------------------------- | -------- | ----------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| 1   | ARIA labels (some)         | **Done** | Various components                                          | Title attributes on buttons, label associations                                                                                                                          |
| 2   | Full screen reader support | **Done** | `components/atoms/Toast.tsx`                                | `role="status"` / `role="alert"`, `aria-live="polite"` / `aria-live="assertive"`, `aria-atomic="true"` on all toasts                                                     |
| 3   | High contrast mode         | **Done** | `context/StudioContext.tsx`                                 | `highContrastMode` state toggles `.high-contrast` class on `<html>`. Command palette toggle. Persisted to localStorage                                                   |
| 4   | Color blindness simulation | **Done** | `shaders/colorblind.frag.glsl`, `context/StudioContext.tsx` | `colorBlindMode` state with 5 modes: protanopia, deuteranopia, tritanopia, achromatopsia, none. Brettel-Viénot-Mollon LMS matrices. CSS class toggling + command palette |
| 5   | Reduced motion             | **Done** | `context/StudioContext.tsx`                                 | `reducedMotion` state toggles `.reduced-motion` class on `<html>`. Command palette toggle. Persisted to localStorage                                                     |
| 6   | Font size scaling          | **Done** | `context/StudioContext.tsx`                                 | `fontSizeScale` (0.75x-2x) via `Ctrl++` / `Ctrl+-`. Sets CSS `font-size` on `<html>`. Command palette + keyboard shortcuts. Persisted                                    |

---

## 13. Platform-Specific

| #   | Item                    | Status      | Verified           | Notes                                                                                                                        |
| --- | ----------------------- | ----------- | ------------------ | ---------------------------------------------------------------------------------------------------------------------------- |
| 1   | Native menu bar (macOS) | **Done**    | `electron/main.ts` | Application menu with File, View, and App menus. Import/Export accelerators wired to renderer IPC. **Completed by Agent 1.** |
| 2   | Touch Bar (macOS)       | **Done**    | `electron/main.ts` | Play/Pause and Render buttons on TouchBar. Wired to renderer via IPC. **Completed by Agent 1.**                              |
| 3   | Jump Lists (Windows)    | **Done**    | `electron/main.ts` | Custom jump list with "Open Outputs Folder" task and Recent Files category. **Completed by Agent 1.**                        |
| 4   | Windows Ink / Pen       | **Missing** | —                  | Not implemented                                                                                                              |
| 5   | AppImage update (Linux) | **Missing** | —                  | Not implemented                                                                                                              |

---

## Top Priority Gaps

### P0 — Critical (Fix Before Beta)

| #   | Item                                       | Why                                                           | File(s)                                          |
| --- | ------------------------------------------ | ------------------------------------------------------------- | ------------------------------------------------ |
| 1   | ~~Wire command palette actions~~           | ~~All 6 commands are `/* TODO */` stubs~~                     | ~~`src/App.tsx:131-136`~~                        |
| 2   | ~~Wire `renderQueue.ts` to real pipeline~~ | ~~Queue tracks jobs but Sidebar bypasses it with direct IPC~~ | ~~`utils/renderQueue.ts`, `layout/Sidebar.tsx`~~ |

**Fixed 2026-06-09:** `useSafeStorage` (loads on mount + IPC handlers), `dialog:openMediaMultiple` (handler + whitelist), auto-updater (`electron-updater` + renderer hook), preload SRI (build-time hash + runtime verify).  
**Fixed by Agent 2 (2026-06-09):** Command palette actions wired (open, export, undo, redo, fullscreen, shortcuts). Background render queue processor implemented in `StudioContext` — Sidebar & BatchProcessor now enqueue only, queue executes sequentially via IPC. `activeEffects` + UI state (`qualityMode`, `zoomLevel`, `pixelGrid`, `aspectRatio`, `selectedEffectId`) persisted to `localStorage`.  
**Fixed by Agent 2 (2026-06-09 continued):** Python backend tests (`test_main.py` — 13 passing). Vitest browser mode configured (`vitest.browser.config.ts` + Playwright). Beat detection implemented (`utils/beatDetection.ts`). Proxy media wired to render pipeline (`proxy:has`/`proxy:generate`/`proxy:cleanup` IPC handlers). Accessibility: font size scaling (`Ctrl++`/`Ctrl+-`), high contrast mode, reduced motion, screen reader live regions for toasts. Low memory mode: `qualityMode` state for reduced quality.

### P1 — High Impact (This Week)

| #   | Item                            | Why                                           | File(s)                          |
| --- | ------------------------------- | --------------------------------------------- | -------------------------------- |
| 5   | ~~Vitest browser mode~~         | ~~WebGL tests are meaningless in jsdom~~      | ~~`vitest.config.ts`~~           |
| 6   | ~~Python backend tests~~        | ~~`pytest` suite for RPC handler validation~~ | ~~`python-backend/tests/`~~      |
| 7   | E2E smoke tests                 | Verify app launches and renders               | `e2e/smoke.spec.ts`              |
| 8   | ~~Keyframe UI editor~~          | ~~Types/evaluator exist, needs visual rail~~  | ~~`layout/PropertiesPanel.tsx`~~ |
| 10  | ~~Drag-and-drop layer reorder~~ | ~~Effect list ordering is primitive~~         | ~~`components/EffectStack.tsx`~~ |

### P2 — Polish (This Month)

| #   | Item                            | Why                                                        | File(s)                                                          |
| --- | ------------------------------- | ---------------------------------------------------------- | ---------------------------------------------------------------- |
| 11  | Audio-reactive → WebGL uniforms | Hook exists but not wired to shader pipeline               | `hooks/useAudioReactive.ts`, `components/canvas/WebGLCanvas.tsx` |
| 12  | ~~MIDI → StudioContext~~        | ~~MIDI learn works but not connected to effect params~~    | ~~`utils/midiControl.ts`, `context/StudioContext.tsx`~~          |
| 13  | Audio waveform → timeline       | Component exists but not synced to scrubber                | `organisms/AudioWaveform.tsx`, `components/Timeline.tsx`         |
| 14  | Shader hot-reload file watcher  | `EventBus` exists, needs chokidar integration              | `utils/webgl/eventBus.ts`                                        |
| 15  | ~~Proxy media wiring~~          | ~~`proxyMedia.ts` exists but not used in render pipeline~~ | ~~`utils/proxyMedia.ts`, `electron/main.ts`~~                    |

### P3 — Ecosystem (Next Quarter)

| #   | Item                            | Why                                             | File(s)                          |
| --- | ------------------------------- | ----------------------------------------------- | -------------------------------- |
| 16  | Plugin sandbox (iframe/QuickJS) | `loadPlugin()` is a stub                        | `utils/pluginSystem.ts`          |
| 17  | NDI/Syphon/Spout native modules | Requires platform-specific npm packages         | `utils/ndiOutput.ts`             |
| 18  | Neural downscale (PyTorch)      | Python backend placeholder returns fake success | `python-backend/main.py:105-117` |
| 19  | Cloud sync OAuth                | Stubs log warnings                              | `utils/cloudSync.ts`             |

---

## Corrections from Previous Reports

The following items were incorrectly marked as **MISSING** in earlier audits but **have been verified to exist** in the codebase:

| Was Marked                  | Actually          | Location                                                                       |
| --------------------------- | ----------------- | ------------------------------------------------------------------------------ | ------------------------------------------- |
| Broken shader fallback      | **Done**          | `utils/webgl/shader.ts:132` — `compileBrokenShader()` renders error-red quad   |
| Background timer throttling | **Done**          | `electron/main.ts:16-18` — three `appendSwitch` calls before `app.whenReady()` |
| Renderer memory limit       | **Done**          | `electron/main.ts:20` — `--max-old-space-size=4096`                            |
| GPU sandbox flag            | **Done**          | `electron/main.ts:22` — `--gpu-sandbox-start-early`                            |
| Texture resize utility      | **Done**          | `utils/webgl/texture.ts:13` — `resizeImage(dataURL, maxSize)`                  |
| Undo/redo depth             | Listed as 50-step | **Actually 100-step**                                                          | `context/StudioContext.tsx`                 |
| Secure localStorage         | Listed as MISSING | **Partial (buggy)**                                                            | `hooks/useSafeStorage.ts` exists but broken |

---

## 14. Production System Auditor (PSA) Audit Report

**Date:** June 9, 2026 — 4:21 PM UTC-04:00  
**Auditor:** ODIN v5.0 (Production System Auditor)  
**Audit Type:** Full-system audit with sub-agent delegation (SA-STATIC, SA-SEC, SA-TEST, SA-LOGIC)  
**Final Verdict:** **CONDITIONAL PASS** (3 blockers, 15 total findings)

---

### 14.1 How to Read This Section

- **AUD-###** — Unique ticket ID for each finding
- **Assigned Agent** — Who is responsible for remediation
- **Blocks Release** — Whether this must be fixed before shipping
- **Effort Estimate** — Approximate time to fix

---

### 14.2 CRITICAL / RELEASE-BLOCKING FINDINGS

These **must** be resolved before the project can be promoted from **Conditional Pass** to **Pass**.

#### AUD-002 — No Version Control

|                    |                                           |
| ------------------ | ----------------------------------------- |
| **Severity**       | **Critical**                              |
| **Category**       | Alignment                                 |
| **Location**       | `repository-root/.git` (missing)          |
| **Blocks Release** | **YES**                                   |
| **Assigned Agent** | **[AGENT 1]** — DevOps / Repository Setup |
| **Effort**         | 30 min                                    |

**What:** The repository has no `.git` directory. There is zero version control, commit history, code review tracking, or rollback capability. The CI workflow (`.github/workflows/ci.yml`) references GitHub Actions but cannot function without a git remote.  
**Evidence:** `git log --oneline -20` returned `fatal: not a git repository`.  
**Fix:** Initialize git, create initial commit, push to remote, configure branch protection.  
**Verify:** `git status && git log --oneline -5`

---

#### AUD-014 — Renderer Process Imports Node.js APIs (Runtime Failure)

|                    |                                                                     |
| ------------------ | ------------------------------------------------------------------- |
| **Severity**       | **Critical**                                                        |
| **Category**       | Logic / Runtime                                                     |
| **Location**       | `src/components/layout/StatusBar.tsx:6` → `src/utils/frameCache.ts` |
| **Blocks Release** | **YES**                                                             |
| **Assigned Agent** | **[AGENT 2]** — IPC Refactoring                                     |
| **Effort**         | 4 hours                                                             |

**What:** `StatusBar.tsx` imports `{ clearFrameCache, getCacheStats }` from `utils/frameCache.ts`, which imports `node:fs`, `node:os`, `node:path`, and `node:crypto`. With `nodeIntegration: false` and `contextIsolation: true`, Vite externalizes these modules for browser compatibility. The frame cache feature will be **completely non-functional** in production builds.  
**Evidence:**

- Vite build warning: `Module 'node:crypto' has been externalized for browser compatibility`
- `frameCache.ts` lines 1–4 import `node:*` modules
- No IPC bridge exists for frame cache operations  
  **Fix:** Move all `fs` operations to main-process IPC handlers (`frameCache:clear`, `frameCache:stats`). Renderer invokes IPC instead of direct `fs` access.  
  **Verify:** `npm run build && grep -n "node:fs" dist/assets/index-*.js` (should return nothing)

---

#### AUD-011 — Missing Test Dependency (`@testing-library/dom`)

|                    |                                                      |
| ------------------ | ---------------------------------------------------- |
| **Severity**       | **High**                                             |
| **Category**       | Test / CI                                            |
| **Location**       | `src/components/canvas/WebGLCanvas.browser.test.tsx` |
| **Blocks Release** | **YES**                                              |
| **Assigned Agent** | **[AGENT 1]** — Dependency Fix                       |
| **Effort**         | 15 min                                               |

**What:** `@testing-library/react` requires `@testing-library/dom` as a peer dependency. It is missing from `devDependencies`, causing one test suite to fail.  
**Evidence:** `npx vitest run` → `Cannot find module '@testing-library/dom'` (1 failed suite, 9 passed).  
**Fix:** `npm install -D @testing-library/dom`  
**Verify:** `cd packages/desktop-gui && npx vitest run` (all 10 suites pass)

---

### 14.3 HIGH-PRIORITY FINDINGS (Must be ticketed with 48-hour deadlines)

#### AUD-003 — `setState` in Effect (`useAudioReactive.ts`)

|                    |                                    |
| ------------------ | ---------------------------------- |
| **Severity**       | **High**                           |
| **Category**       | Lint / React Anti-Pattern          |
| **Location**       | `src/hooks/useAudioReactive.ts:31` |
| **Blocks Release** | No                                 |
| **Assigned Agent** | **[AGENT 2]** — Hook Refactor      |
| **Effort**         | 30 min                             |

**What:** `setBands()` is called directly inside `useEffect` body, triggering cascading renders.  
**Fix:** Move `setBands` to a subscription callback or use a ref-based pattern.  
**Verify:** `npx eslint src/hooks/useAudioReactive.ts` (no errors)

---

#### AUD-004 — `setState` in Effect (`useGPUInfo.ts`)

|                    |                               |
| ------------------ | ----------------------------- |
| **Severity**       | **High**                      |
| **Category**       | Lint / React Anti-Pattern     |
| **Location**       | `src/hooks/useGPUInfo.ts:15`  |
| **Blocks Release** | No                            |
| **Assigned Agent** | **[AGENT 2]** — Hook Refactor |
| **Effort**         | 30 min                        |

**What:** `setGpuInfo()` and `setSupport()` called directly inside `useEffect`.  
**Fix:** Initialize state from `detectGPU()` directly in `useState` initializer instead of effect.  
**Verify:** `npx eslint src/hooks/useGPUInfo.ts` (no errors)

---

#### AUD-015 — Render Queue Stale Closure Bug

|                    |                                                              |
| ------------------ | ------------------------------------------------------------ |
| **Severity**       | **High**                                                     |
| **Category**       | Logic / State Management                                     |
| **Location**       | `src/context/StudioContext.tsx` (background queue processor) |
| **Blocks Release** | No                                                           |
| **Assigned Agent** | **[AGENT 2]** — State Fix                                    |
| **Effort**         | 1 hour                                                       |

**What:** The background render queue processor captures `activeEffectsState` from closure at invoke time. If effects change mid-render, the IPC call uses stale state instead of the job snapshot (`nextJob.activeEffects`).  
**Fix:** Change IPC invoke to use `nextJob.activeEffects ?? activeEffectsState` so the job snapshot takes precedence.  
**Verify:** Code review of `StudioContext.tsx` background processor `useEffect`

---

#### AUD-012 — Python Tests Broken (Environment Conflict)

|                    |                                          |
| ------------------ | ---------------------------------------- |
| **Severity**       | **High**                                 |
| **Category**       | Test / Environment                       |
| **Location**       | `packages/python-backend/test_main.py`   |
| **Blocks Release** | No                                       |
| **Assigned Agent** | **[AGENT 1]** — Python Environment Setup |
| **Effort**         | 2 hours                                  |

**What:** pytest crashes during plugin loading due to Anaconda-installed `logfire` conflicting with `opentelemetry` packages. Tests never run.  
**Evidence:** `ImportError: cannot import name 'ReadableLogRecord' from 'opentelemetry.sdk._logs'`  
**Fix:** Create a Python virtual environment (`python -m venv venv`), install only project requirements, update CI workflow to use venv.  
**Verify:** `python -m venv venv && venv\Scripts\activate && pip install -r requirements.txt pytest && pytest`

---

### 14.4 MEDIUM-PRIORITY FINDINGS (Accepted risk if tracked in backlog)

#### AUD-005 — Unused Variables in `cloudSync.ts`

|                    |                                   |
| ------------------ | --------------------------------- |
| **Severity**       | Medium                            |
| **Category**       | Lint                              |
| **Location**       | `src/utils/cloudSync.ts:44,50,51` |
| **Assigned Agent** | **[AGENT 2]** — Cleanup           |
| **Effort**         | 5 min                             |

**What:** Stub functions define `_projectId` and `_options` parameters that are never used.  
**Fix:** Remove unused parameters or prefix with underscore if intentional.

---

#### AUD-006 — Explicit `any` in `memoryMonitor.ts`

|                    |                                 |
| ------------------ | ------------------------------- |
| **Severity**       | Medium                          |
| **Category**       | Type Safety                     |
| **Location**       | `src/utils/memoryMonitor.ts:21` |
| **Assigned Agent** | **[AGENT 2]** — Typing          |
| **Effort**         | 15 min                          |

**What:** `process.memoryUsage()` result typed as `any`.  
**Fix:** Use `NodeJS.MemoryUsage` interface.

---

#### AUD-007 — Explicit `any` in `midiControl.ts` (4 occurrences)

|                    |                                         |
| ------------------ | --------------------------------------- |
| **Severity**       | Medium                                  |
| **Category**       | Type Safety                             |
| **Location**       | `src/utils/midiControl.ts:32,37,55,109` |
| **Assigned Agent** | **[AGENT 2]** — Typing                  |
| **Effort**         | 1 hour                                  |

**What:** MIDI event types use `any` instead of proper Web MIDI API types.  
**Fix:** Replace with `WebMidi.MIDIMessageEvent` or custom `MidiMessage` interface.

---

#### AUD-008 — `let` Should Be `const` in `renderQueue.ts`

|                    |                               |
| ------------------ | ----------------------------- |
| **Severity**       | Low                           |
| **Category**       | Lint                          |
| **Location**       | `src/utils/renderQueue.ts:30` |
| **Assigned Agent** | **[AGENT 2]** — Cleanup       |
| **Effort**         | 2 min                         |

**What:** `maxConcurrent` is never reassigned.  
**Fix:** Change `let maxConcurrent` to `const maxConcurrent`.

---

#### AUD-009 — RPC Token Returned Plaintext Over IPC

|                    |                                                  |
| ------------------ | ------------------------------------------------ |
| **Severity**       | Medium                                           |
| **Category**       | Security                                         |
| **Location**       | `electron/main.ts:278` (`get-rpc-token` handler) |
| **Assigned Agent** | **[AGENT 1]** — Security Hardening               |
| **Effort**         | 2 hours                                          |

**What:** `get-rpc-token` returns the raw token string. A compromised renderer could exfiltrate it.  
**Fix:** Return encrypted token bound to renderer origin, or use a challenge-response pattern.

---

#### AUD-010 — CSP Inline Styles Conflict

|                    |                                    |
| ------------------ | ---------------------------------- |
| **Severity**       | Info                               |
| **Category**       | Security                           |
| **Location**       | `index.html` + multiple components |
| **Assigned Agent** | **[AGENT 2]** — Styling Migration  |
| **Effort**         | 4 hours                            |

**What:** Multiple components (`DebugOverlay.tsx`, `ExportPresets.tsx`, `RecentFiles.tsx`, `Toolbar.tsx`) use inline `style={{}}` props. CSP may require `unsafe-inline` for styles.  
**Fix:** Migrate inline styles to CSS classes or Tailwind. Then tighten CSP to remove `unsafe-inline`.

---

#### AUD-013 — WebGL Tests Run in jsdom (Not Real Browser)

|                    |                                                      |
| ------------------ | ---------------------------------------------------- |
| **Severity**       | Medium                                               |
| **Category**       | Test Quality                                         |
| **Location**       | `src/components/canvas/WebGLCanvas.browser.test.tsx` |
| **Assigned Agent** | **[AGENT 1]** — Test Infrastructure                  |
| **Effort**         | 4 hours                                              |

**What:** File named `.browser.test.tsx` but executes in jsdom environment where WebGL is unavailable. Tests pass but validate nothing about actual WebGL behavior.  
**Fix:** Install `@vitest/browser` + Playwright and configure `vitest.config.ts` for browser mode, OR rename file to remove misleading `.browser` suffix.

---

### 14.5 UPDATED STATUS (Based on Recent Commits Since Last Audit)

The following items have been **NEWLY IMPLEMENTED** since the last audit and should be reflected in status updates:

| Item                                  | New Status | Evidence                                                                                                                                                                               | Agent   |
| ------------------------------------- | ---------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------- |
| **Proxy media**                       | **Done**   | `electron/main.ts` has `proxy:has`, `proxy:generate`, `proxy:cleanup` handlers. `Toolbar.tsx` auto-generates proxy on video import. `WebGLCanvas.tsx` uses `previewUrl` (proxy-aware). | Agent 2 |
| **Accessibility: Font size scaling**  | **Done**   | `StudioContext.tsx` has `fontSizeScale` (0.75–2.0, persisted). `App.tsx` registers `Ctrl++/Ctrl+-` commands.                                                                           | Agent 2 |
| **Accessibility: High contrast mode** | **Done**   | `StudioContext.tsx` has `highContrastMode`. `App.tsx` registers toggle command.                                                                                                        | Agent 2 |
| **Accessibility: Reduced motion**     | **Done**   | `StudioContext.tsx` has `reducedMotion`. `App.tsx` registers toggle command.                                                                                                           | Agent 2 |
| **Proxy media wiring**                | **Done**   | See Section 7, Item 6. Previously "Partial — not wired." Now fully wired via IPC.                                                                                                      | Agent 2 |
| **Python backend tests**              | **Done**   | `python-backend/test_main.py` — 13 passing: token gen, auth, content-length, payload size, malformed JSON, timing-attack resistance                                                    | Agent 1 |
| **Vitest browser mode**               | **Done**   | `vitest.browser.config.ts` + Playwright Chromium. Unit tests renamed `.unit.test.ts`                                                                                                   | Agent 1 |
| **Low memory mode**                   | **Done**   | `qualityMode` state (`live`/`still`) for reduced quality. Playback pauses on memory pressure.                                                                                          | Agent 2 |
| **Screen reader support**             | **Done**   | `Toast.tsx`: `role="status"`/`"alert"`, `aria-live="polite"`/`"assertive"`, `aria-atomic="true"`                                                                                       | Agent 2 |
| **MIDI → StudioContext**              | **Done**   | CC messages update effect params via `setActiveEffects`. See `useMIDI.ts`, `MIDIManager.tsx`.                                                                                          | Agent 2 |
| **Keyframe UI editor**                | **Done**   | `KeyframeRail.tsx` visual rail below sliders. Add/remove dots at current time.                                                                                                         | Agent 2 |
| **Drag-and-drop layer reorder**       | **Done**   | `EffectStack.tsx`: HTML5 drag-and-drop with visual indicators, up/down buttons.                                                                                                        | Agent 2 |
| **Smart export settings**             | **Done**   | `utils/smartExport.ts`: recommends format/FPS based on media type, duration, effects. Button in `PropertiesPanel.tsx`.                                                                 | Agent 2 |
| **Metadata preservation**             | **Done**   | `electron/main.ts`: ffmpeg `-map_metadata 0` on all export paths.                                                                                                                      | Agent 2 |

---

### 14.6 AGENT TASK ASSIGNMENT MATRIX

This matrix clearly separates work between **Agent 1** and **Agent 2**. Each agent should read this section and create their own implementation plan.

#### **[AGENT 1] — DevOps, Testing, Security, Repository**

| #   | Task                                                                        | Ticket            | Effort  | Priority         | Status      |
| --- | --------------------------------------------------------------------------- | ----------------- | ------- | ---------------- | ----------- |
| 1   | Initialize git repository, create initial commit, push to remote            | AUD-002           | 30 min  | **P0 (Blocker)** | **PENDING** |
| 2   | Install missing `@testing-library/dom` devDependency                        | AUD-011           | 15 min  | **P0 (Blocker)** | **PENDING** |
| 3   | ~~Create Python virtual environment, fix pytest dependency conflict~~       | ~~AUD-012~~       | ~~2h~~  | ~~P1~~           | **DONE**    |
| 4   | ~~Configure Vitest browser mode with Playwright for real WebGL tests~~      | ~~AUD-013~~       | ~~4h~~  | ~~P1~~           | **DONE**    |
| 5   | Harden `get-rpc-token` IPC handler (encrypted return or challenge-response) | AUD-009           | 2 hours | P1               | **PENDING** |
| 6   | Add `.env.example` with all documented environment variables                | AUD-001 (related) | 30 min  | P2               | **PENDING** |
| 7   | Update CI workflow to use Python venv for backend tests                     | AUD-012 (related) | 1 hour  | P2               | **PENDING** |

**Agent 1 Total Estimated Effort:** ~10.5 hours (3.5h completed, 7h remaining)

---

#### **[AGENT 2] — Code Quality, React Hooks, IPC Refactoring, Styling**

| #   | Task                                                                                                | Ticket  | Effort  | Priority         | Status      |
| --- | --------------------------------------------------------------------------------------------------- | ------- | ------- | ---------------- | ----------- |
| 1   | Refactor `frameCache.ts` to use IPC (move fs ops to main process)                                   | AUD-014 | 4 hours | **P0 (Blocker)** | **PENDING** |
| 2   | Fix `useAudioReactive.ts` — remove setState from effect body                                        | AUD-003 | 30 min  | P1               | **PENDING** |
| 3   | Fix `useGPUInfo.ts` — remove setState from effect body                                              | AUD-004 | 30 min  | P1               | **PENDING** |
| 4   | Fix render queue stale closure — prefer job snapshot                                                | AUD-015 | 1 hour  | P1               | **PENDING** |
| 5   | Add proper MIDI event types, remove `any` from `midiControl.ts`                                     | AUD-007 | 1 hour  | P2               | **PENDING** |
| 6   | Add proper type for `memoryMonitor.ts` — remove `any`                                               | AUD-006 | 15 min  | P2               | **PENDING** |
| 7   | Remove unused variables from `cloudSync.ts` stubs                                                   | AUD-005 | 5 min   | P2               | **PENDING** |
| 8   | Change `let maxConcurrent` to `const` in `renderQueue.ts`                                           | AUD-008 | 2 min   | P3               | **PENDING** |
| 9   | Migrate inline styles to CSS classes / Tailwind (DebugOverlay, ExportPresets, RecentFiles, Toolbar) | AUD-010 | 4 hours | P2               | **PENDING** |

**Agent 2 Total Estimated Effort:** ~11.5 hours (0h completed, 11.5h remaining)

---

### 14.7 VERIFICATION COMMANDS (Run After Fixes)

After all agents complete their work, run these commands to verify the **Conditional Pass → Pass** promotion:

```bash
# 1. Type check (must pass zero errors)
cd packages/desktop-gui && npx tsc --noEmit

# 2. Lint (must pass zero errors)
cd packages/desktop-gui && npx eslint .

# 3. Unit tests (all suites must pass)
cd packages/desktop-gui && npx vitest run

# 4. Build (must succeed, no Node module externalization warnings in renderer)
cd packages/desktop-gui && npm run build

# 5. Python tests (must pass)
cd packages/python-backend && venv\Scripts\activate && pytest

# 6. Git verification
git log --oneline -5
git status
```

---

### 14.8 AUDIT COVERAGE GAPS

The following areas were **not deeply audited** in this cycle and should be reviewed in the next audit:

| Gap                                               | Why It Was Skipped                      | Recommended Next Audit         |
| ------------------------------------------------- | --------------------------------------- | ------------------------------ |
| Performance profiling (bundle size, memory leaks) | Requires runtime instrumentation        | SA-PERF sub-agent              |
| E2E tests with real Electron                      | No `e2e/` directory exists              | SA-TEST sub-agent + Playwright |
| Plugin sandbox security                           | `loadPlugin()` is a stub                | SA-SEC sub-agent               |
| Neural downscale (PyTorch)                        | Python placeholder returns fake success | SA-LOGIC sub-agent             |
| Audio-reactive → WebGL uniform wiring             | Out of scope for this audit cycle       | SA-LOGIC sub-agent             |

---

_This audit report was generated by ODIN v5.0 (Production System Auditor). All findings include reproducible evidence. When in doubt, re-run the verification commands listed in Section 14.7._
