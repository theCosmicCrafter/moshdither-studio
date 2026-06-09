# MoshDither Studio — Testing Strategy

**Version:** 1.5.0-beta  
**Date:** June 9, 2026

---

## 1. Testing Pyramid

```
        ┌─────────────┐
        │   E2E       │  Playwright (Electron.launch)
        │  ~5 tests   │  Full app: import → add effect → render → export
        ├─────────────┤
        │  Browser    │  Vitest Browser Mode + Playwright
        │  ~10 tests  │  WebGL context, shader compile, canvas resize
        ├─────────────┤
        │   Unit      │  Vitest + jsdom + @testing-library/react
        │  ~20 tests  │  Components, context logic, math utilities
        ├─────────────┤
        │  Python     │  pytest
        │  ~10 tests  │  RPC auth, input validation, ffmpeg args
        └─────────────┘
```

---

## 2. Unit Tests (Renderer)

**Framework:** Vitest + jsdom + `@testing-library/react`

### 2.1 Coverage Targets

| Module | Target | Priority |
|--------|--------|----------|
| `context/StudioContext` | 90% | P0 — undo/redo, toast lifecycle, effect updates |
| `types/effectTypes` | 100% | P0 — type guards, registry lookup |
| `math/*` | 95% | P1 — Bayer matrices, color space conversions |
| `components/atoms/*` | 70% | P2 — Button, Switch, Icon rendering |
| `components/canvas/WebGLCanvas` | — | P1 — Requires Browser Mode (see §3) |

### 2.2 Required Mocks

- `window.ipcRenderer` → `src/test/ipcMock.ts` (already implemented)
- `matchMedia` → Vitest `vi.stubGlobal('matchMedia', ...)`
- `ResizeObserver` → `vi.stubGlobal('ResizeObserver', class {...})`
- `HTMLCanvasElement.getContext('webgl2')` → returns mock WebGL context or null

### 2.3 Example Test Matrix

| Test | File | What It Verifies |
|------|------|-----------------|
| Undo adds previous state to past | `StudioContext.unit.test.tsx` | History stack mechanics |
| Redo restores from future | `StudioContext.unit.test.tsx` | Future stack mechanics |
| Add effect assigns unique ID | `Sidebar.unit.test.tsx` | Collision-free ID generation |
| Effect type guard works | `effectTypes.unit.test.ts` | `isWebGLEffect()`, `isPythonEffect()` |
| IPC mock returns unsubscribe | `ipcMock.unit.test.ts` | Listener cleanup (already passing) |

---

## 3. Browser Tests (WebGL)

**Framework:** Vitest Browser Mode + Playwright (Chromium)

**Why Browser Mode?**
- `jsdom` cannot create WebGL contexts
- `HTMLVideoElement` playback requires a real DOM
- `MediaRecorder` and `canvas.captureStream` are browser-only APIs

### 3.1 WebGL Smoke Tests

| Test | What It Verifies |
|------|-----------------|
| Context creation | `canvas.getContext('webgl2')` returns valid context |
| Passthrough shader | Default vertex + fragment shaders compile and link |
| Effect shader compilation | Each effect's fragment shader compiles without errors |
| Resource cleanup | After unmount, `gl.isProgram(program)` is `false` |
| HiDPI resize | Changing DPR updates canvas drawing buffer correctly |
| Framebuffer completeness | All created FBOs pass `checkFramebufferStatus` |

### 3.2 Canvas Interaction Tests

| Test | What It Verifies |
|------|-----------------|
| Mask painting | Pointer events draw on mask canvas |
| ResizeObserver | Wrapper resize triggers canvas re-init |
| Context loss/recovery | `webglcontextlost` + `webglcontextrestored` handled |

---

## 4. E2E Tests (Main + Renderer)

**Framework:** Playwright `electron.launch()`

### 4.1 Smoke Test Suite

