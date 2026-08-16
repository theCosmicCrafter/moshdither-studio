import { describe, expect, it } from "vitest";
import { isVideoOnlyEffect } from "./effectConverter";

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
