# MoshDither Studio

> **A production-grade desktop creative tool for datamoshing, dithering, and real-time WebGL post-processing.**

MoshDither Studio combines glitch art techniques (datamoshing via FFglitch), pixel art dithering algorithms, and real-time WebGL shader effects into a unified creative pipeline. Built with Electron, React 19, TypeScript, and Python.

---

## Features

- **Real-Time WebGL Preview** — Chain shader effects (halftone, analog glitch, CRT phosphor, temporal noise, epsilon glow) with live preview
- **Datamoshing Engine** — Python-powered FFglitch integration for classic and modern datamoshing modes
- **Dithering Library** — Bayer, error diffusion, blue noise, polka dot, wavelet, adaptive variance, and halftone dithering
- **Mask Painting** — Brush-based mask editor with eraser support for selective effect application
- **Video & Image Export** — Render pipeline with format selection (PNG, JPG, GIF, MP4)
- **Effect Stacking** — Layer multiple effects with independent time ranges and parameters
- **Undo/Redo** — Full history stack (50 states) for non-destructive editing

---

## Architecture

```
packages/
  desktop-gui/     Electron + React + Vite renderer process
  mosh-engine/     TypeScript adapters for Python backend (datamoshing, dithering)
  python-backend/  Python RPC server (FFglitch, ffmpeg, neural downscale placeholder)
```

- **Main Process:** Node.js/Electron — file dialogs, Python spawning, IPC routing, custom protocol (`media://`)
- **Renderer Process:** React 19 + WebGL2 — UI, canvas rendering, effect parameter editing
- **Python Backend:** `mosh_cli.py` (FFglitch/ffmpeg) + `main.py` (secure RPC server)

---

## Quick Start

### Prerequisites

- Node.js 22+
- Python 3.12+
- ffmpeg (bundled for Windows; macOS/Linux must install separately)

### Install

```bash
# Clone
git clone <repo-url>
cd moshdither-studio

# Install Node dependencies
cd packages/desktop-gui
npm install

# Install Python dependencies
cd ../python-backend
pip install -r requirements.txt
```

### Development

```bash
cd packages/desktop-gui
npm run dev
```

This starts the Vite dev server and launches the Electron window.

### Build

```bash
cd packages/desktop-gui
npm run build
```

Output is written to `dist/` (renderer) and `dist-electron/` (main + preload).

### Tests

```bash
cd packages/desktop-gui
npm test           # Unit tests (jsdom)
```

```bash
cd packages/python-backend
pytest             # Python tests
```

---

## Security

See [`SECURITY.md`](./SECURITY.md) for vulnerability reporting and hardening summary.

Key security features:
- Context isolation + sandbox in all renderers
- IPC channel whitelist in preload script
- Custom `media://` protocol with path traversal prevention
- Python RPC token authentication (`X-RPC-Token`)
- Electron fuses flipped for production builds (`runAsNode: false`, etc.)
- Content Security Policy enforced

---

## Documentation

| Document | Description |
|----------|-------------|
| [`docs/PRODUCTION_HARDENING_PLAN.md`](./docs/PRODUCTION_HARDENING_PLAN.md) | Security & performance hardening roadmap |
| [`docs/DESIGN_SPEC_UNIFIED.md`](./docs/DESIGN_SPEC_UNIFIED.md) | UI/UX design system (OKLCH colors, typography, components) |
| [`docs/API_SPEC.md`](./docs/API_SPEC.md) | IPC channels and Python RPC API reference |
| [`docs/ARCHITECTURE.md`](./docs/ARCHITECTURE.md) | System architecture and data flow |
| [`packages/desktop-gui/README.md`](./packages/desktop-gui/README.md) | Frontend-specific build and dev docs |
| [`packages/python-backend/README.md`](./packages/python-backend/README.md) | Python backend setup and API docs |

---

## License

[MIT](LICENSE) © 2026 MoshDither Studio Contributors