| Test | Steps |
|------|-------|
| App launches | `electron.launch()` → wait for firstWindow → assert title |
| No console errors | Capture `page.on('console')` → filter `error` severity → assert empty |
| Import media | Click Import → mock dialog → assert mediaUrl set |
| Add effect | Click "Add Effect Layer" → select dither → assert activeEffects.length === 1 |
| Toggle effect | Click Switch → assert enabled flag flipped |
| Undo/redo | Add effect → undo → assert removed → redo → assert restored |

### 4.2 Security E2E

| Test | What It Verifies |
|------|-----------------|
| Navigation blocked | Attempt `window.location.href = "https://evil.com"` → assert blocked |
| IPC channel whitelist | Attempt `window.ipcRenderer.send("evil-channel")` → assert throws |
| Custom protocol safety | Request `media://../../etc/passwd` → assert 403 |

### 4.3 Render Pipeline E2E

| Test | Steps |
|------|-------|
| WebGL export | Import video → add halftone → click Render → assert progress toast → assert output file exists |
| Python datamosh | Import video → add datamosh → click Render → assert python process spawned → assert output file |

---

## 5. Python Tests

**Framework:** pytest

### 5.1 Test Matrix

| Test | Module | What It Verifies |
|------|--------|-----------------|
| Token auth rejects missing header | `test_main.py` | Returns 403 when `X-RPC-Token` absent |
| Token auth rejects bad token | `test_main.py` | Returns 403 when token mismatched |
| Method allowlist | `test_main.py` | Returns 404 for unknown method |
| Payload size limit | `test_main.py` | Returns 413 when `Content-Length > 1MB` |
| Ephemeral port binding | `test_main.py` | Server binds to port 0 and prints actual port |
| ffmpeg args construction | `test_mosh_cli.py` | Arguments are passed as list, not shell string |
| ffmpeg error handling | `test_mosh_cli.py` | Non-zero exit code throws `RuntimeError` |

### 5.2 Running Python Tests

```bash
cd packages/python-backend
python -m pytest -v
```

---

## 6. CI/CD Integration

See `.github/workflows/ci.yml` for the current pipeline:

1. `npm ci` + `npm run lint`
2. `npx tsc -b` (type check)
3. `npm run build` (production build)
4. `npx vitest run` (unit tests)
5. `pytest` (Python tests)

**Future additions:**
- Browser tests: `npx vitest run --config vitest.browser.config.ts` (requires Vitest 4)
- E2E tests: `npx playwright test` (requires Playwright Electron setup)
- Code coverage: `npx vitest run --coverage` (requires `@vitest/coverage-v8`)

---

## 7. Debug & Diagnostic Tools

### 7.1 WebGL Debug Mode

Set `?debug=webgl` in dev server URL to enable:
- `webgl-lint` integration (throws on GL errors)
- Spector.js capture (one-click frame capture)
- Verbose shader compilation logging

### 7.2 IPC Trace Mode

Set `DEBUG_IPC=1` env var to log all IPC calls:
```
[IPC] invoke: dialog:openMedia → "media://C:/path.mp4"
[IPC] on: render:progress ← { percent: 42, log: "Encoding frame 420" }
```

### 7.3 Python RPC Trace

Set `MOSHDITHER_DEBUG=1` to log all Python RPC requests/responses.

---

## 8. Performance Budgets

| Metric | Target | Max |
|--------|--------|-----|
| WebGL frame time | 16 ms | 33 ms |
| Shader compile time | 50 ms | 200 ms |
| Bundle size (renderer) | 250 KB (gz) | 350 KB (gz) |
| Main process startup | 500 ms | 1 s |
| Python RPC response | 100 ms | 500 ms |

---

## 9. Known Gaps

| Gap | Impact | Plan |
|-----|--------|------|
| No browser tests | WebGL untested in CI | Upgrade to Vitest 4 + `@vitest/browser-playwright` |
| No E2E tests | Full pipeline untested | Add Playwright Electron harness |
| No coverage tracking | Unknown test completeness | Add `@vitest/coverage-v8` |
| No visual regression | Shader changes may break output | Add pixel-diff tests (browser mode) |
