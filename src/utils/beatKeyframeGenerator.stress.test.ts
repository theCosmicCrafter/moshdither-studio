import { describe, it, expect } from "vitest";
import { generateBeatKeyframes } from "./beatKeyframeGenerator";
import type { Beat } from "./beatDetection";

describe("Beat Keyframe Generator Stress Tests", () => {
  // ── cycleBeats=0 produces NaN via modulo ──
  describe("cycleBeats=0 NaN injection", () => {
    const beats: Beat[] = [
      { time: 0, intensity: 1 },
      { time: 1, intensity: 0.8 },
      { time: 2, intensity: 0.6 },
      { time: 3, intensity: 0.9 },
    ];

    it("ramp mode with cycleBeats=0 does not produce NaN", () => {
      const kfs = generateBeatKeyframes({
        beats,
        paramKey: "intensity",
        mode: "ramp",
        minValue: 0,
        maxValue: 100,
        rampCycleBeats: 0,
      });
      expect(kfs.every((kf) => !Number.isNaN(kf.value))).toBe(true);
    });

    it("ramp mode with cycleBeats=0 produces valid values (not NaN)", () => {
      const kfs = generateBeatKeyframes({
        beats,
        paramKey: "intensity",
        mode: "ramp",
        minValue: 0,
        maxValue: 100,
        rampCycleBeats: 0,
      });
      expect(kfs.length).toBe(4);
      expect(kfs.every((kf) => !Number.isNaN(kf.value))).toBe(true);
    });
  });

  // ── cycleBeats=1 produces only minValue ──
  describe("cycleBeats=1 edge case", () => {
    const beats: Beat[] = [
      { time: 0, intensity: 1 },
      { time: 1, intensity: 0.8 },
    ];

    it("ramp mode with cycleBeats=1 always produces minValue", () => {
      const kfs = generateBeatKeyframes({
        beats,
        paramKey: "intensity",
        mode: "ramp",
        minValue: 10,
        maxValue: 100,
        rampCycleBeats: 1,
      });
      // step = (100 - 10) / (1 - 1 || 1) = 90 / 1 = 90
      // cyclePosition = i % 1 = 0
      // value = 10 + 90 * 0 = 10
      expect(kfs.every((kf) => kf.value === 10)).toBe(true);
    });
  });

  // ── NaN min/max ──
  describe("NaN min/max propagation", () => {
    const beats: Beat[] = [{ time: 0, intensity: 1 }];

    it("NaN minValue produces NaN keyframe values in pulse mode", () => {
      const kfs = generateBeatKeyframes({
        beats,
        paramKey: "intensity",
        mode: "pulse",
        minValue: Number.NaN,
        maxValue: 100,
        pulseDecay: 0.5,
      });
      // value = NaN + (100 - NaN) * 1 = NaN
      expect(kfs.some((kf) => Number.isNaN(kf.value))).toBe(true);
    });

    it("NaN maxValue produces NaN keyframe values in pulse mode", () => {
      const kfs = generateBeatKeyframes({
        beats,
        paramKey: "intensity",
        mode: "pulse",
        minValue: 0,
        maxValue: Number.NaN,
        pulseDecay: 0.5,
      });
      // value = 0 + (NaN - 0) * 1 = NaN
      expect(kfs.some((kf) => Number.isNaN(kf.value))).toBe(true);
    });

    it("NaN minValue in toggle mode produces NaN", () => {
      const kfs = generateBeatKeyframes({
        beats: [
          { time: 0, intensity: 1 },
          { time: 1, intensity: 0.5 },
        ],
        paramKey: "intensity",
        mode: "toggle",
        minValue: Number.NaN,
        maxValue: 100,
      });
      // Even-indexed beats get maxValue=100, odd get minValue=NaN
      expect(kfs[1].value).toBe(Number.NaN);
    });
  });

  // ── Infinity min/max ──
  describe("Infinity min/max", () => {
    const beats: Beat[] = [{ time: 0, intensity: 1 }];

    it("Infinity maxValue in pulse mode produces Infinity value", () => {
      const kfs = generateBeatKeyframes({
        beats,
        paramKey: "intensity",
        mode: "pulse",
        minValue: 0,
        maxValue: Infinity,
        pulseDecay: 0.5,
      });
      // value = 0 + (Infinity - 0) * 1 = Infinity
      expect(kfs[0].value).toBe(Infinity);
    });

    it("-Infinity minValue in pulse mode produces -Infinity value", () => {
      const kfs = generateBeatKeyframes({
        beats,
        paramKey: "intensity",
        mode: "pulse",
        minValue: -Infinity,
        maxValue: 0,
        pulseDecay: 0.5,
      });
      // value = -Infinity + (0 - (-Infinity)) * 1 = -Infinity + Infinity = NaN
      // Actually: -Inf + Inf = NaN in JS!
      expect(Number.isNaN(kfs[0].value)).toBe(true);
    });

    it("Infinity max with -Infinity min produces NaN", () => {
      const kfs = generateBeatKeyframes({
        beats,
        paramKey: "intensity",
        mode: "pulse",
        minValue: -Infinity,
        maxValue: Infinity,
        pulseDecay: 0.5,
      });
      // value = -Inf + (Inf - (-Inf)) * 1 = -Inf + Inf = NaN
      expect(Number.isNaN(kfs[0].value)).toBe(true);
    });
  });

  // ── pulseDecay edge cases ──
  describe("pulseDecay edge cases", () => {
    const beats: Beat[] = [
      { time: 1, intensity: 1 },
      { time: 2, intensity: 0.8 },
    ];

    it("pulseDecay=NaN silently drops decay keyframes", () => {
      const kfs = generateBeatKeyframes({
        beats,
        paramKey: "intensity",
        mode: "pulse",
        minValue: 0,
        maxValue: 100,
        pulseDecay: Number.NaN,
      });
      // decayTime = Math.min(1 + NaN, 2 - 0.05) = NaN
      // NaN > 1 is false → no decay keyframe for first beat
      // Last beat: makeKeyframe(1 + NaN, 0, "easeOut") → time=NaN
      expect(kfs.length).toBeLessThan(4); // Should have 4 (2 peaks + 2 decays)
      // Documents the bug: decay keyframes are silently dropped
    });

    it("pulseDecay=0 produces decay at same time as beat (deduped)", () => {
      const kfs = generateBeatKeyframes({
        beats,
        paramKey: "intensity",
        mode: "pulse",
        minValue: 0,
        maxValue: 100,
        pulseDecay: 0,
      });
      // decayTime = Math.min(1 + 0, 2 - 0.05) = 1
      // 1 > 1 is false → no decay keyframe for first beat
      // Last beat: makeKeyframe(2 + 0, 0, "easeOut") → time=2, value=0
      // But beat at time=2 has value=80, and dedupe keeps higher value
      // So the decay at time=2 is dropped (value 0 < value 80)
      expect(kfs.length).toBeGreaterThanOrEqual(1);
    });

    it("pulseDecay=Infinity clamps to nextBeat.time - 0.05", () => {
      const kfs = generateBeatKeyframes({
        beats,
        paramKey: "intensity",
        mode: "pulse",
        minValue: 0,
        maxValue: 100,
        pulseDecay: Infinity,
      });
      // decayTime = Math.min(1 + Inf, 2 - 0.05) = 1.95
      // 1.95 > 1 → true → decay keyframe at 1.95
      expect(kfs.some((kf) => kf.time === 1.95)).toBe(true);
    });

    it("negative pulseDecay produces no decay keyframe for non-last beats", () => {
      const kfs = generateBeatKeyframes({
        beats,
        paramKey: "intensity",
        mode: "pulse",
        minValue: 0,
        maxValue: 100,
        pulseDecay: -1,
      });
      // decayTime = Math.min(1 + (-1), 2 - 0.05) = Math.min(0, 1.95) = 0
      // 0 > 1 is false → no decay keyframe for first beat
      // Last beat: makeKeyframe(2 + (-1), 0, "easeOut") → time=1
      // dedupe: beat at time=1 has value=100, decay at time=1 has value=0 → keep 100
      // So we only get 2 keyframes (peaks only, decays are all deduped)
      expect(kfs.length).toBe(2);
    });
  });

  // ── dedupeAndSort mutates input array ──
  describe("dedupeAndSort side-effect mutation", () => {
    it("generatePulse mutates the sorted beats array copy (not original)", () => {
      const beats: Beat[] = [
        { time: 2, intensity: 0.5 },
        { time: 1, intensity: 1 },
        { time: 0, intensity: 0.8 },
      ];
      const originalOrder = beats.map((b) => b.time);
      generateBeatKeyframes({
        beats,
        paramKey: "intensity",
        mode: "pulse",
        minValue: 0,
        maxValue: 100,
        pulseDecay: 0.5,
      });
      // The function does [...beats].sort() which creates a copy
      // So the original array should be unchanged
      expect(beats.map((b) => b.time)).toEqual(originalOrder);
    });

    it("dedupeAndSort mutates keyframes array in-place via .sort()", () => {
      // generatePulse creates keyframes array and calls dedupeAndSort
      // dedupeAndSort does keyframes.sort() which mutates in-place
      // But since it's a local array, this is safe
      // However, if someone were to pass a shared array, it would be mutated
      // This test documents that the internal sort is in-place
      const beats: Beat[] = [
        { time: 0, intensity: 1 },
        { time: 0.005, intensity: 0.9 }, // Within 10ms of first
      ];
      const kfs = generateBeatKeyframes({
        beats,
        paramKey: "intensity",
        mode: "pulse",
        minValue: 0,
        maxValue: 100,
        pulseDecay: 0.5,
      });
      // Two beats within 10ms → deduped to 1 keyframe (higher value kept)
      // First beat: time=0, value=100 (intensity=1)
      // Second beat: time=0.005, value=90 (intensity=0.9)
      // Dedupe: 0.005 - 0 = 0.005 < 0.01 → deduped, keep higher (100)
      expect(kfs.length).toBeLessThan(4);
    });
  });

  // ── Empty and single-beat edge cases ──
  describe("empty and single-beat edge cases", () => {
    it("empty beats array returns empty keyframes", () => {
      const kfs = generateBeatKeyframes({
        beats: [],
        paramKey: "intensity",
        mode: "pulse",
        minValue: 0,
        maxValue: 100,
      });
      expect(kfs).toEqual([]);
    });

    it("single beat in pulse mode produces peak + decay", () => {
      const kfs = generateBeatKeyframes({
        beats: [{ time: 1, intensity: 0.5 }],
        paramKey: "intensity",
        mode: "pulse",
        minValue: 0,
        maxValue: 100,
        pulseDecay: 0.3,
      });
      // Peak at t=1 (value=50), decay at t=1.3 (value=0)
      expect(kfs.length).toBe(2);
      expect(kfs[0].time).toBe(1);
      expect(kfs[0].value).toBe(50);
      expect(kfs[1].time).toBe(1.3);
      expect(kfs[1].value).toBe(0);
    });

    it("single beat in toggle mode produces single keyframe", () => {
      const kfs = generateBeatKeyframes({
        beats: [{ time: 1, intensity: 0.5 }],
        paramKey: "intensity",
        mode: "toggle",
        minValue: 0,
        maxValue: 100,
      });
      expect(kfs.length).toBe(1);
      expect(kfs[0].value).toBe(100); // i=0, even → max
    });

    it("single beat in ramp mode with cycleBeats=4 produces minValue", () => {
      const kfs = generateBeatKeyframes({
        beats: [{ time: 1, intensity: 0.5 }],
        paramKey: "intensity",
        mode: "ramp",
        minValue: 0,
        maxValue: 100,
        rampCycleBeats: 4,
      });
      // cyclePosition = 0 % 4 = 0
      // value = 0 + (100/3) * 0 = 0
      expect(kfs.length).toBe(1);
      expect(kfs[0].value).toBe(0);
    });

    it("single beat in decay mode produces peak + mid decay", () => {
      const kfs = generateBeatKeyframes({
        beats: [{ time: 1, intensity: 0.5 }],
        paramKey: "intensity",
        mode: "decay",
        minValue: 0,
        maxValue: 100,
      });
      // Only one beat, no next beat → only peak keyframe
      expect(kfs.length).toBe(1);
      expect(kfs[0].value).toBe(100);
    });
  });

  // ── Beats with NaN time ──
  describe("beats with NaN time", () => {
    it("NaN time beat produces keyframe at NaN time", () => {
      const kfs = generateBeatKeyframes({
        beats: [{ time: Number.NaN, intensity: 1 }],
        paramKey: "intensity",
        mode: "toggle",
        minValue: 0,
        maxValue: 100,
      });
      expect(kfs.length).toBe(1);
      expect(Number.isNaN(kfs[0].time)).toBe(true);
      // Documents that NaN time propagates
    });

    it("mixed NaN and valid times produce unsorted output", () => {
      const kfs = generateBeatKeyframes({
        beats: [
          { time: Number.NaN, intensity: 1 },
          { time: 1, intensity: 0.5 },
          { time: 0, intensity: 0.8 },
        ],
        paramKey: "intensity",
        mode: "toggle",
        minValue: 0,
        maxValue: 100,
      });
      // sort with NaN produces unpredictable order
      // This test documents the behavior
      expect(kfs.length).toBe(3);
    });
  });

  // ── Beats with negative time ──
  describe("beats with negative time", () => {
    it("negative time beats produce keyframes at negative time", () => {
      const kfs = generateBeatKeyframes({
        beats: [
          { time: -1, intensity: 1 },
          { time: -0.5, intensity: 0.8 },
        ],
        paramKey: "intensity",
        mode: "pulse",
        minValue: 0,
        maxValue: 100,
        pulseDecay: 0.3,
      });
      expect(kfs.some((kf) => kf.time < 0)).toBe(true);
    });
  });

  // ── NaN intensity ──
  describe("NaN intensity propagation", () => {
    it("NaN intensity in pulse mode clamps to 0 (safe default)", () => {
      const kfs = generateBeatKeyframes({
        beats: [{ time: 0, intensity: Number.NaN }],
        paramKey: "intensity",
        mode: "pulse",
        minValue: 0,
        maxValue: 100,
        pulseDecay: 0.5,
      });
      expect(Number.isNaN(kfs[0].value)).toBe(false);
      expect(kfs[0].value).toBe(0);
    });

    it("intensity > 1 in pulse mode clamps to maxValue", () => {
      const kfs = generateBeatKeyframes({
        beats: [{ time: 0, intensity: 2 }],
        paramKey: "intensity",
        mode: "pulse",
        minValue: 0,
        maxValue: 100,
        pulseDecay: 0.5,
      });
      expect(kfs[0].value).toBe(100);
    });

    it("negative intensity in pulse mode clamps to minValue", () => {
      const kfs = generateBeatKeyframes({
        beats: [{ time: 0, intensity: -0.5 }],
        paramKey: "intensity",
        mode: "pulse",
        minValue: 0,
        maxValue: 100,
        pulseDecay: 0.5,
      });
      expect(kfs[0].value).toBe(0);
    });
  });

  // ── Large beat arrays ──
  describe("large beat arrays stress", () => {
    it("1000 beats in pulse mode completes without stack overflow", () => {
      const beats: Beat[] = Array.from({ length: 1000 }, (_, i) => ({
        time: i * 0.5,
        intensity: Math.random(),
      }));
      const kfs = generateBeatKeyframes({
        beats,
        paramKey: "intensity",
        mode: "pulse",
        minValue: 0,
        maxValue: 100,
        pulseDecay: 0.1,
      });
      // Each beat produces 2 keyframes (peak + decay), minus dedup
      expect(kfs.length).toBeGreaterThan(0);
      expect(kfs.length).toBeLessThanOrEqual(2000);
    });

    it("10000 beats in toggle mode completes quickly", () => {
      const beats: Beat[] = Array.from({ length: 10000 }, (_, i) => ({
        time: i * 0.1,
        intensity: 0.5,
      }));
      const start = performance.now();
      const kfs = generateBeatKeyframes({
        beats,
        paramKey: "intensity",
        mode: "toggle",
        minValue: 0,
        maxValue: 100,
      });
      const elapsed = performance.now() - start;
      expect(kfs.length).toBe(10000);
      expect(elapsed).toBeLessThan(100); // Should complete in <100ms
    });
  });
});
