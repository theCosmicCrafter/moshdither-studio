import { describe, it, expect } from "vitest";
import type { SerializedProject } from "../autoSave";

describe("SerializedProject type", () => {
  it("accepts valid project snapshot", () => {
    const snapshot: SerializedProject = {
      version: 1,
      savedAt: new Date().toISOString(),
      activeEffects: [],
      mediaUrl: null,
      mediaType: null,
      currentTime: 0,
      duration: 10,
      qualityMode: "full",
      zoomLevel: 1,
      pixelGrid: false,
      aspectRatio: "free",
      exportFormat: "same",
      exportFps: 30,
      outputDirectory: null,
    };
    expect(snapshot.version).toBe(1);
    expect(snapshot.savedAt).toBeDefined();
  });
});
