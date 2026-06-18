# MoshDither Studio — SAM3 Feature Gap Analysis

**Date:** 2026-06-17
**Scope:** Compare current SAM3 implementation against full SAM3 model capabilities
**Methodology:** Code review of `sam3_bridge.py`, `sam3_engine.rs`, `MaskPanel.tsx`, `PreviewViewport.tsx`, and `store/index.ts`

---

## SAM3 Model Capabilities (Ground Truth)

SAM3 (Segment Anything Model 3) provides the following inference modes:

1. **Text Prompt Segmentation** — Natural language object description (e.g., "the red car")
2. **Point Prompt Segmentation** — Foreground/background click points
3. **Box Prompt Segmentation** — Bounding box coordinates
4. **Automatic Mask Generation** — Grid-based automatic segmentation without any prompts
5. **Multi-Mask Output** — Returns 3 mask candidates per prompt at different granularities
6. **Mask Refinement** — Iterative click-to-refine on an existing mask
7. **Video Segmentation Propagation** — Track a segmented object across video frames
8. **3D Segmentation** — Volumetric segmentation (medical/ scientific use cases)
9. **Edge-Aware Post-Processing** — Contour smoothing, hole filling, grow/shrink

---

## Current Implementation Matrix

| Feature | Status | Bridge | Frontend | Notes |
|---------|--------|--------|----------|-------|
| Text Prompt | **Implemented** | `sam3_text_prompt` | `MaskPanel.tsx` | Returns single mask only |
| Point Prompt | **Implemented** | `sam3_point_prompt` | `PreviewViewport.tsx` | Multiple points supported; single mask returned |
| Box Prompt | **Partial** | `sam3_box_prompt` exists | UI field exists but **not wired** to `handlePrompt` | Backend handler present but frontend does not call it |
| Auto Mask Generation | **Missing** | Not implemented | No UI | Not exposed in bridge or frontend |
| Multi-Mask Output | **Missing** | Returns only `masks[0]` | No mask selector UI | User cannot choose alternative masks |
| Mask Refinement | **Missing** | Not implemented | No "add point to refine" mode | Would require click-on-mask + iterative re-predict |
| Video Propagation | **Missing** | Not implemented | No video timeline mask UI | Critical for video workflows |
| 3D Segmentation | **N/A** | — | — | Out of scope for MoshDither (2D image/video app) |
| Edge Post-Processing | **Missing** | Raw masks returned | No post-process controls | No smoothing, feathering, or hole fill |

---

## Detailed Gap Analysis

### Gap 1: Box Prompt Not Wired in Frontend

- **Evidence:** `MaskPanel.tsx` has `handleBoxPrompt` (line ~127) and input fields for box coordinates, but `PreviewViewport.tsx` never calls it. The `handlePrompt` method in `PreviewViewport.tsx` only handles `point` and `text` modes.
- **Impact:** A key SAM3 interaction mode is advertised in the UI but non-functional.
- **Fix:** Add box drawing mode to `PreviewViewport.tsx` (drag-to-draw rectangle) and wire it to `invoke("sam3_box_prompt")`.

### Gap 2: Single Mask Returned

- **Evidence:** `sam3_bridge.py` line ~215: `mask = result.masks[0]`
- **Impact:** SAM3's multi-granularity output is discarded. Users get only the model's highest-confidence guess, which may be too coarse or too fine.
- **Fix:** Return `masks: [str]` (all 3 base64-encoded) + `scores: [float]`. Add a mask selector UI (radio buttons or click-through) in `MaskPanel.tsx`.

### Gap 3: No Auto-Mask (Grid) Mode

- **Evidence:** No bridge command for automatic mask generation. No frontend toggle for "auto-segment everything."
- **Impact:** Users must manually specify every object. SAM3's strongest feature (automatic segmentation) is unavailable.
- **Fix:** Add `sam3_auto_mask` command to bridge. Frontend: add "Auto Segment" button that generates a grid of masks and overlays them with different colors.

### Gap 4: No Mask Refinement

- **Evidence:** The frontend clears and re-predicts on every new point. There is no "refine current mask" flow.
- **Impact:** Users cannot incrementally improve a mask by adding corrective clicks.
- **Fix:** Add a refinement mode where the current mask + new points are fed back to SAM3 as a prompt. Requires stateful mask tracking in the bridge.

### Gap 5: No Video Propagation

