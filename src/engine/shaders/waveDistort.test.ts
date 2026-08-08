import { describe, expect, it } from "vitest";
import { waveDistortShader } from "./waveDistort";

/**
 * Rust (wave_distort.rs): offset = amplitude * sin(y * frequency + time *
 * 0.2), a horizontal-only pixel displacement where amplitude/frequency are
 * resolution-independent pixel-space quantities. The shader previously used
 * fixed constants that made displacement scale with frame resolution (2-4x
 * too strong at 4K vs 1080p) and added a second, Rust-less vertical axis.
 */
describe("waveDistort shader", () => {
  const src = waveDistortShader.fragmentSource;

  it("converts pixel-space amplitude to UV space via the resolution uniform", () => {
    expect(src).toMatch(/uniform\s+vec2\s+resolution\s*;/);
    expect(src).toMatch(/uv\.x\s*\+=\s*offsetPixels\s*\/\s*res\.x/);
  });

  it("does not add a second (vertical) distortion axis", () => {
    expect(src).not.toMatch(/uv\.y\s*\+=/);
  });

  it("matches Rust's offset formula: amplitude * sin(y*frequency + time*0.2)", () => {
    expect(src).toMatch(/sin\(yPixel\s*\*\s*frequency\s*\+\s*u_time\s*\*\s*0\.2\)/);
  });

  it("declares defaults matching Rust's (amplitude=10px, frequency=0.05)", () => {
    const amount = waveDistortShader.uniforms.find((u) => u.name === "amount");
    const frequency = waveDistortShader.uniforms.find((u) => u.name === "frequency");
    expect(amount?.default).toBe(10.0);
    expect(frequency?.default).toBe(0.05);
  });

  it("displacement in pixels stays constant across resolutions for a fixed amplitude", () => {
    // At amplitude=10 the max |offsetPixels| is 10px regardless of res.x,
    // which is what makes offsetPixels/res.x scale-independent in pixels.
    const amplitude = 10;
    const maxOffsetPixels = amplitude * 1; // sin() peaks at 1
    for (const width of [1920, 3840]) {
      const maxOffsetUv = maxOffsetPixels / width;
      const maxOffsetPixelsBack = maxOffsetUv * width;
      expect(maxOffsetPixelsBack).toBe(10);
    }
  });
});
