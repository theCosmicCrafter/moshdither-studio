# Mosh Pro Feature Integration & Reference Algorithm Port

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Port Mosh Pro's real-time GPU pipeline (shaders, LUTs, overlays), its runtime tools (FFmpeg, MIDI, Spout), and remaining reference algorithms into moshdither-studio's Tauri v2 + React architecture.

**Architecture:** A WebGL2 real-time preview pipeline lives in the React frontend (GPU-accelerated 60fps), fed by Tauri IPC for media loading and parameter updates. The Rust backend handles file I/O, FFmpeg export, and frame-accurate batch processing. Effect parameters are unified: the same JSON spec drives both the WebGL preview shader uniforms and the Rust export pipeline.

**Tech Stack:** Tauri v2, React 18, TypeScript, WebGL2, Rust (image, rayon, ffmpeg-next), Web MIDI API, Spout SDK (via Rust FFI), zustand, Tailwind CSS.

---

## Executive Summary

### What's Already Built (Don't Rebuild)
- Tauri v2 app shell with React + Tailwind
- Rust effect engine: 40+ effects across 8 categories
- Effect stack with mask support
- SAM3 segmentation
- Undo/redo, command palette, keyboard shortcuts
- Auto-save, crash recovery, settings persistence
- FFmpeg integration (Rust backend)

### What Mosh Pro Adds (Port These)
1. **80 WebGL shaders** — real-time preview (dither, LUT, VHS, scanlines, chromatic aberration, noise, grain, etc.)
2. **15 PNG LUTs** — Instagram-style color grading lookup tables
3. **3 MP4 overlays** — film damage loops (burn, dust, VHS static)
4. **FFmpeg binaries** — bundled for guaranteed codec support
5. **MIDI controller** — hardware parameter binding
6. **Spout GPU sharing** — real-time output to Resolume/OBS

### What References Add (Audit & Port)
- Datamosh algorithms not yet in Rust backend (motion transfer variants, cross-video, profile-based)
- Glitch techniques (databend variants, JPEG quantize tables)
- Dither algorithms (some already in Rust — verify coverage)

---

## Phase Structure

| Phase | Focus | Est. Time |
|-------|-------|-----------|
| 1 | WebGL2 Preview Pipeline | 2-3 days |
| 2 | Port Mosh Pro Shaders | 3-4 days |
| 3 | LUT & Overlay System | 2 days |
| 4 | MIDI Controller Support | 1-2 days |
| 5 | Spout Real-Time Output | 2-3 days |
| 6 | FFmpeg Binary Bundling | 1 day |
| 7 | Reference Algorithm Audit & Port | 3-4 days |
| 8 | Integration & Polish | 2-3 days |

---

## Phase 1: WebGL2 Real-Time Preview Pipeline

**Goal:** Replace the current <img>-based preview with a WebGL2 canvas that can chain effects at 60fps via ping-pong FBOs.

### Task 1.1: WebGL2 Context Manager

**Files:**
- Create: src/engine/webgl2/WebGLContext.ts
- Create: src/engine/webgl2/types.ts
- Create: src/engine/webgl2/FullscreenQuad.ts
- Create: src/engine/webgl2/EffectChain.ts
- Create: src/engine/webgl2/MediaUploader.ts

**Deliverables:**
1. WebGLContext class wrapping canvas creation, shader compilation, program linking, texture/FBO management
2. FullscreenQuad VAO for rendering full-screen passes
3. EffectChain class managing ping-pong FBO texture pairs for multi-pass rendering
4. MediaUploader class for loading images/videos into GPU textures
5. Type definitions: EffectShader, UniformDef, RenderPass

**Key code pattern:**
`	ypescript
// Ping-pong FBO swap
let inputTex = sourceTexture;
for (const pass of passes) {
  const program = ctx.getOrCreateProgram(pass.shaderId, vert, frag);
  gl.useProgram(program);
  gl.activeTexture(gl.TEXTURE0);
  gl.bindTexture(gl.TEXTURE_2D, inputTex);
  gl.uniform1i(gl.getUniformLocation(program, 'tDiffuse'), 0);
  // ... set uniforms
  gl.bindFramebuffer(gl.FRAMEBUFFER, currentFB);
  quad.draw();
  inputTex = currentFBTexture; // output becomes next input
}
`

**Commit:** eat: add WebGL2 preview pipeline with ping-pong FBOs

### Task 1.2: PreviewViewport Canvas Integration

**Files:**
- Modify: src/components/PreviewViewport.tsx

