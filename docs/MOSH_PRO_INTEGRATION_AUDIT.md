# Mosh Pro Integration Audit

> Date: 2026-06-17
> Scope: Map Mosh Pro `references/` features to `moshdither-studio` implementation status

## ✅ Completed Features

### Phase 1: WebGL2 Real-Time Preview Pipeline
| Feature | Files | Status |
|---------|-------|--------|
| WebGL2 context manager | `src/engine/webgl2/WebGLContext.ts` | ✅ |
| Ping-pong FBO rendering | `src/engine/webgl2/EffectChain.ts` | ✅ |
| Fullscreen quad VAO | `src/engine/webgl2/FullscreenQuad.ts` | ✅ |
| Media uploader (img/video → texture) | `src/engine/webgl2/MediaUploader.ts` | ✅ |
| PreviewViewport canvas integration | `src/components/PreviewViewport.tsx` | ✅ |
| SAM3 coordinate mapping on canvas | `src/components/PreviewViewport.tsx` | ✅ |

### Phase 2: Shader Registry & Effects
| Shader | File | Status |
|--------|------|--------|
| Pass-through | `src/engine/shaders/passThrough.ts` | ✅ |
| LUT Color Grading | `src/engine/shaders/lutColorGrading.ts` | ✅ |
| Dither / Halftone | `src/engine/shaders/ditherHalftone.ts` | ✅ |
| Noise / Grain | `src/engine/shaders/noiseGrain.ts` | ✅ |
| VHS / CRT | `src/engine/shaders/vhsCrt.ts` | ✅ |
| Scanlines | `src/engine/shaders/scanlines.ts` | ✅ |
| Chromatic Aberration | `src/engine/shaders/chromaticAberration.ts` | ✅ |
| Pixelate | `src/engine/shaders/pixelate.ts` | ✅ |
| Posterize | `src/engine/shaders/posterize.ts` | ✅ |
| Hue / Saturation | `src/engine/shaders/hueSaturation.ts` | ✅ |
| RGB Shift | `src/engine/shaders/rgbShift.ts` | ✅ |
| Invert | `src/engine/shaders/invert.ts` | ✅ |

### Phase 3: Asset Pipeline
| Asset | Source | Destination | Status |
|-------|--------|-------------|--------|
| 15 LUT PNGs | Mosh Pro `source/res/lut/` | `public/lut/` | ✅ |
| 3 Video Overlays | Mosh Pro `source/res/video/` | `public/overlays/` | ✅ |
| LUT Loader + caching | `src/engine/lut/loader.ts` | — | ✅ |
| Overlay Manager | `src/engine/overlays/OverlayManager.ts` | — | ✅ |

### Phase 4-6: Infrastructure
| Feature | Status |
|---------|--------|
| FFmpeg / FFprobe binary bundling | ✅ |
| MIDI Controller support (Web MIDI API) | ✅ |
| Spout GPU sharing stub (Rust + frontend) | ✅ |

### Phase 7: Presets & Performance
| Feature | Status |
|---------|--------|
| 5 built-in effect presets | ✅ |
| Custom preset save/load/import/export | ✅ |
| Debounce hook for slider inputs | ✅ |
| Effect bypass optimization (amount=0) | ✅ |
| Preview-Export parity converter | ✅ |

## 🔄 Remaining Work

### High Priority
1. **Effect Parameter UI Panels** — Need React components for each shader's uniform sliders (amount, scale, hue, etc.)
2. **Effect Chain Integration** — Wire `PreviewViewport` to actually use `EffectChain` with active effects from zustand store
3. **Rust IPC Commands for WebGL Effects** — Add Tauri commands so `effectConverter.ts` can send effect stacks to Rust backend
4. **LUT Panel UI** — Dropdown to select from 15 presets, load into WebGL `tLUT` uniform
5. **Overlay Panel UI** — Select overlay video, blend mode, opacity controls

### Medium Priority
6. **Spout FFI Binding** — Link Spout2.dll, implement `send_texture()` with GL/D3D interop
7. **MIDI Learn Mode** — UI button to capture incoming CC and assign to active parameter
8. **Shader Hot-Reload** — Watch filesystem for shader edits during development
9. **Export Pipeline** — Wire `toRustEffectStack()` to actual `apply_effect_stack` Tauri command
10. **Cross-Video Effects** — Port Mosh Pro's cross-video datamoshing (I-frame removal + motion transfer)

### Low Priority / Future
11. **Scope / TouchDesigner Bridge** — Alternative to Spout for macOS/Linux
12. **Audio-Reactive Shaders** — Beat detection → uniform modulation
13. **AI Upscaling Integration** — Real-time ESRGAN/Real-ESRGAN in WebGL
14. **NDI Output** — Cross-platform video output (Windows/macOS/Linux)

## Architecture Decisions

- **No direct Mosh Pro code reuse** — All shaders rewritten from scratch with WebGL2 GLSL
- **LUT format**: 512×512 flat PNG (64³ cube, 8×8 tile grid) — matches Mosh Pro convention
- **Overlay format**: MP4 looped via `<video>` element, uploaded to GPU texture per frame
- **Effect chain**: Ping-pong FBOs, each shader is a render pass with `tDiffuse` input
- **MIDI**: CC values 0-127 scaled per-parameter, persisted to `localStorage`
- **FFmpeg**: Bundled as `externalBin` in Tauri, resolves via `current_exe()` parent dir
- **Spout**: Stub architecture documented in `src-tauri/src/spout/mod.rs`, awaits FFI binding

## Test Matrix

| Test | Command | Status |
|------|---------|--------|
| Frontend build | `npm run build` | ✅ Pass |
| Rust check | `cargo check` | ✅ Pass |
| TypeScript check | `tsc --noEmit` | ✅ Pass (via build) |
| WebGL engine unit tests | — | ⏳ Pending |
| Rust effect tests | `cargo test` | ⏳ Pending |
| Manual QA (load media, apply shader) | — | ⏳ Pending |
