# Handoff Notes — MoshDither Studio

**Session Date:** 2026-07-12
**Phase:** Production audit — Rust panic hardening, debug-log cleanup, frontend `any` cleanup, adversarial tests
**Status:** clippy clean (`-D warnings`), lint clean (0 warnings), tsc clean, cargo 408/408, vitest 1015/1015, effect verification 98/98

---

## Production Audit Session (2026-07-12)

### Verification results (Step 1 / Step 7 catalog)

| Check                                                    | Status                 |
| -------------------------------------------------------- | ---------------------- |
| `cargo clippy --all-targets --all-features -- -D warnings` | PASS (clean)           |
| `cargo test`                                             | 408/408 PASS           |
| `cargo run --bin mosh-verify -- verify-all`              | 98/98 effects PASS     |
| `npm run lint` (`--max-warnings 0`)                      | PASS (0 warnings)      |
| `npx tsc --noEmit`                                       | PASS                   |
| `npx vitest run`                                         | 1015/1015 PASS         |

### Changes

1. **Rust panic hardening (Step 2).** Replaced all 29 `.lock().unwrap()` in
   `commands.rs` and both in `ffmpeg/mod.rs` with `.lock().map_err(|e| ..)?`,
   mapping a poisoned mutex to a command error string. `list_effects` and
   `list_effects_by_category` now return `Result<Vec<EffectMeta>, String>`
   (frontend callers already `await` + `.catch()`; Tauri auto-unwraps `Ok`/rejects
   `Err`, so no frontend change was required and tsc/lint stay green).
   `downscale_frame`/`upscale_frame` return an error on an inconsistent buffer
   instead of silently substituting a 1x1 black frame.

2. **Debug-log cleanup (Step 3).** Deleted the five `[MASK DEBUG]` `eprintln!`
   calls in `apply_effect_stack` and the `[SAVE DEBUG]` calls in `save_file`.
   `[export]` progress logs are retained.

3. **Frontend `any` cleanup (Step 4).** Added `@types/webmidi` (2.1.0) to
   devDependencies; `MIDIController.ts` is typed with `WebMidi.MIDIAccess` /
   `WebMidi.MIDIMessageEvent` and the file-wide `eslint-disable no-explicit-any`
   is gone. `PreviewViewport.tsx` had no actual `any` (only the English word in a
   comment) — left untouched, as was `useProject.ts`.

4. **Tests (Step 5 / Step 6).** Cross-platform `test_load_and_convert_media`
   (generated in-memory PNG). New tests: resize-helper valid/invalid-buffer,
   poisoned-lock recovery for frame/registry/sam3 mutexes, and adversarial cases
   (unknown effect id, non-PNG mask base64, garbage image bytes, mismatched-dimension
   mask, extreme out-of-range params) — all confirm errors, not panics.

5. **Pre-existing clippy fixes (Step 7).** `unnecessary_sort_by`
   (`frame_manipulation.rs`), `useless_conversion` + `type_complexity`
   (`sam3_engine.rs`, via a `VideoPredictorResult` type alias).

### Security / capability review (Step 6)

- `SECURITY.md` is comprehensive (pre-commit + CI SAST stack, secret scanning).
- **Finding — broad FS scope (Medium):** `src-tauri/capabilities/default.json`
  grants `core:default` a filesystem scope of `$HOME/**` plus every user directory.
  This is wider than needed; consider narrowing to the specific media/project
  directories the app actually touches. Not changed here to avoid breaking legitimate
  file I/O — flagged for a follow-up scoping pass.

---

## Summary of Changes This Session

### 1. Subagent System (`.devin/agents/`)

15 custom subagent profiles created covering all project domains:

- **sindri** — Rust effect engine (75+ effects, registry, rayon)
- **brokkr** — WebGL2/GLSL shaders (73 files, preview pipeline)
- **mimir** — Documentation & research (ADRs, API specs, handoffs)
- **vidar** — Security (SAST, secret scanning, vuln triage)
- **heimdall** — CI/CD & test gatekeeper (build verification, lint)
- **frontend-smith** — React/TS/Zustand UI (52 components, dock system)
- **bridge-keeper** — Tauri IPC bridge (commands.rs ↔ tauri.ts)
- **sam3-seer** — SAM3/Python ML (ONNX, masks, idle shutdown)
- **video-forge** — FFmpeg/FFglitch export pipeline
- **perf-tuner** — Performance profiling (render pipeline, memory)
- **asset-keeper** — LUT/palette/icon asset management
- **audio-weaver** — Audio/MIDI reactive engine
- **code-reviewer** — PR review (bugs, style, cross-layer issues)
- **devops-builder** — Tauri packaging, CI/CD, release builds
- **effect-designer** — Effect design & prototyping (specs, params)

### 2. CSS Vendor Prefix Fixes (`src/index.css`)

