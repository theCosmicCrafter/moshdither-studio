import { describe, it, expect } from "vitest";
import {
  FFGLITCH_MODES,
  FFGLITCH_GROUPS,
  defaultFfglitchParams,
  getFfglitchMode,
  sanitizeFfglitchParams,
} from "./ffglitchModes";

/**
 * Every parameter id mosh_cli.py reads -- from its params.get(...) calls and
 * the configure_js_script substitutions. A knob the script never reads is a
 * control that does nothing, which is the bug this table replaced.
 */
const READ_BY_MOSH_CLI = new Set([
  "zoom", "delay", "feedback", "somePercentage", "multiple", "tailLength", "threshold",
  "origGravity", "frameCount", "nFrames", "movementThreshold", "randomness", "magnitude",
  "count", "frame", "kill", "keepAudio", "keepFrame",
  "start", "end", "p", "startFrame", "endFrame", "keepFirst", "reverse", "mid",
  "gop", "fluidity", "direction", "chunkSize", "positionFrame", "repeatCount",
  "motionUrl", "combineVideos",
]);

describe("FFGLITCH_MODES", () => {
  it("only offers knobs mosh_cli.py actually reads", () => {
    for (const mode of FFGLITCH_MODES) {
      for (const p of mode.params) {
        expect(READ_BY_MOSH_CLI.has(p.id), `${mode.id}.${p.id}`).toBe(true);
      }
    }
  });

  it("has unique ids, unique knob ids per mode, and defaults inside their ranges", () => {
    const ids = FFGLITCH_MODES.map((m) => m.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const mode of FFGLITCH_MODES) {
      const pids = mode.params.map((p) => p.id);
      expect(new Set(pids).size).toBe(pids.length);
      for (const p of mode.params) {
        if (p.type === "number") {
          expect(p.min, `${mode.id}.${p.id}`).toBeLessThanOrEqual(p.default as number);
          expect(p.max, `${mode.id}.${p.id}`).toBeGreaterThanOrEqual(p.default as number);
        }
        if (p.type === "select") {
          expect(p.options?.some((o) => o.value === p.default), `${mode.id}.${p.id}`).toBe(true);
        }
      }
    }
  });

  it("does not offer modes that need a second video the UI cannot supply", () => {
    expect(getFfglitchMode("combine")).toBeUndefined();
    expect(getFfglitchMode("motion_transfer")).toBeUndefined();
  });

  it("groups every mode", () => {
    for (const mode of FFGLITCH_MODES) expect(FFGLITCH_GROUPS).toContain(mode.group);
  });
});

describe("defaultFfglitchParams", () => {
  it("returns every knob at its default", () => {
    expect(defaultFfglitchParams("noise")).toEqual({ somePercentage: 0.5, multiple: 10, tailLength: 20 });
    expect(defaultFfglitchParams("stretch")).toEqual({ direction: "horizontal" });
    expect(defaultFfglitchParams("no-such-mode")).toEqual({});
  });
});

describe("sanitizeFfglitchParams", () => {
  it("clamps numbers, drops unknown keys, and falls back on bad types", () => {
    const out = sanitizeFfglitchParams("zoom", { zoom: 999, bogus: 1 });
    expect(out).toEqual({ zoom: 100 });
    expect(sanitizeFfglitchParams("zoom", { zoom: "wide" })).toEqual({ zoom: 20 });
    expect(sanitizeFfglitchParams("zoom", { zoom: Number.NaN })).toEqual({ zoom: 20 });
  });

  it("validates selects and booleans", () => {
    expect(sanitizeFfglitchParams("stretch", { direction: "diagonal" })).toEqual({ direction: "horizontal" });
    expect(sanitizeFfglitchParams("stretch", { direction: "vertical" })).toEqual({ direction: "vertical" });
    expect(sanitizeFfglitchParams("sort", { keepFirst: "yes", reverse: true })).toEqual({ keepFirst: true, reverse: true });
  });

  it("fills in every knob when given nothing", () => {
    expect(sanitizeFfglitchParams("buffer", undefined)).toEqual({ delay: 10, feedback: 0.5 });
  });
});
