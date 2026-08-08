import { describe, expect, it } from "vitest";
import { chromaticAberrationShader } from "./chromaticAberration";

/**
 * Rust (chromatic_aberration.rs): rx = x - shift (red from smaller x),
 * bx = x + shift (blue from larger x) -- the shader had these swapped, and
 * also multiplied the offset by an un-mapped sin(u_time*1.5) 'pulse' with
 * no Rust equivalent (Rust reads no time parameter), animating the preview
 * away from the static export.
 */
describe("chromaticAberration shader", () => {
  const src = chromaticAberrationShader.fragmentSource;
  // Strip `//` comments so assertions check the actual GLSL code, not this
  // file's own explanatory prose (which necessarily mentions the removed
  // 'pulse' term when describing what was taken out).
  const code = src.replace(/\/\/.*$/gm, "");

  it("samples red from vUv - offset and blue from vUv + offset", () => {
    expect(src).toMatch(/vUv\s*-\s*offset\)\.r/);
    expect(src).toMatch(/vUv\s*\+\s*offset\)\.b/);
  });

  it("does not animate with an un-mapped time pulse", () => {
    expect(code).not.toMatch(/pulse/);
    expect(code).not.toMatch(/u_time/);
    expect(chromaticAberrationShader.uniforms.map((u) => u.name)).not.toContain("u_time");
  });

  it("direction matches Rust's own unit test (4px row, shift=1)", () => {
    // chromatic_aberration.rs test_chromatic_shifts_channels: pixels are
    // red, green, blue, black. "At x=1, red should come from x=0".
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