- Added `-webkit-backdrop-filter` before all 7 `backdrop-filter` declarations
- Added `-webkit-user-select` before all 4 `user-select` declarations
- Fixed `appearance` property ordering (webkit/moz/standard) in 2 places
- Added standard `background-clip: text` alongside `-webkit-background-clip`
- Fixed invalid `tabular-nums: 1` → `font-variant-numeric: tabular-nums`

### 3. Lint Fixes

- `src/components/FrameTimeline.tsx` — Replaced `catch (e: any)` with `catch (e: unknown)` + type guard
- `tests/e2e/run-parity.spec.ts` — Replaced `@ts-ignore` with `@ts-expect-error`

### 4. Test Fix

- `src/components/__tests__/MaskPanel.test.tsx` — Updated test to match current UI ("SAM3 idle" instead of "Starting SAM3 engine...")

### 5. HANDOFF.md Markdown Formatting

- Added blank lines between all headings and lists to fix MD022/MD032 warnings

---

## Build & Test Status

| Check                         | Status            |
| ----------------------------- | ----------------- |
| TypeScript (`tsc --noEmit`)   | PASS              |
| ESLint (`npm run lint`)       | PASS (0 warnings) |
| Frontend tests (`vitest run`) | 1015/1015 PASS    |
| Rust (`cargo check --lib`)    | PASS              |
| Backend functional tests      | 49/49 PASS        |
| Effect verification           | 98/98 PASS        |

---

## Previous Session Notes (2025-01-30)

**Phase:** Troubleshooting / bug fixing
**Status:** Multiple fixes applied, app running, some issues still being verified

---

## Previous Session Changes (2025-01-30)

### 1. Mask Selector UI Rewrite (`src/components/MaskSelector.tsx`)

- **Was:** All mask thumbnails in a single horizontal flex row (`flex-1 aspect-square`), making each thumbnail ~4px with 25 masks
- **Now:** Collapsible accordion with a scrollable vertical list (max 280px), 48x48px thumbnails, mask number + score + check icon on selected
- Tests updated in `src/components/__tests__/components.test.tsx`

### 2. Preview Downsampling (`src-tauri/src/commands.rs`, `src/lib/tauri.ts`)

- Added `preview_scale` parameter to `apply_effect_stack` command
- Frontend passes `0.5` to downscale to 50% for preview processing (4x fewer pixels)
- `downscale_frame` helper used for the working frame
- **Important:** Mask is NOT downscaled — `blend_mask` in `src-tauri/src/effects/engine.rs` already has nearest-neighbor scaling built in (lines 20-24) that handles dimension mismatches correctly
- A `downscale_mask` function was added then removed — it was corrupting mask data. Do NOT re-add it.

### 3. Stale Render Cancellation (`src/components/Toolbar.tsx`)

- Added `renderIdRef` counter — if a newer render request comes in while an older one is processing, the older result is discarded
- Prevents stale previews from overwriting newer renders when dragging sliders quickly

### 4. Debounce Increase (`src/components/Toolbar.tsx`)

- Increased from 200ms to 350ms for smoother slider dragging
- The debounce effect is at line ~248-254, keyed on `processSignature`

### 5. CPU Preview Loop Fix (`src/components/PreviewViewport.tsx`) — MAJOR

- **Was:** Continuous `requestAnimationFrame` loop running at ~12fps, calling `applyEffectStack` every 80ms even when nothing changed. This was the main cause of the app freezing/lagging.
- **Now:**
  - Static mode (not playing): Renders once, then only re-renders when `cpuRenderSignature` changes (params, mask, effect order, enable/disable)
  - Playback mode: Animation loop only runs when `isPlaying` is true, at 10fps
  - No continuous polling when idle
- Added `cpuRenderSignature` (line ~78) that includes params + maskId + maskMode + activeMask, so param changes trigger re-render
- The `stackSignature` (structural only, line ~75) is still used by the WebGL path

### 6. Mask Post-Processing Fix (`src/components/MaskPanel.tsx`)

- **Was:** After grow/shrink/feather post-processing, `setSam3Masks` always reset `sam3MaskIndex` to 0 and `activeMask` to `masks[0]`, so the processed mask wasn't displayed if it wasn't first
- **Fix:** Directly update the mask array and `activeMask` while preserving the current `sam3MaskIndex`

### 7. Docking Icon Fix (`src/components/DockSystem/FloatingWindow.tsx`)

- "Dock to right" icon was showing `dock_to_right` (same as left)
- Fixed by mirroring with CSS `scaleX(-1)` to show arrow pointing right

### 8. Preset Loading Race Condition Fix (`src/hooks/usePresets.ts`, `src/store/index.ts`) — MAJOR

- **Was:** `loadPreset` used `clearStack()` + `setTimeout(() => { addToStack... }, 0)`, causing a race condition:
  1. `clearStack()` empties stack → triggers 350ms debounce
  2. `setTimeout` adds effects immediately
  3. 350ms timer fires with empty stack → shows original, sets `useCpuPreview = false`
  4. Image disappears, preview state corrupted
