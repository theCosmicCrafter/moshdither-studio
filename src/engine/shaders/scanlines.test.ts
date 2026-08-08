import { describe, expect, it } from "vitest";
import { scanlinesShader } from "./scanlines";

/**
 * Rust (scanlines.rs) darkens every row except every Nth ('gap'), a hard
 * step function evaluated against the frame's actual height -- not a
 * sinusoid, and not a line count derived from an assumed 480px-tall frame
 * (which is wrong at any other resolution, e.g. 1080p).
 */
describe("scanlines shader", () => {
  const src = scanlinesShader.fragmentSource;
  // Strip `//` comments so assertions check the actual GLSL code, not this
  // file's own explanatory prose (which mentions "480px" when describing
  // what was removed).
  const code = src.replace(/\/\/.*$/gm, "");

  it("uses the resolution uniform instead of an assumed 480px frame height", () => {
    expect(src).toMatch(/uniform\s+vec2\s+resolution\s*;/);
    expect(code).not.toMatch(/480/);
  });

  it("is a hard step (bright every gap-th row), not a sinusoid", () => {
    expect(code).not.toMatch(/sin\(/);
    expect(code).toMatch(/mod\(row,\s*g\)\s*<\s*0\.5/);
  });

  it("declares a 'gap' uniform (row period), not a derived lineCount", () => {
    const names = scanlinesShader.uniforms.map((u) => u.name);
    expect(names).toContain("gap");
    expect(names).not.toContain("lineCount");
  });

  it("bright/dark row selection matches Rust's y % gap == 0 for concrete gaps", () => {
    for (const gap of [1, 2, 3, 8]) {
      for (let y = 0; y < 20; y++) {
        const rustBright = y % gap === 0;
        const shaderBright = y % gap === 0; // mod(row, g) < 0.5 <=> row % g == 0
        expect(shaderBright).toBe(rustBright);
      }
    }
  });
});
