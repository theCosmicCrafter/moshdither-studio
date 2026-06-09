# Project Audit Report — CascadeProjects Inventory

## For Moshdither Studio Reuse & Integration

**Audit Date:** 2026-06-09
**Projects Scanned:** 65
**Auditor:** ODIN v5.0

---

## Executive Summary

Of the 65 projects audited, **20 contain directly reusable code, assets, or architectural patterns** for Moshdither Studio. The highest-value projects cluster into five categories:

1. **Shader/WebGL Effects** — Fluid sims, glitch shaders, audio-reactive GLSL
2. **Canvas & Drawing Tools** — Layer management, brush systems, export pipelines
3. **Media Processing Utilities** — Frame extraction, dataset curation, video loading
4. **Electron/Desktop App Patterns** — IPC logging, streaming, window management
5. **FFmpeg Video Processing** — Format conversion, beat detection, auto-editing, audio analysis

---

## Tier S — Critical Reuse Value

### 1. `daydream-fluid-studio` (Electron + WebGL Fluid Sim)

**Location:** `c:\Users\richk\CascadeProjects\daydream-fluid-studio`

**What it is:** A complete Electron desktop app with a real-time WebGL2 fluid simulation engine. Features 9 presets, background/texture loading, audio-reactivity, canvas recording, and WHIP streaming to Daydream API.

**Reusable Assets for Moshdither:**

- **`renderer/fluid_app.jsx:76-222`** — The `FluidSimulation` WebGL class. Complete FBO ping-pong simulation with pressure, viscosity, damping, gravity, flow field, symmetry, paint colors, and brush size. Uses `OES_texture_float` and `OES_texture_float_linear`.
- **`renderer/fluid_app.jsx:348-420`** — Canvas file loading (`handleFileChange`) — drag image/video onto canvas as background/texture.
- **`renderer/fluid_app.jsx:383-420`** — WHIP streaming pipeline: `canvas.captureStream(30)` → `RTCPeerConnection` → offer/answer SDP exchange. Could enable **NDI/Syphon-style output** from Moshdither.
- **`main.js:16-187`** — Production-grade Electron logging system with log rotation (7-day retention, 200-file cap), credential redaction, session JSONL events, renderer console interception, and crash handling.
- **`main.js:283-310`** — Robust `appFetch` with `net.fetch` fallback, retry logic (ECONNRESET, ETIMEDOUT), exponential backoff.
- **Presets system (`defaultPresets` object)** — 9 named presets with full config objects. Pattern matches Moshdither's preset system.

**Integration Path:** Port the `FluidSimulation` class as a new effect type (`fluid-distortion`). Extract the logging system into Moshdither's Electron main process. Reuse WHIP streaming for network output.

---

### 2. `WebGL-Fluid-Simulation-master` (Pavel Dobryakov Reference)

**Location:** `c:\Users\richk\CascadeProjects\WebGL-Fluid-Simulation-master\WebGL-Fluid-Simulation-master`

**What it is:** The industry-standard open-source WebGL fluid simulation. Uses WebGL2 with half-float FBOs, advection, pressure projection, curl/vorticity, bloom, sunrays, and dithering.

**Reusable Assets for Moshdither:**

- **`script.js:118-168`** — `getWebGLContext` with graceful WebGL2/WebGL1 fallback, extension probing (`EXT_color_buffer_float`, `OES_texture_float_linear`), and format capability detection.
- **`script.js:170-206`** — `getSupportedFormat` / `supportRenderTextureFormat` — runtime framebuffer format negotiation. Critical for cross-platform GPU compatibility.
- **`script.js:351-438`** — `Material` class with keyword-based shader variant caching. Compile a fragment shader once, switch `#define` keywords to enable/disable features (BLOOM, SHADING, SUNRAYS) without recompilation.
- **`script.js:440-612`** — `displayShaderSource` with optional SHADING, BLOOM, SUNRAYS branches. Includes `linearToGamma` and dithering noise.
- **`script.js:614-724`** — Complete bloom pipeline: prefilter → blur → final. Sunrays mask + radial accumulation shader.
- **`script.js:726-744`** — `splatShader` — injects color/velocity at a point with radial falloff.
- **`script.js:746-866`** — Core simulation shaders: advection (with manual bilerp fallback), divergence, curl, vorticity, pressure Jacobi iteration, gradient subtraction.
- **`script.js:915-942`** — `blit` utility: fullscreen quad rendering with proper VAO/element buffer setup.

