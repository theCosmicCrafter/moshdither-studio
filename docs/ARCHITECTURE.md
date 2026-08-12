# Architecture

## Overview

MoshDither Studio is a Tauri v2 desktop application. The frontend is a React + TypeScript web app running in a WebView. The backend is a Rust application exposing commands via Tauri's IPC system.

## Stack

| Layer    | Tech                                          |
| -------- | --------------------------------------------- |
| Desktop  | Tauri v2                                      |
| Frontend | Vite + React 18 + TypeScript 5 + Tailwind CSS |
| State    | Zustand                                       |
| Backend  | Rust (stable)                                 |
| Image    | `image` crate                                 |
| Parallel | `rayon`                                       |
| Video    | FFmpeg sidecar                                |
| ML       | ONNX Runtime via `ort` crate                  |

## IPC Flow

```
React UI → invoke("process_media", args) → Tauri → Rust command → Effect engine → Result
```

## Effect System

Every feature is an `Effect` trait implementation. Effects are grouped by category in `src-tauri/src/effects/`. The `EffectStack` runs them in order.

See [API_SPEC.md](API_SPEC.md) for the trait definition.

## Project File Format

```json
{
  "version": "1.0.0",
  "source": { "type": "video", "path": "..." },
  "effectStack": [
    { "effectId": "dither.bayer", "params": { "matrixSize": 8 } }
  ],
  "masks": [],
  "export": { "format": "mp4", "codec": "h264" }
}
```
