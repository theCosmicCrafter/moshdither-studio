import { describe, it, expect } from "vitest";
import { generateBeatKeyframes } from "../beatKeyframeGenerator";
import type { Beat } from "../beatDetection";

function makeBeats(times: number[]): Beat[] {
  return times.map((t) => ({ time: t, intensity: 0.8 }));
}

describe("generateBeatKeyframes", () => {
  describe("pulse mode", () => {
    it("generates peak + decay keyframes for each beat", () => {
      const beats = makeBeats([0.0, 0.5, 1.0]);
      const kf = generateBeatKeyframes({
        beats,
        paramKey: "intensity",
        mode: "pulse",
        minValue: 0,
        maxValue: 1,
        pulseDecay: 0.2,
      });
      expect(kf.length).toBeGreaterThanOrEqual(3);
      expect(kf[0].time).toBe(0.0);
      expect(kf[0].value).toBeCloseTo(0.8, 1); // min + (max-min) * intensity
    });

    it("includes decay keyframe after last beat", () => {
      const beats = makeBeats([0.0]);
      const kf = generateBeatKeyframes({
        beats,
        paramKey: "x",
        mode: "pulse",
        minValue: 0,
        maxValue: 1,
        pulseDecay: 0.3,
      });
      expect(kf.length).toBe(2);
      expect(kf[1].time).toBe(0.3);
      expect(kf[1].value).toBe(0);
    });
  });

  describe("toggle mode", () => {
    it("alternates min and max on each beat", () => {
      const beats = makeBeats([0, 0.5, 1.0, 1.5]);
      const kf = generateBeatKeyframes({
        beats,
        paramKey: "x",
        mode: "toggle",
        minValue: 0,
        maxValue: 1,
      });
      expect(kf).toHaveLength(4);
      expect(kf[0].value).toBe(1);
      expect(kf[1].value).toBe(0);
      expect(kf[2].value).toBe(1);
      expect(kf[3].value).toBe(0);
    });
  });

  describe("ramp mode", () => {
    it("ramps value over cycleBeats then resets", () => {
      const beats = makeBeats([0, 0.5, 1.0, 1.5, 2.0]);
      const kf = generateBeatKeyframes({
        beats,
        paramKey: "x",
        mode: "ramp",
        minValue: 0,
        maxValue: 10,
        rampCycleBeats: 3,
      });
      expect(kf[0].value).toBe(0);
      expect(kf[1].value).toBe(5);
      expect(kf[2].value).toBe(10);
      expect(kf[3].value).toBe(0); // reset after cycle
      expect(kf[4].value).toBe(5);
    });
  });

  describe("decay mode", () => {
    it("peaks on beat and fades to min by mid-beat", () => {
      const beats = makeBeats([0, 1.0]);
      const kf = generateBeatKeyframes({
        beats,
        paramKey: "x",
        mode: "decay",
        minValue: 0,
        maxValue: 1,
      });
      expect(kf).toHaveLength(3);
      expect(kf[0].value).toBe(1);
      expect(kf[1].time).toBe(0.5);
      expect(kf[1].value).toBe(0);
    });
  });

  it("returns empty array when no beats", () => {
    const kf = generateBeatKeyframes({
      beats: [],
      paramKey: "x",
      mode: "pulse",
      minValue: 0,
      maxValue: 1,
    });
    expect(kf).toHaveLength(0);
  });
});
