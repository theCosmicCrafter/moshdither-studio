import { describe, expect, it } from "vitest";
import { isVideoOnlyEffect, rustToWebGL } from "./effectConverter";

describe("datamoshing transforms key on Rust param names", () => {
  it("scales datamoshing.stop's n_frames into blockSize", () => {
    expect(rustToWebGL["datamoshing.stop"].transform?.("n_frames", 5)).toBe(20);
  });

  it("scales motion_transfer's block_size into u_scale", () => {
    expect(rustToWebGL["datamoshing.motion_transfer"].transform?.("block_size", 20)).toBe(2);
  });

  it("scales profile_glitch's drop_interval into blockSize", () => {
    expect(rustToWebGL["datamoshing.profile_glitch"].transform?.("drop_interval", 3)).toBe(12);
  });
});

describe("isVideoOnlyEffect", () => {
  it("is true for media_type 'video'", () => {
    expect(isVideoOnlyEffect({ media_type: "video" })).toBe(true);
  });

  it("is false for media_type 'image'", () => {
    expect(isVideoOnlyEffect({ media_type: "image" })).toBe(false);
  });

  it("is false for media_type 'both'", () => {
    expect(isVideoOnlyEffect({ media_type: "both" })).toBe(false);
  });
});
