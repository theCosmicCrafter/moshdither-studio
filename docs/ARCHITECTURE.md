# MoshDither Studio — System Architecture

**Version:** 1.5.0-beta  
**Date:** June 9, 2026  
**Scope:** End-to-end system design, data flow, IPC contracts, WebGL pipeline

---

## 1. Overview

MoshDither Studio is a monorepo containing three packages that form a creative post-production pipeline:

| Package | Runtime | Role |
|---------|---------|------|
| `desktop-gui` | Electron (main + renderer) | User interface, WebGL preview, file I/O orchestration |
| `mosh-engine` | Node.js (main process) | Adapters that bridge TypeScript IPC to Python CLI tools |
| `python-backend` | Python 3.12 | Video processing: FFglitch datamoshing, ffmpeg encoding, neural downscale RPC |

```
┌─────────────────────────────────────────────────────────────┐
│                     Electron Main Process                     │
│  ┌─────────────┐  ┌──────────────┐  ┌─────────────────────┐ │
│  │  IPC Router │  │ File Dialogs │  │ Python Spawner      │ │
│  │  (preload)  │  │ (dialog:*)   │  │ (spawn + token)     │ │
│  └──────┬──────┘  └──────┬───────┘  └──────────┬──────────┘ │
│         │                │                     │            │
│  ┌──────┴──────┐  ┌──────┴───────┐  ┌──────────┴──────────┐ │
│  │ media://    │  │ Custom       │  │ get-rpc-token         │ │
│  │ Protocol    │  │ Protocol     │  │ render:pipeline       │ │
│  └─────────────┘  └──────────────┘  └─────────────────────┘ │
└─────────────────────────────────────────────────────────────┘
                              │
        ┌─────────────────────┼─────────────────────┐
        │  contextBridge      │                     │
        ▼                     ▼                     ▼
┌───────────────┐     ┌──────────────┐     ┌──────────────────┐
│  Renderer     │     │  Renderer    │     │  Python Backend  │
│  (React 19)   │     │  (WebGL2)  │     │  (HTTP RPC)      │
│               │     │              │     │                  │
│  UI State     │     │  Shader    │     │  mosh_cli.py     │
│  Components   │     │  Pipeline  │     │  main.py         │
│  Context API  │     │  Canvas    │     │  ffmpeg          │
└───────────────┘     └──────────────┘     └──────────────────┘
```

---

## 2. Package Breakdown

### 2.1 `desktop-gui` (Electron Application)

**Main Process** (`electron/main.ts`)
- Window lifecycle (`BrowserWindow`, `activate`, `window-all-closed`)
- IPC handler registration with sender validation
- Custom `media://` protocol for safe local file serving
- Python process spawning with `MOSHDITHER_RPC_TOKEN` env var
- Electron Fuses configuration (packaging-time hardening)

**Preload** (`electron/preload.ts`)
- `contextBridge.exposeInMainWorld("ipcRenderer", {...})`
- Whitelist enforcement: `VALID_SEND_CHANNELS`, `VALID_RECEIVE_CHANNELS`
- Returns unsubscribe functions for `.on()` listeners

**Renderer** (`src/`)
- React 19 with `StudioContext` for global state
- WebGL2 canvas for real-time preview
- Tailwind CSS + CSS custom properties for styling

### 2.2 `mosh-engine` (TypeScript Adapters)

- `MosherAdapter`: Spawns `mosh_cli.py` for datamoshing
- `DitherAdapter`: Spawns `dither_cli.py` for dithering (now async, no sync file I/O)

### 2.3 `python-backend` (Python Processing)

- `mosh_cli.py`: FFglitch wrapper with safe argument list construction (no shell injection)
- `main.py`: Secure JSON-RPC HTTP server with token authentication

---

## 3. Data Flow

### 3.1 Media Import Flow

```
User clicks Import
  → Renderer: window.ipcRenderer.invoke("dialog:openMedia")
    → Preload: validates channel whitelist
      → Main: dialog.showOpenDialog()
        → User selects file
          → Main: returns media://C:/path/to/file.mp4
            → Renderer: setMediaUrl("media://...")
              → WebGLCanvas: loads video via <video> element
                → WebGL texture upload on loadeddata
```

