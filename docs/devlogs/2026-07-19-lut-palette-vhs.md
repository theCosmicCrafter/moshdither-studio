# Devlog — 2026-07-19

## LUT / palette / VHS semantic correctness follow-up

### Goal

Close the remaining semantic-correctness gaps identified in the previous audit:
- `.cube` LUT files were not supported by the Rust export path.
- Custom LUTs could not be loaded through the UI.
- The `CGA` palette was a duplicate of the 16-color EGA default.
- `analog.vhs` lacked canonical VHS artifacts: chroma delay, head-switching noise, and luma noise.

### What changed

- **Rust `.cube` parser**
  - `src-tauri/src/effects/color/lut_grading.rs` now detects `.cube` files.
  - Parses `LUT_3D_SIZE`, `DOMAIN_MIN`, `DOMAIN_MAX`, and `TITLE`.
  - Rejects 1D LUTs and malformed data counts.
  - Applies trilinear interpolation over the parsed 3D LUT.

- **Frontend `.cube` preview support**
  - `src/utils/parseLut.ts` gained `parseCubeLut`, `sampleCubeLut`, and `cubeToFlatLutImageData`.
  - `src/engine/lut/loader.ts` `loadCustomLUT()` converts a `.cube` into a 512×512 PNG-style preview texture using an object URL.

- **Custom LUT picker**
  - `src/components/LUTPanel/index.tsx` added a "Load Custom LUT…" button.
  - `src/store/index.ts` `addLUTEffect()` now accepts an optional `filePath` so Rust receives the real disk path while WebGL uses a preview URL.

- **Historical palettes**
  - `src-tauri/src/effects/color/historical_palettes.rs`: `CGA` is now the classic 4-color Mode 4/5 Palette 1 (black, cyan, magenta, light gray).
  - Added `cga_palette_is_four_colors` and `ega16_palette_is_sixteen_colors` tests.

- **VHS effect**
  - `src-tauri/src/effects/analog/vhs.rs` rebuilt around YCbCr processing.
  - New parameters: `chroma_delay`, `chroma_bleed`, `chroma_offset`, `head_switching`.
  - `noise` now acts as luma noise applied to the Y channel.
  - Added head-switching noise bands in the bottom 8% of the frame.
  - `src/engine/shaders/vhsCrt.ts` and `src/utils/effectConverter.ts` updated to expose the same controls in the WebGL preview.

### Verification

| Check                                                       | Result                         |
| ----------------------------------------------------------- | ------------------------------ |
| `cargo clippy --all-targets --all-features -- -D warnings`  | PASS                           |
| `cargo test --lib`                                          | 438/438 PASS                   |
| `cargo fmt -- --check`                                      | PASS                           |
| `cargo audit`                                               | PASS (0 vulns, 18 warnings)    |
| `npm audit`                                                 | PASS (0 vulns)                 |
| `npm run lint`                                              | PASS (0 warnings)              |
| `npx tsc --noEmit`                                          | PASS                           |
| `npm run test`                                              | 1024/1024 PASS                 |
| `cargo run --bin mosh-verify -- verify-all`                | 98/98 PASS                     |

### Next steps

- Add `.cube` preset import flow (copy user `.cube` into `public/lut` and reference it).
- Add parity tests between Rust and WebGL for the updated VHS shader.
- Continue tracking the 18 `cargo audit` unmaintained-crate warnings.
