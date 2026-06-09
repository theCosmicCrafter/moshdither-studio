# Moshdither Studio — Production Hardening Plan

> **See also:** [`IMPLEMENTATION_STATUS.md`](./IMPLEMENTATION_STATUS.md) — canonical code-verified status of all features.

**Research Date:** 2026-06-09  
**Sources:** Electron Security Docs (v42), Vitest Browser Mode Docs, Playwright Electron API, WebGL2Fundamentals, webgl-lint, @electron/fuses docs  
**Status:** Plan approved — Phase 1-3 complete, Phases 4-6 pending

---

## Executive Summary

This plan closes the remaining gaps between "build passes" and "production-grade graphics editing application." It is organized into 6 phases with explicit dependencies. Each phase includes verification gates.

**Updated finding (June 9, 2026):** The Electron app now implements **16 of 20** official security checklist items. Only 4 remain: auto-updater, release signing verification, Subresource Integrity for preload, and secure localStorage (partial — `useSafeStorage` hook exists but has a load bug). The Python RPC backend **is now authenticated** with token-based auth (`secrets.compare_digest`) and ephemeral port binding.

---

## Phase 1: Testing Infrastructure (Foundation for all other phases)

**Goal:** Establish a 3-tier testing pyramid before adding more code. No new features ship without tests.

### 1.1 Unit + Component Tests (Renderer Process)

**Tech:** Vitest + `@vitest/browser-playwright` + `@testing-library/react`

**Why browser mode?** Standard `jsdom` cannot initialize WebGL contexts, and `jsdom` lacks `HTMLVideoElement` playback. Browser mode runs tests in a real Chromium instance via Playwright, enabling:

- WebGL shader compilation tests
- Canvas `captureStream` smoke tests
- Video texture loading tests

**Implementation:**

```ts
// vitest.config.ts — add browser project
export default defineConfig({
  plugins: [react(), electron([...])],
  test: {
    projects: [
      {
        test: {
          name: 'unit',
          environment: 'jsdom',
          include: ['src/**/*.unit.test.{ts,tsx}'],
        },
      },
      {
        test: {
          name: 'browser',
          include: ['src/**/*.browser.test.{ts,tsx}'],
          browser: {
            enabled: true,
            provider: playwright(),
            instances: [{ browser: 'chromium' }],
          },
        },
      },
    ],
  },
});
```

**Deliverables:**

- `src/math/bayer.unit.test.ts` — deterministic Bayer matrix generation
- `src/context/StudioContext.unit.test.tsx` — undo/redo stack logic, toast lifecycle
- `src/components/canvas/WebGLCanvas.browser.test.tsx` — WebGL context creation, shader compilation, resource cleanup on unmount
- `src/components/organisms/Viewport.browser.test.tsx` — mask painting pointer event handling

### 1.2 IPC Mock Layer (Renderer Process Tests)

**Problem:** Tests crash because `window.ipcRenderer` is undefined outside Electron.

**Solution:** Create a typed mock IPC provider.

```ts
// src/test/ipcMock.ts
export function installMockIpc() {
  (window as any).ipcRenderer = {
    on: vi.fn(() => () => {}),
    off: vi.fn(),
    send: vi.fn(),
    invoke: vi.fn(),
  };
}
```

Use in test setup:

```ts
beforeEach(() => {
  installMockIpc();
});
```

### 1.3 E2E Tests (Main + Renderer Integration)

**Tech:** Playwright `electron.launch()`

**Reference:** Playwright docs confirm `electron.launch({ args: ['main.js'] })` returns an `ElectronApplication` with access to both main process evaluation and renderer windows.

**Deliverables:**

- `e2e/smoke.spec.ts` — Launch app, verify window opens, verify no console errors
- `e2e/pipeline.spec.ts` — Select media, add effect, click Render & Export, verify progress toast
- `e2e/security.spec.ts` — Verify `contextIsolation` is enabled, verify custom protocol handler rejects traversal paths

### 1.4 Python Backend Tests

**Tech:** `pytest` (already implied by Python backend)

