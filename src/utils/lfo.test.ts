/**
 * The modulation math contract. `modulatedParamValue` is THE resolver --
 * useKeyframePlayback calls it through the store every preview tick and
 * `stackToRustPayload` walks it once per export frame to bake LFOs into
 * keyframe tracks. If preview and export ever disagree, the divergence
 * lives here, so these tests pin the semantics hard: media-time phase
 * anchoring (deterministic under scrub), depth as a fraction of the
 * declared range, keyframes as the oscillation centre, and the clamp the
 * backend applies after keyframe injection.
 */
import { describe, expect, it } from "vitest";
import {
  applyEasing,
  exportFrameTimes,
  keyframeValueAt,
  lfoWaveValue,
  modulatedParamValue,
  seededUnit,
} from "./lfo";
import type { Keyframe, LfoSpec } from "../store";

const spec = (over: Partial<LfoSpec> = {}): LfoSpec => ({
  id: "s1.amount",
  waveform: "sine",
  rateHz: 1,
  depth: 0.5,
  offset: 50,
  ...over,
});

const kf = (time: number, value: number, easing: Keyframe["easing"] = "linear"): Keyframe => ({
  id: `k${time}`,
  time,
  value,
  easing,
});

describe("applyEasing", () => {
  it("holds, clamps, and interpolates exactly like the pre-move store version", () => {
    expect(applyEasing(0.5, "hold")).toBe(0);
    expect(applyEasing(0.5, "linear")).toBe(0.5);
    expect(applyEasing(NaN, "linear")).toBe(0);
    expect(applyEasing(-1, "linear")).toBe(0);
    expect(applyEasing(2, "linear")).toBe(1);
    expect(applyEasing(0.5, "easeInOut")).toBeCloseTo(0.5, 10);
  });
});

describe("keyframeValueAt", () => {
  const track = [kf(1, 10), kf(3, 30)];

  it("returns null for an empty track", () => {
    expect(keyframeValueAt([], 0)).toBeNull();
  });

  it("holds the first/last value outside the track", () => {
    expect(keyframeValueAt(track, 0)).toBe(10);
    expect(keyframeValueAt(track, 99)).toBe(30);
  });

  it("interpolates between neighbours with the left key's easing", () => {
    expect(keyframeValueAt(track, 2)).toBeCloseTo(20, 10);
    expect(keyframeValueAt([kf(0, 0, "hold"), kf(1, 100)], 0.999)).toBe(0);
  });
});

describe("seededUnit", () => {
  it("is deterministic and bounded", () => {
    for (let i = 0; i < 64; i++) {
      const a = seededUnit(12345, i);
      expect(a).toBe(seededUnit(12345, i));
      expect(a).toBeGreaterThanOrEqual(0);
      expect(a).toBeLessThan(1);
    }
  });

  it("varies by seed and by index", () => {
    const byIndex = new Set(Array.from({ length: 32 }, (_, i) => seededUnit(7, i)));
    expect(byIndex.size).toBeGreaterThan(28);
    const bySeed = new Set(Array.from({ length: 32 }, (_, s) => seededUnit(s, 0)));
    expect(bySeed.size).toBeGreaterThan(28);
  });
});

