# Handoff Notes — MoshDither Studio

**Session Date:** 2025-01-30 (evening)
**Phase:** Troubleshooting / bug fixing
**Status:** Multiple fixes applied, app running, some issues still being verified

---

## Summary of Changes This Session

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

| File | Changes |
|------|---------|
| `src/components/MaskSelector.tsx` | Rewritten to scrollable list UI |
| `src/components/MaskPanel.tsx` | Mask post-processing preserves sam3MaskIndex |
| `src/components/PreviewViewport.tsx` | CPU preview loop fix, preview_scale param, cpuRenderSignature |
| `src/components/Toolbar.tsx` | Stale render cancellation, 350ms debounce |
| `src/components/DockSystem/FloatingWindow.tsx` | Dock-to-right icon mirror |
| `src/components/DockSystem/DockZone.tsx` | Group resizing both adjacent groups |
| `src/components/DockSystem/TabGroup.tsx` | Group drag grip handle |
| `src/hooks/usePresets.ts` | Atomic replaceStack for preset loading |
| `src/store/index.ts` | Added replaceStack, setDockGroupSizes, tearOffGroupToFloat actions |
| `src/utils/effectConverter.ts` | (Reference only — GPU/CPU mapping table) |
| `src/lib/tauri.ts` | Added preview_scale param to applyEffectStack |
| `src-tauri/src/commands.rs` | Preview downsampling, removed downscale_mask |
| `src/components/__tests__/components.test.tsx` | Updated MaskSelector tests |

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