**Integration Path:** The Dobryakov fluid sim is a **direct upgrade** to the simpler `FluidSimulation` in `daydream-fluid-studio`. Port the advection-pressure-curl pipeline as a new WebGL effect layer. Reuse the `Material` keyword system for Moshdither's shader variants. The bloom/sunray shaders can become standalone post-processing effects.

---

### 3. `hand-shader-app` (Three.js Glitch & Audio Shaders)

**Location:** `c:\Users\richk\CascadeProjects\hand-shader-app`

**What it is:** A Three.js app with categorized shader libraries: glitch, fluid, audio-reactive, and psychedelic. All written as GLSL strings exported from TypeScript modules.

**Reusable Assets for Moshdither:**

- **`src/shaders/glitch/GlitchShader.ts`** — 147-line fragment shader with:
  - Block noise displacement with RGB channel split
  - Scanlines and CRT color fringing
  - Matrix-style falling character rain
  - Neon circuit lines with pulse animation
  - Gesture-reactive burst/charging effects
  - Audio-reactive interference (`uBass`, `uMid`, `uTreble`, `uEnergy`)
- **`src/shaders/audio/AudioShader.ts`** — 155-line fragment shader with:
  - Central waveform ring modulated by audio bands
  - 48 frequency bars with bass/mid/treble scaling
  - Radial ray bursts
  - Hand-interaction glow and ripples
  - Particle sparks
- **`src/shaders/fluid/FluidShader.ts`** — Fluid distortion with hand-proximity ripples
- **`src/shaders/psychedelic/PsychedelicShader.ts`** — Tunnel/traveling wave effects

**Note:** The `uHandPosition` and `uGesture` uniforms in these shaders are designed for live performance with hand tracking. Since Moshdither Studio is a **video post-production tool (not a live performance app)**, the hand gesture features are **not applicable**. However, the visual effects themselves (glitch blocks, matrix rain, audio-reactive rings, waveform bars) are fully reusable by driving `uIntensity` and audio uniforms from the video's audio track instead of live hand input.

**Integration Path:** Port the shader bodies (minus hand-reactive sections) as new Moshdither effects. The `GlitchShader.ts` can become a `matrix-rain` or `cyber-glitch` effect. The `AudioShader.ts` provides a template for an **audio-reactive overlay** driven by the source video's audio waveform. The uniform naming (`uTime`, `uBass`, `uMid`, `uTreble`, `uEnergy`) is consistent with the Web Audio API analyzer node pattern.

---

### 4. `drawing-app` (Layer-Based Canvas with Streaming)

**Location:** `c:\Users\richk\CascadeProjects\drawing-app`

**What it is:** A professional-style drawing application built with Electron + Vite + React. Features layer management, brush presets, canvas resizing, Daydream AI streaming, recording, and export.

**Reusable Assets for Moshdither:**

- **`src/renderer/src/App.tsx:133-146`** — `useLayerManager` hook pattern for layer CRUD (add, remove, duplicate, update, reorder, get active).
- **`src/renderer/src/App.tsx:245-319`** — Layer compositing with `globalCompositeOperation` blending modes. `compositeBackgroundLayers` and `compositeAllLayers` for export.
- **`src/renderer/src/App.tsx:404-446`** — `MediaRecorder` pipeline for canvas recording with WebM/VP9 export. Start/pause/resume/stop with Blob chunking.
- **`src/renderer/src/App.tsx:487-674`** — Resizable docked sidebars with drag handles (`cursor-col-resize`), status bar, top toolbar pattern.
- **Canvas size selector modal** — Preset sizes (A4, A3, Square, etc.) with confirm-on-change.
- **Debug panel overlay** — API key testing, log viewer with 100-line circular buffer.

