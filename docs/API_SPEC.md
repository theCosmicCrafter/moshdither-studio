# MoshDither Studio — API Specification

**Version:** 0.2.0  
**Date:** June 19, 2026  
**Scope:** Tauri v2 IPC commands (frontend ↔ Rust backend) and SAM3 Python bridge

---

## 1. Tauri IPC Commands

All communication between the React frontend and Rust backend uses Tauri v2's `invoke()` API. The frontend wrapper lives in `src/lib/tauri.ts`.

### 1.1 Media & Effects

| Command | Parameters | Return | Description |
|---------|-----------|--------|-------------|
| `load_media` | `path: string` | `string` | Load image/video from filesystem path. Decodes first frame for preview. |
| `load_media_from_base64` | `dataUrl: string` | `void` | Load media from a base64 data URL (e.g. drag-drop). |
| `list_effects` | — | `EffectMeta[]` | List all registered effects (75+ across 11 categories). |
| `list_effects_by_category` | `category: string` | `EffectMeta[]` | Filter effects by category (dithering, analog, color, glitch, etc.). |
| `apply_effect` | `effectId: string, params: Record, maskB64?: string` | `string` (data URL) | Apply a single effect to the current frame. Returns processed image as PNG data URL. |
| `apply_effect_stack` | `stack: StackEntry[], maskB64?: string` | `string` (data URL) | Apply the full effect stack to the current frame. Each entry has `effect_id`, `params`, `mask_b64`, `mask_mode`. |
| `get_frame_data` | — | `string` (data URL) | Get the current frame as a PNG data URL. |
| `save_media` | `path: string, format: string, quality: number` | `void` | Save current frame to file (PNG/JPEG/BMP/TIFF). |
| `export_video` | `sourcePath, outputPath, stack, maskB64?, codec?, fps?, width?, height?, audioBakeJson?, watermark?, trimStart?, trimEnd?` | `string` (output path) | Export video with effect stack applied via FFmpeg. |
| `apply_ffglitch` | `inputPath, outputPath, mode, params` | `string` (output path) | Apply FFglitch datamoshing mode (ffgac/ffedit). |

### 1.2 Media Info & Proxy

| Command | Parameters | Return | Description |
|---------|-----------|--------|-------------|
| `get_media_info` | — | `{ width: number, height: number, loaded: boolean }` | Get dimensions and load status of current media. |
| `get_media_metadata` | `path: string` | `Record<string, unknown>` | Probe media file metadata via ffprobe (codec, duration, bitrate, etc.). |
| `generate_proxy_command` | `sourcePath: string, maxWidth: number, crf: number` | `string` (proxy path) | Generate a low-resolution H.264 proxy video via FFmpeg for smooth preview. Returns proxy file path. |

### 1.3 SAM3 Segmentation

| Command | Parameters | Return | Description |
|---------|-----------|--------|-------------|
| `sam3_init` | — | `string` | Initialize SAM3 ONNX Runtime engine. |
| `sam3_load_image` | `imageB64: string` | `{ width: number, height: number }` | Load an image into the SAM3 model for segmentation. |
| `sam3_text_prompt` | `prompt: string` | `{ count, masks: string[], scores: number[] }` | Segment using natural language prompt (e.g. "the red car"). |
| `sam3_point_prompt` | `points: [number, number][], labels?: number[]` | `{ count, masks: string[], scores: number[] }` | Segment using foreground/background click points. |
| `sam3_box_prompt` | `boxes: [number, number, number, number][]` | `{ count, masks: string[], scores: number[] }` | Segment using bounding box coordinates. |
| `sam3_auto_mask` | `gridSize, iouThreshold, minMaskRegionArea` | `{ count, masks: string[], scores: number[] }` | Automatic mask generation across the image. |
| `sam3_postprocess_mask` | `maskB64, grow, shrink, feather, fillHoles` | `string` (mask data URL) | Post-process a mask: grow/shrink edges, feather, fill holes. |
| `sam3_clear` | — | `string` | Clear SAM3 session state. |
| `sam3_shutdown` | — | `string` | Shut down SAM3 engine and free resources. |

### 1.4 Environment & File I/O

| Command | Parameters | Return | Description |
|---------|-----------|--------|-------------|
| `get_environment_status` | — | `EnvStatus` | Check availability of Python, FFmpeg, ffprobe, FFglitch binaries. |
| `install_local_environment` | — | `EnvStatus` | Install/repair local Python venv and dependencies. |
| `save_file` | `path: string, content: string` | `void` | Write text content to a file path. |
| `read_file` | `path: string` | `string` | Read text content from a file path. |

### 1.5 Dialog Plugins

| Function | Parameters | Return | Description |
|----------|-----------|--------|-------------|
| `open()` | `OpenDialogOptions` | `string \| null` | Native file picker (via `@tauri-apps/plugin-dialog`). |
| `save()` | `SaveDialogOptions` | `string \| null` | Native save dialog (via `@tauri-apps/plugin-dialog`). |
| `convertFileSrc()` | `path: string` | `string` (URL) | Convert a filesystem path to a WebView-servable URL. |

