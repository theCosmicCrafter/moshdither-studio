# Auditing Tools Tasks
- [x] Tool 1: Create `tools/resource_profiler.py` to monitor RAM/VRAM of the Tauri app and SAM3 Python processes.
- [x] Tool 2: Create a preset stress-tester script or Playwright test that blasts the UI with state changes to test robustness.
- [ ] Tool 3: Create a render parity auditor script to compare WebGL vs CPU outputs.
- [ ] Tool 4: Formalize `scratch/feature_check.py` into `tools/feature_audit.py` and add it to `package.json` scripts.

# CPU Preview Performance Tasks
- [x] 1. Intermediate Frame Caching: In `src-tauri/src/commands.rs` (or `engine.rs`), cache the intermediate frame buffer between consecutive effects in the stack. If only a later effect changes, reuse the cached buffer from previous effects.
- [x] 2. Progressive Rendering: In `src/components/PreviewViewport.tsx`, implement logic to render at a highly downscaled scale (e.g. 25%) immediately on slider drag, then re-render at full scale when the debounce completes.

# SAM3 Video Tracking Tasks
- [x] 1. Create src/components/FrameTimeline.tsx to visualize video frames and allow scrubbing.
- [x] 2. Hook it to sam3_video_predictor backend command.
- [x] 3. Update the Zustand store to handle per-frame masks and scores.
- [x] 4. Ensure the PreviewViewport correctly overlays these masks when scrubbing.

# Model Management & Memory Offloading
- [x] Create `sam3_repo/sam3/model_management.py` with `ModelManager` class.
- [x] Implement VRAM state checking and pinned memory loading.
- [x] Implement sequential offloading in `sam3_bridge.py`.
- [x] Add idle timeout "kill switch" to drop model to CPU.
- [x] Implement progress bar event interception for model downloads.

# PyTorch & SageAttention Optimization
- [x] Reinstall PyTorch with CUDA 12.1+ (in progress).
- [x] Install `triton-windows` and `sageattention` wheels.
- [x] Patch `sam3_bridge.py` with `sageattention.patch()`.