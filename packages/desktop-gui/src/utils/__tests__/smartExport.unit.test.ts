import { describe, it, expect } from "vitest";
import { recommendExportSettings, getMediaTypeFromExt } from "../smartExport";

describe("smartExport", () => {
  it("recommends PNG for edited JPEG images", () => {
    const rec = recommendExportSettings("image", ".jpg", undefined, true);
    expect(rec.format).toBe("png");
  });

  it("recommends GIF for short videos", () => {
    const rec = recommendExportSettings("video", ".mp4", 2, false);
    expect(rec.format).toBe("gif");
    expect(rec.fps).toBe(15);
  });

  it("recommends MP4 for long videos with effects", () => {
    const rec = recommendExportSettings("video", ".mp4", 60, true);
    expect(rec.format).toBe("mp4");
  });

  it("preserves same format by default for images", () => {
    const rec = recommendExportSettings("image", ".png");
    expect(rec.format).toBe("same");
  });

  it("detects image type from extension", () => {
    expect(getMediaTypeFromExt("photo.jpg")).toBe("image");
    expect(getMediaTypeFromExt("clip.mp4")).toBe("video");
  });
});
