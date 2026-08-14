# MoshDither Studio — Execution Milestones

> **Stale — not maintained.** Every checkbox below is unchecked, but M1
> (parameter controls, theme system, dock system) and M4 (SAM3 mask
> persistence) items have already shipped per `CHANGELOG.md` and git log.
> Treat `CHANGELOG.md` as the accurate record of what's done; this file was
> never reconciled after the work landed and would need a full pass against
> the checklist below before it could be trusted again.

**Version:** 1.0.0
**Spec Baseline:** commit SHA TBD (after initial governance scaffold)
**Source:** Synthesized from `docs/HARDENING_PLAN_2026-07-26.md`, `docs/IMPLEMENTATION_STATUS.md`, and `docs/UI_UX_IMPROVEMENT_PLAN.md`

---

## M1: UI Polish & Inline Parameter Controls

- **Deliverable**: Effect parameter controls render inline inside selected effect cards; multi-theme system functional; no idle spinners or stale UI state
- **Parallel**: Yes (isolated frontend work, no Rust changes)
- **Docs**: `docs/PRD.md` §3, `docs/DESIGN.md`, `docs/UI_UX_IMPROVEMENT_PLAN.md`
- **Acceptance Criteria**:
  1. [ ] Selecting an effect card expands inline parameter sliders within the card
  2. [ ] No separate bottom parameter splitter pane
  3. [ ] Theme selector works across all 4 themes (dark, high-contrast, light, cosmic)
  4. [ ] SAM3 idle status shows static icon, not spinner
  5. [ ] Before/after split view works in both GPU and CPU modes
  6. [ ] CPU preview clears correctly when effect stack is empty
- **Eval Gate**: `npm run test` (all 1046+ unit tests pass), `npx tsc --noEmit`
- **Budget**: 200K input / 80K output tokens
- **Tool Limit**: 100 invocations
- **Checkpoint**: `checkpoint/m1-baseline`

---

## M2: Effect Engine Correctness

- **Deliverable**: Error diffusion dithering algorithms produce correct output; preset ID migration handles all legacy formats; effect registry returns accurate metadata
- **Sequential**: Depends on M1 UI being stable for visual verification
- **Docs**: `docs/HARDENING_PLAN_2026-07-26.md` §1-2, `docs/API_SPEC.md`
- **Acceptance Criteria**:
  1. [ ] Error diffusion dithers produce correct neighbour-propagated output (Rust CPU path)
  2. [ ] Color error diffusion mode (`rgb`) preserves color channels
  3. [ ] All 75+ effects load without "Effect not found" errors
  4. [ ] Preset loading migrates all historical ID formats
  5. [ ] Effect browser search returns accurate results for all categories
- **Eval Gate**: `npm run test`, `cd src-tauri && cargo test`
- **Budget**: 300K input / 100K output tokens
- **Tool Limit**: 150 invocations
- **Checkpoint**: `checkpoint/m2-baseline`

---

## M3: Video Export Pipeline Hardening

- **Deliverable**: Video export with effect stack produces correct frame-by-frame output; FFglitch datamoshing modes work; audio-reactive export bakes correctly
- **Sequential**: Requires M2 effect correctness
- **Docs**: `docs/API_SPEC.md` §1.1 (export_video, apply_ffglitch), `docs/PRD.md` §5
- **Acceptance Criteria**:
  1. [ ] Single-effect video export produces correct output for all effect categories
  2. [ ] Multi-effect stacked video export applies effects in correct order
  3. [ ] FFglitch datamoshing (ffgac, ffedit) produces valid output files
  4. [ ] Audio-reactive parameters bake to keyframes correctly during export
  5. [ ] Export progress callback reports accurate percentage
  6. [ ] Exported video metadata matches source (resolution, frame rate, codec)
- **Eval Gate**: `npm run test`, `cargo test`, manual video comparison
- **Budget**: 400K input / 150K output tokens
- **Tool Limit**: 200 invocations
- **Checkpoint**: `checkpoint/m3-baseline`

---

## M4: SAM3 Segmentation Stability

- **Deliverable**: SAM3 mask creation, saving, and effect binding work reliably; mask overlay renders correctly; no GPU memory leaks
- **Parallel**: Can run alongside M3 (different subsystem)
- **Docs**: `docs/API_SPEC.md` §1.3, `docs/PRD.md` §4
- **Acceptance Criteria**:
  1. [ ] SAM3 initialization completes without timeout
  2. [ ] Click-to-segment creates valid mask data
  3. [ ] Saved masks persist across project save/load
  4. [ ] Mask-bound effects apply only within mask region
  5. [ ] Inside/outside/alpha mask modes produce correct output
  6. [ ] SAM3 bridge gracefully handles model not found
- **Eval Gate**: `npm run test`, SAM3-specific integration tests
- **Budget**: 300K input / 100K output tokens
- **Tool Limit**: 150 invocations
- **Checkpoint**: `checkpoint/m4-baseline`

---

## M5: Performance & Production Readiness

- **Deliverable**: App launches in <3s, preview renders at 30fps for standard images, production build succeeds on all target platforms
- **Sequential**: Final milestone, requires M1-M4
- **Docs**: `docs/deployment.md`, `docs/operations.md`, `docs/TESTING_STRATEGY.md`
- **Acceptance Criteria**:
  1. [ ] `npm run tauri:build` produces valid installer
  2. [ ] All `evals/regression.ps1` gates pass
  3. [ ] No ESLint warnings, no TypeScript errors
  4. [ ] WebGL2 preview renders at ≥30fps for 1920×1080 images
  5. [ ] CPU fallback preview works when WebGL unavailable
  6. [ ] Memory usage stays under 500MB for typical workflows
- **Eval Gate**: Full regression suite, Playwright E2E, cargo test
- **Budget**: 500K input / 150K output tokens
- **Tool Limit**: 200 invocations
- **Checkpoint**: `checkpoint/m5-baseline`

---

## Parallel Execution Map

```
M1 (UI Polish) ──────────────┐
                              ├──▶ M3 (Video Export) ──▶ M5 (Production)
M2 (Effect Correctness) ─────┘
                              
M4 (SAM3 Stability) ─────────────────────────────────▶ M5 (Production)
```

- **M1 + M2**: Can start in parallel (different subsystems)
- **M3**: Sequential after M2 (needs correct effects)
- **M4**: Parallel with M3 (different subsystem)
- **M5**: Sequential after M1-M4 (integration milestone)
