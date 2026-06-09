import { describe, it, expect } from "vitest";
import { evaluateTrack, setKeyframe, type ParameterTrack } from "../keyframeTypes";

describe("evaluateTrack", () => {
  const track: ParameterTrack = {
    paramKey: "intensity",
    keyframes: [
      { time: 0, value: 0, easing: "linear" },
      { time: 2, value: 1, easing: "linear" },
      { time: 4, value: 0.5, easing: "linear" },
    ],
  };

  it("returns first keyframe value before start", () => {
    expect(evaluateTrack(track, -1)).toBe(0);
  });

  it("returns last keyframe value after end", () => {
    expect(evaluateTrack(track, 10)).toBe(0.5);
  });

  it("interpolates linearly between keyframes", () => {
    expect(evaluateTrack(track, 1)).toBeCloseTo(0.5, 5);
  });

  it("handles single keyframe", () => {
    const single: ParameterTrack = {
      paramKey: "test",
      keyframes: [{ time: 0, value: 42, easing: "linear" }],
    };
    expect(evaluateTrack(single, 5)).toBe(42);
  });
});

describe("setKeyframe", () => {
  it("adds a new keyframe", () => {
    const track: ParameterTrack = { paramKey: "test", keyframes: [] };
    const updated = setKeyframe(track, 1, 0.5);
    expect(updated.keyframes).toHaveLength(1);
    expect(updated.keyframes[0].time).toBe(1);
  });

  it("updates existing keyframe within threshold", () => {
    const track: ParameterTrack = {
      paramKey: "test",
      keyframes: [{ time: 1, value: 0, easing: "linear" }],
    };
    const updated = setKeyframe(track, 1.005, 0.8);
    expect(updated.keyframes).toHaveLength(1);
    expect(updated.keyframes[0].value).toBe(0.8);
  });
});