**Integration Path:** The layer manager and compositing logic can **replace or augment** Moshdither's effect stack. The `MediaRecorder` implementation is more robust than Moshdither's current canvas recording. The sidebar resize pattern solves Moshdither's fixed-layout problem. The debug panel is a direct template for Moshdither's developer mode.

---

## Tier A — High Reuse Value

### 5. `glsl-playground` (Shader Editor Framework)

**Location:** `c:\Users\richk\CascadeProjects\glsl-playground`

**What it is:** A browser-based GLSL shader playground with dual-pane editor (sim + display), live compilation, error display, texture slots, and persistence.

**Reusable Assets for Moshdither:**

- **`src/renderer.js:93-116`** — WebGL init with dual framebuffer ping-pong (sim → display). `createFramebufferTexturePair` utility.
- **`src/renderer.js:185-216`** — Robust framebuffer/texture pair creation with proper attachment checking.
- **`src/renderer.js:235-313`** — Render loop: sim pass writes to FBO A, display pass reads FBO A and writes to screen. Swaps A/B each frame.
- **`src/renderer.js:423-495`** — Live shader recompilation with error handling. Falls back to "broken shader" on compile failure.
- **`src/renderer.js:497-544`** — Full WebGL resource disposal pattern (deleteProgram, deleteTexture, deleteFramebuffer).
- **`src/textureManager.js`** — Image drag-and-drop → WebGL texture with wrap mode support (REPEAT, CLAMP, MIRRORED_REPEAT).
- **`src/shaderPresets.js`** — Default vertex + fragment shaders for display and simulation.

