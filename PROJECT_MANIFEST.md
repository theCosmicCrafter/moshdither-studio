# PROJECT_MANIFEST.md — MoshDither Studio

The contract registry the production audit reconciles against. This file does
not duplicate the contracts — it names the single authoritative document for
each. If a link rots, the manifest is stale; fix the link, not the audit.

**Product:** Desktop creative tool — image/video processing, real
bitstream-datamoshing (FFglitch/pymosh), SAM3 segmentation.
**Stack:** Rust + Tauri v2 backend · React + Vite + Zustand frontend ·
Python sidecars (SAM3 bridge, mosh-cli) · FFmpeg/FFglitch binaries.

## Service boundaries & data flow

`docs/ARCHITECTURE.md` — stack topology and IPC flow: WebView UI ⇄ Tauri
commands ⇄ Rust `EffectRegistry`/`ffmpeg` ⇄ Python sidecars. There is one
process boundary worth naming separately: the frontend never spawns processes
or touches the filesystem except through `src/lib/tauri.ts` adapters, and the
backend never touches WebGL — `apply_effect_stack` (CPU) is the parity oracle
the WebGL preview is checked against.

## Contract registry

This is a desktop app — the "API surface" is the Tauri IPC command set, not
HTTP. There is no OpenAPI/GraphQL schema and no database.

| Contract | Authority |
|---|---|
| IPC commands + typed errors (`AppError`, never `String`) | `docs/API_SPEC.md` |
| Module/layout conventions, naming, store shape | `docs/structure.md` |
| Effect registry contract (`EffectMeta`, `process_video`) | `src-tauri/src/effects/types.rs`, `docs/EFFECT_GUIDE.md` |
| Preset file schema (versioned envelope, `PRESET_SCHEMA_VERSION`) | `src/hooks/usePresets.ts` |
| Dock layout persistence (`moshdither.dockLayout`, `LAYOUT_VERSION`) | `src/components/DockSystem/DockLayout.tsx` |
| Migration paths | overlay guides → `src/utils/migrateOverlayGuides.ts`; preset v0→v1 → `usePresets.ts` |

## Environment variable contract

`.env.example` — every variable is optional and commented out; there are no
required env vars at runtime. Build/signing vars (`WIN_CSC_LINK` etc.) live
there too. `.env` is gitignored and must never be committed; worktree `.env`
files are per-worktree (see `AGENTS.md` worktree policy).

## Module dependency graph (architecture level)

```
components/ → hooks/ → lib/tauri.ts → (IPC) → src-tauri/commands.rs → effects/
     └──────→ store/ (Zustand, single store) ←──────┘
utils/  ← pure helpers, imported by both components/ and hooks/
engine/ ← WebGL2/audio/LUT — frontend only, preview path never touches IPC
```

Forbidden directions (enforced by review, not tooling): components never
import `engine/` internals directly for effect application (that path is
`lib/tauri.ts` → Rust); `store/` imports nothing from `components/`; `utils/`
imports no store. Python sidecars communicate via subprocess pipes only.

## ADR log

`docs/adr/` — Tauri-over-Electron, Rust effect engine + Rayon, single Zustand
store, CSS-variable theming, GTK migration, video-mask-tracking removal.

## Release-gate evidence

`npm run gate` is the canonical all-gates command (`:quick` skips the Rust
release build). `real-backend.spec.ts` refuses to run against a stale
`mosh-verify` binary — rebuild after touching Rust:
`cargo build --release --bin mosh-verify --manifest-path src-tauri/Cargo.toml`.
