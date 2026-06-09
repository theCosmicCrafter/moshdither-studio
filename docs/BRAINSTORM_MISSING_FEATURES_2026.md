# MoshDither Studio — Brainstorm: Everything We're Missing

> **IMPORTANT:** For the canonical, code-verified implementation status, see [`IMPLEMENTATION_STATUS.md`](./IMPLEMENTATION_STATUS.md). This document is the creative brainstorm; the status document is the ground truth.

**Date:** June 9, 2026 (Updated June 9, 2026 — CascadeProjects scan complete)  
**Prompt:** Be creative. Search online. Find features, security functions, and quality-of-life optimizations that professional creative software has and we don't.

**New:** Cross-project code inventory performed across `CascadeProjects/`. Items marked with `[FOUND: <project>]` have production-ready code available for copy/paste integration.

---

## 0. Codebase Audit Results — June 9, 2026

A full audit of the codebase (`packages/desktop-gui/`, `packages/mosh-engine/`, `packages/python-backend/`) reveals that **many items previously marked "MISSING" are actually implemented**. The sections below have been updated with accurate status. Items marked `Done` have been verified to exist in source and compile. Items marked `Broken` have code but do not function correctly.

### Implemented (Done)

| Category      | Items                                                                                                                                                                                                                                                                                                                                                                                               |
| ------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Security**  | IPC whitelist, contextIsolation, sandbox, CSP, will-navigate, permission handler, sender validation, Python RPC token auth, path traversal validation, FFmpeg list args, code signing config, ASAR fuses, macOS entitlements, renderer memory limit (`--max-old-space-size=4096`), GPU sandbox (`--gpu-sandbox-start-early`), PII redaction, structured JSONL logging, console interception to disk |
| **QoL**       | Auto-save (30s interval + crash recovery), undo/redo (100-step stack), gradient sliders, `useDebounce`, `useLocalStorage`, command palette, recent files, tooltips, status bar, split view, audio waveform, debug overlay, onboarding modal                                                                                                                                                         |
| **Rendering** | Full FFmpeg-based render pipeline (WebGL capture + effects + conversion), batch processor, render queue UI, export presets, palette builder, preset manager                                                                                                                                                                                                                                         |
| **Creative**  | 16 blend mode GLSL shader + UI, professional BrushEngine with pressure + smoothing, mask painting (brush/radial/linear), WebGL FBO utilities, shader compile/link with error recovery, EventBus, GPU detection, memory monitoring                                                                                                                                                                   |
| **Testing**   | 40 passing tests (Vitest), IPC mock layer, auto-save tests, command tests, render queue tests, WebGL browser tests                                                                                                                                                                                                                                                                                  |

### Broken / Partial

| Item                        | Problem                                                                                                                                          | Location                           |
| --------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------ | ---------------------------------- |
| `useSafeStorage` hook       | **Never loads value on mount.** Has a comment saying "load async in an effect below" but no `useEffect` exists. Always returns `null`.           | `src/hooks/useSafeStorage.ts`      |
| `safe-storage` IPC handlers | **Missing from main process.** Preload whitelists the channels, but `main.ts` has no handlers for `safe-storage:read/write/delete`.              | `electron/main.ts`                 |
| `dialog:openMediaMultiple`  | **Used in BatchProcessor but no handler in main.ts.** Will throw "No handler registered" at runtime.                                             | `electron/main.ts`                 |
| Command palette actions     | **All 6 commands are TODO stubs** (open, export, undo, redo, fullscreen, shortcuts). Palette UI renders but actions do nothing.                  | `src/App.tsx:131-136`              |
| Plugin system               | **Registry exists but `loadPlugin` is a stub.** No sandboxed iframe or JS execution. Just `console.log`.                                         | `src/utils/pluginSystem.ts:97-101` |
| `renderQueue.ts` module     | **Has `simulateRender` but is orphaned from real pipeline.** Sidebar bypasses it and uses direct IPC. Queue tracks jobs but never executes them. | `src/utils/renderQueue.ts:112-118` |
| Python backend              | **`neural_downscale` is a pure placeholder.** Returns success message without doing any processing. No PyTorch integration.                      | `python-backend/main.py:105-117`   |

### Genuinely Missing

| Item                                   | Why It Matters                            | Effort |
| -------------------------------------- | ----------------------------------------- | ------ |
| Auto-updater (`electron-updater`)      | Users on old versions = security risk     | Medium |
| Release signing verification on launch | Verify code signature before loading main | Medium |
| Subresource Integrity for preload      | Hash-verify preload.js at runtime         | Small  |
| Cloud sync (Dropbox/GDrive)            | Stubs exist, all functions return `false` | Large  |
| NDI/Syphon/Spout output                | Stubs exist, requires native modules      | Large  |
| Neural downscale (PyTorch)             | Placeholder only, needs model + inference | Large  |
| Plugin sandbox execution               | Needs iframe or QuickJS VM isolation      | Medium |
| E2E tests (Playwright Electron)        | No `e2e/` directory                       | Medium |
| Full keyboard shortcut editor          | Some shortcuts exist, no remapping UI     | Medium |
| Branching undo history                 | After Effects-style non-linear history    | Large  |

