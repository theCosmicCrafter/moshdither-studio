# MoshDither Studio — Testing Strategy

**Version:** 2.0.0-tauri
**Date:** June 2026

---

## 1. Testing Pyramid

```
        +-------------+
        |   E2E       |  Playwright (Chromium + Vite dev server)
        |  ~15 tests  |  Full app: launch, theme, effects, keyboard, export
        +-------------+
        |   Unit      |  Vitest + jsdom + @testing-library/react
        |  ~30 tests  |  Store, components, utilities, effect converter
        +-------------+
        |  Rust       |  cargo test
        |  ~10 tests  |  Effect registry, frame processing, FFmpeg args
        +-------------+
```

---

## 2. Unit Tests (Frontend)

**Framework:** Vitest + jsdom + `@testing-library/react`

### 2.1 Coverage Targets

| Module                       | Target | Priority                                             | Status              |
| ---------------------------- | ------ | ---------------------------------------------------- | ------------------- |
| `store/index.ts`             | 90%    | P0 - theme, stack, undo/redo, overlays, aspect ratio | **Done** (21 tests) |
| `utils/effectConverter`      | 80%    | P0 - stackToRenderPasses, Rust-to-WebGL mapping      | Planned             |
| `utils/watermark`            | 90%    | P1 - watermark settings, defaults                    | Planned             |
| `utils/beatDetection`        | 70%    | P1 - BPM estimation, onset detection                 | Planned             |
| `hooks/useKeyboardShortcuts` | 80%    | P1 - shortcut binding, category switching            | Planned             |
| `components/EffectStack`     | 70%    | P2 - stack rendering, parameter panel                | Planned             |
| `components/Toolbar`         | 70%    | P2 - theme toggle, before/after, zoom                | Planned             |

### 2.2 Required Mocks

- `@tauri-apps/api/core` - mock `invoke()` with canned responses (see `tests/e2e/mocks/tauri-mock.ts`)
- `@tauri-apps/plugin-dialog` - mock `open()` / `save()` returning null or path string
- `matchMedia` - Vitest `vi.stubGlobal('matchMedia', ...)`
- `ResizeObserver` - `vi.stubGlobal('ResizeObserver', class {...})`
- `HTMLCanvasElement.getContext('webgl2')` - returns mock WebGL context or null

### 2.3 Test Files

| File                      | Tests | What It Verifies                                                                                                      |
| ------------------------- | ----- | --------------------------------------------------------------------------------------------------------------------- |
| `src/store/index.test.ts` | 39    | Theme toggle, stack add/remove/toggle, undo/redo, overlays, aspect ratio, category, proxy media, multi-track layering |

### 2.4 Running Unit Tests

```bash
npm run test:unit
# or
npx vitest run
```

---

## 3. E2E Tests (Playwright)

**Framework:** Playwright + Chromium (against Vite dev server)

**Why not Tauri.launch()?**

- Tauri's Playwright integration requires a compiled binary, slowing CI
- The frontend runs identically in Chromium with Tauri API mocks
- `page.addInitScript()` injects a mock `__TAURI_INTERNALS__.invoke()` before app loads

### 3.1 Tauri API Mock

Located at `tests/e2e/mocks/tauri-mock.ts`. Stubs:

- `invoke()` - returns canned data per command (`list_effects`, `get_media_info`, `get_environment_status`, SAM3, etc.)
- `convertFileSrc()` - returns placeholder URL
- `@tauri-apps/plugin-dialog` - `open()` / `save()` return null

### 3.2 Smoke Test Suite

| File                         | Tests | What It Verifies                                                                                           |
| ---------------------------- | ----- | ---------------------------------------------------------------------------------------------------------- |
| `app-launch.spec.ts`         | 4     | Toolbar renders, effect browser visible, preview viewport visible, no console errors                       |
| `theme-toggle.spec.ts`       | 3     | Toggle button exists, click switches data-theme, T keyboard shortcut works                                 |
| `effect-browser.spec.ts`     | 3     | Category tabs visible, number keys switch categories, effect list renders items                            |
| `keyboard-shortcuts.spec.ts` | 4     | Shortcuts panel opens, spacebar/V/G keys work without crash                                                |
| `proxy-tracks.spec.ts`       | 6     | Proxy panel visible, generate button, quality slider, tracks panel visible, add creates track, empty state |

### 3.3 Running E2E Tests

```bash
npm run test:e2e
# or
npx playwright test
```

---

## 4. Rust Tests

**Framework:** `cargo test`

### 4.1 Test Matrix

| Test             | Module                | What It Verifies                          |
| ---------------- | --------------------- | ----------------------------------------- |
| Effect registry  | `effects/registry.rs` | All 75+ effects register, metadata valid  |
| Frame processing | `effects/types.rs`    | Frame struct, VideoSegment                |
| FFmpeg decode    | `ffmpeg/mod.rs`       | decode_video, probe_video, probe_metadata |
| Effect engine    | `effects/engine.rs`   | Sequential + Rayon parallel processing    |

### 4.2 Running Rust Tests

```bash
cd src-tauri
cargo test
```

---

## 5. CI/CD Integration

See `.github/workflows/ci.yml` for the current pipeline (3 parallel jobs):

### 5.1 Frontend Job

1. `npm ci`
2. `npm run lint`
3. `npx tsc --noEmit`
4. `npm run test:unit`

### 5.2 E2E Job

1. `npm ci`
2. `npx playwright install --with-deps chromium`
3. `npm run test:e2e`
4. Upload Playwright report artifact

### 5.3 Rust Job

1. Install Rust + Tauri system deps
2. `cargo fmt -- --check`
3. `cargo clippy -- -D warnings`
4. `cargo test`

---

## 6. Debug & Diagnostic Tools

### 6.1 WebGL Debug Mode

Set `?debug=webgl` in dev server URL to enable:

- Verbose shader compilation logging
- Framebuffer status checks

### 6.2 Tauri IPC Trace

Set `DEBUG_IPC=1` env var to log all invoke() calls:

```
[IPC] invoke: load_media -> "C:/path/to/video.mp4"
[IPC] invoke: list_effects -> [EffectMeta{...}, ...]
```

---

## 7. Performance Budgets

| Metric                 | Target      | Max         |
| ---------------------- | ----------- | ----------- |
| WebGL frame time       | 16 ms       | 33 ms       |
| Shader compile time    | 50 ms       | 200 ms      |
| Bundle size (frontend) | 250 KB (gz) | 350 KB (gz) |
| Tauri app startup      | 500 ms      | 1 s         |
| Proxy media generation | 5 s         | 15 s        |

---

## 8. Known Gaps

| Gap                         | Impact                          | Plan                                       |
| --------------------------- | ------------------------------- | ------------------------------------------ |
| No browser-mode WebGL tests | WebGL untested in CI            | Add Vitest browser mode tests              |
| No coverage tracking        | Unknown test completeness       | Add `@vitest/coverage-v8`                  |
| No visual regression        | Shader changes may break output | Add pixel-diff tests                       |
| Limited component tests     | UI components untested          | Add @testing-library/react component tests |