**Deliverables:**

- `packages/python-backend/tests/test_mosh_cli.py` — Mock ffmpeg/ffglitch paths, verify argument list construction
- `packages/python-backend/tests/test_main.py` — Verify RPC handler rejects unknown methods, verify malformed JSON returns 400

**Verification Gate:**

```bash
cd packages/desktop-gui && npx vitest run
cd packages/python-backend && pytest
```

---

## Phase 2: Python Backend Security (BLOCKER for shipping)

**Goal:** Eliminate the unauthenticated localhost HTTP server vulnerability.

### 2.1 Token-Based Authentication

**Research finding:** Local HTTP servers on fixed ports are trivially discoverable (`netstat`, port scanning). Any other process on the machine can POST to `http://127.0.0.1:8080/` and execute arbitrary Python code via the `neural_downscale` placeholder or future RPC methods.

**Implementation:**

1. **Main process generates a cryptographically random token at startup:**

   ```ts
   const rpcToken = crypto.randomBytes(32).toString("hex");
   ```

2. **Token is passed to Python via environment variable:**

   ```ts
   const pythonProc = spawn("python", ["main.py"], {
     env: { ...process.env, MOSHDITHER_RPC_TOKEN: rpcToken },
   });
   ```

3. **Python validates `X-RPC-Token` header on every request:**

   ```python
   class RPCRequestHandler(BaseHTTPRequestHandler):
       def do_POST(self):
           if self.headers.get('X-RPC-Token') != os.environ.get('MOSHDITHER_RPC_TOKEN'):
               self.send_error(403, "Invalid token")
               return
           # ... existing logic
   ```

4. **Renderer includes token in all IPC-to-main-to-Python calls:** Main process proxies requests with the token header.

### 2.2 Input Validation

**Deliverables:**

- Validate `method` against a strict allowlist: `['neural_downscale']` (expand as methods are added)
- Validate `params` schema per method (reject unexpected keys to prevent parameter smuggling)
- Enforce `Content-Length` limits (max 1MB to prevent memory exhaustion)

### 2.3 Port Binding Security

- Bind to `127.0.0.1` explicitly (not `0.0.0.0`)
- Use port `0` (ephemeral) instead of hardcoded `8080`, then read the actual port from stdout
- This prevents port conflicts and makes discovery harder

**Verification Gate:**

- Run `nmap -p 8000-9000 localhost` during app runtime — confirm no predictable open port
- Attempt curl without `X-RPC-Token` — confirm 403

---

## Phase 3: Electron Security Hardening

**Goal:** Close all 8 remaining gaps from the official Electron security checklist.

### 3.1 Content Security Policy

**Current state:** No CSP defined in `index.html`.

**Reference:** Electron docs recommend `script-src 'self'` and restricting remote content.

**Implementation:**

```html
<meta
  http-equiv="Content-Security-Policy"
  content="
  default-src 'self';
  script-src 'self';
  style-src 'self' 'unsafe-inline';
  img-src 'self' media: data: blob:;
  media-src 'self' media:;
  connect-src 'self';
  font-src 'self';
  worker-src 'self' blob:;
"
/>
```

**Note:** `'unsafe-inline'` for styles is required because the app uses inline `style` props. The long-term fix is migrating styles to CSS modules/classes, but that's Phase 5. The CSP above still blocks inline scripts and remote resources.

### 3.2 Navigation & New Window Restrictions

**Current state:** `will-navigate` and `new-window` handlers are absent.

**Reference:** Electron checklist items 13 and 14.

**Implementation:**

```ts
// In createWindow() after win creation
win.webContents.on("will-navigate", (event, url) => {
  if (url !== win.webContents.getURL()) {
    event.preventDefault();
    console.warn("Blocked navigation to:", url);
  }
});

win.webContents.setWindowOpenHandler(({ url }) => {
  console.warn("Blocked new window:", url);
  return { action: "deny" };
});
```

This prevents malicious links from navigating the app or opening popups.

### 3.3 Permission Request Handler

