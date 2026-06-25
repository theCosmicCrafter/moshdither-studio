import { describe, it, expect, beforeEach, vi } from "vitest";
import { getMediaInfo, getFrameData, loadMediaFromBase64 } from "./tauri";
import { isTauriAvailable } from "./browserFallback";

// Mock browserMedia module-level variable via the loadMediaFromBase64 / getMediaInfo / getFrameData flow

describe("Media Loading Pipeline E2E", () => {
  beforeEach(() => {
    // Ensure we're in browser mode (no Tauri) — must actually delete the property
    // because `in` operator checks existence, not value
    delete (globalThis as Record<string, unknown>).__TAURI_INTERNALS__;
  });

  describe("isTauriAvailable", () => {
    it("returns false when __TAURI_INTERNALS__ is not present", () => {
      expect("__TAURI_INTERNALS__" in globalThis).toBe(false);
      expect(isTauriAvailable()).toBe(false);
    });
  });

  describe("getMediaInfo (browser mode)", () => {
    it("returns unloaded info when no media loaded", async () => {
      const info = await getMediaInfo();
      expect(info.loaded).toBe(false);
      expect(info.width).toBe(0);
      expect(info.height).toBe(0);
    });
  });

  describe("getFrameData (browser mode)", () => {
    it("throws when no media loaded", async () => {
      await expect(getFrameData()).rejects.toThrow("No media loaded");
    });
  });

  describe("loadMediaFromBase64 (browser mode)", () => {
    it("stores media and makes getMediaInfo return loaded state", async () => {
      // Create a tiny 1x1 red pixel PNG data URL
      const pngBase64 =
        "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8/5+hHgAHggJ/PchI7wAAAABJRU5ErkJggg==";
      const dataUrl = `data:image/png;base64,${pngBase64}`;

      // Mock Image to resolve immediately with known dimensions
      const mockImg = {
        src: "",
        naturalWidth: 100,
        naturalHeight: 50,
        onload: null as (() => void) | null,
        onerror: null as ((e: unknown) => void) | null,
      };

      const OrigImage = globalThis.Image;
      vi.stubGlobal(
        "Image",
        vi.fn(() => mockImg)
      );

      // Trigger onload asynchronously
      const loadPromise = loadMediaFromBase64(dataUrl);
      // Simulate image load event
      setTimeout(() => mockImg.onload?.(), 0);
      await loadPromise;

      const info = await getMediaInfo();
      expect(info.loaded).toBe(true);
      expect(info.width).toBe(100);
      expect(info.height).toBe(50);

      const frame = await getFrameData();
      expect(frame).toBe(dataUrl);

      // Restore
      vi.stubGlobal("Image", OrigImage);
    });
  });
});
