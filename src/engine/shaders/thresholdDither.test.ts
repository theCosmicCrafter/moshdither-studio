import { describe, expect, it } from "vitest";
import { thresholdDitherShader } from "./thresholdDither";

/**
 * Rust (threshold.rs) does `if lum > threshold as f32 { 255 } else { 0 }` --
 * a strict greater-than in 0-255 space. The shader must match both the
 * comparison operator and (via effectConverter's transform) the 0-255 ->
 * [0,1] scale, or a default threshold of 128 renders solid black at every
 * practical setting (step(threshold, lum) with an un-scaled threshold is
 * never true).
 */
describe("thresholdDither shader", () => {
  const src = thresholdDitherShader.fragmentSource;

  it("uses a strict greater-than comparison, matching Rust's `lum > threshold`", () => {
    expect(src).toMatch(/lum\s*>\s*threshold\s*\?\s*1\.0\s*:\s*0\.0/);
    // The old `step(threshold, lum)` is >=, which flips the result at exact
    // ties (e.g. a mid-grey pixel sitting exactly on the default threshold).
    expect(src).not.toMatch(/step\(\s*threshold/);
  });

  it("declares a normalized [0,1] default so a bare uniform read is sane", () => {
    const threshold = thresholdDitherShader.uniforms.find((u) => u.name === "threshold");
    expect(threshold?.default).toBe(0.5);
  });
});
