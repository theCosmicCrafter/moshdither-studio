import { describe, expect, it } from "vitest";
import { channelSwapShader } from "./channelSwap";

/**
 * Rust's map table (channel_swap.rs) indexed by mode:
 *   mode -> (r_idx, g_idx, b_idx), where 0=R, 1=G, 2=B and
 *   new_r = old[r_idx], new_g = old[g_idx], new_b = old[b_idx].
 *
 * The shader previously used GLSL swizzles that did not correspond to the
 * same mode indices (e.g. mode 1 in Rust means "keep R, swap G/B", but the
 * shader's mode 1 was `c.bgr`, "keep G, swap R/B"). This file checks every
 * mode's swizzle against the Rust table directly, both symbolically and by
 * running a concrete RGB sample through each side.
 */
const RUST_MAP: [number, number, number][] = [
  [0, 1, 2], // mode 0: RGB (identity)
  [0, 2, 1], // mode 1: RBG
  [1, 0, 2], // mode 2: GRB
  [1, 2, 0], // mode 3: GBR
  [2, 0, 1], // mode 4: BRG
  [2, 1, 0], // mode 5: BGR
];

const CHANNEL_LETTERS = ["r", "g", "b"];
const LETTER_TO_INDEX: Record<string, number> = { r: 0, g: 1, b: 2 };

function extractSwizzle(src: string, mode: number): string {
  const re = new RegExp(`mode == ${mode}\\)\\s*\\{[^}]*outColor = c\\.([a-z]{3});`);
  const m = src.match(re);
  if (!m) throw new Error(`could not find an outColor = c.xyz swizzle for mode ${mode}`);
  return m[1];
}

describe("channelSwap shader", () => {
  const src = channelSwapShader.fragmentSource;

  it.each([0, 1, 2, 3, 4, 5] as const)(
    "mode %i's swizzle spells out Rust's map[%i] tuple exactly",
    (mode) => {
      const swizzle = extractSwizzle(src, mode);
      const [rIdx, gIdx, bIdx] = RUST_MAP[mode];
      const expected = [rIdx, gIdx, bIdx].map((i) => CHANNEL_LETTERS[i]).join("");
      expect(swizzle).toBe(expected);
    }
  );

  it.each([0, 1, 2, 3, 4, 5] as const)(
    "mode %i reproduces Rust's channel arrangement for a concrete RGB sample",
    (mode) => {
      const sample = [10, 20, 30]; // R=10, G=20, B=30
      const [rIdx, gIdx, bIdx] = RUST_MAP[mode];
      const rustResult = [sample[rIdx], sample[gIdx], sample[bIdx]];

      const swizzle = extractSwizzle(src, mode);
      const shaderResult = swizzle.split("").map((letter) => sample[LETTER_TO_INDEX[letter]]);

      expect(shaderResult).toEqual(rustResult);
    }
  );

  it("matches Rust's own unit test: mode 2 (GRB) turns pure red into pure green", () => {
    // channel_swap.rs test_channel_swap: ChannelSwap::new(2) on [255,0,0]
    // yields [0,255,0] -- new_r=old[1]=G=0, new_g=old[0]=R=255, new_b=old[2]=B=0.
    const sample = [255, 0, 0];
    const swizzle = extractSwizzle(src, 2);
    const shaderResult = swizzle.split("").map((letter) => sample[LETTER_TO_INDEX[letter]]);
    expect(shaderResult).toEqual([0, 255, 0]);
  });
});
