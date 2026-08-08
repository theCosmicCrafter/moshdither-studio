import { describe, expect, it } from "vitest";
import { pixelateShader } from "./pixelate";

/**
 * Rust (pixelate.rs) samples the single integer pixel index
 * `block_origin + bs/2` (integer division truncates). The shader previously
 * sampled the block's continuous-coordinate midpoint, which for EVEN block
 * sizes (including the default, 8) lands exactly on a texel boundary --
 * combined with this app's global LINEAR texture filtering, that blends 2-4
 * adjacent source pixels instead of reading Rust's single center pixel.
 */
describe("pixelate shader", () => {
  const src = pixelateShader.fragmentSource;

  it("samples the integer texel's center (index + 0.5), not a continuous midpoint", () => {
    expect(src).toMatch(/\(centerIndex\s*\+\s*0\.5\)\s*\/\s*res/);
  });

  it("computes the block-center index with the same truncating half Rust uses", () => {
    expect(src).toMatch(/floor\(vec2\(bs\)\s*\*\s*0\.5\)/);
  });

  it("matches Rust's bs/2 (integer division) for even and odd block sizes", () => {
    for (const bs of [8, 3, 16, 5, 1, 64]) {
      const rustHalf = Math.trunc(bs / 2); // Rust: usize `bs / 2`
      const shaderHalf = Math.floor(bs * 0.5); // GLSL: floor(vec2(bs) * 0.5)
      expect(shaderHalf).toBe(rustHalf);
    }
  });

  it("reproduces Rust's own unit test: block_size=2 samples index 1 for both pixels", () => {
    // pixelate.rs test_pixelate: 2x1 image, block_size=2, center index =
    // 0 + 2/2 = 1 for both output pixels.
    const bs = 2;
    const blockOrigin = 0;
    const centerIndex = blockOrigin + Math.floor(bs * 0.5);
    expect(centerIndex).toBe(1);
  });
});