**Implementation:**

```ts
win.webContents.session.setPermissionRequestHandler(
  (webContents, permission, callback) => {
    // Only allow media access for file inputs; block everything else
    const allowedPermissions = ["media"];
    const url = webContents.getURL();
    if (url.startsWith("file://") || url.startsWith("media://")) {
      callback(allowedPermissions.includes(permission));
    } else {
      callback(false);
    }
  },
);
```

### 3.4 Electron Fuses (Packaging-Time Hardening)

**Reference:** Electron Fuses docs — these are "magic bits" flipped at package time before code signing.

**Recommended fuse configuration for Moshdither:**

| Fuse                               | Current  | Target       | Reason                                      |
| ---------------------------------- | -------- | ------------ | ------------------------------------------- |
| `runAsNode`                        | Enabled  | **Disabled** | Prevents `ELECTRON_RUN_AS_NODE` RCE vector  |
| `nodeOptions`                      | Enabled  | **Disabled** | Prevents `NODE_OPTIONS` env var tampering   |
| `nodeCliInspect`                   | Enabled  | **Disabled** | Prevents `--inspect` debugger injection     |
| `embeddedAsarIntegrityValidation`  | Disabled | **Enabled**  | Validates `app.asar` at load time           |
| `onlyLoadAppFromAsar`              | Disabled | **Enabled**  | Prevents loading unpacked `app/` directory  |
| `cookieEncryption`                 | Disabled | **Enabled**  | Encrypts cookie store with OS keys          |
| `grantFileProtocolExtraPrivileges` | Enabled  | **Disabled** | App uses `media://` protocol, not `file://` |

**Implementation:**

```js
// In electron-builder config or post-build script
const { flipFuses, FuseVersion, FuseV1Options } = require("@electron/fuses");

flipFuses(require("electron"), {
  version: FuseVersion.V1,
  [FuseV1Options.RunAsNode]: false,
  [FuseV1Options.EnableNodeOptionsEnvironmentVariable]: false,
  [FuseV1Options.EnableNodeCliInspectArguments]: false,
  [FuseV1Options.EnableEmbeddedAsarIntegrityValidation]: true,
  [FuseV1Options.OnlyLoadAppFromAsar]: true,
  [FuseV1Options.EnableCookieEncryption]: true,
  [FuseV1Options.GrantFileProtocolExtraPrivileges]: false,
});
```

### 3.5 Validate IPC Sender

**Current state:** IPC handlers do not validate `event.sender`.

**Reference:** Electron checklist item 17.

**Implementation:**

```ts
ipcMain.handle("render:pipeline", (event, ...args) => {
  const sender = event.senderFrame;
  if (
    !sender ||
    (sender.origin !== "media://" && !sender.url.startsWith("file://"))
  ) {
    throw new Error("Unauthorized IPC sender");
  }
  // ... existing logic
});
```

**Verification Gate:**

- Run `npm run build` and inspect fuses: `npx @electron/fuses read --app dist/`
- Confirm CSP headers appear in DevTools Network panel
- Confirm `will-navigate` blocks external URLs

---

## Phase 4: Type Safety & Architecture

**Goal:** Eliminate `any` types and tighten the preload API contract.

### 4.1 Harden `global.d.ts`

**Current state:** `window.ipcRenderer` is likely declared as an optional loose object.

**Implementation:**

```ts
// src/global.d.ts
import type { IpcRendererEvent } from "electron";

export interface HackedIpcRenderer {
  on(
    channel: string,
    listener: (event: IpcRendererEvent, ...args: unknown[]) => void,
  ): () => void;
  off(
    channel: string,
    listener: (event: IpcRendererEvent, ...args: unknown[]) => void,
  ): void;
  send(channel: string, ...args: unknown[]): void;
  invoke<T = unknown>(channel: string, ...args: unknown[]): Promise<T>;
}

declare global {
  interface Window {
    ipcRenderer: HackedIpcRenderer;
  }
}
```

### 4.2 Strict Effect Parameter Typing

