# MoshDither Studio — Project Structure Plan

**Status:** Pending user approval before any code is written.
**Goal:** Industry-standard open source Rust + Tauri v2 project layout.

---

## 1. Top-Level Layout

```text
moshdither-studio/
├── .github/
│   ├── workflows/
│   │   ├── ci.yml                 # Lint, test, build on PR/push
│   │   ├── release.yml            # Automated release builds (Windows, macOS, Linux)
│   │   └── dependabot.yml         # Automated dependency updates
│   ├── CODE_OF_CONDUCT.md
│   ├── CONTRIBUTING.md
│   └── SECURITY.md
├── assets/
│   ├── icons/                     # App icons (macOS .icns, Windows .ico, Linux .png)
│   ├── splash.png                 # App splash screen
│   └── fonts/                     # Bundled fonts (if any)
├── docs/
│   ├── PRD.md                     # Product Requirements Document (already exists)
│   ├── ARCHITECTURE.md            # Technical architecture decisions
│   ├── API.md                     # Effect trait API reference for contributors
│   ├── EFFECT_GUIDE.md            # How to add a new effect (contributor guide)
│   └── FOLDER_STRUCTURE_PLAN.md   # This file
├── scripts/
│   ├── setup-ffmpeg.ps1           # Windows: download/copy FFmpeg sidecar
│   ├── setup-ffmpeg.sh            # macOS/Linux: download/copy FFmpeg sidecar
│   ├── build-release.ps1          # Windows release build
│   └── build-release.sh           # macOS/Linux release build
├── src-tauri/                     # Tauri v2 Rust backend
│   ├── Cargo.toml
│   ├── build.rs
│   ├── tauri.conf.json
│   ├── capabilities/
│   │   └── default.json
│   ├── icons/
│   └── src/
│       ├── main.rs
│       ├── lib.rs
│       ├── commands.rs            # Tauri IPC command handlers
│       ├── app_state.rs           # Shared app state (preview buffers, jobs)
│       ├── config.rs              # App configuration / settings
│       ├── error.rs               # Centralized error types
│       ├── ffmpeg/                # FFmpeg orchestration
│       │   ├── mod.rs
│       │   ├── decode.rs          # Video → frame sequence
│       │   ├── encode.rs          # Frame sequence → video
│       │   ├── probe.rs           # ffprobe metadata extraction
│       │   └── sidecar.rs         # Locate FFmpeg binary
│       ├── effects/               # Effect system
│       │   ├── mod.rs             # Effect trait, registry, categories
│       │   ├── engine.rs          # Pipeline execution (linear stack)
│       │   ├── preview.rs         # Preview renderer (fast tier)
│       │   ├── types.rs           # Frame, VideoSegment, Mask, ParameterDef types
│       │   ├── datamoshing/       # Category: Datamoshing
│       │   │   ├── mod.rs
│       │   │   ├── iframe_removal.rs
│       │   │   ├── frame_reorder.rs
│       │   │   ├── frame_repeat.rs
│       │   │   └── motion_transfer.rs
│       │   ├── dithering/         # Category: Dithering
│       │   │   ├── mod.rs
│       │   │   ├── bayer.rs
│       │   │   ├── floyd_steinberg.rs
│       │   │   ├── atkinson.rs
│       │   │   ├── blue_noise.rs
│       │   │   └── ... (add more as needed)
│       │   ├── glitch/            # Category: Glitch
│       │   │   ├── mod.rs
│       │   │   ├── jpeg_quant.rs
│       │   │   ├── jpeg_scan_corrupt.rs
│       │   │   └── databend.rs
│       │   ├── analog/            # Category: Analog / VHS / CRT
│       │   │   ├── mod.rs
│       │   │   ├── vhs.rs
│       │   │   ├── scanlines.rs
│       │   │   └── chromatic_aberration.rs
│       │   ├── pixel_geo/         # Category: Pixel Geometry
│       │   │   ├── mod.rs
│       │   │   ├── pixel_sort.rs
│       │   │   ├── kaleidoscope.rs
│       │   │   └── wave_distort.rs
│       │   ├── segmentation/      # Category: Segmentation (SAM3)
│       │   │   ├── mod.rs
│       │   │   ├── sam3.rs        # ONNX Runtime integration
│       │   │   └── mask_ops.rs    # Mask compositing (inside/outside/alpha)
│       │   └── artistic/          # Category: Artistic
│       │       ├── mod.rs
│       │       ├── luminous_flow.rs
│       │       └── vaporwave.rs
│       ├── segmentation/          # SAM3 engine (separate from effect system)
│       │   ├── mod.rs
│       │   ├── model.rs           # Model download / cache / load
│       │   ├── inference.rs       # Run SAM3 encoder + decoder
│       │   └── tracking.rs        # Video mask propagation
│       ├── dsp/                   # Audio/DSP (replaces Audacity)
│       │   ├── mod.rs
│       │   ├── filters.rs         # Echo, Reverb, Low-pass
│       │   └── frame_as_audio.rs  # Flatten frame ↔ PCM ↔ DSP
│       ├── optical_flow/          # Optical flow engine
│       │   ├── mod.rs
│       │   ├── extract.rs
│       │   └── transfer.rs
│       └── utils/                 # Shared utilities
│           ├── mod.rs
│           ├── image_io.rs        # PNG/JPEG read/write
│           ├── color.rs           # Color space conversions
│           └── math.rs            # Math helpers (clamp, lerp, etc.)
├── src/                           # Vite + React + TypeScript frontend
│   ├── main.tsx
│   ├── App.tsx
│   ├── index.css
│   ├── types/
│   │   ├── index.ts               # Shared TS types (Effect, Parameter, Mask)
│   │   └── tauri.d.ts             # Tauri command type wrappers
│   ├── components/
│   │   ├── AppLayout.tsx          # Three-panel layout shell
│   │   ├── PreviewViewport.tsx    # Canvas 2D preview + video controls
│   │   ├── EffectBrowser/
│   │   │   ├── index.tsx
│   │   │   ├── CategoryTabs.tsx
│   │   │   ├── EffectList.tsx
│   │   │   └── EffectSearch.tsx
│   │   ├── EffectStack/
│   │   │   ├── index.tsx
│   │   │   ├── StackItem.tsx
│   │   │   └── StackReorder.tsx
│   │   ├── ParameterPanel/
│   │   │   ├── index.tsx
│   │   │   ├── SliderParam.tsx
│   │   │   ├── ToggleParam.tsx
│   │   │   ├── PaletteParam.tsx
│   │   │   └── MaskSelector.tsx
│   │   ├── ExportDialog.tsx
│   │   ├── StatusBar.tsx
│   │   └── common/
│   │       ├── Button.tsx
│   │       ├── Icon.tsx
│   │       └── Tooltip.tsx
│   ├── hooks/
│   │   ├── useTauriCommand.ts     # Wrapper for invoke() with types
│   │   ├── usePreview.ts          # Preview frame lifecycle
│   │   └── useEffectStack.ts      # Effect stack state management
│   ├── state/
│   │   ├── store.ts               # Zustand or Redux store
│   │   └── slices/
│   │       ├── projectSlice.ts
│   │       ├── previewSlice.ts
│   │       └── exportSlice.ts
│   └── lib/
│       ├── constants.ts
│       └── utils.ts
├── tests/                         # E2E and integration tests
│   ├── e2e/
│   │   └── app.spec.ts            # Playwright E2E tests
│   └── fixtures/
│       ├── sample_image.png
│       └── sample_video.mp4
├── .gitignore
├── .prettierrc
├── .eslintrc.cjs
├── CHANGELOG.md
├── CODE_OF_CONDUCT.md
├── CONTRIBUTING.md
├── LICENSE                        # MIT (or GPL-3.0 if preferred)
├── README.md
├── index.html
├── package.json
├── postcss.config.js
├── tailwind.config.js             # If using Tailwind
├── tsconfig.json
├── tsconfig.node.json
├── vite.config.ts
├── Cargo.toml                     # Workspace root (optional workspace setup)
└── rustfmt.toml
```

