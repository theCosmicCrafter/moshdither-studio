# Handover: Canvas Overlay Alignment & SAM Debugging

## Status: NOT FIXED
**Date:** 2026-06-14
**Issue:** The masking canvas (paint canvas / SAM overlay) does not align with the WebGL image canvas.

---

## What the User Reported

1. **Red overlay is off-center** — When painting a brush mask or using SAM, the overlay (a red-bordered debug rect we added) is visibly offset from the actual image.
2. **Window controls are also off-center** — The minimize/maximize/close buttons in the toolbar are not pushed to the far right.

---

## What Has Been Done This Session

### Fixes Applied (but not verified as complete)
- **Toolbar window controls** — Added `.window-controls { margin-left: auto; }` and `.window-btn` styles in `layout.css` to push controls to the far right. The user confirmed this improved the toolbar layout.
- **Debug visualizations** — Added `outline: 2px solid red` to the paint canvas overlay and `outline: 2px solid lime` to the SAM overlay, plus `console.log` statements in `syncPaintCanvasSize` and the SAM overlay `useEffect` to print exact pixel positions.
- **SAM model loading** — User added a manual "Load SAM 3 Model" button, preload-model IPC handler, and `load_model()` in Python to handle cases where the model auto-download fails.
- **SAM mask format** — Changed `_mask_to_base64` to output RGBA PNG so the frontend can composite with source-in blending.
- **Python backend** — Added `sam3_load_model` to `ALLOWED_METHODS`, added `sam3_predict_box` handler in Electron main.

### NOT Fixed
- **Core overlay misalignment** — The red outline (paint canvas) is still visibly offset from the WebGL-rendered image. We have not yet identified the root cause.

---

## What We Know (Evidence)

### From the screenshot (red outline visible)
- The paint canvas overlay (red border) traces a rectangle around the image area.
- The red border appears to be **aligned with the outer container** but not necessarily with the **letterboxed image** inside the WebGL canvas.
- The WebGL canvas uses `maxWidth: 100%, maxHeight: 100%, width: 100%, height: 100%` in CSS, but the shader letterboxes the actual media to preserve aspect ratio.
- The overlay's `getBoundingClientRect()` approach measures the **CSS box** of the `<canvas>` element, not the **letterboxed image quad** inside it.

### Key Code Locations
| File | Lines | Purpose |
|------|-------|---------|
| `Viewport.tsx` | 89–157 | `syncPaintCanvasSize` — sets paint canvas position/size from `glCanvas.getBoundingClientRect()` |
| `Viewport.tsx` | 220–265 | SAM overlay positioning `useEffect` — same `getBoundingClientRect()` approach |
| `WebGLCanvas.tsx` | 887–903 | Canvas wrapper with `width:100%, height:100%, maxWidth:100%, maxHeight:100%` |
| `WebGLCanvas.tsx` | ~500 | `_updateLetterboxQuad` — shader scales media to preserve aspect ratio, creating black bars |
| `Viewport.tsx` | 654–688 | Viewport container chain: flex → zoom wrapper → flex container |
| `StudioLayout.tsx` | 85–91 | Grid layout with resizable side panels |

---

## Hypotheses (Ranked by Likelihood)

1. **Letterboxing mismatch (most likely)** — The overlay measures the full `<canvas>` CSS box, but the shader renders the media letterboxed inside that box. If the media and canvas have different aspect ratios, the overlay covers the full canvas (including black bars) while the actual image is smaller and centered. **Fix:** The overlay must match the **letterboxed image quad**, not the canvas element.
2. **Nested flex/zoom transform offset** — The viewport has multiple nested flex containers and a `transform: scale(zoomLevel)`. `getBoundingClientRect()` should account for transforms, but combined with the zoom wrapper and SplitView, there might be a cumulative offset.
3. **SplitView or wrapper sizing** — The `SplitView` component wraps `WebGLCanvas` in `position: relative, width:100%, height:100%`. When split view is disabled, it returns `children` directly. This might create a different stacking context.
4. **DPR / pixel ratio mismatch** — The WebGL drawing buffer is sized to `container * devicePixelRatio`, but the overlay CSS size is in CSS pixels. This usually doesn't cause offset, but could affect perceived sharpness.

---

## What Needs to Be Done Next

### Immediate next step: Read the debug logs
The console logs from `syncPaintCanvasSize` are being printed but the objects are collapsed. **The next agent/user must expand one of those log objects in DevTools and share the exact numbers for:**
- `containerRect` (w, h, x, y)
- `glRect` (w, h, x, y)
- `relativeLeft`, `relativeTop`
- `glCanvasSize` (internal pixel dimensions: w, h)
- `paintCanvasSize`

Compare `glRect.width` vs the **visible image width** (not the canvas). If the canvas is wider/taller than the image due to letterboxing, that's the root cause.

### If letterboxing is confirmed:
- **Option A (preferred):** In `syncPaintCanvasSize` and the SAM overlay effect, calculate the letterboxed image dimensions instead of using `glCanvas.getBoundingClientRect()`. Use the shader's `_updateLetterboxQuad` logic (or duplicate the aspect-ratio math in JS) to compute the actual displayed image rect.
- **Option B:** Change the WebGL canvas CSS to `object-fit: contain` and let the canvas element itself letterbox, so the canvas CSS box matches the visible image. This may require significant WebGL shader changes.

### If the numbers look correct but the visual is still off:
- Check if the `transform: scale(${zoomLevel})` on line 669 of `Viewport.tsx` is distorting the overlay position. The overlay is inside the zoom wrapper, so it should scale with it, but verify.
- Check if `SplitView` is adding unexpected offsets when `enabled={false}` (it returns `<>{children}</>` which should be transparent).

### Also needed:
- Verify the toolbar window control fix is working after the latest CSS changes.

---

## Files Touched This Session
- `packages/desktop-gui/src/components/organisms/Viewport.tsx` — debug logging + colored borders
- `packages/desktop-gui/src/styles/layout.css` — `.window-controls` + `.window-btn` styles
- `packages/desktop-gui/src/hooks/useSAM3.ts` — `predictBox`, `loadModel`
- `packages/desktop-gui/src/components/layout/PropertiesPanel.tsx` — manual SAM load button, `SAM3Editor` integration
- `packages/desktop-gui/electron/main.ts` — `sam3:predict-box`, `sam3:preload-model`, temp file cleanup
- `packages/python-backend/sam3_service.py` — `_mask_to_base64` RGBA output, `load_model()`
- `packages/python-backend/main.py` — `sam3_load_model` in `ALLOWED_METHODS`

---

## Bottom Line
**The overlay alignment bug is NOT fixed.** We added diagnostics (red/lime borders + console logs) that should reveal the exact pixel discrepancy. The most likely root cause is that the overlay matches the `<canvas>` element's CSS box, but the **visible image is letterboxed inside that box**, creating an offset when the aspect ratios differ. The next step is to read the debug logs and confirm the numbers.
