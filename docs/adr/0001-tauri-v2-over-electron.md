# ADR-0001: Choose Tauri v2 over Electron

## Status
Accepted

## Context
MoshDither Studio was originally prototyped as an Electron app. We needed to choose a desktop framework for the production version that would provide better performance, smaller bundle size, and native Rust integration for image/video processing.

## Decision
We chose **Tauri v2** as the desktop framework.

## Rationale
- **Bundle size**: Tauri apps are ~10MB vs Electron's ~150MB+
- **Native Rust**: The effect engine, FFmpeg encoding, and ONNX segmentation run natively in Rust without Node.js overhead
- **Security**: Tauri's IPC model is more restrictive by default, reducing attack surface
- **Performance**: Direct Rust-to-frontend IPC without V8 serialization overhead
- **Cross-platform**: Tauri v2 supports Windows, macOS, and Linux with native webviews

## Consequences
- Frontend must use Tauri IPC APIs instead of Node.js APIs
- File system access goes through Tauri commands, not `fs` module
- Drag & drop uses Tauri webview API instead of HTML5 drag events
- Plugin ecosystem is smaller than Electron's but growing