- **Evidence:** The bridge only processes single images. The `process_video` method in Rust effects expects `VideoSegment` but there's no mask-for-video pipeline.
- **Impact:** Video segmentation is impossible. A user cannot track a masked object across frames.
- **Fix:** This is a large feature requiring:
  1. `video_predict` bridge command accepting frame array
  2. Temporal mask storage in Rust `VideoSegment`
  3. Mask propagation caching in frontend store
  4. Timeline UI for per-frame mask inspection

### Gap 6: No Post-Processing

- **Evidence:** Masks are returned as raw boolean arrays from SAM3. No morphological ops, no edge feathering.
- **Impact:** Mask edges are often jagged. Holes inside objects are not filled. The mask may be slightly too tight or loose.
- **Fix:** Add `postprocess_mask` utility in bridge (OpenCV `cv2.morphologyEx`, `cv2.GaussianBlur`, `cv2.findContours` + fill). Frontend: add sliders for "grow/shrink" and "feather."

---

## Backend Fortification for ML Diffusion

The user explicitly requested: *"Make sure the backend is fortified and works up to code standards for machine learning diffusion and can really handle everything that the SAM model throws at it."*

### Current Deficiencies Against Production ML Standards

| Standard | Requirement | Current Status | Gap |
|----------|-------------|--------------|-----|
| **Model Lifecycle** | Validate at init, lazy-load with timeout, report progress | Validates nothing at init; loads on first prompt with no timeout | No init validation, no timeout, no progress |
| **Error Recovery** | Catch CUDA OOM, model not found, shape mismatch; return structured errors; auto-restart | No try/catch around inference; Rust Mutex poison on crash | Unrecoverable crash on any inference error |
| **Resource Cleanup** | Ensure GPU memory freed, child process reaped, temp files deleted | No explicit `torch.cuda.empty_cache()`; no child process monitoring | Memory leaks; zombie processes |
| **Concurrency Safety** | Multiple concurrent inference requests queued safely | Single Mutex on stdin/stdout; no queue | All requests serialized; one hang blocks everything |
| **Input Sanitization** | Validate image dimensions, bit depth, file size before inference | No validation; malformed base64 crashes bridge | Crash on bad input |
| **Framing Protocol** | Length-prefix or protobuf to avoid stdout corruption | Newline-delimited JSON; debug prints break protocol | Fragile IPC |
| **Observability** | Structured logging, metrics, health endpoint | `print()` statements only | No observability |
| **Portability** | No hardcoded paths; works on macOS/Linux/Windows | Hardcoded Windows path; no cross-platform fallback | Windows-only developer machine |

### Production ML Backend Recommendations

1. **Add a model manager** that validates checkpoint existence at app startup, verifies SHA256 checksum, and downloads missing models automatically.
2. **Implement request queueing** with timeout and cancellation. Use `tokio::sync::mpsc` in Rust and `queue.Queue` in Python.
3. **Add health check endpoint** (`sam3_health`) that returns: model loaded, device, memory usage, last inference time.
4. **Use ONNX Runtime native** in Rust (`ort` crate) to eliminate the Python bridge entirely, reducing complexity and improving performance.
5. **Add telemetry** (opt-in) for inference latency, error rates, and device types to guide optimization.

---

## Estimated Effort to Close All Gaps

| Feature | Backend (Python) | Frontend (React) | Rust Integration | Total Effort |
|---------|------------------|-------------------|------------------|--------------|
| Box Prompt wiring | — | 2 hr | — | **2 hr** |
| Multi-mask output | 1 hr | 3 hr | — | **4 hr** |
| Auto-mask grid | 4 hr | 4 hr | 2 hr | **10 hr** |
| Mask refinement | 3 hr | 3 hr | 2 hr | **8 hr** |
| Video propagation | 8 hr | 8 hr | 6 hr | **22 hr** |
| Post-processing | 2 hr | 2 hr | — | **4 hr** |
| **Total** | **18 hr** | **22 hr** | **10 hr** | **~50 hr** |

---

## Priority Order

1. **P0 (This session):** Fix box prompt wiring, return multi-mask, add error handling + OOM recovery.
2. **P1 (Next 48h):** Add auto-mask grid mode, add mask post-processing (grow/shrink/feather).
3. **P2 (Next sprint):** Implement mask refinement workflow.
4. **P3 (Future milestone):** Video propagation (requires video pipeline overhaul).

---

*Analysis performed by ODIN v5.0 MLBackendEngineer agent.*
