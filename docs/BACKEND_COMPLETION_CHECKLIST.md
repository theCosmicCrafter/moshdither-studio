# Backend Completion Master Checklist

## Category A: Rust Effects Needing WebGL Shaders (Preview)

### Analog (2 remaining)

- [x] `analog.ghosting` -> `ghosting` shader
- [x] `analog.scan_drift` -> `scan_drift` shader

### Artistic (1 remaining)

- [x] `artistic.vaporwave` -> `vaporwave` shader

### Dithering (10 remaining)

- [x] `dithering.atkinson` -> `atkinson_dither` shader
- [x] `dithering.blue_noise` -> `blue_noise_dither` shader
- [x] `dithering.burkes` -> `burkes_dither` shader
- [x] `dithering.floyd_steinberg` -> `floyd_steinberg_dither` shader
- [x] `dithering.jarvis_judice_ninke` -> `jarvis_dither` shader
- [x] `dithering.random_noise` -> `random_dither` shader
- [x] `dithering.riemersma` -> `riemersma_dither` shader
- [x] `dithering.sierra` -> `sierra_dither` shader
- [x] `dithering.stucki` -> `stucki_dither` shader
- [x] `dithering.threshold` -> `threshold_dither` shader

### Glitch (7 remaining)

- [x] `glitch.byte_flip` -> `byte_flip` shader
- [x] `glitch.byte_insert` -> `byte_insert` shader
- [x] `glitch.byte_reverse` -> `byte_reverse` shader
- [x] `glitch.byte_zero` -> `byte_zero` shader
- [x] `glitch.databend` -> `databend` shader
- [x] `glitch.jpeg_quantize` -> `jpeg_quantize` shader
- [x] `glitch.slice_shift` -> `slice_shift` shader

### Noise (1 remaining)

- [x] `noise.fractal` -> `fractal_noise` shader

### Pixel Geometry (3 remaining)

- [x] `pixel_geo.anaglyph` -> `anaglyph` shader
- [x] `pixel_geo.block_shift` -> `block_shift` shader
- [x] `pixel_geo.pixel_sort` -> `pixel_sort` shader

## Category B: WebGL Shaders Needing Rust CPU Effects (Export)

- [x] `lutColorGrading` -> Rust `color.lut_grading` effect
- [x] `ditherHalftone` -> Rust `dithering.halftone` effect
- [x] `invert` -> Rust `color.invert` effect

## Category C: LUT Pipeline Backend

- [x] Rust CPU LUT color grading effect (`color.lut_grading`)
- [x] LUT PNG assets already in `public/lut/` (15 presets)
- [x] LUT loader (`src/engine/lut/loader.ts`) exists
- [x] Need: LUT effect in Rust registry with 3D texture sampling or CPU cube interpolation

## Category D: Overlay Pipeline Backend

- [x] Rust CPU overlay compositing effect (`composite.overlay`)
- [x] Overlay video assets already in `public/overlays/` (3 presets)
- [x] Overlay manager (`src/engine/overlays/OverlayManager.ts`) exists for WebGL preview
- [x] Need: Per-frame overlay compositing in Rust export (video blending)

## Category E: Advanced/Temporal (No WebGL preview possible)

- [x] All 8 datamoshing effects work in Rust export via `process_video`
- [ ] WebGL preview not feasible (requires GOP-level video manipulation)

## Category F: Asset Verification

- [x] 15 LUT PNGs present
- [x] 3 overlay MP4s present
- [x] FFmpeg sidecar configured in `tauri.conf.json`
- [x] Spout stub present
- [x] MIDI controller present

## Category G: Engine Infrastructure

- [x] WebGL2 context manager
- [x] EffectChain ping-pong FBO rendering
- [x] Fullscreen quad VAO
- [x] Media uploader
- [x] Shader registry
- [x] LUT loader + cache
- [x] Overlay manager + video texture upload
- [x] FFmpeg decode/encode/probe
- [x] Effect registry (53 Rust effects)
- [x] export_video command (process_video-based)
- [x] Mask post-process blending in export
- [x] PreviewViewport WebGL integration
- [x] EffectConverter mappings