**Deliverables:**
1. Replace <img> with <canvas ref={canvasRef}>
2. Instantiate WebGLContext on mount, destroy on unmount
3. Connect to zustand store: listen for ctiveEffects changes, rebuild render pass list
4. Resize observer handling devicePixelRatio (max 2x)
5. Render loop: equestAnimationFrame driven, only when isPlaying or 
eedsUpdate

**Commit:** eat: wire WebGL2 preview into PreviewViewport

---

## Phase 3: LUT & Video Overlay System

**Goal:** Load Mosh Pro's 15 PNG LUTs and 3 MP4 overlays, sample them in shaders.

### Task 3.1: LUT Asset Pipeline

**Files:**
- Create: src/components/LUTPanel.tsx
- Create: src/engine/lut/loader.ts
- Modify: src/store/ (add lut state)

**Deliverables:**
1. Copy Mosh Pro LUTs to public/lut/:
   - matorka.png, rannan.png, arlybird.png, tikate.png, gotham.png, hefe.png, inkwell.png, kelvin.png, lofi.png, 
ashville.png, sutro.png, 	oaster.png, walden.png, xpro.png
2. LUTLoader class: loads PNG, creates WebGL texture, validates dimensions (must be 512x512 or 1024x1024)
3. LUTPanel UI component: grid of thumbnails, click to apply, mount slider (0-100%)
4. Zustand slice: ctiveLUT: { name: string, texture: WebGLTexture, amount: number } | null

**Commit:** eat: add LUT color grading system with Mosh Pro presets

### Task 3.2: Video Overlay Compositing

**Files:**
- Create: src/engine/overlays/OverlayManager.ts
- Create: src/components/OverlayPanel.tsx
- Create: public/overlays/ (copy MP4s)

**Deliverables:**
1. Copy Mosh Pro overlays to public/overlays/:
   - urn.mp4 (film burn light leak)
   - dust.mp4 (film dust/scratches)
   - hs-static.mp4 (VHS noise/static)
2. OverlayManager: loads <video> elements, creates WebGL textures, updates per-frame
3. Blend mode system: Normal, Screen, Multiply, Overlay, Lighten, ColorDodge (index-based uniform)
4. OverlayPanel: list overlays, blend mode dropdown, opacity slider, loop toggle
5. Shader integration: overlayBlend.ts samples 	Overlay with blend mode math

**Commit:** eat: add video overlay compositing with blend modes

---

## Phase 5: Spout Real-Time GPU Output

**Goal:** Pipe the WebGL preview texture directly to Spout receivers (Resolume, OBS, TouchDesigner).

### Task 5.1: Spout Integration Research & Design

**Architecture decision:** Spout requires shared GPU textures (DirectX/OpenGL interop on Windows). Three approaches:

| Approach | Complexity | Performance | Notes |
|----------|-----------|-------------|-------|
| A. Pure frontend WebGL → readback → Spout | Low | Poor (CPU readback kills 60fps) | Don't do this |
| B. Tauri Rust backend with wgpu → Spout native | High | Excellent | Best long-term |
| C. Hybrid: WebGL FBO → glReadPixels → Rust → Spout | Medium | Good | Pragmatic first step |

**Recommended: Approach C (Pragmatic) → migrate to B later.**

**Files:**
- Create: src-tauri/src/spout/mod.rs
- Create: src-tauri/src/spout/texture_sender.rs
- Create: src/components/SpoutPanel.tsx
- Modify: src-tauri/Cargo.toml (add dependencies)

**Deliverables:**
1. Rust Spout sender using spout_rust crate or FFI to Spout SDK
2. IPC command: mit_spout_frame(width, height, rgba_bytes) from frontend
3. SpoutPanel UI: on/off toggle, sender name input, FPS counter, connected receivers list
4. Frame readback: WebGL eadPixels → Uint8Array → Tauri IPC → Rust → Spout send
5. Optimization: readback only every Nth frame (e.g., 30fps output for 60fps preview)

**Cargo.toml additions:**
`	oml
[dependencies]
# Option 1: pure Rust (if available)
# spout = "0.1"
# Option 2: FFI to Spout SDK
libloading = "0.8"
`

**Commit:** eat: add Spout real-time GPU output

---

## Phase 6: FFmpeg Binary Bundling

**Goal:** Ship FFmpeg/FFprobe binaries with the app so export works out-of-the-box.

### Task 6.1: Bundle FFmpeg Binaries

