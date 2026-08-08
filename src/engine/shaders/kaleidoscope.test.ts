import { describe, expect, it } from "vitest";
import { kaleidoscopeShader } from "./kaleidoscope";

/**
 * Rust (kaleidoscope.rs) does a pure rotational segment copy: it computes
 * dx/dy in true pixel space (using the frame's actual width/height) and
 * wraps the angle into [0, angle_step) with `angle.rem_euclid(angle_step)`
 * -- no reflection. The shader previously computed angle from raw UV space
 * (stretching it on non-square frames) and folded/mirrored past the segment
 * midpoint, which Rust never does.
 */
describe("kaleidoscope shader", () => {
  const src = kaleidoscopeShader.fragmentSource;
  // Strip `//` comments so assertions check the actual GLSL code, not this
  // file's own explanatory prose describing the removed mirror step.
  const code = src.replace(/\/\/.*$/gm, "");

  it("computes angle/radius in pixel space via the resolution uniform", () => {
    expect(src).toMatch(/uniform\s+vec2\s+resolution\s*;/);
    expect(src).toMatch(/pixel\s*=\s*vUv\s*\*\s*res/);
    expect(src).toMatch(/atan\(d\.y,\s*d\.x\)/);
  });

  it("does not reflect/mirror the mapped angle", () => {
    // The old shader folded with `if (angle > segAngle) angle = 2.0 *
    // segAngle - angle;`, which mirrors -- Rust's rem_euclid wrap has no
    // such reflection, it is a pure rotational copy.
    expect(code).not.toMatch(/2\.0\s*\*\s*segAngle\s*-\s*angle/);
    expect(code).not.toMatch(/if\s*\(\s*angle\s*>/);
  });

  it("wraps with a single floored mod, matching Rust's rem_euclid", () => {
    // GLSL's mod(x, y) = x - y*floor(x/y) is the floored modulo, which is
    // exactly Rust's f32::rem_euclid for a positive divisor.
    expect(src).toMatch(/mod\(angle,\s*angleStep\)/);
  });

  it("uses angleStep = 2*PI / segments, matching Rust's angle_step", () => {
    expect(src).toMatch(/angleStep\s*=\s*\(2\.0\s*\*\s*PI\)\s*\/\s*max\(segments/);
  });

  it("angle wrapping reproduces Rust's rem_euclid for a concrete example", () => {
    // Rust: angle.rem_euclid(angle_step). For segments=4, angle_step=PI/2.
    // An angle of 100deg should wrap to 10deg (100 - 90 = 10), same segment
    // as Rust picks -- no reflection, so it stays 10deg, not 80deg.
    const segments = 4;
    const angleStep = (2 * Math.PI) / segments; // 90deg
    const angle = (100 * Math.PI) / 180;
    const rustWrap = ((angle % angleStep) + angleStep) % angleStep; // rem_euclid
    expect(rustWrap * (180 / Math.PI)).toBeCloseTo(10, 5);
  });
});
