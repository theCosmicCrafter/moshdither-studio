import { describe, expect, it } from "vitest";
import { maskBlendShader } from "./maskBlend";

/**
 * The mask-blend shader is the GPU half of a pair. Its Rust counterpart,
 * `blend_mask()` in src-tauri/src/effects/engine.rs, is what actually renders an
 * export:
 *
 *   inside   old*(1-m) + new*m
 *   outside  old*m     + new*(1-m)
 *   alpha    new*m
 *
 * The shader had been reduced to the `inside` case with its `u_mode` uniform
 * deleted, while EffectChain.ts still set u_mode from MASK_MODE_MAP. WebGL
 * silently ignores a uniform the program does not declare, so `outside` and
 * `alpha` masks previewed as `inside` and only diverged from the export when a
 * non-default mode was used — the quietest kind of preview/export mismatch.
 *
 * These tests read the shader source. That is deliberate: a headless WebGL
 * context is not available here, so the alternative is no coverage at all, and
 * the specific regression was a *missing uniform and missing branches*, which
 * source inspection detects precisely.
 */
describe("maskBlend shader", () => {
  const src = maskBlendShader.fragmentSource;

  it("declares the u_mode uniform EffectChain sets", () => {
    // EffectChain.ts:145 sets `u_mode` from MASK_MODE_MAP for every masked pass.
    // Without this declaration that assignment is a no-op.
    expect(src).toMatch(/uniform\s+int\s+u_mode\s*;/);
  });

  it("exposes u_mode in its uniform list so the chain can bind it", () => {
    const names = maskBlendShader.uniforms.map((u) => u.name);
    expect(names).toContain("u_mode");
    const mode = maskBlendShader.uniforms.find((u) => u.name === "u_mode");
    expect(mode?.type).toBe("int");
    // 0 is `inside`, matching MASK_MODE_MAP and blend_mask's fallback arm.
    expect(mode?.default).toBe(0);
  });

  it("branches on all three modes rather than hardcoding one", () => {
    expect(src).toMatch(/u_mode\s*==\s*1/); // outside
    expect(src).toMatch(/u_mode\s*==\s*2/); // alpha
  });

  it("implements each mode to match blend_mask in Rust", () => {
    // inside: mix(pre, post, m) == old*(1-m) + new*m
    expect(src).toMatch(/mix\(\s*preColor\.rgb\s*,\s*postColor\.rgb\s*,\s*m\s*\)/);
    // outside: mix(post, pre, m) == new*(1-m) + old*m
    expect(src).toMatch(/mix\(\s*postColor\.rgb\s*,\s*preColor\.rgb\s*,\s*m\s*\)/);
    // alpha: post * m, with no contribution from the pre-effect frame
    expect(src).toMatch(/postColor\.rgb\s*\*\s*m/);
  });

  it("takes alpha from the post-effect frame, as Rust does", () => {
    // blend_mask writes channels 0..3 only, leaving working's alpha in place.
    expect(src).toMatch(/fragColor\s*=\s*vec4\(\s*rgb\s*,\s*postColor\.a\s*\)/);
  });

  it("samples the mask from the red channel", () => {
    // Masks are greyscale PNGs; Rust reads a single u8 per pixel.
    expect(src).toMatch(/texture\(\s*tMask\s*,\s*vUv\s*\)\.r/);
  });
});