**Files:**
- Create: src-tauri/bin/ffmpeg.exe (copy from Mosh Pro)
- Create: src-tauri/bin/ffprobe.exe (copy from Mosh Pro)
- Modify: src-tauri/tauri.conf.json (add externalBin)
- Modify: src-tauri/src/ffmpeg/mod.rs

**Deliverables:**
1. Copy fmpeg.exe and fprobe.exe from Mosh Pro extracted app to src-tauri/bin/
2. Configure 	auri.conf.json:
   `json
   {
     "bundle": {
       "externalBin": [
         "bin/ffmpeg",
         "bin/ffprobe"
       ]
     }
   }
   `
3. Update Rust FFmpeg wrapper to use bundled path:
   `ust
   use std::path::PathBuf;
   use tauri::api::path::resource_dir;

   pub fn ffmpeg_path(app_handle: &tauri::AppHandle) -> PathBuf {
       let resource_dir = resource_dir(app_handle).expect("resource dir");
       resource_dir.join("bin").join("ffmpeg.exe")
   }
   `
4. Verify: fmpeg -version runs successfully from bundled path on clean machine
5. Update export pipeline to use bundled FFmpeg instead of system PATH

**Commit:** eat: bundle FFmpeg/FFprobe binaries for guaranteed export

---

## Phase 7: Reference Algorithm Audit & Port

**Goal:** Audit 37 reference projects, port missing algorithms to Rust backend.

### Task 7.1: Algorithm Coverage Audit

**Files:**
- Create: docs/references/AUDIT_REPORT.md

**Deliverables:**
1. Matrix: Reference project × Effect category × Already in Rust? × Port priority
2. Focus on categories with gaps:

| Category | In Rust Now | References Add | Priority |
|----------|-------------|----------------|--------|
| I-frame removal | Yes | P-frame motion, B-frame bidirectional | High |
| Motion transfer | Yes | Fluid motion, average macroblock | Medium |
| Frame repeat | Yes | Echo, buffer, delay variants | Medium |
| Frame shuffle | Yes | Random order, jiggle, overlap | Medium |
| Slice shift | Yes | Random slice, mirror slice | Low |
| Byte flip | Yes | Word-level, dword-level | Low |
| Databend | Yes | Channel-specific, bit-depth | Medium |
| JPEG quantize | Yes | Table swap, AC/DC manipulation | Medium |
| Dithering | 11 algorithms | Didder (error diffusion variants) | Low |
| Pixel sort | Yes | Threshold-angle variants | Low |
| Datamosh profiles | No | Glitch, bloom, smear, extreme, rainbow | High |
| Cross-video mosh | No | Combine, segmented random | Medium |
| Live datamosh | No | WebCodecs frame drop, corrupt, inject | High |

3. Deduplicate: don't port what's already covered by existing Rust effects
4. Flag: datamosh-js and datamoshlive have live WebCodecs approaches — these go to Phase 8

**Commit:** docs: add reference algorithm coverage audit

### Task 7.2: Port Missing Datamosh Algorithms

**Files:**
- Create: src-tauri/src/effects/datamoshing/profiles.rs
- Create: src-tauri/src/effects/datamoshing/cross_video.rs
- Create: src-tauri/src/effects/datamoshing/live_codec.rs
- Modify: src-tauri/src/effects/registry.rs

**Deliverables:**
1. **Profile-based datamosh** (profiles.rs): 5 presets (glitch, bloom, smear, extreme, rainbow) that set combinations of existing parameters
2. **Cross-video datamosh** (cross_video.rs): Interleave macroblock motion vectors between two input videos
3. **Live codec manipulation** (live_codec.rs): WebCodecs-based frame dropping, corruption, injection — Tauri command wrapper
4. Register all new effects in egistry.rs

**Commit:** eat: port missing reference datamosh algorithms

---

## Phase 8: Integration & Polish

**Goal:** Wire all new systems together, ensure preview matches export, add presets, ship.

### Task 8.1: Preview-Export Parity

**Files:**
- Modify: src-tauri/src/effects/engine.rs
- Modify: src/engine/webgl2/EffectChain.ts
- Create: src/utils/effectConverter.ts

**Deliverables:**
1. ffectConverter.ts: converts zustand ctiveEffects state → WebGL RenderPass[] for preview AND → Rust EffectStack for export
2. Ensure parameter IDs match between WebGL uniforms and Rust ParameterValues
3. For effects that can't run in WebGL (complex datamosh), show "Preview not available" badge + still render downstream effects
4. Export pipeline: if preview is WebGL-accurate, skip Rust re-render for those effects

**Commit:** eat: ensure preview-export parity for WebGL effects

### Task 8.2: Preset System