**Integration Path:** The shader hot-reload system (`setSimShader` / `setDisplayShader`) is exactly what Moshdither needs for **custom shader injection** (Improvement #15). The texture manager can be reused for loading custom LUTs or displacement maps. The disposal patterns prevent the memory leaks common in long-running WebGL apps.

---

### 6. `audio-reactive-body-particles` (2D Canvas Audio + Pose)

**Location:** `c:\Users\richk\CascadeProjects\audio-reactive-body-particles`

**What it is:** A Vite + React app that uses MediaPipe pose detection + Web Audio API to drive a 20,000-particle 2D canvas system.

**Reusable Assets for Moshdither:**

- **`src/App.tsx:263-265`** — `usePoseDetection` and `useAudioReactive` hooks.
- **`src/App.tsx:317-331`** — Animation loop with FPS counter using `performance.now()` and `requestAnimationFrame`.
- **HUD component (lines 73-246)** — Floating glassmorphism panels with audio band meters (bass/mid/treble), FPS display, theme selector, toggle controls.
- **Audio analysis** — Web Audio API `AnalyserNode` with `getByteFrequencyData` split into bass/mid/treble/energy bands.

**Integration Path:** The `useAudioReactive` hook and audio band splitting logic can feed into Moshdither's shaders as a new **audio-reactive uniform source**. The HUD pattern is a polished UI reference for Moshdither's overlay controls. The pose detection hook is less relevant unless adding body-tracking effects.

---

### 7. `color-theory-art-builder` (Color Palette & UI)

**Location:** `c:\Users\richk\CascadeProjects\color-theory-art-builder`

**What it is:** A React app for generating color palettes with harmony rules, AI prompt engineering, theme building, and design asset preview.

**Reusable Assets for Moshdither:**

- **`App.tsx:180-257`** — `handleRandomize` function: HSL-based palette generation with warm/cool/standard lighting modes, curve intensity, and locked slot preservation.
- **`components/MagicPalette.tsx`** — Palette generation algorithms (complementary, triadic, tetradic, analogous, split-complementary, monochromatic).
- **`utils.ts`** — `hslToHex`, `hexToHsl`, `getTextColor`, `secureCopy` clipboard helper.
- **UI patterns:** Mac-style dock navigation with `motion.layoutId` spring animations, floating panels with backdrop blur, history sidebar with color strip previews.

**Integration Path:** The palette generation logic can **augment Moshdither's palette source system** (currently limited to K-Means, Median Cut, etc.). Adding "Harmony" palette generation (complementary, triadic) would give users more artistic control. The floating dock UI is a polished reference for Moshdither's toolbar redesign.

---

### 8. `crt-wall-controller` (Massive CRT/Scope Controller)

**Location:** `c:\Users\richk\CascadeProjects\crt-wall-controller`

**What it is:** A very large Electron app (396KB `App.tsx`) for controlling a CRT wall installation via NDI/WebRTC/Scope. Contains extensive preset management, node graph execution, and real-time video routing.

**Reusable Assets for Moshdither:**

- **`src/renderer/App.tsx`** — Despite its size, this contains:
  - NDI module integration (`NDI_MODULE.md` documents 25+ pages of NDI sender/receiver code)
  - Scope CRT wall preset system with JSON serialization
  - Node-graph execution engine for chaining effects
  - WebRTC test page for streaming
- **`NDI_MODULE.md`** — Standalone NDI module documentation that could be extracted for **NDI output** from Moshdither.

**Integration Path:** The NDI integration is the primary asset. Moshdither could send its WebGL canvas output over NDI for use in Resolume, OBS, or other VJ software. The preset JSON serialization pattern is also relevant for Moshdither's project save/load feature.

---

## Tier A+ — Critical Video Processing Value

### 9. `video-converter` (Full-Featured FFmpeg Backend + Electron Frontend)

**Location:** `c:\Users\richk\CascadeProjects\video-converter`

**What it is:** A complete video conversion and editing suite with an Electron React frontend and a Flask/Python backend wrapping `ffmpeg-python`. Features format conversion, metadata extraction, filmstrip thumbnails, audio waveforms, beat detection, auto-editing, and timeline generation.

**Reusable Assets for Moshdither:**

- **`backend/app.py:323-408`** — `get_metadata()` with `ffmpeg.probe()`: extracts duration, resolution, FPS, codec, bitrate, audio channels, sample rate. Includes fallbacks for AI-generated content with missing/wrong metadata.
- **`backend/app.py:421-476`** — Filmstrip thumbnail generator: batch-generates `n` evenly-spaced JPEG thumbnails using `ffmpeg -ss -vframes 1`.
- **`backend/app.py:518-596`** — Waveform visualization: `showwavespic` filter for PNG waveform image + `volumedetect` for mean/max dB stats.
- **`backend/app.py:599-686`** — Beat detection with aubio primary → ffmpeg `silencedetect` fallback → librosa advanced.
- **`backend/app.py:699-1107`** — **Complete video editing pipeline**: trim, rotate, flip, crop, fit/pad, brightness/contrast/saturation (`eq` filter), color filters (`noir`, `sepia`, `cyberpunk`, `warm`, `bleach`), Gaussian blur (`gblur`), unsharp mask, vignette, speed change (`setpts` + `atempo`), fade in/out, watermark overlay with opacity/position, subtitle burn-in, hardware acceleration (`h264_nvenc`, `h264_qsv`, `h264_amf`), and whitelist-sanitized custom FFmpeg args.
- **`backend/audio_engine/analyzer.py:11-175`** — `LibrosaBeatDetector`: onset-snapped beat detection with confidence scores. Uses `librosa.beat.beat_track` + `onset_detect` with configurable snap window.
- **`backend/audio_engine/analyzer.py:196-317`** — `SectionDetector`: energy-based verse/chorus/bridge/outro detection using RMS + scipy median filter.
- **`backend/audio_engine/analyzer.py:334-392`** — `AudioAnalyzer`: combined pipeline returning BPM, beats, sections, dominant section, analysis quality.
- **`backend/timeline_engine/timeline_generator.py:40-198`** — `BeatLockedTimeline`: generates `TimelineEvent` list from beats + sections with chorus aggression, phrase beats, downbeat bias, cooldown, and B-roll injection.
- **`backend/timeline_engine/timeline_generator.py:255-275`** — EDL export for Premiere/Resolve.
- **`backend/ffmpeg_setup.py`** — Auto-downloads FFmpeg if missing.
- **`backend/core/converter.py`** — Abstract `Converter` base class + `FFmpegConverter` + `ImageMagickConverter` with format registry.

**Integration Path:** The backend (`app.py` + `analyzer.py` + `timeline_generator.py`) is a **complete ffmpeg video processing server**. Port the color filter presets (`noir`, `sepia`, `cyberpunk`, `warm`, `bleach`) as new Moshdither effects. Use `LibrosaBeatDetector` and `SectionDetector` to **auto-generate effect intensity keyframes** synced to beats and song sections. The filmstrip + waveform generators can enhance Moshdither's timeline UI. The auto-edit cut-point generator (`/auto-edit/generate`) can inform Moshdither's batch export with music-synced cuts.

---

### 10. `StemSyncVideoEditor` (Beat-Locked Music Video Editor)

**Location:** `c:\Users\richk\CascadeProjects\VideoTools-Reference\StemSyncVideoEditor\StemSyncVideoEditor`

**What it is:** A Gradio + MoviePy + librosa app for automatically editing music videos by syncing cuts to audio beats and song sections.

**Reusable Assets for Moshdither:**

- **`app.py:45-58`** — `analyze_audio()`: librosa RMS energy analysis with silence thresholding.
- **`app.py:77-95`** — `detect_snapped_beats()`: `librosa.beat.beat_track` snapped to `onset_detect` within configurable window (0.02–0.15s).
- **`app.py:100-119`** — `detect_sections()`: RMS energy → verse/chorus classification with `scipy.signal.medfilt`.
- **`app.py:130-148`** — `FreeClipCycler`: B-roll rotation with mirror/reverse transform cycling.
- **`app.py:153-267`** — `generate_timeline()`: energy-matched clip selection, chorus aggression, phrase length, downbeat bias, camera cooldown, B-roll injection.
- **`app.py:325-428`** — `build_video()`: MoviePy assembly with intro/outro, forward/reverse loop for free clips, mirrorX/time_mirror transforms.
- **`app.py:293-320`** — `write_edit_summary()`: JSON cut list export with source/timeline timings.

**Integration Path:** The beat-locked timeline logic is a **direct template** for Moshdither's music-synced effects. The `generate_timeline()` algorithm can auto-generate effect intensity keyframes at beat boundaries. The section-based aggression (more cuts in chorus) maps directly to "increase glitch intensity during chorus, calm during verse." The JSON edit summary format could be Moshdither's project export format.

---

## Tier B — Moderate Reuse Value

### 11. `note-taking-app` (Speech Recognition + TTS)

**Location:** `c:\Users\richk\CascadeProjects\note-taking-app`

**What it is:** A React note-taking app with browser SpeechRecognition API, text-to-speech, calculator, and shadcn/ui components.

**Reusable Assets for Moshdither:**

- **`src/App.tsx:79-183`** — Full SpeechRecognition setup with `webkitSpeechRecognition`, continuous listening, interim results, error handling (not-allowed, audio-capture, language-not-supported), auto-restart on end.
- **`src/App.tsx:443-479`** — TTS voice selector with `speechSynthesis.getVoices()`.

**Integration Path:** Speech recognition could enable **voice commands** for Moshdither (e.g., "add glitch effect", "export as GIF"). TTS could provide accessibility narration. The error handling patterns are robust.

---

### 12. `OmniMedia_App` (Dataset Curation Backend)

**Location:** `c:\Users\richk\CascadeProjects\OmniMedia_App`

**What it is:** A Flask server for AI image dataset curation with YOLO face detection, duplicate checking, and manual review workflow.

**Reusable Assets for Moshdither:**

- **`app.py:41-46`** — MD5 chunk-based file hashing for deduplication.
- **`app.py:76-121`** — YOLO batch inference with confidence thresholding and file routing (pass → staging, fail → trash).
- **`app.py:162-181`** — Manual selection API: move files between dataset/trash based on JSON selections.
- **`app.py:183-191`** — Folder counting endpoint for dashboard stats.

**Integration Path:** The deduplication and batch screening logic can be repurposed for **Moshdither's batch processing** (Improvement #7). The file hashing pattern prevents processing duplicates in a folder of media.

---

### 13. `load_video_frame` (Video Frame Provider)

**Location:** `c:\Users\richk\CascadeProjects\load_video_frame`

**What it is:** A small Python utility for loading video frames.

**Reusable Assets for Moshdither:**

- **`video_frame_provider.py`** — Python frame extraction with OpenCV or similar. Likely contains seek-to-frame logic.

**Integration Path:** Can be integrated into Moshdither's offline render pipeline for more reliable frame-by-frame processing than ffmpeg alone.

---

### 14. `video-frames` (Frame Extraction Scripts)

**Location:** `c:\Users\richk\CascadeProjects\video-frames`

**What it is:** Shell scripts for extracting video frames.

**Reusable Assets for Moshdither:**

- **`scripts/frame.sh`** — `ffmpeg` frame extraction command with timestamp/interval control.

**Integration Path:** Reference for ffmpeg frame extraction parameters in Moshdither's render pipeline.

---

### 15. `ImageSorter` (Web-Based Image Review)

**Location:** `c:\Users\richk\CascadeProjects\ImageSorter`

**What it is:** A Flask + vanilla JS app for sorting images into categories with keyboard shortcuts.

**Reusable Assets for Moshdither:**

- **`app.py`** — Simple Flask static file server with image serving.
- **`index.html`** — Keyboard-driven image review UI (arrow keys to navigate, number keys to categorize).

**Integration Path:** The keyboard-driven review UI pattern could inform Moshdither's **A/B comparison** feature (Improvement #10).

---

### 16. `audiovisual-production-skills` (TouchDesigner/Houdini)

**Location:** `c:\Users\richk\CascadeProjects\audiovisual-production-skills`

**What it is:** A collection of Houdini VEX, TouchDesigner GLSL, and particle system examples.

**Reusable Assets for Moshdither:**

- **`td-glsl/examples/`** — TouchDesigner GLSL snippets for audio-reactive geometry, feedback loops, and displacement.
- **`td-glsl/templates/`** — Starter GLSL templates with standard uniforms.

**Integration Path:** The GLSL examples can be ported to WebGL as new effects. The feedback loop patterns are particularly useful for temporal effects.

---

### 17. `aether-archive` (Archivist UI)

**Location:** `c:\Users\richk\CascadeProjects\aether-archive`

**What it is:** A React app for managing an archive/catalog of media.

**Reusable Assets for Moshdither:**

- **`App.tsx`** — Archivist dashboard with media grid, metadata panels, and search.
- **TypeScript types** — Media file type definitions.

**Integration Path:** The media grid and metadata panel patterns can inform Moshdither's **recent files** and **project browser** UI (Improvement #13).

---

## Tier C — Low/Indirect Value

### 18. `crucible-engine-master` (Python AI Engine)

**Location:** `c:\Users\richk\CascadeProjects\crucible-engine-master`

**What it is:** A massive Python AI orchestration engine with adversarial testing, memory, emotional modeling, and visualization.

**Reusable Assets:**

- **`crucible_engine/visualization/`** — Python-based visualization utilities.
- **`crucible_engine/web/`** — Web interface patterns.

**Verdict:** Overly complex for Moshdither's needs. The visualization module might have charting code for render progress, but not worth the extraction effort.

---

### 19. `AudioNexus-by-cosmic` (Audio Player Electron)

**Location:** `c:\Users\richk\CascadeProjects\AudioNexus-by-cosmic`

**What it is:** An Electron audio player with visualizations.

**Reusable Assets:**

- **`App.tsx`** — Audio player UI with visualizer canvas.
- **`src/index.css`** — Audio visualization styling.

**Verdict:** The visualizer is 2D canvas-based and less sophisticated than `hand-shader-app`. Low priority.

---

### 20. `Dataset-Organization-Tool` (Dataset Manager)

**Location:** `c:\Users\richk\CascadeProjects\Dataset-Organization-Tool`

**What it is:** A full-stack dataset organization tool with SQLite backend and React frontend.

**Reusable Assets:**

- **`backend/`** — Python API for file organization.
- **`frontend/`** — React file browser with metadata.

**Verdict:** More general-purpose than `OmniMedia_App`. Could inform batch processing UI but not critical.

---

## Projects with NO Reusable Value for Moshdither

| Project                              | Why Not Useful                                                |
| ------------------------------------ | ------------------------------------------------------------- |
| `daydream-drawing-pad`               | Empty subdirectories, no code beyond scaffold                 |
| `musubi-tuner`                       | LoRA training for Stable Diffusion, unrelated to video/glitch |
| `ArtAgents`                          | Ollama agent orchestration, no media processing               |
| `phone-control`                      | OpenClaw plugin stub, minimal code                            |
| `canvas`                             | Empty SKILL.md                                                |
| `coding-agent`                       | Empty SKILL.md                                                |
| `ultimate48bitToolReal_v10`          | ComfyUI custom node for 48-bit color, niche                   |
| `_ComfyUI_Extensions`                | ComfyUI node collection, not directly portable                |
| `MilkDrop 3.28`                      | Binary-only Winamp visualizer, no source code                 |
| `Automated Video Subtitle Generator` | Empty MemeCat folder                                          |
| `drawing-pad`                        | Scaffold with no implementation                               |
| `cosmic-transcriber-typo`            | Whisper transcription service, not related                    |
| `Audio_Processing`                   | Empty Audio-Upscaler folder                                   |
| `LoRAForge`                          | LoRA training UI, unrelated                                   |
| `smart-notes-app`                    | Simple notes app, no relevant code                            |
| `Notesapp-electron-starter`          | Minimal electron starter, superseded by `drawing-app`         |
| `notepad-app-multiproject`           | Multiple note app variants, none relevant                     |
| `open-webui-0.4.4`                   | LLM chat UI, massive codebase, no media processing            |
| `neu ai`                             | Java JAR executables, no source                               |
| `img-txt_viewer-main`                | Python image viewer for danbooru tags, niche                  |
| `ContentNexus-AI`                    | Pinokio-based content pipeline, not portable                  |
| `Wispr Flow Pro 1.3.92`              | Cracked software installer                                    |
| `Python_Wheels`                      | Just `.whl` files                                             |
| `neuromancer_build`                  | Audio tapes/metadata, no code                                 |
| `Lorien-main`                        | Nested empty folder                                           |
| `Archivist-main`                     | Nested empty folder                                           |
| `TrentNodes-main`                    | Nested empty folder                                           |
| `DrawThings-1.20251223.0`            | macOS app bundle, no source                                   |
| `devvault-tauri-app`                 | Tauri app scaffold, minimal code                              |
| `crt wall`                           | Just a logger.ts file                                         |
| `deer-flow-main`                     | Nested empty folder                                           |
| `leon-ref`                           | Leon AI assistant, Node.js chatbot                            |
| `instagram-automation`               | Marketing scripts, no code                                    |
| `OmniMedia_Workspace`                | Empty folder structure for datasets                           |
| `Dataset_Organization_Workspace`     | Empty folder structure                                        |
| `bluebubbles`                        | iMessage integration skill, minimal                           |
| `AetherArchivist`                    | Complex Docker-based archivist system, too heavy              |
| `creative-brief`                     | Empty SKILL.md                                                |
| `spotify-player`                     | Empty SKILL.md                                                |
| `instagram-automation`               | Config/prompt folders, no runnable code                       |

---

## Recommended Integration Priority

### Phase 1 — Immediate Wins (Low Risk, High Impact)

1. **Port `hand-shader-app` glitch shader** (minus hand gesture sections) → New Moshdither effect `matrix-glitch`
2. **Port `hand-shader-app` audio-reactive uniforms** → Drive from video audio track (not live mic)
3. **Extract `drawing-app` MediaRecorder** → Replace current canvas recording
4. **Extract `daydream-fluid-studio` logging** → Replace console.log in Electron main

### Phase 2 — Feature Expansion (Medium Effort)

5. **Port Dobryakov fluid sim** → New `fluid-advection` effect layer
6. **Integrate `glsl-playground` shader hot-reload** → Custom user shader injection
7. **Add `color-theory` palette generation** → New palette sources (harmony-based)
8. **Extract `crt-wall-controller` NDI** → Network video output feature
9. **Port `video-converter` color filters** → `noir`, `sepia`, `cyberpunk`, `warm`, `bleach` as new effects
10. **Integrate `video-converter` audio analysis** → `LibrosaBeatDetector` + `SectionDetector` for auto-keyframes

### Phase 3 — Architecture Improvements (High Effort)

11. **Port `drawing-app` layer manager** → Replace effect stack with full layer compositing
12. **Add `OmniMedia_App` batch processing** → Folder-based effect application
13. **Integrate `note-taking-app` speech recognition** → Voice command controls
14. **Add `audio-reactive-body-particles` audio hooks** → Full audio-reactive mode (driven from video audio)
15. **Port `StemSyncVideoEditor` beat-locked timeline** → Music-synced cut points for batch export

---

## File Reference Cheat Sheet

| Asset                   | Source File                                                     | Lines    | Reuse Target                     |
| ----------------------- | --------------------------------------------------------------- | -------- | -------------------------------- |
| Fluid Simulation Class  | `daydream-fluid-studio/renderer/fluid_app.jsx`                  | 76-222   | New effect                       |
| WHIP Streaming          | `daydream-fluid-studio/renderer/fluid_app.jsx`                  | 383-420  | NDI/Syphon output                |
| Electron Logging        | `daydream-fluid-studio/main.js`                                 | 16-187   | `electron/main.ts`               |
| WebGL Context Init      | `WebGL-Fluid-Sim/script.js`                                     | 118-168  | `WebGLCanvas.tsx`                |
| FBO Format Detection    | `WebGL-Fluid-Sim/script.js`                                     | 170-206  | `WebGLCanvas.tsx`                |
| Material/Keyword Shader | `WebGL-Fluid-Sim/script.js`                                     | 351-438  | Shader system                    |
| Bloom Pipeline          | `WebGL-Fluid-Sim/script.js`                                     | 614-724  | Post-processing                  |
| Glitch GLSL             | `hand-shader-app/src/shaders/glitch/GlitchShader.ts`            | 1-147    | New effect (strip hand gestures) |
| Audio GLSL              | `hand-shader-app/src/shaders/audio/AudioShader.ts`              | 1-155    | New effect (strip hand gestures) |
| Layer Manager           | `drawing-app/src/renderer/src/App.tsx`                          | 133-146  | Effect stack                     |
| MediaRecorder           | `drawing-app/src/renderer/src/App.tsx`                          | 404-446  | Toolbar recording                |
| Shader Hot-Reload       | `glsl-playground/src/renderer.js`                               | 423-495  | Custom shaders                   |
| Dual FBO Render         | `glsl-playground/src/renderer.js`                               | 235-313  | WebGL pipeline                   |
| Audio Analysis Hook     | `audio-reactive-body-particles/src/App.tsx`                     | 263-265  | Audio reactivity                 |
| Palette Generation      | `color-theory-art-builder/App.tsx`                              | 180-257  | Palette system                   |
| Speech Recognition      | `note-taking-app/src/App.tsx`                                   | 79-183   | Voice commands                   |
| YOLO Batch Screen       | `OmniMedia_App/app.py`                                          | 76-121   | Batch processing                 |
| MD5 Deduplication       | `OmniMedia_App/app.py`                                          | 41-46    | Batch processing                 |
| NDI Module              | `crt-wall-controller/NDI_MODULE.md`                             | Full doc | Network output                   |
| Video Metadata Probe    | `video-converter/backend/app.py`                                | 323-408  | File info panel                  |
| Filmstrip Thumbnails    | `video-converter/backend/app.py`                                | 421-476  | Timeline scrubber                |
| Waveform Generation     | `video-converter/backend/app.py`                                | 518-596  | Audio visualization              |
| Librosa Beat Detector   | `video-converter/backend/audio_engine/analyzer.py`              | 11-175   | Auto-keyframes                   |
| Section Detector        | `video-converter/backend/audio_engine/analyzer.py`              | 196-317  | Effect intensity by section      |
| Color Filter Pipeline   | `video-converter/backend/app.py`                                | 844-873  | New effects (noir, sepia, etc.)  |
| Beat-Locked Timeline    | `video-converter/backend/timeline_engine/timeline_generator.py` | 40-198   | Music-synced cuts                |
| Stem Timeline Generator | `StemSyncVideoEditor/app.py`                                    | 153-267  | Music-synced edit events         |

---

_End of Report_