### 1.6 Security Model

- **Tauri v2 IPC:** Only commands registered in `invoke_handler!` can be called from the frontend.
- **Context isolation:** Enabled. The frontend has no direct access to the filesystem or system APIs.
- **Asset protocol:** `convertFileSrc()` provides controlled access to local files via Tauri's asset protocol.
- **SAM3 bridge:** Python subprocess communicates via stdin/stdout IPC with the Rust process. No network port is opened.

---

## 2. SAM3 Python Bridge

The SAM3 segmentation engine runs as a Python subprocess managed by the Rust backend (`src-tauri/src/sam3_engine.rs`). Communication uses stdin/stdout JSON messages (not HTTP).

### 2.1 Protocol

1. Rust spawns `python sam3_bridge.py` as a child process
2. Rust sends JSON commands via stdin
3. Python responds with JSON via stdout
4. Each message is a single line of JSON terminated by `\n`

### 2.2 Commands

| Method | Params | Description |
|--------|--------|-------------|
| `init` | `model_path?` | Load SAM3 ONNX model into memory |
| `load_image` | `image_b64` | Decode base64 image and set as SAM3 input |
| `text_prompt` | `prompt` | Text-based segmentation |
| `point_prompt` | `points, labels` | Point-based segmentation (foreground/background) |
| `box_prompt` | `boxes` | Bounding box segmentation |
| `auto_mask` | `grid_size, iou_threshold, min_mask_region_area` | Automatic mask generation |
| `postprocess` | `mask_b64, grow, shrink, feather, fill_holes` | Mask post-processing |
| `clear` | — | Clear current session |
| `shutdown` | — | Terminate Python process |

### 2.3 Response Format

```json
{
  "status": "ok" | "error",
  "data": { ... },
  "message": "optional error message"
}
```

---

## 3. Data Types

### 3.1 `EffectMeta`

```ts
interface EffectMeta {
  id: string;           // e.g. "dithering.bayer"
  name: string;         // e.g. "Bayer Dither"
  category: string;     // e.g. "dithering"
  media_type: string;   // "image" | "video" | "both"
  parameters: EffectParam[];
}
```

### 3.2 `StackEntry`

```ts
interface StackEntry {
  id: string;
  effectId: string;
  effectName: string;
  params: Record<string, unknown>;
  enabled: boolean;
  maskId: string | null;
  maskMode: "inside" | "outside" | "alpha";
}
```

### 3.3 `EnvStatus`

```ts
interface EnvStatus {
  mode: string;
  python_ok: boolean;
  venv_ok: boolean;
  pip_ok: boolean;
  ffmpeg_ok: boolean;
  ffprobe_ok: boolean;
  ffglitch_ok: boolean;
  python_path?: string;
  venv_dir?: string;
  ffmpeg_path?: string;
  ffprobe_path?: string;
  ffgac_path?: string;
  ffedit_path?: string;
  mosh_cli_path?: string;
}
```

### 3.4 `Track` (Multi-Track Layering)

```ts
interface Track {
  id: string;
  name: string;
  visible: boolean;
  opacity: number;       // 0-1
  blendMode: BlendMode;
  effectStack: StackEntry[];
  filePath: string | null;
}

type BlendMode = "normal" | "multiply" | "screen" | "overlay" | "darken" |
  "lighten" | "color-dodge" | "color-burn" | "hard-light" | "soft-light" |
  "difference" | "exclusion";
```

### 3.5 Proxy Media State

```ts
interface ProxyMediaState {
  proxyEnabled: boolean;
  proxyPath: string | null;
  proxyMaxWidth: number;   // default: 1280
  proxyCrf: number;        // default: 28
  proxyGenerating: boolean;
}
```

---

## 4. Error Handling

Tauri commands return `Result<T, String>` where the error string is displayed to the user. Common error patterns:

| Error | Context | Cause |
|-------|---------|-------|
| `FFmpeg not found` | Export, proxy generation | FFmpeg binary not in PATH or bundled location |
| `Failed to decode video` | `load_media` | Unsupported codec or corrupted file |
| `SAM3 not initialized` | SAM3 commands | `sam3_init` not called before other SAM3 commands |
| `Python bridge not started` | SAM3 commands | Python or ONNX Runtime not installed |
| `IO error: ...` | File operations | Permission denied, disk full, path not found |

---

## 5. Frontend Wrapper API

All Tauri commands are wrapped in `src/lib/tauri.ts` as typed async functions. Import pattern:

```ts
import { loadMediaFile, applyEffectStack, generateProxy } from "../lib/tauri";
```

The wrapper handles:
- Type-safe `invoke()` calls with proper parameter naming (camelCase → snake_case conversion by Tauri)
- Dialog integration (`open()` / `save()` for file pickers)
- `convertFileSrc()` for displaying local files in `<img>` / `<video>` tags