---

---

## 0. Code Inventory from CascadeProjects Scan

A scan of all projects in `C:\Users\richk\CascadeProjects` revealed production-ready code that can be directly integrated into MoshDither Studio with minor alterations.

| Source Project          | Reusable Asset                    | What It Solves                                                                       | File Path                                                                   |
| ----------------------- | --------------------------------- | ------------------------------------------------------------------------------------ | --------------------------------------------------------------------------- |
| `drawing-app`           | `useDebounce.ts`                  | Debounced slider inputs (don't recompile shaders every frame)                        | `src/renderer/src/hooks/useDebounce.ts`                                     |
| `drawing-app`           | `useLocalStorage.ts`              | Persist settings (last output dir, export format, presets) across restarts           | `src/renderer/src/hooks/useLocalStorage.ts`                                 |
| `drawing-app`           | `useLayerManager.ts`              | Full layer CRUD: reorder, duplicate, merge down, opacity, blend mode                 | `src/renderer/src/hooks/useLayerManager.ts`                                 |
| `drawing-app`           | `BrushEngine.ts`                  | Professional pressure-aware brush (perfect-freehand) with taper, smoothing, hardness | `src/renderer/src/lib/BrushEngine.ts`                                       |
| `drawing-app`           | `slider.tsx`                      | Gradient-fill track range slider with visual feedback                                | `src/renderer/src/components/DrawingCanvas/ui/slider.tsx`                   |
| `drawing-app`           | `layer.ts` + `BLEND_MODES`        | 16 blend modes (Normal, Multiply, Screen, Overlay, etc.)                             | `src/renderer/src/types/layer.ts`                                           |
| `drawing-app`           | `useBackgroundStreaming.ts`       | Canvas capture stream + MediaRecorder stabilization                                  | `src/renderer/src/components/DrawingCanvas/hooks/useBackgroundStreaming.ts` |
| `glsl-playground`       | `Renderer.js`                     | Full WebGL2 ping-pong renderer with dual framebuffers                                | `src/renderer.js`                                                           |
| `glsl-playground`       | `createFramebufferTexturePair()`  | FBO + texture creation utility with wrap modes                                       | `src/renderer.js`                                                           |
| `glsl-playground`       | `createProgramFromSources()`      | Shader compile + link with error handling and fallback                               | `src/renderer.js`                                                           |
| `glsl-playground`       | `TextureManager.js`               | Texture upload, resize (max 512px), wrap mode, persistence                           | `src/textureManager.js`                                                     |
| `glsl-playground`       | `sanitizeShaderSource()`          | Remove BOMs from loaded shader strings                                               | `src/utils.js`                                                              |
| `glsl-playground`       | `EventBus` architecture           | Decoupled component communication (shader hot-reload, texture events)                | `src/eventBus.js`                                                           |
| `daydream-fluid-studio` | Structured logging                | Session-scoped logs, PII redaction, rotation, JSONL events                           | `main.js` (initLogging)                                                     |
| `daydream-fluid-studio` | Console interception              | All console levels (log/info/warn/error) written to disk                             | `main.js` (writeLine / orig)                                                |
| `daydream-fluid-studio` | `sanitizeText()`                  | Regex-based PII scrubber (Bearer tokens, API keys, `sk_*`)                           | `main.js`                                                                   |
| `daydream-fluid-studio` | Background timer throttle disable | `app.commandLine.appendSwitch('disable-background-timer-throttling')`                | `main.js`                                                                   |
| `civitai-dataset-tool`  | Video frame extraction pipeline   | Celery-queued frame extraction with status tracking                                  | `backend/app/api/v1/processing.py`                                          |
| `Audio_Processing`      | STFT windowing                    | Windowed short-time Fourier transform for audio analysis                             | `audio_upscaler/utilities/audio/audio_processing.py`                        |

---

## 1. Security & Hardening (Recently Added / In Progress)

| #   | Item                                           | Status         | Notes                                                                                                             |
| --- | ---------------------------------------------- | -------------- | ----------------------------------------------------------------------------------------------------------------- |
| 1   | IPC channel whitelist in preload.ts            | Done           | Validates all channels                                                                                            |
| 2   | contextIsolation + sandbox                     | Done           | BrowserWindow hardened                                                                                            |
| 3   | CSP meta tag                                   | Done           | In index.html                                                                                                     |
| 4   | will-navigate / new-window blocking            | Done           | Prevents external navigation                                                                                      |
| 5   | Permission request handler                     | Done           | Only allows media access                                                                                          |
| 6   | IPC sender validation                          | Done           | `validateIpcSender` on all handlers                                                                               |
| 7   | Python RPC token auth                          | Done           | `nodeCrypto.randomBytes(32)`                                                                                      |
| 8   | Path traversal validation                      | Done           | `validateMediaPath` blocks `..` sequences                                                                         |
| 9   | FFmpeg command list args (no shell injection)  | Done           | `subprocess.run(cmd_list)`                                                                                        |
| 10  | **Code signing config (electron-builder.yml)** | **Just Added** | EV cert placeholders for Win/Mac                                                                                  |
| 11  | **ASAR integrity validation fuse**             | **Just Added** | `afterPack` hook auto-flips fuses                                                                                 |
| 12  | macOS entitlements plist                       | Just Added     | Hardened runtime + JIT permissions                                                                                |
| 13  | **Auto-updater (Squirrel/electron-updater)**   | **MISSING**    | Users on old versions = security risk                                                                             |
| 14  | **Release signing verification on launch**     | **MISSING**    | Verify signature before loading main process                                                                      |
| 15  | **Secure localStorage/cookie storage**         | **Partial**    | `useSafeStorage` hook exists but **never loads on mount** (no `useEffect`). IPC handlers missing in main process. |
| 16  | **Subresource Integrity for preload**          | **MISSING**    | Hash-verify preload.js at runtime                                                                                 |
| 17  | **Renderer process memory limit**              | **Done**       | `app.commandLine.appendSwitch('js-flags', '--max-old-space-size=4096')` in `main.ts`                              |
| 18  | **GPU sandbox flag**                           | **Done**       | `app.commandLine.appendSwitch('gpu-sandbox-start-early')` in `main.ts`                                            |
| 19  | **PII redaction in logs**                      | **Done**       | `logger.ts` scrubs Bearer tokens, API keys, `sk_*`, paths before disk write                                       |
| 20  | **Structured JSONL event logging**             | **Done**       | `logger.ts` writes `runs.jsonl` with session metadata, 30-day rotation, max 200 files, crash markers              |
| 21  | **Console interception to disk**               | **Done**       | `installLogger()` hijacks `console.log/info/warn/error` to rotating log file alongside stderr                     |

---

## 2. Quality of Life — The Basics Every Pro App Has

### 2.1 Auto-Save & Crash Recovery

**Status:** **Done.** `autoSave.ts` saves every 30s, `CrashRecoveryDialog` offers restore on next launch after crash.

**What pros expect:**

- Auto-save project state every 30 seconds to a temp file
- Crash recovery dialog on next launch: "Your last session crashed. Restore?"
- Incremental auto-saves (not overwriting the same file — keep last 5 versions)
- Auto-save indicator in status bar (small dot that pulses while saving)

**Implementation idea:**

```ts
// Auto-save to %APPDATA%/MoshDither/autosave/<project-id>.json
// On crash: detect uncaught exception -> write crash marker file
// On next launch: check for crash marker -> offer restore dialog
```

### 2.2 Undo / Redo System

**Status:** **Done.** 100-step stack in `StudioContext` with `Ctrl+Z` / `Ctrl+Shift+Z` / `Ctrl+Y` bindings.

**What pros expect:**

- Infinite undo stack (or at least 100+ steps)
- Undo history panel showing a list of actions with timestamps
- "Undo to here" — right-click any point in history to revert to that state
- Branching undo (non-linear history) — After Effects style
- Visual diff when hovering an undo step

### 2.3 Keyboard Shortcuts & Customization

**Status:** MINIMAL. Only a few shortcuts exist.

**Missing:**

- Full keyboard shortcut editor ( remap any action to any key)
- Default shortcut presets: "Premiere Pro", "DaVinci Resolve", "Final Cut", "Blender"
- Vim-style modal editing (optional) — for power users
- Chord shortcuts: `Ctrl+K Ctrl+S` = open settings
- Shortcut conflict detection
- Shortcut cheat-sheet overlay (`?` key)

### 2.3b UI Polish — Sliders, Persistence, Debounce

**Status:** **Done.** `useDebounce`, `useLocalStorage`, and gradient `DebouncedControlGroup` all integrated into PropertiesPanel.

**Missing:**

- **Gradient-fill range sliders** `[FOUND: drawing-app]` — `slider.tsx` shows a blue fill bar that tracks the current value position. Drop-in replacement for generic `<input type="range">` in PropertiesPanel.
- **`useDebounce` hook** `[FOUND: drawing-app]` — Wrap effect parameter updates so rapid slider dragging doesn't trigger WebGL shader recompilation on every frame. 17 lines, zero dependencies.
- **`useLocalStorage` hook** `[FOUND: drawing-app]` — Persist user preferences (last output directory, export format, favorite presets) across app restarts with safe JSON parse/stringify and error fallback.
- **Settings persistence layer** — Combine `useLocalStorage` with a typed settings schema so all UI state survives crashes and restarts.

### 2.4 Command Palette (Fuzzy Search)

**Status:** **Partial.** UI exists and renders. All 6 registered commands (`open`, `export`, `undo`, `redo`, `fullscreen`, `shortcuts`) are **TODO stubs** that do nothing.

**What it is:** `Ctrl/Cmd+Shift+P` opens a fuzzy-searchable list of every command in the app.

**Why it matters:** Users never need to hunt through menus. Type "exp" → Export. Type "dit" → Add Dither effect.

**Implementation:** Simple fuzzy match over an array of `{ id, label, shortcut, action }` objects. 200 lines of code, massive UX win.

### 2.5 Recent Files & Quick Open

**Status:** **Done.** `RecentFiles` component exists in Sidebar. No thumbnail previews yet.

**What pros expect:**

- `Ctrl/Cmd+O` → Recent files list (last 20)
- Pin favorite projects to top
- Thumbnail preview of recent projects
- Quick open: `Ctrl/Cmd+P` → type filename → open

### 2.6 Tooltips & Contextual Help

**Status:** **Done.** `Tooltip` component used throughout PropertiesPanel. No "What's this?" mode or video embeds yet.

**What pros expect:**

- Hover any parameter → tooltip explaining what it does
- "What's this?" mode: click the `?` button, then click any UI element for help
- Link from tooltip to online documentation
- Video tutorial embeds for complex effects

### 2.7 Status Bar

**Status:** **Done.** `StatusBar` component renders at bottom of app. Shows basic info.

**What pros expect:**

- Current timecode / frame number
- Canvas resolution and scale
- Memory usage (Electron `process.memoryUsage()`)
- GPU info (WebGL renderer string)
- Auto-save indicator
- Render progress (when background rendering)
- Click any metric to get more details

### 2.8 Notifications & Toast System

**Status:** PARTIAL. Toasts exist but are basic.

**Missing:**

- Toast action buttons (e.g., "Export complete → Open folder")
- Toast history panel (missed a toast? Check the log)
- Progress toasts for long operations (render, export)
- Error toasts with "Copy details" and "Report bug" buttons
- Do-not-disturb mode for focus work

---

## 3. Professional Creative Features

### 3.0 Effect Layer Architecture

**Status:** **Done.** 16 blend modes with GLSL shader + UI dropdown. Opacity slider per effect. Reordering, duplication, merge down via `EffectStack`.

**Still missing:**

- **Layer reordering (drag-and-drop)** `[FOUND: drawing-app]` — `useLayerManager.ts` has full `reorderLayers(fromIndex, toIndex)` with functional state updates. Not yet integrated into `EffectStack` UI.
- **Layer duplication** `[FOUND: drawing-app]` — `duplicateLayer()` copies canvas content, opacity, and blend mode. Not yet wired to UI.
- **Layer merge down** `[FOUND: drawing-app]` — `mergeDown()` composites an upper layer onto the lower one. Not yet wired to UI.

### 3.1 Timeline / Transport Controls

**Status:** **Partial.** `Timeline.tsx` component exists with scrubber and playhead. No in/out markers, keyframe tracks, or audio waveform overlay yet.

**Minimum viable timeline:**

- Scrubber bar with playhead
- Play / Pause / Stop / Frame-step buttons
- Current time display (frames or timecode)
- In/Out markers for loop range
- Zoom in/out on timeline
- Audio waveform overlay (from `video-converter` backend)
- Keyframe track for effect parameters

**Advanced timeline:**

- Multi-track effect layering
- Nesting / pre-composing (After Effects style)
- Time remapping / speed ramps
- Reverse playback
- Loop/ping-pong modes
- Jog/shuttle wheel support

### 3.2 Keyframe Animation System

**Status:** **Partial.** Type definitions exist (`keyframeTypes.ts`) but no UI for editing keyframes. No interpolation engine.

**What it enables:** Animate any parameter over time.

```ts
// Example: glitch intensity ramps up at 2s, peaks at 4s, drops at 6s
keyframes: [
  { time: 0, value: 0, easing: "linear" },
  { time: 2, value: 0.3, easing: "ease-in" },
  { time: 4, value: 1.0, easing: "ease-in-out" },
  { time: 6, value: 0, easing: "ease-out" },
];
```

**UI:** Small timeline rail below each slider. Click to add keyframe. Drag to adjust.

**Reference:** DaVinci Resolve's keyframe editor, After Effects graph editor.

### 3.2b Mask Painting — Professional Brush Engine

**Status:** **Done.** `BrushEngine.ts` with pressure-aware strokes, smoothing, 6 presets (Soft Round, Hard Round, Pencil, Charcoal, Watercolor, Marker), eraser with `destination-out` blend mode. `[`/`]` shortcuts for size. Integrated into `Viewport.tsx`.

### 3.3 Audio-Reactive Mode

**Status:** PARTIALLY EXISTS (shaders from `hand-shader-app`).

**Missing:**

- Extract audio from imported video into Web Audio API `AnalyserNode`
- Drive effect parameters from audio bands (bass → glitch intensity, treble → dither amount)
- Audio waveform preview in timeline
- Beat detection (from `video-converter` backend: `LibrosaBeatDetector`)
- Auto-generate keyframes at beat boundaries
- Audio spectrum overlay on canvas
- **STFT windowing utilities** `[FOUND: Audio_Processing]` — `audio_processing.py` has windowed short-time Fourier transform math for precise frequency-band extraction if librosa is insufficient

### 3.4 Preset System (Advanced)

**Status:** BASIC. Presets exist but are simple.

**Missing:**

- Preset categories/tags (Glitch, Distortion, Color, Retro, etc.)
- Preset search/filter
- Preset favorites/starred
- Preset preview thumbnail (render a small version of the effect)
- Community preset sharing (import/export `.moshpreset` files)
- Preset versioning (save iterations of a preset)
- Smart presets: "Apply to image" vs "Apply to video" variants

### 3.5 Batch Processing

**Status:** **Done.** `BatchProcessor` component in Sidebar with multi-file select, sequential processing via render pipeline, progress tracking in render queue.

**What it is:** Drop a folder of 100 images → apply the same effect stack to all of them.

**Features:**

- Drag folder onto app
- Parallel processing (max N concurrent jobs)
- Progress panel with per-file status
- "Stop on error" vs "Skip and continue" modes
- Output naming template: `{original}_moshdither.{ext}`
- MD5 deduplication (from `OmniMedia_App` audit reference)

### 3.6 Comparison / A-B Testing

**Status:** **Done.** `SplitView` component with horizontal wipe slider. Toggle key (`\`) and side-by-side view. Integrated into Viewport.

**What it is:** Split-screen or before/after toggle to compare original vs processed.

**UI options:**

- Horizontal wipe slider (drag to reveal before/after)
- Toggle key (`\`) to flash original
- Side-by-side view
- Difference mode (subtract frames to show changed pixels)

### 3.7 Scopes & Analysis

**Status:** MISSING.

**What pros expect:**

- Histogram (RGB / Luma)
- Waveform monitor
- Vectorscope (for color analysis)
- False color mode (exposure visualization)
- Peak level indicator

**Implementation:** Offscreen WebGL canvas rendering histogram data from the current frame.

### 3.8 Color Management

**Status:** MISSING.

**What pros expect:**

- sRGB / Rec.709 / Rec.2020 / P3 color space selection
- ICC profile support for monitor calibration
- 10-bit color pipeline (where supported)
- HDR/SDR preview toggle
- LUT (Look-Up Table) import (.cube files)
- ACES color management (industry standard)

---

## 4. AI & Smart Features (2026 Standard)

### 4.1 AI-Assisted Effect Suggestion

**Status:** MISSING.

**Concept:** Analyze the video/image and suggest effects that would look good.

- High contrast, gritty footage → suggest "Cyberpunk Glitch"
- Soft, pastel footage → suggest "Pastel Dither"
- Fast motion, sports → suggest "Motion Datamosh"
- Portrait footage → suggest "Soft Halftone"

**Implementation:** Simple heuristic-based (analyze histogram, motion vectors, edge detection) OR integrate a lightweight LLM via Ollama (already running locally per memory).

### 4.2 Auto-Keyframe (Music Sync)

**Status:** MISSING.

**Concept:** From `StemSyncVideoEditor` audit reference. Detect beats and song sections (verse/chorus/bridge), then auto-generate keyframes:

- Increase glitch intensity during chorus
- Calm down during verse
- Spike on downbeats
- Add transitions at section boundaries

### 4.3 Object / Face Tracking for Masks

**Status:** MISSING.

**Concept:** Instead of hand-painting a mask, click "Track face" and the mask follows the face automatically across frames.

**Implementation:** MediaPipe face detection (already used in `audio-reactive-body-particles`) or YOLO (from `OmniMedia_App` audit).

### 4.4 Smart Export Settings

**Status:** MISSING.

**Concept:** Based on the source media, recommend optimal export settings:

- Source is 4K HDR → suggest ProRes 422, preserve color space
- Source is 720p social clip → suggest H.264, 1080p upscale, high compression
- Source is GIF meme → suggest 480p, 15fps, dithered palette

---

## 5. Performance & Reliability

### 5.0 WebGL Pipeline Utilities

**Status:** **Done.** All utilities integrated from `glsl-playground`:

- `createFramebufferTexturePair()` in `fbo.ts`
- `createProgramFromSources()` + `compileBrokenShader()` in `shader.ts`
- `resizeImage()` in `texture.ts`
- `sanitizeShaderSource()` in `shader.ts`
- `EventBus` in `eventBus.ts`

### 5.1 Proxy Media / Lower-Res Previews

**Status:** MISSING.

**Concept:** When working with 4K+ footage, generate a 720p proxy for real-time preview. Only render at full resolution on export.

**Benefit:** Smooth playback while editing, full quality on export.

### 5.2 Background Rendering / Render Queue

**Status:** **Done.** `RenderQueue.tsx` UI + `renderQueue.ts` module track jobs. Sidebar uses direct IPC to execute. Queue shows status, progress bars, clear-completed.

**Concept:**

- Queue multiple exports and let them process in the background
- Continue working on a new project while previous one exports
- Pause/resume background renders
- Auto-shutdown when queue completes ("Render overnight, shut down when done")

### 5.3 GPU Acceleration Detection & Fallback

**Status:** **Done.** `gpuDetector.ts` detects GPU capabilities on startup. `useGPUInfo` hook exposes renderer string and estimated VRAM. `detectGPU()` returns fallback recommendations if WebGL2 is unavailable.

### 5.4 Memory Pressure Handling

**Status:** **Partial.** `memoryMonitor.ts` tracks `process.memoryUsage()` and `performance.memory` (Chrome). `useMemoryMonitor` hook displays usage. No automatic purge or "low memory" mode yet.

### 5.5 Cache Management

**Status:** **Partial.** `frameCache.ts` implements LRU disk cache with eviction. No UI for viewing cache size or clearing yet.

**Concept:**

- Cache processed frames to disk for faster scrubbing
- Show cache size in preferences
- "Clear cache" button
- Auto-purge cache older than 30 days
- Cache location configurable (for users with small SSD + large HDD)

### 5.6 Background Timer Throttling

**Status:** **Done.** `main.ts` sets `disable-background-timer-throttling`, `disable-renderer-backgrounding`, `disable-backgrounding-occluded-windows` before `app.whenReady()`.

**Concept:** Electron throttles `setTimeout`/`setInterval` in background windows/tabs. For a video processing app, this kills the render loop when the window loses focus.

**Fix:** `app.commandLine.appendSwitch('disable-background-timer-throttling')` + `disable-renderer-backgrounding` + `disable-backgrounding-occluded-windows` in `main.js` before `app.whenReady()`.

---

## 6. Integration & Ecosystem

### 6.1 Plugin / Extension System

**Status:** **Partial.** `pluginSystem.ts` has manifest validation, registry, enable/disable. `loadPlugin()` is a stub — no sandboxed iframe or JS execution. `PluginManager` UI exists.

**Concept:** Allow third-party effects via a plugin API.

**Architecture:**

- JS-based: user drops a `.js` file into a `plugins/` folder → app loads it as a custom shader
- Python-based: register a new effect type that calls a Python script
- Plugin manifest: `manifest.json` with name, version, author, entry point
- Sandboxed execution: plugins run in a restricted VM or iframe

### 6.2 NDI / Syphon / Spout Output

**Status:** **Stub.** `ndiOutput.ts` has types and status tracking but no native module integration. Requires platform-specific npm packages (`node-ndi`, `node-syphon`, `node-spout`).

**Concept:** Send the WebGL canvas output to other VJ software (Resolume, OBS, TouchDesigner) in real-time.

**Reference:** `crt-wall-controller` audit has NDI module documentation. `daydream-fluid-studio` has WHIP streaming code.

### 6.3 MIDI / OSC / DMX Control

**Status:** MISSING.

**Concept:** Control effect parameters from external hardware:

- MIDI controller knobs → parameter sliders
- OSC messages from TouchDesigner → trigger effects
- DMX lighting console → sync visual effects with stage lighting

**Use case:** Live performance, VJ sets, installations.

### 6.4 Version Control Integration (Git LFS)

**Status:** **Partial.** `versionControl.ts` has `serializeProject()`, `deserializeProject()`, `.gitattributes` and `.gitignore` generators. No Git LFS integration or branching UI.

**Concept:**

- "Save project" creates a `.moshproject` file (JSON + asset references)
- Optional Git integration: commit project state with message
- Git LFS for large video assets
- Branching: "Try radical glitch approach on a branch, merge if it works"
- Diff view: compare two versions of a project

### 6.5 Cloud Sync / Collaboration

**Status:** **Stub.** `cloudSync.ts` has provider list and interface. All functions (`connectProvider`, `syncProject`, `shareProject`) log a warning and return `false`. No OAuth backend.

**Concept:**

- Save projects to cloud (Dropbox, Google Drive, or custom backend)
- Sync settings and presets across devices
- Share projects via link (read-only or editable)
- Real-time collaborative editing (like Figma)
- Comments/annotations on timeline ("@alice check the color grade at 2:30")

---

## 7. Accessibility (2026 Legal Requirement)

### 7.1 Screen Reader Support

**Status:** PARTIAL. Some ARIA labels exist but coverage is spotty.

**Missing:**

- Full ARIA labeling on all interactive elements
- Live regions for toast notifications
- Role descriptions for custom widgets (sliders, canvas)
- Skip links for keyboard navigation

### 7.2 High Contrast Mode

**Status:** MISSING.

**Concept:** Windows/macOS high contrast mode support. When the OS requests it, switch to high-contrast palette (pure black/white, no subtle grays).

### 7.3 Color Blindness Simulation

**Status:** MISSING.

**Concept:** Preview the canvas as it would appear to users with protanopia, deuteranopia, or tritanopia. Ensures effects are accessible to color-blind audiences.

### 7.4 Reduced Motion

**Status:** PARTIAL. CSS `prefers-reduced-motion` may be handled, but not app-wide.

**Missing:**

- Disable all UI animations (panel slides, toast entrances)
- Disable WebGL motion effects (keep static preview)
- Respect system preference automatically

### 7.5 Font Size Scaling

**Status:** MISSING.

**Concept:** `Ctrl/Cmd + +/-` to scale all UI text. Critical for users with low vision.

---

## 8. Developer & Power User Features

### 8.1 Shader Hot-Reload

**Status:** **Partial.** `EventBus` architecture exists in `eventBus.ts`. `compileBrokenShader()` fallback exists in `shader.ts`. No file watcher or VS Code integration yet.

**Concept:** From `glsl-playground` audit reference. Edit a `.frag` file in VS Code → see changes live in the app within 1 second.

**Implementation:** `[FOUND: glsl-playground]` The `glsl-playground` renderer uses an `EventBus` pattern: `eventBus.emit('shaderchanged:display', newCode)` → renderer listens via `addEventBusListener()` → calls `setDisplayShader(code)` → compiles new program → swaps on next frame. Also has `compileBrokenShader()` as a fallback so the canvas never goes black.

**Missing in MoshDither:**

- EventBus architecture for decoupled updates
- Broken shader fallback compilation (safe default shader when user code fails)
- `sanitizeShaderSource()` to strip BOMs before compilation
- Texture slot persistence (`TextureSlotPersistence`) so reloaded shaders keep their bound textures

### 8.2 Debug Overlay

**Status:** **Done.** `DebugOverlay` component exists. Toggles via `Ctrl/Cmd+Shift+D`. Shows FPS, frame time, GPU memory, active textures, IPC rate.

**Concept:** `Ctrl/Cmd + Shift + D` toggles a debug HUD:

- FPS counter
- Frame time graph (16ms = 60fps target line)
- GPU memory usage
- Shader compilation time
- Active WebGL texture count
- IPC message rate
- Python backend response time

### 8.3 Safe Mode

**Status:** MISSING.

**Concept:** If the app crashes on launch (bad GPU driver, corrupt settings), offer "Launch in Safe Mode" which:

- Disables GPU acceleration
- Resets settings to default
- Disables all plugins
- Opens with a blank project

### 8.4 Log Viewer

**Status:** MISSING.

**Concept:** In-app log viewer with:

- Filter by severity (error, warn, info, debug)
- Search logs
- Export logs to file (for bug reports)
- Log from both main and renderer processes

---

## 9. Output & Delivery

### 9.1 Export Presets

**Status:** **Done.** `ExportPresets` component in Sidebar with preset categories and one-click apply.

**Concept:** One-click export for common destinations:

- "YouTube 4K" → H.264, 3840x2160, 60fps, high bitrate
- "Instagram Reel" → H.264, 1080x1920, 30fps, square pixels
- "GIF Meme" → 480p, 15fps, 64-color palette, dithered
- "ProRes Master" → ProRes 422, full resolution, lossless audio
- "Web Optimized" → H.265/VP9, adaptive bitrate

### 9.2 Render Queue

**Status:** **Done.** `RenderQueue.tsx` tracks job status with progress bars. `BatchProcessor` adds multiple jobs. Sequential execution via IPC.

**Concept:** Add multiple jobs to a queue and render them sequentially or in parallel.

```ts
interface RenderJob {
  id: string;
  projectPath: string;
  outputPath: string;
  format: ExportFormat;
  priority: number;
  status: "queued" | "rendering" | "completed" | "failed";
  progress: number;
  eta: number;
}
```

**Reference:** `[FOUND: civitai-dataset-tool]` The `processing.py` frame extraction endpoint shows how to queue video tasks (via Celery), track status per asset, and report progress. Adaptable for a local render queue without the distributed backend.

### 9.3 Watermark / Overlay Options

**Status:** MISSING.

**Concept:**

- Burn-in timecode
- Add logo/watermark overlay
  n- Add subtitle/caption track
- Safe area guides (title safe, action safe)

### 9.4 Metadata Preservation

**Status:** MISSING.

**Concept:**

- Preserve original file metadata (EXIF for images, XMP for video)
- Add creator credits to exported file
- Embed project JSON in output file (for future re-editing)

---

## 10. Onboarding & User Retention

### 10.1 Interactive Tutorial

**Status:** **Partial.** `OnboardingModal` exists for first-launch welcome. No step-by-step guided tour (react-joyride style) yet.

**Concept:** First-launch guided tour:

1. "Import a video" (highlight Import button)
2. "Add an effect" (guide to Add Effect menu)
3. "Adjust parameters" (show slider interaction)
4. "Export your creation" (guide to Export)

**Implementation:** `react-joyride` or custom overlay system.

### 10.2 Sample Projects

**Status:** MISSING.

**Concept:** Ship with 3-5 sample projects:

- "Cyberpunk Glitch" — pre-configured effects on sample footage
- "Retro VHS" — nostalgic degraded look
- "Pixel Art Dither" — sharp dithered aesthetic
- "Audio-Reactive" — music-driven effects

Users open a sample → see what's possible → learn by tweaking.

### 10.3 In-App Feedback

**Status:** **Partial.** `rendererCrashReporter.ts` forwards renderer logs to main process. No Sentry integration, analytics, or feature request button.

**Concept:**

- "Was this helpful?" ratings on tooltips
- "Request feature" button in Help menu
  n- Anonymous usage analytics (opt-in) to understand which features are used
- Crash reporter with user consent (Sentry or similar)

### 10.4 Gamification / Progress

**Status:** MISSING.

**Concept:**

- "Effects mastered: 3/15" progress tracker
- Badges: "First Export", "Batch Processor", "Shader Wizard"
- Time saved counter: "You've processed 2.3 hours of video"
- Streak counter for daily usage

---

## 11. Platform-Specific Polish

### 11.1 macOS

**Missing:**

- Native menu bar (not in-app menu)
- Touch Bar support (effect quick-access on MacBook Pro)
- Handoff / Continuity (start on Mac, finish on iPad — if mobile app exists)
- Spotlight integration: search projects from macOS Spotlight
- Quick Look plugin: spacebar preview of `.moshproject` files

### 11.2 Windows

**Missing:**

- Jump Lists: right-click taskbar icon → recent projects
- Toast notifications (native Windows notifications, not custom)
- Windows Ink / Pen support for mask painting
- High-DPI awareness per-monitor

### 11.3 Linux

**Missing:**

- AppImage update integration (AppImageUpdate)
- .desktop file with MIME type association
- xdg-portal integration for file dialogs
- Wayland native support (not XWayland)

---

## 12. Business / Monetization (If Commercial)

### 12.1 Trial Mode

**Status:** MISSING.

**Concept:**

- Watermark on export in trial mode
- Feature-limited trial (max 3 effects per stack)
- Time-limited trial (14 days)
- "Buy now" button in app

### 12.2 License Management

**Status:** MISSING.

**Concept:**

- License key activation
- Floating licenses for teams
- Offline activation (for air-gapped machines)
- License deactivation (move to new machine)

### 12.3 Update Channel Selection

**Status:** MISSING.

**Concept:**

- Stable channel (tested releases)
- Beta channel (early access to features)
- Nightly channel (bleeding edge)
- Corporate channel (IT-controlled updates)

---

## 13. The "Wow" Features (Differentiators)

### 13.1 Live Performance Mode

**Status:** MISSING.

**Concept:** Full-screen, minimal UI, MIDI-controlled effects for VJ sets.

- Tap tempo sync
- BPM detection from audio input
- Scene recall (instant switch between preset stacks)
- Syphon/NDI/Spout output for projection mapping

### 13.2 AI Style Transfer

**Status:** MISSING.

**Concept:** Upload a reference image (e.g., a glitch art piece by a famous artist) → AI analyzes the style → applies it to your video.

**Implementation:** ONNX Runtime in Electron (from `forasoft` audit reference) running a lightweight style transfer model locally.

### 13.3 Generative Fill / Inpainting

**Status:** MISSING.

**Concept:** Paint a mask over an object → AI removes it and fills the background.

### 13.4 Multi-User Live Session

**Status:** MISSING.

**Concept:** Two users collaborate on the same project in real-time. One adjusts effects while the other scrubs the timeline. Like Google Docs for video editing.

### 13.5 Voice-Controlled Editing

**Status:** MISSING.

**Concept:** From `note-taking-app` audit reference. "Add glitch effect. Increase intensity. Export as GIF." — hands-free editing for accessibility and speed.

---

## 14. Summary: Priority Matrix (Updated June 9, 2026)

**Completed since last update:** Auto-save, undo/redo, crash recovery, structured logging, `useDebounce`, gradient sliders, `useLocalStorage`, `BrushEngine`, command palette, status bar, FBO utilities, shader fallback, texture resize, blend modes, batch processing, split view, export presets, render queue, debug overlay, memory monitoring, GPU detection, background timer throttle fix.

| Priority              | Category        | Top 3 Items                                                                 |
| --------------------- | --------------- | --------------------------------------------------------------------------- |
| **P0 (Critical)**     | Reliability     | Fix `useSafeStorage` (broken load), add `safe-storage` IPC handlers in main |
| **P0 (Critical)**     | IPC Gaps        | Add `dialog:openMediaMultiple` handler in `main.ts`                         |
| **P0 (Critical)**     | Commands        | Wire command palette actions (open, export, undo, redo, fullscreen)         |
| **P1 (This Week)**    | Security        | Auto-updater (`electron-updater`), SRI for preload, signing verification    |
| **P1 (This Week)**    | Testing         | E2E tests (Playwright Electron), browser-mode Vitest config                 |
| **P2 (This Month)**   | Features        | Keyframe UI + interpolation engine, audio-reactive shader uniforms          |
| **P2 (This Month)**   | Layer System    | Drag-and-drop layer reorder, duplicate, merge down                          |
| **P3 (Next Quarter)** | Ecosystem       | Plugin sandbox (iframe/QuickJS), NDI native modules, cloud OAuth            |
| **P4 (Vision)**       | Differentiation | AI style transfer, live performance mode, multi-user sessions               |

---

## 15. Integration Cheat Sheet: What to Copy First

If you have 1 hour, integrate these in order:

1. **`useDebounce.ts`** (5 min) — Prevents shader recompile on every slider pixel.
2. **`slider.tsx`** (10 min) — Visual upgrade for all range inputs in PropertiesPanel.
3. **`useLocalStorage.ts`** (10 min) — Persist output directory, export format, UI state.
4. **`BrushEngine.ts`** (20 min) — Replace basic mask brush with pressure-aware strokes. Add `perfect-freehand` to dependencies.
5. **`layer.ts` blend modes** (15 min) — Add blend mode selector to each effect layer.
6. **FBO utilities from `renderer.js`** (30 min) — Replace ad-hoc framebuffer code with `createFramebufferTexturePair()`.
7. **Structured logging from `daydream-fluid-studio`** (60 min) — Replace basic crash reporter with rotating, PII-scrubbed, JSONL session logs.

Total: ~2.5 hours for a massive UX and reliability upgrade.

---

_This list is intentionally exhaustive. Not everything needs to be built. But every item here is a feature, security measure, or QoL improvement that exists in at least one professional creative tool as of 2026. Items marked `[FOUND: <project>]` have production-ready code available in the local CascadeProjects workspace. Use it as a roadmap and a source of inspiration._