**Current state:** `Effect.params` is `Record<string, any>`.

**Implementation:** Replace with a discriminated union:

```ts
interface DitherParams {
  ditherMode: 'bayer' | 'error_diffusion' | ...;
  numColors: number;
  // ... dither-specific params
}

interface HalftoneParams {
  dotSize: number;
  angleC: number;
  // ...
}

type EffectParams =
  | { type: 'dither' } & DitherParams
  | { type: 'halftone' } & HalftoneParams
  | { type: 'analog-glitch' } & { intensity: number }
  | ...;
```

This eliminates the `any` types in `WebGLCanvas.tsx` uniform binding and enables compile-time exhaustiveness checking.

### 4.3 WebGL Canvas Resize with devicePixelRatio

**Research finding:** WebGL2Fundamentals recommends handling `devicePixelRatio` for crisp rendering on HiDPI displays. Current code uses `wrapper.clientWidth/Height` but ignores DPR.

**Implementation:**

```ts
const dpr = window.devicePixelRatio || 1;
const displayWidth = Math.round(wrapper.clientWidth * dpr);
const displayHeight = Math.round(wrapper.clientHeight * dpr);

if (canvas.width !== displayWidth || canvas.height !== displayHeight) {
  canvas.width = displayWidth;
  canvas.height = displayHeight;
  gl.viewport(0, 0, canvas.width, canvas.height);
}
```

**Note:** Canvas CSS size should remain `100%` of wrapper; only the drawing buffer resolution changes.

**Verification Gate:**

- `npx tsc -b` passes with zero `any` warnings
- App renders crisply on 4K/Retina displays

---

## Phase 5: WebGL Production Hardening

**Goal:** Apply graphics-engine best practices learned from WebGL2Fundamentals and webgl-lint.

### 5.1 WebGL Resource Naming (Debuggability)

**Research finding:** `webgl-lint` supports naming WebGL objects so errors reference human-readable names.

**Implementation:**

```ts
// Wrap create* calls with debug names (stripped in production builds)
const DEBUG = import.meta.env.DEV;

function createNamedTexture(gl: WebGL2RenderingContext, name: string) {
  const tex = gl.createTexture();
  if (DEBUG && tex && (gl as any).getExtension("WEBGL_debug_renderer_info")) {
    (tex as any).__SPECTOR_Metadata = { name };
  }
  return tex;
}
```

This integrates with Spector.js and webgl-lint for frame capture debugging.

### 5.2 Shader Compilation Caching

**Current state:** Shaders are recompiled on every effect change. For a post-production tool, users may toggle effects frequently.

**Implementation:** Cache compiled programs keyed by `(vertexSourceHash, fragmentSourceHash)`:

```ts
const programCache = new Map<string, WebGLProgram>();

function getOrCreateProgram(gl, vs, fs) {
  const key = hashShaderPair(vs, fs);
  if (!programCache.has(key)) {
    programCache.set(key, createProgram(gl, vs, fs));
  }
  return programCache.get(key)!;
}
```

Cleanup only on app quit (or context loss), not on effect change.

### 5.3 Framebuffer Completeness Checking

**Current state:** `gl.framebufferTexture2D` is called without checking `gl.checkFramebufferStatus`.

**Implementation:**

```ts
function checkFramebufferComplete(gl: WebGL2RenderingContext) {
  const status = gl.checkFramebufferStatus(gl.FRAMEBUFFER);
  if (status !== gl.FRAMEBUFFER_COMPLETE) {
    throw new Error(`Framebuffer incomplete: 0x${status.toString(16)}`);
  }
}
```

Call after every `framebufferTexture2D` setup. Catches GPU memory exhaustion early.

### 5.4 Canvas ResizeObserver Integration

**Current state:** `WebGLCanvas.tsx` sets canvas size once on media load but does not respond to container resizing.

**Implementation:** Use `ResizeObserver` on `wrapperRef` to dynamically adjust canvas drawing buffer:

