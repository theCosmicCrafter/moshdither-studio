import { describe, it, expect } from "vitest";
import { generateBeatKeyframes, type BeatKeyframeOptions } from "./beatKeyframeGenerator";
import type { Beat } from "./beatDetection";

function makeBeats(times: number[], intensity = 0.8): Beat[] {
  return times.map((t) => ({ time: t, intensity }));
}

describe("Beat Keyframe Generator", () => {
  const baseOpts: Omit<BeatKeyframeOptions, "beats" | "mode"> = {
    paramKey: "intensity",
    minValue: 0,
    maxValue: 1,
  };

  describe("empty beats", () => {
    it("returns empty array for no beats", () => {
      const kfs = generateBeatKeyframes({ ...baseOpts, beats: [], mode: "pulse" });
      expect(kfs).toEqual([]);
    });
  });

  describe("pulse mode", () => {
    it("generates peak + decay keyframes for each beat", () => {
      const beats = makeBeats([1.0, 2.0]);
      const kfs = generateBeatKeyframes({
        ...baseOpts,
        beats,
        mode: "pulse",
        pulseDecay: 0.3,
      });
      // 2 beats × 2 keyframes (peak + decay) = 4
      expect(kfs.length).toBe(4);
      // First peak at t=1.0
      expect(kfs[0].time).toBeCloseTo(1.0);
      expect(kfs[0].value).toBeCloseTo(0.8); // min + (max-min) * intensity
      // First decay before next beat
      expect(kfs[1].time).toBeGreaterThan(1.0);
      expect(kfs[1].time).toBeLessThan(2.0);
      expect(kfs[1].value).toBe(0); // decays to min
    });

    it("last beat decays after its time", () => {
      const beats = makeBeats([1.0]);
      const kfs = generateBeatKeyframes({
        ...baseOpts,
        beats,
        mode: "pulse",
        pulseDecay: 0.5,
      });
      expect(kfs.length).toBe(2);
      expect(kfs[0].time).toBe(1.0);
      expect(kfs[1].time).toBeCloseTo(1.5);
      expect(kfs[1].value).toBe(0);
    });

    it("decay time is clamped to not overlap next beat", () => {
      const beats = makeBeats([1.0, 1.1]); // very close beats
      const kfs = generateBeatKeyframes({
        ...baseOpts,
        beats,
        mode: "pulse",
        pulseDecay: 0.5, // would be 1.5, but next beat at 1.1
      });
      // Decay should be at most 1.1 - 0.05 = 1.05
      const decayKf = kfs[1];
      expect(decayKf.time).toBeLessThanOrEqual(1.05);
    });

    it("uses intensity to scale peak value", () => {
      const beats: Beat[] = [{ time: 1.0, intensity: 0.5 }];
      const kfs = generateBeatKeyframes({
        ...baseOpts,
        beats,
        mode: "pulse",
        minValue: 0,
        maxValue: 100,
      });
      expect(kfs[0].value).toBe(50); // 0 + (100-0) * 0.5
    });
  });

  describe("toggle mode", () => {
    it("alternates between max and min", () => {
      const beats = makeBeats([1.0, 2.0, 3.0, 4.0]);
      const kfs = generateBeatKeyframes({ ...baseOpts, beats, mode: "toggle" });
      expect(kfs.length).toBe(4);
      expect(kfs[0].value).toBe(1); // max (even index)
      expect(kfs[1].value).toBe(0); // min (odd index)
      expect(kfs[2].value).toBe(1); // max
      expect(kfs[3].value).toBe(0); // min
    });

    it("first beat is max", () => {
      const beats = makeBeats([0.5]);
      const kfs = generateBeatKeyframes({ ...baseOpts, beats, mode: "toggle" });
      expect(kfs[0].value).toBe(1);
    });
  });

  describe("ramp mode", () => {
    it("ramps up over cycleBeats then resets", () => {
      const beats = makeBeats([1.0, 2.0, 3.0, 4.0, 5.0]);
      const kfs = generateBeatKeyframes({
        ...baseOpts,
        beats,
        mode: "ramp",
        rampCycleBeats: 4,
        minValue: 0,
        maxValue: 30,
      });
      expect(kfs.length).toBe(5);
      // Step = (30 - 0) / (4 - 1) = 10
      expect(kfs[0].value).toBe(0); // cycle pos 0
      expect(kfs[1].value).toBe(10); // cycle pos 1
      expect(kfs[2].value).toBe(20); // cycle pos 2
      expect(kfs[3].value).toBe(30); // cycle pos 3 (max)
      expect(kfs[4].value).toBe(0); // cycle pos 0 (reset)
    });

    it("handles cycleBeats of 1", () => {
      const beats = makeBeats([1.0, 2.0]);
      const kfs = generateBeatKeyframes({
        ...baseOpts,
        beats,
        mode: "ramp",
        rampCycleBeats: 1,
        minValue: 0,
        maxValue: 10,
      });
      // step = (10-0) / (1-1 || 1) = 10/1 = 10, but cyclePosition = i % 1 = 0
      expect(kfs[0].value).toBe(0);
      expect(kfs[1].value).toBe(0);
    });
  });

  describe("decay mode", () => {
    it("generates peak then mid-point decay", () => {
      const beats = makeBeats([1.0, 2.0]);
      const kfs = generateBeatKeyframes({ ...baseOpts, beats, mode: "decay" });
      // 2 beats: beat0 peak + mid decay, beat1 peak (no next beat for mid)
      expect(kfs.length).toBe(3);
      expect(kfs[0].time).toBe(1.0);
      expect(kfs[0].value).toBe(1); // max
      expect(kfs[1].time).toBeCloseTo(1.5); // midpoint
      expect(kfs[1].value).toBe(0); // min
      expect(kfs[2].time).toBe(2.0);
      expect(kfs[2].value).toBe(1); // max
    });

    it("single beat has no mid-decay", () => {
      const beats = makeBeats([1.0]);
      const kfs = generateBeatKeyframes({ ...baseOpts, beats, mode: "decay" });
      expect(kfs.length).toBe(1);
      expect(kfs[0].value).toBe(1);
    });
  });

  describe("default mode", () => {
    it("unknown mode falls back to pulse", () => {
      const beats = makeBeats([1.0]);
      const kfs = generateBeatKeyframes({
        ...baseOpts,
        beats,
        mode: "nonexistent" as never,
        pulseDecay: 0.3,
      });
      // Should behave like pulse: peak + decay
      expect(kfs.length).toBe(2);
      expect(kfs[0].value).toBe(0.8);
      expect(kfs[1].value).toBe(0);
    });
  });

  describe("keyframe properties", () => {
    it("all keyframes have unique IDs", () => {
      const beats = makeBeats([1.0, 2.0, 3.0]);
      const kfs = generateBeatKeyframes({ ...baseOpts, beats, mode: "toggle" });
      const ids = kfs.map((k) => k.id);
      expect(new Set(ids).size).toBe(ids.length);
    });

    it("all keyframes have easing", () => {
      const beats = makeBeats([1.0]);
      const kfs = generateBeatKeyframes({
        ...baseOpts,
        beats,
        mode: "pulse",
        easing: "easeIn",
      });
      expect(kfs[0].easing).toBe("easeIn");
    });

    it("keyframes are sorted by time", () => {
      const beats = makeBeats([3.0, 1.0, 2.0]); // unsorted
      const kfs = generateBeatKeyframes({ ...baseOpts, beats, mode: "toggle" });
      for (let i = 1; i < kfs.length; i++) {
        expect(kfs[i].time).toBeGreaterThanOrEqual(kfs[i - 1].time);
      }
    });
  });

  describe("deduplication", () => {
    it("removes keyframes within 10ms of each other", () => {
      const beats: Beat[] = [
        { time: 1.0, intensity: 0.5 },
        { time: 1.005, intensity: 1.0 }, // 5ms apart
      ];
      const kfs = generateBeatKeyframes({
        ...baseOpts,
        beats,
        mode: "pulse",
        pulseDecay: 0.3,
      });
      // The dedupe should merge keyframes at ~1.0 and ~1.005
      // Check no two keyframes are within 10ms
      for (let i = 1; i < kfs.length; i++) {
        expect(Math.abs(kfs[i].time - kfs[i - 1].time)).toBeGreaterThan(0.01);
      }
    });
  });
});