---

## 2. Why This Structure?

### Tauri v2 Conventions

- `src-tauri/` is the **required** Tauri v2 backend directory. Cargo lives here.
- `src/` at root is the **frontend** source (Vite convention).
- `tauri.conf.json` configures the app window, permissions, and sidecars.
- `capabilities/` defines security scopes for IPC commands.

### BitRot Reference

BitRot (already in your references) uses this exact pattern:

- `src-tauri/src/` for Rust backend
- Root-level `index.html` + frontend build
- FFmpeg sidecars in `src-tauri/binaries/`

### Rust Best Practices

- **Module-per-file**: Each file is a module (`mod.rs` or `foo.rs`).
- **Category folders**: Effects grouped by domain (`dithering/`, `glitch/`, etc.) matching the UI.
- **Centralized errors**: `error.rs` with `thiserror` for typed errors.
- **Separation of concerns**: `ffmpeg/`, `dsp/`, `segmentation/` are standalone modules, not tangled in effects.

### Open Source Standards

- **`.github/`**: CI/CD, contribution guidelines, security policy.
- **`CODE_OF_CONDUCT.md`**: Community standards (Contributor Covenant).
- **`CONTRIBUTING.md`**: How to build, test, and submit PRs.
- **`CHANGELOG.md`**: Keep a Changelog format (Added/Changed/Fixed).
- **`LICENSE`**: MIT is permissive; GPL-3.0 if you want copyleft.
- **`SECURITY.md`**: How to report vulnerabilities.