**Files:**
- Create: src/utils/presets.ts
- Create: src/components/PresetPanel.tsx
- Modify: src/store/ (add preset state)

**Deliverables:**
1. Ship 5 built-in presets inspired by Mosh Pro + references:
   - "Retro VHS": scanlines + chromatic aberration + VHS noise + LUT (xpro)
   - "Cyberpunk Glitch": rgb shift + databend + pixel sort + bloom
   - "Film Damage": overlay (dust) + overlay (burn) + grain + LUT (hefe)
   - "Pixel Art Dither": pixelate + bayer dither + posterize + sharp
   - "Datamosh Extreme": I-frame removal + motion transfer + smear profile
2. User can save current effect stack as named preset
3. Presets persisted to localStorage, exportable/importable as JSON

**Commit:** eat: add effect preset system with built-in looks

### Task 8.3: Performance Optimization

**Files:**
- Modify: src/engine/webgl2/WebGLContext.ts
- Modify: src/engine/webgl2/EffectChain.ts

**Deliverables:**
1. Shader compilation cache: Map<string, WebGLProgram> — never recompile same shader
2. Texture resize guard: don't recreate textures if dimensions unchanged
3. Lazy FBO creation: only create when first effect needs it
4. Parameter debounce: 150ms on sliders before GPU update
5. Effect bypass: if mount === 0, skip the pass entirely (no-op optimization)

**Commit:** perf: add shader cache and render pass optimization

### Task 8.4: Final QA Checklist

**Verification:**
`ash
# Type check
cd packages/desktop-gui && npx tsc --noEmit

# Unit tests
cd packages/desktop-gui && npx vitest run

# Rust tests
cd src-tauri && cargo test

# Dev build
cd packages/desktop-gui && npm run dev

# Production build
cd src-tauri && cargo tauri build
`

**Manual QA:**
- [ ] Load image → apply LUT → preview updates in < 16ms
- [ ] Load video → play → WebGL preview at 30fps+ at 1080p
- [ ] Add 5 effects to stack → reorder → preview updates correctly
- [ ] Export → FFmpeg runs with bundled binary → output matches preview
- [ ] MIDI knob wiggle → parameter updates in real-time
- [ ] Spout enabled → OBS/Resolume receives stream
- [ ] All 5 presets load and render correctly

**Commit:** chore: final QA and performance pass

---

## Risk Mitigation

| Risk | Mitigation |
|------|------------|
| WebGL2 not supported on some GPUs | Graceful fallback to Canvas 2D or Rust preview |
| Spout SDK licensing/complexity | Start with Approach C (readback), upgrade later |
| FFmpeg binary size | Only bundle Windows x64 binaries; other platforms download on first use |
| MIDI API not supported (Firefox) | Feature-gate MIDI panel; show "Chrome/Edge required" message |
| Shader compilation errors | Validate GLSL at build time with glslangValidator |
| Preview-export mismatch | Strict parameter ID mapping; test suite comparing preview vs export |

---

## Appendix A: Mosh Pro Asset Inventory

| Asset | Location in Extracted App | Destination in MoshDither |
|-------|---------------------------|----------------------------|
| 15 LUT PNGs | pp/res/lut/*.png | public/lut/ |
| 3 overlay MP4s | pp/res/video/*.mp4 | public/overlays/ |
| 5 fonts | pp/res/fonts/*.ttf | public/fonts/ (optional) |
| 1 audio MP3 | pp/res/mp3/done.mp3 | public/audio/ (optional) |
| FFmpeg binary | pp/resources/bin/ffmpeg.exe | src-tauri/bin/ |
| FFprobe binary | pp/resources/bin/ffprobe.exe | src-tauri/bin/ |
| 80 GLSL shaders | Inline in js/app.bd92b5ed.js | src/engine/shaders/*.ts |

---

## Appendix B: Reference Projects to Port (Priority Order)

| Project | Language | What to Port | Priority |
|---------|----------|--------------|----------|
| datamoshlive | JS | WebCodecs live frame drop/corrupt/inject | High |
| pymosh | Python | Motion vector manipulation patterns | Medium |
| supermosh | JS/TS | Web-based datamosh UI patterns | Low (UI only) |
| didder | Rust? | Additional dither algorithms | Low |
| ditherista | C++ | GPU dither compute approaches | Medium |
| 	ransflow | Python | Optical flow-based mosh | Low (optical flow already exists) |
| itrot | Rust/TS | Additional glitch byte patterns | Low |
| glitch-studio | JS | UI patterns for effect layering | Low |

---
