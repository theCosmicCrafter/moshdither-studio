---
type: devlog
status: complete
session_start: "2026-07-19 06:00"
session_end: "2026-07-19 08:30"
phase: "Semantic correctness + resource allocation hardening"
subphase: null
approval: pending
summary: "Verified that effect algorithms match their names, fixed broken LUT export, hardened SAM3 lifecycle and resource allocation, and added algorithm-truth Rust tests."
note_created: "2026-07-19"
updated: "2026-07-19"
---

# 2026-07-19 — Semantic verification and resource-allocation hardening

## Goal

Move beyond "does it crash" verification and confirm each feature behaves the way the algorithm name implies; fix mislabelled/approximate implementations; harden SAM3 startup and resource allocation; and lock the corrections in with semantic unit tests.

## Audit scope

- **SAM3 lifecycle:** startup lag, lazy loading, model-load errors, idle shutdown, process cleanup.
- **LUT / color grading:** bundled LUT loading, frontend ↔ backend parameter parity, export accuracy.
- **Effect semantic truth:** pixel sort, Bayer, blue noise, Riemersma, JPEG quantize, lift/gamma/gain, fractal noise, halftone.
- **Resource allocation:** preview frame budget, effect cache budget, SAM3 shutdown on app close, no eager model load.

## Work Done

### SAM3 / resource allocation

- Removed eager `sam3Init()` call from `src/components/AppLayout.tsx`. SAM3 now initializes lazily via `MaskPanel.ensureSam3Ready()` on first use, eliminating the ~6 GB / ~10–30 s app-startup penalty.
- Registered a Tauri `CloseRequested` window event handler in `src-tauri/src/lib.rs` that explicitly shuts down the SAM3 child process when the user closes the app, preventing RAM/VRAM leakage.
- The existing 5-minute idle shutdown (`useSam3IdleShutdown`) and `Sam3Engine` `Drop` implementation are still in place.

### LUT color grading

- Fixed the broken LUT export pipeline. The frontend was sending `tLUT` for the preview shader but the Rust backend expected `lut_path`; `color.lut_grading` now accepts both keys and resolves paths in dev and production.
- Added `locate_lut_file()` helper that searches the absolute path, `public/lut/`, the executable directory, and `resources/lut/` so bundled LUTs resolve everywhere.
- Bundled `../public/lut` into the Tauri resource output via `tauri.conf.json` `bundle.resources`.
- `src/utils/effectConverter.ts` now maps `tLUT` to the WebGL `tLUT` sampler2D uniform and preserves string values (instead of coercing them to `Number`).
- `src/store/index.ts` `addLUTEffect()` now writes both `tLUT` (WebGL preview) and `lut_path` (Rust export) to the stack entry.
- `lut_grading.rs` now loads the LUT once per video segment instead of once per frame and returns a clear error if a selected LUT file is missing (instead of silently returning the input).

### Effect algorithm fixes

- `color/lift_gamma_gain.rs` and `src/engine/shaders/liftGammaGain.ts` now use the canonical lift/gamma/gain formula:
  `out = ((in + lift * (1 - in)) * (1 + gain)) ^ (1 / gamma)`.
  Lift raises shadows while preserving whites, gain scales linearly, and gamma bends midtones.
- `glitch/jpeg_quantize.rs` replaced integer-division fake quantization with a real 8×8 DCT pipeline:
  - RGB → YCbCr (BT.601)
  - Forward DCT per 8×8 block
  - Quantization with standard JPEG luminance/chrominance matrices scaled by the libjpeg quality formula
  - Inverse DCT and YCbCr → RGB
- `dithering/blue_noise.rs` replaced smoothed white noise with a true void-and-cluster generated 64×64 blue-noise threshold matrix, deterministic and reused for every frame.
- `dithering/riemersma.rs` replaced a single error variable with the canonical exponentially-decaying error history along the Hilbert curve.
- `noise/fractal.rs` replaced hash noise with smooth 2D value noise using bilinear smoothstep interpolation for genuine FBM-style multi-octave output.
- `dithering/halftone.rs` added a `screen_angle` parameter and rotates the dot grid, producing real halftone screen behavior.

### Semantic verification tests

Added `src-tauri/src/effects/semantic_tests.rs` (test-only module) with algorithm-truth assertions:

- Invert is involutive.
- Brightness/contrast/gamma/saturation neutral on gray leaves the image unchanged.
- Lift/gamma/gain neutral leaves the image unchanged; lift on a single channel raises only that channel's shadows.
- Pixel sort (threshold 0) on descending rows produces monotonically non-decreasing rows.
- JPEG quality 100 DCT round-trip is near-lossless; quality 1 produces DC-dominated 8×8 blocks.
- Bayer dither output is binary.
- Blue noise on 50% gray produces ~50% white pixels.
- Halftone darker input produces larger/more black dots; screen angle parameter is accepted.
- Identity LUT reconstructs the input; bundled LUT loads and modifies colors.
- Fractal noise is spatially smooth (low adjacent-pixel variance).
- Riemersma dither distributes error to produce both tones and preserves average brightness.

## Verification

- `cargo clippy --all-targets --all-features -- -D warnings` PASS
- `cargo test --lib` PASS (433/433)
- `cargo fmt -- --check` PASS
- `cargo audit` PASS (0 vulnerabilities; 18 unmaintained-crate warnings)
- `npm audit` PASS (0 vulnerabilities)
- `npm run lint` PASS (0 warnings)
- `npx tsc --noEmit` PASS
- `npm run test` PASS (1017/1017)
- `mosh-verify verify-all` PASS (98/98)

## Findings

- SAM3 was eagerly loaded at app startup, blocking launch for users who never open the mask panel.
- LUT export was completely broken: `tLUT` from the frontend never reached the Rust backend.
- `Lift / Gamma / Gain` had the wrong formula order and lift applied globally instead of to shadows.
- `JPEG Quantize` was just integer division, not DCT quantization.
- `Blue Noise` was white noise with box smoothing, not void-and-cluster.
- `Riemersma` used a single error term instead of the exponential history.
- `Fractal Noise` used hash noise with no interpolation.
- `Halftone` had no screen angle and inverted dot logic (larger dots on light input).

## Follow-ups

- Add `.cube` LUT parser for the Rust backend so custom `.cube` files work in export, not just PNG LUTs.
- Add a custom LUT file picker to `LUTPanel`.
- Validate the CGA vs EGA palette entries in `historical_palettes.rs`.
- Correct `analog.vhs` to include chroma delay/bleed, head-switching noise, and luma noise modeling.
- Replace whole-segment video decode with streaming/chunked decode for long 4K exports.
- Add a binary IPC seam for preview frames to remove base64 overhead.