---

## 3. Key Files to Create First (in order)

### Phase 1: Foundation (no code logic yet)

1. **Root config**: `.gitignore`, `README.md`, `LICENSE`
2. **Rust backend config**: `src-tauri/Cargo.toml`, `tauri.conf.json`
3. **Frontend config**: `package.json`, `vite.config.ts`, `tsconfig.json`
4. **App entry points**: `src-tauri/src/main.rs`, `src/main.tsx`, `src/App.tsx`
5. **Documentation**: `docs/ARCHITECTURE.md`, `CONTRIBUTING.md`

### Phase 2: Effect system skeleton

1. **Effect trait**: `src-tauri/src/effects/mod.rs`
2. **Registry**: `src-tauri/src/effects/engine.rs`
3. **One dummy effect**: `src-tauri/src/effects/dithering/bayer.rs`
4. **IPC command**: `src-tauri/src/commands.rs`
5. **Frontend wiring**: `src/hooks/useTauriCommand.ts`

### Phase 3: UI scaffold

1. **Three-panel layout**: `src/components/AppLayout.tsx`
2. **Effect browser**: `src/components/EffectBrowser/`
3. **Effect stack**: `src/components/EffectStack/`
4. **Preview viewport**: `src/components/PreviewViewport.tsx`

---

## 4. Technology Choices (Locked)

| Layer              | Tool                      | Version                                         |
| ------------------ | ------------------------- | ----------------------------------------------- |
| Desktop            | Tauri v2                  | `^2.0`                                          |
| Frontend           | Vite + React + TypeScript | `vite@5`, `react@18`, `typescript@5`            |
| Styling            | Tailwind CSS              | `^3.4`                                          |
| State              | Zustand                   | `^4.5` (lighter than Redux, excellent for this) |
| Backend            | Rust                      | `stable` toolchain                              |
| Image              | `image` crate             | `^0.25`                                         |
| Parallelism        | `rayon`                   | `^1.8`                                          |
| Video              | FFmpeg sidecar            | `6.x`                                           |
| ML                 | `ort` (ONNX Runtime)      | `^2.0`                                          |
| Errors             | `thiserror`               | `^1.0`                                          |
| Serialization      | `serde` + `serde_json`    | `^1.0`                                          |
| Testing (Rust)     | Built-in + `insta`        | —                                               |
| Testing (Frontend) | Vitest                    | `^1.0`                                          |
| E2E                | Playwright                | `^1.40`                                         |

---

## 5. Design Decisions Explained

### Why not a Cargo workspace?

A workspace splits the project into multiple crates. For this app, the backend is tightly coupled (effects need engine, engine needs preview, etc.). A single crate with modules is simpler until the project grows past ~50k LOC. We can always extract a workspace later.

### Why Zustand over Redux?

Zustand is 1kB, has no boilerplate, and fits the "simple store" mental model. Redux is overkill for a single-source + effect-stack app.

### Why `image` crate over `opencv-rust`?

The `image` crate is pure Rust, no C++ dependency, and handles everything we need for static images. OpenCV is only needed if optical flow becomes a bottleneck — added later as optional.

### Why no `src-tauri/src/ui/`?

Tauri v2 keeps frontend completely separate. The Rust backend only exposes IPC commands. The frontend is a standard web app that happens to run in a WebView.

---

## 6. Questions for You

Before I scaffold this, two quick questions:

1. **License preference**: MIT (permissive, anyone can use commercially) or GPL-3.0 (copyleft, derivatives must be open source)?
2. **Styling framework**: Tailwind CSS (utility-first, fast) or plain CSS modules (no build-time dependency)?

Once you confirm, I'll create the full folder structure and config files. No business logic until you approve the skeleton.
