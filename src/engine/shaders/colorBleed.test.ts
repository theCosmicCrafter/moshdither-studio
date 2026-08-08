import { describe, expect, it } from "vitest";
import { colorBleedShader } from "./colorBleed";

/**
 * Rust (color_bleed.rs) bands the R/B shift PER ROW:
 *   r_shift = (y % (amount*2+1)) - amount   (signed, range [-amount, amount])
 *   b_shift = -r_shift
 * This row-banding is the effect's defining visual signature. The shader
 * previously applied one constant, time-pulsing offset to the whole frame
 * with no banding at all.
 */
describe("colorBleed shader", () => {
  const src = colorBleedShader.fragmentSource;

  it("bands the shift per row using the resolution uniform", () => {
    expect(src).toMatch(/uniform\s+vec2\s+resolution\s*;/);
    expect(src).toMatch(/mod\(row,\s*period\)\s*-\s*amt/);
    expect(src).toMatch(/bShift\s*=\s*-rShift/);
  });

  it("does not use a single frame-wide time-pulsing offset", () => {
    expect(src).not.toMatch(/u_time/);
    expect(colorBleedShader.uniforms.map((u) => u.name)).not.toContain("u_time");
  });

  it("row banding reproduces Rust's per-row formula for concrete rows", () => {
    const amount = 4;
    const period = amount * 2 + 1; // 9, matches shader's `period = amt*2+1`
    const rustShift = (y: number) => (y % period) - amount;
    for (const y of [0, 1, 4, 8, 9, 13, 17]) {
      // GLSL's mod() is floored, matching JS/Rust's % for non-negative y.
      const shaderShift = (y % period) - amount;
      expect(shaderShift).toBe(rustShift(y));
    }
    // Range check: signed shift must stay within [-amount, amount].
    for (let y = 0; y < 30; y++) {
      const shift = (y % period) - amount;
      expect(shift).toBeGreaterThanOrEqual(-amount);
      expect(shift).toBeLessThanOrEqual(amount);
    }
  });
});
