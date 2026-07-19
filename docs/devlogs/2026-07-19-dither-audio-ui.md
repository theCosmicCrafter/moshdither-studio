---
type: devlog
status: complete
session_start: "2026-07-19 00:15"
session_end: "2026-07-19 02:30"
phase: "Dither effects hardening + Audio Dither parity + UI filename fix"
subphase: null
approval: pending
summary: "Fixed dither effects to use luminance-based grayscale output, aligned Audio Reactive Dither with the WebGL preview, fixed Timeline/AudioPanel audio file-name display, and researched Vercel Labs Native SDK."
note_created: "2026-07-19"
updated: "2026-07-19"
---

# 2026-07-19 — Dither fixes, Audio Dither parity, audio filename display

## Goal
Fix dither effects producing color/per-channel artifacts, align Audio Reactive Dither with the WebGL preview, clean up audio file-name display, and evaluate Vercel Labs Native SDK for current/future use.

## Work Done

### Dithering backend (Rust)
- Added `src-tauri/src/effects/dithering/error_diffusion.rs` shared helper.
- Converted Floyd-Steinberg, Atkinson, Burkes, Sierra, Stucki, Jarvis-Judice-Ninke, Riemersma, `error_diffusion_variants`, and `ordered_dither_variants` from per-channel RGB thresholding to luminance-based grayscale error diffusion.
- Fixed `custom_matrix` ordered dither producing solid white output.
- Fixed `random_noise` dither producing washed-out saturated noise; now uses signed random-threshold dither on luminance.
- Fixed `bayer` `matrix_size` parameter being treated as an index into `[2,4,8,16]` instead of the actual size.
- All dither effects verified with `cargo test` (408/408), `cargo clippy`, and `mosh-verify verify-all --filter dither` (20/20).

### Audio Reactive Dither parity
- Renamed Rust parameter `palette_size` → `levels` and effect name to "Audio Reactive Dither".
- Updated `process_frame` to luminance-based ordered dither with audio-modulated threshold.
- Updated `src/engine/shaders/audioReactiveDither.ts` to use `u_threshold`, `u_intensity`, `u_levels`, `u_bass`.
- Fixed `src/utils/effectConverter.ts` mapping and transform so `base_threshold`, `modulation`, and `levels` map correctly. The old transform was checking `_k === "u_levels"` when `_k` is actually the Rust parameter name, sending wrong values to the shader.
- Verified `cargo test` and `npx vitest run` / `npm run lint` / `npx tsc --noEmit`.

### Audio filename display
- Added `src/utils/fileName.ts` `getFileName()` helper.
- Updated `src/components/Timeline/index.tsx` and `src/components/AudioPanel/index.tsx` to display basename while keeping full path in `title` tooltip.
- Added `Timeline.test.tsx` regression test for full Windows paths.
- Verified `npx vitest run src/components/__tests__/Timeline.test.tsx` (28/28) and full `npm run test` (1017/1017).

### Vercel Labs Native SDK research
- Reviewed `vercel-labs/native` repo and docs (`native-sdk.dev`).
- Conclusion: not a migration target for MoshDither today (Tauri is mature; Native SDK is v0.5.x and would require rewriting Rust/Zig backend). Promising for future native desktop / media / AI-agent-driven apps, especially `media-surface` producers and the automation server.

## Decisions Made
- Dither effects should output grayscale (luminance) rather than per-channel colors; palette dithers remain color by design.
- Audio Reactive Dither should share the same luminance model as the preview shader; parameter names aligned.
- Audio file display should always show the basename, not a full path.

## Issues Encountered
- `audioReactiveDither` preview was broken because `effectConverter.ts` transform compared `_k` against a shader uniform name when the function receives the Rust parameter name. Fixed by dispatching on `rustParam`.
- `bayer.rs` used `matrix_size` value as an array index; selecting `4` ran a `2×2` matrix. Fixed to treat the value as the actual size.
- `Timeline`/`AudioPanel` displayed `audioFilePath` directly, so a restored full path would overflow the UI. Fixed with `getFileName()` and `title` tooltip.

## Next Steps
- Optional: investigate `dithering.random_noise` `amount` parameter mismatch with `effectConverter.ts` / shader; Rust currently has no `amount` parameter while the preview shader expects one.
- Optional: consider replacing `sanitize_filename` in `src-tauri/src/bin/mosh_verify.rs` with a more robust path-safe sanitizer if effect IDs ever contain characters beyond `.`, `/`, `\`.
- Optional: continue tracking `vercel-labs/native`; prototype if a greenfield native media/agent app arises.

## Verification
- `cargo test` 408/408 PASS
- `cargo clippy` clean
- `mosh-verify verify-all --filter dither` 20/20 PASS
- `mosh-verify verify-all --filter audio` 4/4 PASS
- `npm run lint` PASS
- `npx tsc --noEmit` PASS
- `npm run test` 1017/1017 PASS