```ts
useEffect(() => {
  const observer = new ResizeObserver(() => {
    setMediaReadyRev((r) => r + 1); // triggers re-init with new size
  });
  if (wrapperRef.current) observer.observe(wrapperRef.current);
  return () => observer.disconnect();
}, []);
```

**Verification Gate:**

- Resize browser window / Electron window; canvas resizes smoothly
- Run with `?webgl-lint` query param; no resource leaks reported

---

## Phase 6: CI/CD & Quality Gates

**Goal:** Automate verification so no broken build ever reaches `main`.

### 6.1 GitHub Actions Workflow

```yaml
# .github/workflows/ci.yml
name: CI
on: [push, pull_request]
jobs:
  desktop-gui:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with: { node-version: 22 }
      - run: npm ci
        working-directory: packages/desktop-gui
      - run: npm run lint
        working-directory: packages/desktop-gui
      - run: npm run build
        working-directory: packages/desktop-gui
      - run: npx vitest run --project unit
        working-directory: packages/desktop-gui
      - run: npx playwright install chromium
      - run: npx vitest run --project browser
        working-directory: packages/desktop-gui
      - run: npx playwright test
        working-directory: packages/desktop-gui

  python-backend:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-python@v5
        with: { python-version: "3.12" }
      - run: pip install pytest
        working-directory: packages/python-backend
      - run: pytest
        working-directory: packages/python-backend
```

### 6.2 Pre-Commit Hooks

```json
// package.json
{
  "husky": {
    "hooks": {
      "pre-commit": "lint-staged"
    }
  },
  "lint-staged": {
    "*.{ts,tsx}": ["eslint --fix", "tsc --noEmit"]
  }
}
```

### 6.3 Build Verification Script

```bash
#!/bin/bash
# scripts/verify.sh
set -e
cd packages/desktop-gui
npx tsc -b
npx eslint .
npx vite build
cd ../python-backend
pytest
echo "All gates passed."
```

**Verification Gate:**

- Push to a test branch; confirm all CI jobs pass
- Confirm `dist/` artifact is generated and fuses are flipped in packaged build

---

## Risk Assessment & Deferrals

| Risk                                    | Impact | Mitigation                                                          |
| --------------------------------------- | ------ | ------------------------------------------------------------------- |
| Vitest browser mode adds ~60s to CI     | Medium | Run browser tests only on PRs, not every push                       |
| CSP blocks inline styles                | Medium | Keep `'unsafe-inline'` in `style-src` until Phase 5 CSS migration   |
| Fuses require code-signing redo         | Low    | Flip fuses in `afterPack` electron-builder hook, before signing     |
| Python token auth breaks manual testing | Low    | Add `--dev-mode` flag to `main.py` that skips auth when env var set |

**Deferred to v0.2.0:**

- ASAR integrity checksum pinning (requires signed release pipeline)
- Remote update mechanism (auto-updater) security review
- Hardware-accelerated video decode sandboxing

---

## Timeline Estimate

| Phase                           | Effort               | Parallelizable                              |
| ------------------------------- | -------------------- | ------------------------------------------- |
| Phase 1: Testing Infrastructure | 2 days               | Yes — unit tests can be written in parallel |
| Phase 2: Python Security        | 0.5 days             | Yes — independent of frontend               |
| Phase 3: Electron Security      | 1 day                | Yes — after Phase 1 mock layer is ready     |
| Phase 4: Type Safety            | 1 day                | Yes — pure refactoring                      |
| Phase 5: WebGL Hardening        | 1 day                | Yes — after Phase 1 browser tests           |
| Phase 6: CI/CD                  | 0.5 days             | Depends on all above                        |
| **Total**                       | **~6 engineer-days** | **3 people = 2 days**                       |

---

## Immediate Next Actions

1. **Approve this plan** — I can begin Phase 1 immediately.
2. **Confirm Python backend scope** — Should I replace the HTTP server with Node.js `UtilityProcess` / `fork`, or keep Python and harden it?
3. **Confirm release target** — Are we targeting code-signed `.exe` / `.dmg` builds, or is this currently dev-only?
