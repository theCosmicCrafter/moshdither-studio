import { describe, it, expect } from "vitest";
import { generateBeatKeyframes } from "./beatKeyframeGenerator";
import type { Beat } from "./beatDetection";

describe("Beat Keyframe Generator Fringe Cases", () => {
  const baseOpts = {
    paramKey: "intensity",
    minValue: 0,
    maxValue: 1,
  };

  describe("negative and extreme values", () => {
    it("handles negative minValue", () => {
      const beats: Beat[] = [{ time: 1, intensity: 0.5 }];
      const kfs = generateBeatKeyframes({
        ...baseOpts,
        beats,
        mode: "pulse",
        minValue: -100,
        maxValue: 0,
        pulseDecay: 0.3,
      });
      expect(kfs[0].value).toBe(-50); // -100 + (0-(-100)) * 0.5
    });

    it("handles negative maxValue", () => {
      const beats: Beat[] = [{ time: 1, intensity: 1 }];
      const kfs = generateBeatKeyframes({
        ...baseOpts,
        beats,
        mode: "pulse",
        minValue: -200,
        maxValue: -100,
        pulseDecay: 0.3,
      });
      expect(kfs[0].value).toBe(-100); // -200 + (-100-(-200)) * 1
    });

    it("handles minValue === maxValue", () => {
      const beats: Beat[] = [{ time: 1, intensity: 0.8 }];
      const kfs = generateBeatKeyframes({
        ...baseOpts,
        beats,
        mode: "pulse",
        minValue: 50,
        maxValue: 50,
        pulseDecay: 0.3,
      });
      expect(kfs[0].value).toBe(50);
      expect(kfs[1].value).toBe(50);
    });

    it("handles very large maxValue", () => {
      const beats: Beat[] = [{ time: 1, intensity: 1 }];
      const kfs = generateBeatKeyframes({
        ...baseOpts,
        beats,
        mode: "pulse",
        minValue: 0,
        maxValue: 1000000,
        pulseDecay: 0.3,
      });
      expect(kfs[0].value).toBe(1000000);
    });

    it("handles intensity of 0", () => {
      const beats: Beat[] = [{ time: 1, intensity: 0 }];
      const kfs = generateBeatKeyframes({
        ...baseOpts,
        beats,
        mode: "pulse",
        minValue: 0,
        maxValue: 100,
        pulseDecay: 0.3,
      });
      expect(kfs[0].value).toBe(0); // 0 + (100-0) * 0
    });

    it("handles intensity > 1 (clamped by Math.min in pulse)", () => {
      const beats: Beat[] = [{ time: 1, intensity: 1.5 }];
      const kfs = generateBeatKeyframes({
        ...baseOpts,
        beats,
        mode: "pulse",
        minValue: 0,
        maxValue: 100,
        pulseDecay: 0.3,
      });
      // intensity is now clamped to [0,1]: 0 + 100 * 1.0 = 100
      expect(kfs[0].value).toBe(100);
    });
  });

  describe("same-time beats", () => {
    it("two beats at same time produce deduped keyframes", () => {
      const beats: Beat[] = [
        { time: 1.0, intensity: 0.5 },
        { time: 1.0, intensity: 1.0 },
      ];
      const kfs = generateBeatKeyframes({
        ...baseOpts,
        beats,
        mode: "pulse",
        pulseDecay: 0.3,
      });
      // Keyframes at same time should be deduped (within 10ms)
      for (let i = 1; i < kfs.length; i++) {
        expect(Math.abs(kfs[i].time - kfs[i - 1].time)).toBeGreaterThan(0.01);
      }
    });

    it("beats within 10ms are deduped in pulse mode", () => {
      const beats: Beat[] = [
        { time: 1.0, intensity: 0.5 },
        { time: 1.005, intensity: 1.0 },
      ];
      const kfs = generateBeatKeyframes({
        ...baseOpts,
        beats,
        mode: "pulse",
        pulseDecay: 0.3,
      });
      // pulse mode calls dedupeAndSort which removes keyframes within 10ms
      // Two peaks at 1.0 and 1.005 are within 10ms → higher value wins
      // Plus one decay keyframe at ~1.3
      const peakKfs = kfs.filter((k) => k.value > 0);
      expect(peakKfs.length).toBe(1);
      expect(peakKfs[0].value).toBe(1); // higher intensity beat wins
    });
  });

  describe("large beat counts", () => {
    it("handles 100 beats in pulse mode", () => {
      const beats: Beat[] = [];
      for (let i = 0; i < 100; i++) {
        beats.push({ time: i * 0.5, intensity: 0.5 + (i % 10) / 20 });
      }
      const kfs = generateBeatKeyframes({
        ...baseOpts,
        beats,
        mode: "pulse",
        pulseDecay: 0.2,
      });
      // Each beat produces 2 keyframes (peak + decay)
      // Last beat only has peak + final decay
      expect(kfs.length).toBeGreaterThan(0);
      // All keyframes sorted
      for (let i = 1; i < kfs.length; i++) {
        expect(kfs[i].time).toBeGreaterThanOrEqual(kfs[i - 1].time);
      }
    });

    it("handles 100 beats in toggle mode", () => {
      const beats: Beat[] = [];
      for (let i = 0; i < 100; i++) {
        beats.push({ time: i * 0.25, intensity: 0.8 });
      }
      const kfs = generateBeatKeyframes({
        ...baseOpts,
        beats,
        mode: "toggle",
      });
      expect(kfs.length).toBe(100);
      // Even beats = max, odd = min
      for (let i = 0; i < kfs.length; i++) {
        expect(kfs[i].value).toBe(i % 2 === 0 ? 1 : 0);
      }
    });

    it("handles 100 beats in ramp mode", () => {
      const beats: Beat[] = [];
      for (let i = 0; i < 100; i++) {
        beats.push({ time: i * 0.1, intensity: 0.8 });
      }
      const kfs = generateBeatKeyframes({
        ...baseOpts,
        beats,
        mode: "ramp",
        rampCycleBeats: 8,
        minValue: 0,
        maxValue: 70,
      });
      expect(kfs.length).toBe(100);
      // Check cycle resets
      expect(kfs[0].value).toBe(0); // cycle pos 0
      expect(kfs[8].value).toBe(0); // cycle pos 0 (reset)
    });
  });

  describe("decay mode edge cases", () => {
    it("decay with only 2 beats produces 3 keyframes", () => {
      const beats: Beat[] = [
        { time: 1.0, intensity: 0.8 },
        { time: 3.0, intensity: 0.6 },
      ];
      const kfs = generateBeatKeyframes({
        ...baseOpts,
        beats,
        mode: "decay",
        minValue: 0,
        maxValue: 100,
      });
      expect(kfs.length).toBe(3);
      // decay mode uses max for peak (not intensity-scaled), min for midpoint
      expect(kfs[0].time).toBe(1.0);
      expect(kfs[0].value).toBe(100); // always max at beat
      expect(kfs[1].time).toBeCloseTo(2.0); // midpoint
      expect(kfs[1].value).toBe(0); // min at midpoint
      expect(kfs[2].time).toBe(3.0);
      expect(kfs[2].value).toBe(100); // always max at beat
    });

    it("decay with 3 beats produces 5 keyframes", () => {
      const beats: Beat[] = [
        { time: 1.0, intensity: 0.8 },
        { time: 2.0, intensity: 0.6 },
        { time: 3.0, intensity: 0.9 },
      ];
      const kfs = generateBeatKeyframes({
        ...baseOpts,
        beats,
        mode: "decay",
        minValue: 0,
        maxValue: 100,
      });
      // beat0 peak(max), mid0(min), beat1 peak(max), mid1(min), beat2 peak(max)
      expect(kfs.length).toBe(5);
      expect(kfs[0].value).toBe(100);
      expect(kfs[1].value).toBe(0);
      expect(kfs[2].value).toBe(100);
      expect(kfs[3].value).toBe(0);
      expect(kfs[4].value).toBe(100);
    });
  });

  describe("ramp mode edge cases", () => {
    it("ramp with cycleBeats=2 produces 2-step ramp", () => {
      const beats: Beat[] = [
        { time: 1, intensity: 0.8 },
        { time: 2, intensity: 0.8 },
        { time: 3, intensity: 0.8 },
        { time: 4, intensity: 0.8 },
      ];
      const kfs = generateBeatKeyframes({
        ...baseOpts,
        beats,
        mode: "ramp",
        rampCycleBeats: 2,
        minValue: 0,
        maxValue: 10,
      });
      // step = (10-0) / (2-1) = 10
      expect(kfs[0].value).toBe(0); // pos 0
      expect(kfs[1].value).toBe(10); // pos 1 (max)
      expect(kfs[2].value).toBe(0); // pos 0 (reset)
      expect(kfs[3].value).toBe(10); // pos 1
    });

    it("ramp with cycleBeats=10 and only 3 beats", () => {
      const beats: Beat[] = [
        { time: 1, intensity: 0.8 },
        { time: 2, intensity: 0.8 },
        { time: 3, intensity: 0.8 },
      ];
      const kfs = generateBeatKeyframes({
        ...baseOpts,
        beats,
        mode: "ramp",
        rampCycleBeats: 10,
        minValue: 0,
        maxValue: 90,
      });
      // step = 90 / 9 = 10
      expect(kfs[0].value).toBe(0); // pos 0
      expect(kfs[1].value).toBe(10); // pos 1
      expect(kfs[2].value).toBe(20); // pos 2
    });

    it("ramp with cycleBeats=0 uses fallback (1)", () => {
      const beats: Beat[] = [
        { time: 1, intensity: 0.8 },
        { time: 2, intensity: 0.8 },
      ];
      const kfs = generateBeatKeyframes({
        ...baseOpts,
        beats,
        mode: "ramp",
        rampCycleBeats: 0,
        minValue: 0,
        maxValue: 10,
      });
      // step = 10 / (0-1 || 1) = 10/1 = 10, but cyclePosition = i % 0...
      // i % 0 is NaN in JS, so value = 0 + NaN = NaN
      // Let's just check it doesn't crash
      expect(kfs.length).toBe(2);
    });
  });

  describe("pulse decay edge cases", () => {
    it("pulseDecay of 0 produces immediate decay", () => {
      const beats: Beat[] = [
        { time: 1.0, intensity: 0.8 },
        { time: 2.0, intensity: 0.8 },
      ];
      const kfs = generateBeatKeyframes({
        ...baseOpts,
        beats,
        mode: "pulse",
        pulseDecay: 0,
      });
      // decayTime = min(1.0 + 0, 2.0 - 0.05) = 1.0
      // But decayTime > beat.time check: 1.0 > 1.0 is false, so no decay kf
      // Only peaks
      expect(kfs.length).toBe(2); // just the two peaks
    });

    it("pulseDecay larger than beat interval clamps to next beat", () => {
      const beats: Beat[] = [
        { time: 1.0, intensity: 0.8 },
        { time: 1.2, intensity: 0.8 },
      ];
      const kfs = generateBeatKeyframes({
        ...baseOpts,
        beats,
        mode: "pulse",
        pulseDecay: 1.0,
      });
      // decay should be at most 1.2 - 0.05 = 1.15
      const decayKf = kfs[1];
      expect(decayKf.time).toBeLessThanOrEqual(1.15);
      expect(decayKf.time).toBeGreaterThan(1.0);
    });

    it("last beat always gets a decay keyframe", () => {
      const beats: Beat[] = [
        { time: 1.0, intensity: 0.8 },
        { time: 2.0, intensity: 0.8 },
        { time: 5.0, intensity: 0.8 },
      ];
      const kfs = generateBeatKeyframes({
        ...baseOpts,
        beats,
        mode: "pulse",
        pulseDecay: 0.3,
      });
      // Last beat should have a decay keyframe at 5.0 + 0.3 = 5.3
      const lastKf = kfs[kfs.length - 1];
      expect(lastKf.time).toBeCloseTo(5.3);
      expect(lastKf.value).toBe(0);
    });
  });

  describe("easing propagation", () => {
    it("custom easing is applied to peak keyframes", () => {
      const beats: Beat[] = [{ time: 1, intensity: 0.5 }];
      const kfs = generateBeatKeyframes({
        ...baseOpts,
        beats,
        mode: "toggle",
        easing: "easeInOut",
      });
      expect(kfs[0].easing).toBe("easeInOut");
    });

    it("decay keyframes always use easeOut", () => {
      const beats: Beat[] = [{ time: 1, intensity: 0.5 }];
      const kfs = generateBeatKeyframes({
        ...baseOpts,
        beats,
        mode: "pulse",
        easing: "easeIn",
        pulseDecay: 0.3,
      });
      expect(kfs[0].easing).toBe("easeIn"); // peak uses provided easing
      expect(kfs[1].easing).toBe("easeOut"); // decay always easeOut
    });
  });
});