describe("lfoWaveValue", () => {
  it("anchors sine phase to media time -- t=0 is the cycle start", () => {
    const s = spec({ waveform: "sine", rateHz: 2 });
    expect(lfoWaveValue(s, 0)).toBeCloseTo(0, 10);
    expect(lfoWaveValue(s, 0.125)).toBeCloseTo(1, 10); // quarter of a 0.5s period
    expect(lfoWaveValue(s, 0.375)).toBeCloseTo(-1, 10);
    // Same media time, same value -- scrubbing never drifts.
    expect(lfoWaveValue(s, 4.25)).toBe(lfoWaveValue(s, 4.25));
  });

  it("square alternates half-cycle at +1/-1", () => {
    const s = spec({ waveform: "square", rateHz: 1 });
    expect(lfoWaveValue(s, 0.25)).toBe(1);
    expect(lfoWaveValue(s, 0.75)).toBe(-1);
  });

  it("triangle ramps -1 -> +1 -> -1 over a cycle", () => {
    const s = spec({ waveform: "triangle", rateHz: 1 });
    expect(lfoWaveValue(s, 0)).toBeCloseTo(-1, 10);
    expect(lfoWaveValue(s, 0.25)).toBeCloseTo(0, 10);
    expect(lfoWaveValue(s, 0.5)).toBeCloseTo(1, 10);
    expect(lfoWaveValue(s, 0.75)).toBeCloseTo(0, 10);
  });

  it("random is a per-cycle sample-and-hold, seeded by spec id", () => {
    const s = spec({ waveform: "random", rateHz: 1 });
    // Constant within a cycle, changes across cycles.
    expect(lfoWaveValue(s, 3.1)).toBe(lfoWaveValue(s, 3.9));
    const cycles = new Set([0.2, 1.2, 2.2, 3.2, 4.2, 5.2].map((t) => lfoWaveValue(s, t)));
    expect(cycles.size).toBeGreaterThan(3);
    // A different LFO id gets its own sequence.
    const other = spec({ id: "s2.mix", waveform: "random", rateHz: 1 });
    expect(lfoWaveValue(other, 0.2)).not.toBe(lfoWaveValue(s, 0.2));
    // Never Math.random: a second evaluation is identical.
    expect(lfoWaveValue(s, 7.77)).toBe(lfoWaveValue(s, 7.77));
  });
});

describe("modulatedParamValue", () => {
  it("returns null when nothing animates the param", () => {
    expect(modulatedParamValue({ keyframeValue: null, lfo: null, min: 0, max: 100, time: 1 })).toBeNull();
  });

  it("passes a bare keyframe value through unchanged", () => {
    expect(
      modulatedParamValue({ keyframeValue: 42, lfo: null, min: 0, max: 100, time: 1 })
    ).toBe(42);
  });

  it("oscillates around offset by depth of the declared range", () => {
    // sine rateHz=1 hits +1 at t=0.25: offset 50 + 0.5 * 100 * 1 = 100.
    const v = modulatedParamValue({
      keyframeValue: null,
      lfo: spec({ waveform: "sine", rateHz: 1, depth: 0.5, offset: 50 }),
      min: 0,
      max: 100,
      time: 0.25,
    });
    expect(v).toBeCloseTo(100, 10);
  });

  it("uses the keyframe value as the centre when a track exists -- offset is ignored", () => {
    const v = modulatedParamValue({
      keyframeValue: 10,
      lfo: spec({ waveform: "sine", rateHz: 1, depth: 0.5, offset: 50 }),
      min: 0,
      max: 100,
      time: 0.25,
    });
    expect(v).toBeCloseTo(60, 10); // 10 + 50, not 50 + 50
  });

  it("clamps into the declared range, like the export's post-keyframe clamp", () => {
    const v = modulatedParamValue({
      keyframeValue: null,
      lfo: spec({ depth: 1, offset: 90 }),
      min: 0,
      max: 100,
      time: 0.25, // sine peak: 90 + 100 = 190
    });
    expect(v).toBe(100);
  });

  it("stays unclamped when the param declares no range (unit amplitude fallback)", () => {
    const v = modulatedParamValue({
      keyframeValue: null,
      lfo: spec({ depth: 0.5, offset: 0 }),
      min: undefined,
      max: undefined,
      time: 0.25,
    });
    expect(v).toBeCloseTo(0.5, 10);
  });
});

describe("exportFrameTimes", () => {
  it("lands on the exact grid the backend evaluates: trim_start + idx/fps", () => {
    const times = exportFrameTimes(30, 1.5, 2.0);
    expect(times[0]).toBeCloseTo(1.5, 12);
    expect(times[1]).toBeCloseTo(1.5 + 1 / 30, 12);
    // The last baked time covers the trim end so the tail never freezes.
    expect(times[times.length - 1]).toBeGreaterThanOrEqual(2.0);
    for (let i = 0; i < times.length; i++) {
      expect(times[i]).toBeCloseTo(1.5 + i / 30, 12);
    }
  });

  it("still emits a frame for a zero-length range (still-image exports)", () => {
    const times = exportFrameTimes(24, 0, 0);
    expect(times.length).toBeGreaterThanOrEqual(1);
    expect(times[0]).toBe(0);
  });

  it("treats a negative trim start as 0, matching the backend's clamp", () => {
    expect(exportFrameTimes(30, -5, 1)[0]).toBe(0);
  });
});
