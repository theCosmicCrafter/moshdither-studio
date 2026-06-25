# MoshDither Studio — Project Context

## What Is This?

MoshDither Studio is a **Tauri v2 desktop application** for real-time video and image glitch-art processing. It combines a Rust backend (75+ effects, FFmpeg encoding, ONNX-based segmentation) with a React/TypeScript frontend (Zustand state, WebGL2 preview, neumorphic cyber-urban UI).

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Desktop framework | Tauri v2 |
| Backend | Rust 1.75+ |
| Frontend | React 18, TypeScript, Vite |
| State management | Zustand |
| Styling | Tailwind CSS + CSS variables (dark/light themes) |
| Video encoding | FFmpeg (via `ffmpeg-next` crate) |
| ML segmentation | ONNX Runtime (SAM3) |
| Image processing | `image` crate, custom Rust effect engine |
| Parallel processing | Rayon |
| Icons | Material Symbols Outlined |

## Architecture Overview

```
Frontend (React/TS)                    Backend (Rust/Tauri)
┌─────────────────────┐               ┌──────────────────────────┐
│  AppLayout           │               │  lib.rs (Tauri builder)   │
│  ├─ Toolbar          │  IPC commands │  ├─ commands.rs           │
│  ├─ PreviewViewport  │ ◄──────────► │  ├─ effects/              │
│  ├─ EffectBrowser    │               │  │   ├─ engine.rs (rayon) │
│  ├─ Timeline         │               │  │   ├─ registry.rs       │
│  ├─ ExportPanel      │               │  │   └─ */ (75+ effects)  │
│  ├─ MaskPanel        │               │  ├─ spout/ (stub)         │
│  └─ CommandPalette   │               │  ├─ audio/                │
│                      │               │  └─ sam3/                 │
│  Store (Zustand)     │               │                           │
│  WebGL2 preview      │               │  AppState                 │
│  Keyboard shortcuts  │               │  ├─ EffectRegistry        │
│  Theme system        │               │  └─ Sam3Engine            │
└─────────────────────┘               └──────────────────────────┘
```

## Key Directories

- `src-tauri/src/effects/` — Rust effect engine, registry, and all effect implementations
- `src-tauri/src/commands.rs` — Tauri IPC commands (export, apply, SAM3, metadata)
- `src-tauri/src/spout/` — Spout GPU output stub (Windows)
- `src/components/` — React UI components
- `src/store/index.ts` — Zustand global state store
- `src/hooks/` — Custom React hooks (keyboard, project, audio)
- `src/lib/tauri.ts` — Frontend Tauri IPC wrappers
- `src/index.css` — CSS variables for dark/light theming
- `docs/` — Project documentation (PRD, checklists, plans, ADRs)

## Effect System

Effects implement the `Effect` trait with `meta()`, `process_frame()`, and `process_video()`. The `EffectRegistry` holds all registered effects. The `EffectStack` in `engine.rs` applies effects sequentially, with Rayon parallelization for non-temporal effects on video segments.

Categories: Dithering, Analog, Color, Composite, Pixel Geometry, Glitch, Noise, Artistic, Datamoshing, Segmentation, Audio-Reactive.

## State Management

The Zustand store (`src/store/index.ts`) is the single source of truth for:
- Media state (loaded file, preview, original)
- Effect stack (ordered, toggleable, with parameters)
- Timeline (current time, in/out points, playback)
- Masks (SAM3, custom, active mask, visibility)
- UI state (HUD overlays, theme, panels, zoom)
- Export state (progress, queue, watermark, aspect ratio)

## Build & Run

```bash
# Frontend
npm install
npm run dev      # Vite dev server
npm run build    # Production build

# Backend
cd src-tauri
cargo check --lib    # Type check
cargo build          # Build
```

## Testing

- `npm run lint` — ESLint with zero warnings target
- `cargo check --lib` — Rust type checking
- Manual testing via Tauri dev: `npm run tauri dev`

## Key Design Decisions

See `docs/adr/` for Architecture Decision Records.