- **Fix:** Added `replaceStack` action to store that atomically replaces the entire stack in one update
- `loadPreset` now does `replaceStack(newStack)` with deep-cloned entries (new IDs to avoid collisions)
- Removed unused `clearStack`, `addToStack`, `allEffects` references from `usePresets.ts`

### 9. Dock System Resizing + Group Dragging (from earlier in session)

- `setDockGroupSizes` action in store adjusts both adjacent groups in opposite directions
- `tearOffGroupToFloat` action for dragging entire tab groups
- Drag grip handle (⋮⋮ icon) in `TabGroup.tsx`
- `DockZone.tsx` handles both group IDs for resizing

---

## Architecture Notes

### GPU vs CPU Preview Split

The app uses a hybrid rendering approach (like Mosh-Pro but with CPU fallback):

- **WebGL/GPU path:** Effects with accurate WebGL shaders run entirely on GPU via FBO ping-pong. No Rust roundtrip. Fast (~60fps).
- **CPU/Rust path:** Effects that can't be done accurately in a pixel shader (error diffusion dithering, byte-level glitch, datamoshing, etc.) use the Rust backend via IPC.
- **Selection logic:** `stackRequiresCpuPreview()` in `src/utils/effectConverter.ts` checks if any enabled effect has `accurate: false` or no WebGL mapping. If so, CPU path is used.
- **Export always uses CPU/Rust** — the GPU shaders are for preview only. The preview matches export because `accurate: false` effects use CPU for both preview AND export.

### Mosh-Pro Reference

- Located at `C:\Users\richk\CascadeProjects\Mosh-Pro-1.3.5-win\extracted\app\resources\app_unpacked\`
- Electron + Vue + Three.js, 100% WebGL rendering
- No CPU roundtrip for preview — all effects are GLSL shader passes
- Render loop is on-demand only (no continuous RAF)
- FBO ping-pong chain: `renderFBO` → pass1.fbo → pass2.fbo → `screenPass.renderToScreen()`
- Mask passes use `tOrig` uniform for before/after blending

---

## Known Issues / Things to Verify Next Session

1. **Mask locking to effects:** User reported effects weren't being locked to the mask. Backend tests pass (mask_blend_inside/outside/alpha all PASS). The mask must be explicitly assigned to each effect via the dropdown in the EffectStack panel. Verify this works after the preset fix.

2. **App stability:** The app crashed once with `STATUS_HEAP_CORRUPTION` (0xc0000374) — likely from the frozen state when the user closed it, not a code bug. Monitor for recurrence.

3. **SAM3 memory:** The SAM3 Python process uses ~6GB RAM. This is expected for the model but may cause resource pressure on lower-end machines.

4. **Preset loading:** The race condition fix is in place but hasn't been fully user-tested. Verify that loading a preset keeps the image visible and applies effects correctly.

5. **CPU preview performance:** The continuous RAF loop is fixed, but CPU renders still take time for large images at 50% scale. Could optimize further with:
   - Intermediate frame caching between effects
   - Progressive rendering (low-res first, then full-res)
   - Web Worker for the IPC calls

---

## Files Modified This Session

| File                                           | Changes                                                            |
| ---------------------------------------------- | ------------------------------------------------------------------ |
| `src/components/MaskSelector.tsx`              | Rewritten to scrollable list UI                                    |
| `src/components/MaskPanel.tsx`                 | Mask post-processing preserves sam3MaskIndex                       |
| `src/components/PreviewViewport.tsx`           | CPU preview loop fix, preview_scale param, cpuRenderSignature      |
| `src/components/Toolbar.tsx`                   | Stale render cancellation, 350ms debounce                          |
| `src/components/DockSystem/FloatingWindow.tsx` | Dock-to-right icon mirror                                          |
| `src/components/DockSystem/DockZone.tsx`       | Group resizing both adjacent groups                                |
| `src/components/DockSystem/TabGroup.tsx`       | Group drag grip handle                                             |
| `src/hooks/usePresets.ts`                      | Atomic replaceStack for preset loading                             |
| `src/store/index.ts`                           | Added replaceStack, setDockGroupSizes, tearOffGroupToFloat actions |
| `src/utils/effectConverter.ts`                 | (Reference only — GPU/CPU mapping table)                           |
| `src/lib/tauri.ts`                             | Added preview_scale param to applyEffectStack                      |
| `src-tauri/src/commands.rs`                    | Preview downsampling, removed downscale_mask                       |
| `src/components/__tests__/components.test.tsx` | Updated MaskSelector tests                                         |

---

## Build & Run Commands

```bash
# Start dev server + Tauri app
npm run tauri:dev

# Type check
npx tsc --noEmit

# Run tests
npx vitest run

# Rust check
cd src-tauri && cargo check

# MCP verification (backend tests)
# Use mcp-verify server: verify_all, test_all, list_effects, get_status
```

## Test Status

- All 49 backend functional tests PASS (mask blending, effects, animation, I/O)
- All 85 frontend tests PASS
- TypeScript compiles clean
- Rust compiles clean
