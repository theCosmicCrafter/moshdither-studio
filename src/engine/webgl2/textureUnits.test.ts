import { describe, expect, it } from "vitest";

/**
 * Regression: stacking two LUTs blacked out the preview.
 *
 * EffectChain reserves texture unit 0 for the pass input, 2 for the pre-effect
 * frame and 3 for the mask. Extra samplers (a LUT's tLUT) were allocated from a
 * counter that started at 1 and was never reset between passes, so it ran
 * 1, 2, 3... across the render. The second LUT therefore bound to unit 2 — and
 * passes without a mask explicitly unbind units 2 and 3, wiping it. Sampling an
 * unbound texture returns black.
 *
 * One LUT worked, two went black, which is exactly what was reported.
 */
const RESERVED = { input: 0, previous: 2, mask: 3 };
const FIRST_FREE_TEXTURE_UNIT = 4;

/** Units a pass would hand out, under the fixed per-pass allocation. */
function unitsForPasses(samplersPerPass: number[]): number[][] {
  return samplersPerPass.map((count) => {
    let next = FIRST_FREE_TEXTURE_UNIT; // reset per pass
    return Array.from({ length: count }, () => next++);
  });
}

describe("EffectChain texture unit allocation", () => {
  it("never hands a sampler one of the reserved units", () => {
    const reserved = new Set(Object.values(RESERVED));
    for (const units of unitsForPasses([1, 1, 1, 2, 3])) {
      for (const u of units) {
        expect(reserved.has(u), `unit ${u} collides with a reserved unit`).toBe(false);
      }
    }
  });

  it("gives two stacked LUTs units that do not collide with the mask units", () => {
    // The exact reported case: LUT, then a second LUT.
    const [first, second] = unitsForPasses([1, 1]);
    expect(first[0]).toBe(FIRST_FREE_TEXTURE_UNIT);
    expect(second[0]).toBe(FIRST_FREE_TEXTURE_UNIT);
    expect(second[0]).not.toBe(RESERVED.previous);
    expect(second[0]).not.toBe(RESERVED.mask);
  });

  it("resets per pass so a long stack cannot climb out of range", () => {
    // WebGL2 guarantees at least 32 combined units; an unreset counter on a
    // 40-effect stack would walk past that.
    const units = unitsForPasses(new Array(40).fill(1)).flat();
    expect(Math.max(...units)).toBe(FIRST_FREE_TEXTURE_UNIT);
    expect(Math.max(...units)).toBeLessThan(32);
  });

  it("still allocates distinct units within a single pass", () => {
    const [units] = unitsForPasses([3]);
    expect(new Set(units).size).toBe(3);
    expect(units).toEqual([4, 5, 6]);
  });
});
