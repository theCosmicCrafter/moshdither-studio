import { describe, expect, it } from "vitest";
import { blockShiftShader } from "./blockShift";

/**
 * Rust's max_shift (block_shift.rs) is a pixel displacement independent of
 * block_size. The shader previously computed `amount * blockSize` for the
 * offset, so displacement scaled 2-16x depending on block_size. It also
 * declared an unwired `seed` uniform that effectConverter never mapped from
 * any Rust parameter.
 */
describe("blockShift shader", () => {
  const src = blockShiftShader.fragmentSource;

  it("does not multiply displacement by blockSize", () => {
    expect(src).not.toMatch(/amount\s*\*\s*blockSize/);
  });

  it("keeps displacement in pixel units via the resolution uniform only", () => {
    expect(src).toMatch(/amount\s*\/\s*res\.x/);
    expect(src).toMatch(/amount\s*\/\s*res\.y/);
  });

  it("does not declare a wired-but-meaningless seed uniform", () => {
    expect(src).not.toMatch(/uniform\s+float\s+seed\s*;/);
    expect(src).not.toMatch(/\bseed\b/);
    expect(blockShiftShader.uniforms.map((u) => u.name)).not.toContain("seed");
  });
});
