import { describe, expect, it } from "vitest";
import { anaglyphShader } from "./anaglyph";

/**
 * Rust (anaglyph.rs): rx = x.saturating_sub(shift) (red samples from
 * smaller x), bx = x + shift (blue samples from larger x). vUv.x increases
 * with x, so that is `vUv - offset` for red and `vUv + offset` for blue.
 * The shader had these swapped.
 */
describe("anaglyph shader", () => {
  const src = anaglyphShader.fragmentSource;

  it("samples red from vUv - offset and blue from vUv + offset", () => {
    expect(src).toMatch(/vUv\s*-\s*vec2\(offset,\s*0\.0\)\)\.r/);
    expect(src).toMatch(/vUv\s*\+\s*vec2\(offset,\s*0\.0\)\)\.b/);
  });

  it("direction matches Rust's own unit test (4px row, shift=1)", () => {
    // anaglyph.rs test_anaglyph: pixels are red, green, blue, black.
    // "At x=1, red from x=0 (255), blue from x=2 (255)".
    const pixels = [
      { r: 255, g: 0, b: 0 },
      { r: 0, g: 255, b: 0 },
      { r: 0, g: 0, b: 255 },
      { r: 0, g: 0, b: 0 },
    ];
    const shift = 1;
    const x = 1;
    const rSrcX = x - shift; // shader: vUv - offset
    const bSrcX = x + shift; // shader: vUv + offset
    expect(pixels[rSrcX].r).toBe(255);
    expect(pixels[bSrcX].b).toBe(255);
  });
});
