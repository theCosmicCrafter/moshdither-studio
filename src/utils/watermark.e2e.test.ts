import { describe, it, expect } from "vitest";
import {
  DEFAULT_WATERMARK,
  buildDrawtextFilter,
  buildImageOverlayFilter,
  appendTextWatermarkToVf,
  buildWatermarkArgs,
  type WatermarkSettings,
} from "./watermark";

describe("Export Pipeline — Watermark E2E", () => {
  describe("DEFAULT_WATERMARK", () => {
    it("has sensible defaults", () => {
      expect(DEFAULT_WATERMARK.enabled).toBe(false);
      expect(DEFAULT_WATERMARK.type).toBe("text");
      expect(DEFAULT_WATERMARK.text).toBe("MoshDither");
      expect(DEFAULT_WATERMARK.position).toBe("bottom-right");
      expect(DEFAULT_WATERMARK.opacity).toBe(0.7);
    });
  });

  describe("buildDrawtextFilter", () => {
    it("returns null when disabled", () => {
      const s = { ...DEFAULT_WATERMARK, enabled: false };
      expect(buildDrawtextFilter(s)).toBeNull();
    });

    it("returns null when type is image", () => {
      const s: WatermarkSettings = { ...DEFAULT_WATERMARK, enabled: true, type: "image" };
      expect(buildDrawtextFilter(s)).toBeNull();
    });

    it("returns null when text is empty", () => {
      const s = { ...DEFAULT_WATERMARK, enabled: true, text: "" };
      expect(buildDrawtextFilter(s)).toBeNull();
    });

    it("generates drawtext filter for enabled text watermark", () => {
      const s: WatermarkSettings = {
        ...DEFAULT_WATERMARK,
        enabled: true,
        type: "text",
        text: "Test",
        position: "bottom-right",
        fontSize: 24,
        color: "white",
        opacity: 0.5,
      };
      const filter = buildDrawtextFilter(s);
      expect(filter).toContain("drawtext=");
      expect(filter).toContain("text='Test'");
      expect(filter).toContain("fontsize=24");
      expect(filter).toContain("fontcolor=white");
    });

    it("includes fontfile when fontPath is set", () => {
      const s: WatermarkSettings = {
        ...DEFAULT_WATERMARK,
        enabled: true,
        text: "X",
        fontPath: "/usr/share/fonts/arial.ttf",
      };
      const filter = buildDrawtextFilter(s);
      expect(filter).toContain("fontfile='/usr/share/fonts/arial.ttf'");
    });

    it("generates correct position coords for each position", () => {
      const positions: Array<[WatermarkSettings["position"], string]> = [
        ["top-left", "x=10:y=10"],
        ["top-right", "w-text_w-10"],
        ["bottom-left", "x=10:y=h-text_h-10"],
        ["bottom-right", "w-text_w-10:y=h-text_h-10"],
        ["center", "(w-text_w)/2"],
      ];
      for (const [pos, expected] of positions) {
        const s = { ...DEFAULT_WATERMARK, enabled: true, text: "T", position: pos };
        const filter = buildDrawtextFilter(s);
        expect(filter).toContain(expected);
      }
    });

    it("escapes special characters in text", () => {
      const s = { ...DEFAULT_WATERMARK, enabled: true, text: "it's:cool" };
      const filter = buildDrawtextFilter(s);
      // A quote is spliced in from outside the quotes: close, \\\', reopen.
      expect(filter).toContain("text='it'\\\\\\''s\\:cool':expansion=none");
    });
  });

  describe("buildImageOverlayFilter", () => {
    it("returns null when disabled", () => {
      const s: WatermarkSettings = {
        ...DEFAULT_WATERMARK,
        enabled: false,
        type: "image",
        imagePath: "/img.png",
      };
      expect(buildImageOverlayFilter(s).filter).toBeNull();
    });

    it("returns null when no image path", () => {
      const s: WatermarkSettings = {
        ...DEFAULT_WATERMARK,
        enabled: true,
        type: "image",
        imagePath: null,
      };
      expect(buildImageOverlayFilter(s).filter).toBeNull();
    });

    it("generates overlay filter for enabled image watermark", () => {
      const s: WatermarkSettings = {
        ...DEFAULT_WATERMARK,
        enabled: true,
        type: "image",
        imagePath: "/logo.png",
        position: "bottom-right",
        scale: 20,
        opacity: 0.5,
      };
      const result = buildImageOverlayFilter(s);
      expect(result.filter).toContain("overlay=");
      expect(result.filter).toContain("scale=-1:20*ih/100");
      expect(result.extraInputIndex).toBe(1);
    });

    it("includes opacity expression when opacity < 1", () => {
      const s: WatermarkSettings = {
        ...DEFAULT_WATERMARK,
        enabled: true,
        type: "image",
        imagePath: "/x.png",
        opacity: 0.3,
      };
      const result = buildImageOverlayFilter(s);
      expect(result.filter).toContain("colorchannelmixer=aa=0.30");
    });

    it("omits opacity expression when opacity = 1", () => {
      const s: WatermarkSettings = {
        ...DEFAULT_WATERMARK,
        enabled: true,
        type: "image",
        imagePath: "/x.png",
        opacity: 1,
      };
      const result = buildImageOverlayFilter(s);
      expect(result.filter).not.toContain("colorchannelmixer");
    });
  });

  describe("appendTextWatermarkToVf", () => {
    it("appends to existing vf string", () => {
      const s = { ...DEFAULT_WATERMARK, enabled: true, text: "WM" };
      const result = appendTextWatermarkToVf("scale=640:480", s);
      expect(result).toContain("scale=640:480");
      expect(result).toContain("drawtext=");
    });

    it("returns just watermark when vf is empty", () => {
      const s = { ...DEFAULT_WATERMARK, enabled: true, text: "WM" };
      const result = appendTextWatermarkToVf("", s);
      expect(result).toContain("drawtext=");
      expect(result).not.toContain(",");
    });

    it("returns vf unchanged when watermark disabled", () => {
      const s = { ...DEFAULT_WATERMARK, enabled: false };
      expect(appendTextWatermarkToVf("scale=640:480", s)).toBe("scale=640:480");
    });
  });

  describe("buildWatermarkArgs", () => {
    it("returns base args unchanged when disabled", () => {
      const baseArgs = ["-i", "input.mp4", "-vf", "scale=640:480", "output.mp4"];
      const s = { ...DEFAULT_WATERMARK, enabled: false };
      const result = buildWatermarkArgs(baseArgs, s);
      expect(result.args).toEqual(baseArgs);
      expect(result.extraInputs).toEqual([]);
    });

    it("appends drawtext to existing -vf when text watermark enabled", () => {
      const baseArgs = ["-i", "input.mp4", "-vf", "scale=640:480", "output.mp4"];
      const s = { ...DEFAULT_WATERMARK, enabled: true, text: "WM" };
      const result = buildWatermarkArgs(baseArgs, s);
      expect(result.args[3]).toContain("scale=640:480");
      expect(result.args[3]).toContain("drawtext=");
    });
  });
});
