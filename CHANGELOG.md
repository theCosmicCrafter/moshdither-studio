# Changelog

All notable changes to MoshDither Studio are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Security
- Electron main process: validate IPC sender origin on all handlers (`validateIpcSender`)
- Python RPC backend: token authentication via `X-RPC-Token` header (256-bit, timing-attack resistant)
- Python RPC backend: ephemeral port binding (port=0) to prevent predictable discovery
- Python RPC backend: input validation (method allowlist, payload cap 1MB)
- ffmpeg argument list construction (no shell injection via `subprocess.run`)
- Navigation blocking: `will-navigate` handler blocks external URLs
- Popup blocking: `setWindowOpenHandler` denies all new windows
- Permission handler restricts to `media` only
- Electron fuses: `scripts/flip-fuses.js` disables `runAsNode`, `nodeOptions`, `nodeCliInspect`, enables ASAR integrity validation

### Added
- Production Hardening Plan (`docs/PRODUCTION_HARDENING_PLAN.md`)
- System Architecture document (`docs/ARCHITECTURE.md`)
- API Specification (`docs/API_SPEC.md`)
- Testing Strategy (`docs/TESTING_STRATEGY.md`)
- Security Policy (`SECURITY.md`)
- Contributing Guide (`CONTRIBUTING.md`)
- CI/CD pipeline (`.github/workflows/ci.yml`)
- React Error Boundary (`src/components/templates/ErrorBoundary.tsx`)
- IPC mock utility for unit tests (`src/test/ipcMock.ts`)
- HiDPI/Retina support in WebGL canvas (`devicePixelRatio` scaling)
- WebGL `ResizeObserver` for dynamic canvas resizing
- WebGL framebuffer completeness checks after FBO creation
- Uniform location caching in WebGL render loop
- Shader program + texture + buffer + framebuffer tracking with bulk cleanup
- `get-rpc-token` IPC channel for renderer-to-Python auth

### Changed
- Renamed `HackedIpcRenderer` → `IpcRendererApi` in `global.d.ts`
- `DitherAdapter` refactored from sync `fs` to async `fs.promises`
- Python `main.py` rewritten with secure request handling and structured JSON-RPC responses
- Python `mosh_cli.py`: `ffmpeg_convert` now accepts argument arrays, captures stderr, throws on failure
- All `setActiveEffects` calls updated to functional updates where stale closure was possible
- Sidebar effect ID generation now uses stable counter + `Date.now()` with `crypto.randomUUID` fallback

### Fixed
- Path traversal vulnerability in `getPathFromMediaUrl`: traversal sequences now blocked before normalization
- React 19 `setState-in-effect` violation in `WebGLCanvas.tsx` (deferred via microtask)
- React 19 purity violation: `Date.now()` no longer called directly during render scope in Sidebar
- React Compiler memoization failure in `Viewport.tsx` (`activeFx` memoized, `brushDataRef` pattern)
- Missing `mask` property on newly created effects (inconsistent object shape)
- Stale closure in `handlePointerUp` mask saving (now uses functional state update)
- Missing `useEffect` dependency (`activeFx?.mask?.brushData` in Viewport)
- Broken IPC listener cleanup in `App.tsx` (now properly unsubscribes)
- Deprecated `String.prototype.substr` replaced with `.substring()`
- `EffectCard.tsx` unused import (`Button`)

---

## [0.1.0] - 2026-06-09

### Added
- Initial release with Electron 42 + React 19 + Vite 8
- Real-time WebGL2 shader preview (halftone, analog glitch, CRT phosphor, temporal noise, epsilon glow)
- Advanced dithering engine (Bayer, error diffusion, blue noise, polka dot, wavelet, adaptive variance)
- Datamoshing pipeline via FFglitch + ffmpeg
- Effect stacking with per-layer parameters, time ranges, and mask painting
- Mask painting system (brush + eraser on HTML5 canvas)
- Undo/redo history (50 states)
- Media import (images + video) via custom `media://` protocol
- Video export (WebGL capture stream + MediaRecorder)
- Toast notification system
- Preset manager for saving/loading effect stacks
- Timeline scrubber for video playback

### Security
- Context isolation enabled
- Node integration disabled
- Sandbox enabled in renderer
- IPC channel whitelist in preload script
- Custom protocol with path traversal prevention
