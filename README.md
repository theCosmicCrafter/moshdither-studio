# MoshDither Studio

A unified desktop application for datamoshing, dithering, glitch art, and video effects. Combines the capabilities of 37+ existing tools into a single, modern, cross-platform creative suite.

> **Status:** Early development. Not yet ready for production use.

## Features

- **Datamoshing**: I-frame removal, frame reordering/repetition, motion transfer, cross-video mosh
- **Dithering**: 15+ algorithms (Bayer, Floyd-Steinberg, Atkinson, Blue Noise, and more)
- **Glitch**: JPEG/PNG corruption, databending, byte-level manipulation
- **Analog Effects**: VHS, scanlines, chromatic aberration, CRT simulation
- **Pixel Geometry**: Pixel sorting, kaleidoscope, wave distortion
- **Segmentation**: SAM3-powered mask generation (point, box, auto) for selective effects
- **Mask-Driven Pipeline**: Apply any effect inside, outside, or masked-to-alpha
- **Linear Effect Stack**: Reorderable, previewable stack of effects

## Tech Stack

| Layer         | Technology                        |
| ------------- | --------------------------------- |
| Desktop Shell | Tauri v2                          |
| Backend       | Rust                              |
| Frontend      | Vite + React + TypeScript         |
| Styling       | Tailwind CSS                      |
| State         | Zustand                           |
| Video         | FFmpeg (sidecar)                  |
| Segmentation  | ONNX Runtime (`ort` crate) + SAM3 |

## Development

### Prerequisites

- [Rust](https://rustup.rs/) (stable toolchain)
- [Node.js](https://nodejs.org/) 18+ with npm or pnpm
- FFmpeg binaries (downloaded automatically on first build)

### Setup

```bash
# Install frontend dependencies
npm install

# Install Tauri CLI globally (optional)
npm install -g @tauri-apps/cli

# Run in development mode
npm run tauri:dev
```

### LUT setup

MoshDither Studio ships with a bundled LUT library. Custom LUTs can be loaded at runtime through the **LUT Library** panel.

**Supported formats:**

- **512×512 PNG LUTs** — standard 64×64 tile layout (8×8 grid of blue slices, x=red, y=green).
- **.cube 3D LUTs** — Adobe / Resolve format (`LUT_3D_SIZE`, optional `DOMAIN_MIN`/`DOMAIN_MAX`, up to size 256).

**Adding bundled presets:**

1. For local development, copy PNG LUTs into `public/lut/`.
2. For production installers, place them in `src-tauri/resources/lut/` (or the `resources/lut/` folder next to the built executable).
3. Add a new entry to `src/engine/lut/loader.ts` `LUT_PRESETS`.

**Loading custom LUTs:**

1. Open the app and import an image or video.
2. In the left sidebar, click **LUT Library** → **Load Custom LUT…**.
3. Select a `.png` or `.cube` file. The app copies it into a scoped temporary directory so the WebGL preview can access it.
4. The LUT is applied immediately and is also used when exporting.

### Build

```bash
# Build for production
npm run tauri:build
```

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md) for guidelines.

## Production Release & Code Signing

Before distributing MoshDither Studio, ensure you configure code signing for Windows (Authenticode) and macOS (Developer ID) in your environment variables before running the build command.

1. **macOS**: Export `APPLE_SIGNING_IDENTITY` and `APPLE_CERTIFICATE_PASSWORD`
2. **Windows**: Export `TAURI_SIGN_PFX_PATH` and `TAURI_SIGN_PFX_PASSWORD`

```bash
# Build the production release installers
npm run tauri:build
```

## License

MIT — see [LICENSE](LICENSE).