### 3.2 Render Pipeline Flow

```
User clicks "Render & Export"
  → Renderer: invoke("render:pipeline", mediaUrl, effects, outputDir, format, fps)
    → Main: validateIpcSender()
      → Main: getPathFromMediaUrl() (sanitize path)
        → Main: classify effects (webgl vs python)
          → WebGL effects: captureWebGLFromRenderer()
            → Main sends "main:webgl-export-request" to renderer
              → Renderer: canvas.captureStream() → MediaRecorder
                → Renderer: invoke("main:save-webgl-blob")
                  → Main: fs.writeFileSync(tempPath)
          → Python effects: mosher.applyMosh() / ditherer.applyDither()
            → Spawn python mosh_cli.py with args[] (no shell injection)
              → Python: subprocess.run([ffmpeg, ...]) with check=True
          → Main: ffmpeg final encode (runFfmpeg)
            → Main: return resultUrl to renderer
              → Renderer: addToast("Render successful!")
```

### 3.3 Effect Parameter Update Flow

```
User adjusts slider in PropertiesPanel
  → updateParam(key, value)
    → setActiveEffects(map + spread)
      → StudioContext updates state
        → Undo stack: setPast([...past, prevState])
        → WebGLCanvas effect re-runs (activeEffects dependency)
          → Recompiles shaders for changed effects
            → render() loop uses new uniform values
```

---

## 4. IPC Contract

See [`API_SPEC.md`](./API_SPEC.md) for the full channel reference.

**Security model:**
1. Preload whitelists channels
2. Main validates `event.senderFrame.url` origin
3. Renderer never accesses Node.js APIs directly

---

## 5. WebGL Pipeline

### 5.1 Resource Lifecycle

```
Effect changes → useEffect re-runs
  → cleanup: deleteProgram, deleteTexture, deleteBuffer, deleteFramebuffer
  → init: compile shaders → create textures → create FBOs
  → render(): requestAnimationFrame loop
```

### 5.2 Ping-Pong Rendering

For N effects, the pipeline uses 2 offscreen framebuffers:
- Pass 0: input texture → FBO 0
- Pass 1: FBO 0 texture → FBO 1
- Pass 2: FBO 1 texture → FBO 0
- ... alternating
- Final pass: last FBO → screen (null framebuffer)

### 5.3 HiDPI Support

Canvas drawing buffer resolution = CSS display size × `window.devicePixelRatio`.
`gl.viewport(0, 0, canvas.width, canvas.height)` is called after every resize.

---

## 6. State Management

### 6.1 Global State (`StudioContext`)

Single `useReducer`-like pattern with `useState`:
- `activeEffects`: effect stack (source of truth)
- `mediaUrl`: currently loaded media
- `selectedEffectId`: which effect is being edited
- `currentTime / duration`: playback timeline
- `isPaintingMask`: mask brush mode
- `undo / redo`: capped at 50 entries

### 6.2 Undo/Redo

```
setActiveEffects(newEffects)
  → setPast(prev => [...prev.slice(-49), previousState])
  → clear future

undo()
  → setFuture(prev => [current, ...prev])
  → setActiveEffects(past.pop())
```

---

## 7. Security Boundaries

| Boundary | Attack Vector | Mitigation |
|----------|--------------|------------|
| Renderer ↔ Main | Malicious renderer code | contextIsolation, sandbox, preload whitelist |
| Main ↔ Filesystem | Path traversal | `validateMediaPath()` blocks `..` and relative paths |
| Main ↔ Python | Shell injection | Argument arrays, no `shell=True` |
| Python ↔ Network | Unauthorized RPC access | Token auth, ephemeral port, 127.0.0.1 only |
| Package ↔ OS | Living-off-the-land | Electron fuses disable `runAsNode`, `nodeOptions` |

---

## 8. Build & Packaging

```
dev:     vite dev server + Electron
build:   tsc -b && vite build (renderer + main + preload)
package: electron-builder (ASAR + fuses + code sign)
```

See [`PRODUCTION_HARDENING_PLAN.md`](./PRODUCTION_HARDENING_PLAN.md) for packaging hardening.
