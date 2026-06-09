# MoshDither Studio — API Specification

**Version:** 0.1.0  
**Date:** June 9, 2026  
**Scope:** Electron IPC channels (renderer ↔ main) and Python RPC endpoints

---

## 1. Electron IPC Channels

All IPC communication between the renderer and main process is mediated by the preload script (`electron/preload.ts`), which enforces a strict channel whitelist.

### 1.1 Renderer → Main (Invoke)

| Channel | Payload | Return | Description |
|---------|---------|--------|-------------|
| `dialog:openMedia` | — | `string \| null` | Open file picker for media (jpg, jpeg, png, mp4, webm). Returns `media://` URL. |
| `dialog:selectOutputDir` | — | `string \| null` | Open directory picker for export output. |
| `get-default-output-dir` | — | `string` | Returns the default output directory path. |
| `get-rpc-token` | — | `string` | Returns the Python RPC auth token (256-bit hex). |
| `render:pipeline` | `inputUrl, effects[], outputDir?, format?, fps?` | `string \| null` | Execute the full render/export pipeline. Returns result media URL. |
| `main:save-webgl-blob` | `{ data: ArrayBuffer, ext: string }` | `string` | Save a WebGL-captured blob to temp directory. Returns file path. |

### 1.2 Main → Renderer (Events)

| Channel | Payload | Description |
|---------|---------|-------------|
| `main:webgl-export-request` | `{ inputUrl: string, duration: number, fps: number }` | Request renderer to capture WebGL canvas and return blob via `main:save-webgl-blob`. |
| `render:progress` | `{ percent: number, log: string }` | Progress update during render pipeline execution. |
| `main-process-message` | `string` | Generic heartbeat/status message from main process. |

### 1.3 Security Model

- **Preload whitelist:** Only channels listed above can be sent/received.
- **Sender validation:** Every `ipcMain.handle()` call verifies `event.senderFrame.url` is from `file://`, `media://`, or the dev server origin.
- **Context isolation:** Enabled. Renderer cannot access Node.js APIs directly.

---

## 2. Python RPC API

The Python backend (`packages/python-backend/main.py`) exposes a JSON-RPC 1.0-like HTTP endpoint at `127.0.0.1` on an ephemeral port (default: `0`, OS-assigned).

### 2.1 Authentication

All requests must include the `X-RPC-Token` header matching the `MOSHDITHER_RPC_TOKEN` environment variable.

```
POST / HTTP/1.1
Host: 127.0.0.1:<port>
X-RPC-Token: <256-bit-hex-token>
Content-Type: application/json
Content-Length: <length>
```

Requests without a valid token receive `403 Forbidden`.

### 2.2 POST / — JSON-RPC Request

**Request body:**

```json
{
  "method": "neural_downscale",
  "params": {
    "input_path": "/path/to/input.png",
    "scale": 0.5,
    "output_path": "/path/to/output.png"
  },
  "id": 1
}
```

**Response (success):**

```json
{
  "jsonrpc": "2.0",
  "result": {
    "status": "success",
    "message": "Neural downscale complete",
    "params": { ... }
  },
  "id": 1
}
```

**Response (error):**

```json
{
  "jsonrpc": "2.0",
  "error": "Method not found: unknown_method",
  "id": 1
}
```

### 2.3 Methods

| Method | Params | Description |
|--------|--------|-------------|
| `neural_downscale` | `input_path`, `scale`, `output_path` | Placeholder for PyTorch-based neural downscaling. |

### 2.4 Security Limits

- Max payload: 1 MB (`Content-Length` > 1MB → `413 Payload Too Large`)
- Allowed methods are strictly allowlisted. Unknown methods → `404`
- Params must be an object. Unexpected keys are rejected with `400`

---

## 3. Custom Protocol: `media://`

The app registers a privileged custom protocol to serve local media files securely.

```
media://C:/Users/Alice/Pictures/photo.jpg
```

**Security features:**
- Path traversal blocked (`../` sequences rejected)
- Relative paths rejected (must be absolute)
- Only file read access; no directory listing or write

---

## 4. Data Types

### 4.1 `PipelineEffect`

```ts
interface PipelineEffect {
  enabled: boolean;
  type: string;
  params: Record<string, unknown>;
  startTime?: number;
  endTime?: number;
}
```

### 4.2 `Effect` (Renderer State)

```ts
interface Effect {
  id: string;
  name: string;
  type: EffectType;
  enabled: boolean;
  params: Record<string, unknown>;
  startTime: number;
  endTime: number;
  mask: {
    type: "none" | "brush";
    invert: boolean;
    brushData?: string; // dataURL
  };
}
```

---

## 5. Error Codes

| Code | Context | Meaning |
|------|---------|---------|
| `400` | Python RPC | Malformed request (bad JSON, invalid params) |
| `403` | Python RPC / media | Invalid or missing auth token / path traversal blocked |
| `404` | Python RPC | Method not found |
| `413` | Python RPC | Payload exceeds 1MB limit |
| `500` | Python RPC | Internal server error |
| `500` | media protocol | Error reading file from disk |
