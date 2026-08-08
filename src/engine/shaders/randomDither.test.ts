import { describe, expect, it } from "vitest";
import { randomDitherShader } from "./randomDither";

/**
 * Rust (random_noise.rs) perturbs luminance by a per-pixel random value
 * spanning the FULL [0, 255] range before thresholding at the midpoint --
 * equivalent to +/-0.5 in this shader's normalized [0,1] luma space. The
 * shader previously only reached +/-0.25 at its default amount (0.5).
 * Rust exposes no parameters for this effect, so effectConverter's mapping
 * stays unwired (empty paramMap) and marks the preview `accurate: false`
 * because the shader's GLSL sin-hash is a different PRNG from Rust's
 * x/y/time multiplicative hash -- see effectConverter.ts.
 */
describe("randomDither shader", () => {
  const src = randomDitherShader.fragmentSource;

  it("widens the noise term to a *2.0 factor over the amount uniform", () => {
    expect(src).toMatch(/\(rand\(vUv\)\s*-\s*0\.5\)\s*\*\s*amount\s*\*\s*2\.0/);
  });

  it("reaches the full +/-0.5 luma range at amount's default (0.5)", () => {
    const amount = randomDitherShader.uniforms.find((u) => u.name === "amount");
    expect(amount?.default).toBe(0.5);
    // noise = (rand-0.5) * amount * 2.0; rand ranges [0,1) so (rand-0.5)
    // ranges [-0.5, 0.5) -- at amount=0.5 the *2.0 exactly cancels amount's
    // halving, giving the full +/-0.5 range Rust's [0,255] randomization
    // maps to in normalized [0,1] luma space.
    const maxNoiseMagnitude = 0.5 * (amount?.default as number) * 2.0;
    expect(maxNoiseMagnitude).toBeCloseTo(0.5, 10);
  });
});
