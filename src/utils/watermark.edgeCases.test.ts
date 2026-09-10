import { describe, it, expect } from "vitest";
import {
  DEFAULT_WATERMARK,
  buildDrawtextFilter,
  buildImageOverlayFilter,
  appendTextWatermarkToVf,
  buildWatermarkArgs,
  type WatermarkSettings,
} from "./watermark";

describe("Watermark Edge Cases", () => {
  describe("buildDrawtextFilter edge cases", () => {
    // Alpha is a float: ffmpeg rejects bare hex ("Invalid alpha value specifier").
    it("handles opacity at exactly 0 (transparent)", () => {
      const s: WatermarkSettings = {
        ...DEFAULT_WATERMARK,
        enabled: true,
        text: "X",
        opacity: 0,
      };
      const filter = buildDrawtextFilter(s);
      expect(filter).toContain("@0.000");
    });

    it("handles opacity at exactly 1 (opaque)", () => {
      const s: WatermarkSettings = {
        ...DEFAULT_WATERMARK,
        enabled: true,
        text: "X",
        opacity: 1,
      };
      const filter = buildDrawtextFilter(s);
      expect(filter).toContain("@1.000");
    });

    it("handles opacity 0.5", () => {
      const s: WatermarkSettings = {
        ...DEFAULT_WATERMARK,
        enabled: true,
        text: "X",
        opacity: 0.5,
      };
      const filter = buildDrawtextFilter(s);
      expect(filter).toContain("@0.500");
    });

    it("maps all supported color names", () => {
      const colors = ["white", "black", "red", "green", "blue", "yellow", "cyan", "magenta"];
      for (const color of colors) {
        const s: WatermarkSettings = {
          ...DEFAULT_WATERMARK,
          enabled: true,
          text: "X",
          color,
        };
        const filter = buildDrawtextFilter(s);
        expect(filter).toContain(`fontcolor=${color}`);
      }
    });

    it("falls back to white for unknown color", () => {
      const s: WatermarkSettings = {
        ...DEFAULT_WATERMARK,
        enabled: true,
        text: "X",
        color: "purple",
      };
      const filter = buildDrawtextFilter(s);
      expect(filter).toContain("fontcolor=white");
    });

    it("color matching is case-insensitive", () => {
      const s: WatermarkSettings = {
        ...DEFAULT_WATERMARK,
        enabled: true,
        text: "X",
        color: "RED",
      };
      const filter = buildDrawtextFilter(s);
      expect(filter).toContain("fontcolor=red");
    });

    it("escapes multiple special characters", () => {
      const s: WatermarkSettings = {
        ...DEFAULT_WATERMARK,
        enabled: true,
        text: "it's: a:test's",
      };
      const filter = buildDrawtextFilter(s);
      // Quotes are spliced in from outside the quoted value; colons escaped.
      expect(filter).toContain("text='it'\\\\\\''s\\: a\\:test'\\\\\\''s':expansion=none");
    });

    it("handles text with only special characters", () => {
      const s: WatermarkSettings = {
        ...DEFAULT_WATERMARK,
        enabled: true,
        text: "':'",
      };
      const filter = buildDrawtextFilter(s);
      expect(filter).toContain("text=''\\\\\\''\\:'\\\\\\''':expansion=none");
    });

    it("handles very large fontSize", () => {
      const s: WatermarkSettings = {
        ...DEFAULT_WATERMARK,
        enabled: true,
        text: "X",
        fontSize: 9999,
      };
      const filter = buildDrawtextFilter(s);
      expect(filter).toContain("fontsize=999");
    });

    it("handles fontSize of 1", () => {
      const s: WatermarkSettings = {
        ...DEFAULT_WATERMARK,
        enabled: true,
        text: "X",
        fontSize: 1,
      };
      const filter = buildDrawtextFilter(s);
      expect(filter).toContain("fontsize=1");
    });

    it("handles text with spaces", () => {
      const s: WatermarkSettings = {
        ...DEFAULT_WATERMARK,
        enabled: true,
        text: "Hello World Test",
      };
      const filter = buildDrawtextFilter(s);
      expect(filter).toContain("text='Hello World Test'");
    });

    it("handles fontPath with spaces and special chars", () => {
      const s: WatermarkSettings = {
        ...DEFAULT_WATERMARK,
        enabled: true,
        text: "X",
        fontPath: "C:/Program Files/Fonts/arial.ttf",
      };
      const filter = buildDrawtextFilter(s);
      expect(filter).toContain("fontfile='C\\:/Program Files/Fonts/arial.ttf'");
    });
  });

  describe("buildImageOverlayFilter edge cases", () => {
    it("handles scale=0 (no scaling expression)", () => {
      const s: WatermarkSettings = {
        ...DEFAULT_WATERMARK,
        enabled: true,
        type: "image",
        imagePath: "/img.png",
        scale: 0,
      };
      const result = buildImageOverlayFilter(s);
      expect(result.filter).not.toContain("scale=-1:");
      expect(result.filter).toContain("overlay=");
    });

    it("handles scale=100 (full height)", () => {
      const s: WatermarkSettings = {
        ...DEFAULT_WATERMARK,
        enabled: true,
        type: "image",
        imagePath: "/img.png",
        scale: 100,
      };
      const result = buildImageOverlayFilter(s);
      expect(result.filter).toContain("scale=-1:100*ih/100");
    });

    it("handles opacity at exactly 0", () => {
      const s: WatermarkSettings = {
        ...DEFAULT_WATERMARK,
        enabled: true,
        type: "image",
        imagePath: "/img.png",
        opacity: 0,
      };
      const result = buildImageOverlayFilter(s);
      expect(result.filter).toContain("colorchannelmixer=aa=0.00");
    });

    it("generates correct coords for all image positions", () => {
      const positions: Array<[WatermarkSettings["position"], string]> = [
        ["top-left", "overlay=10:10"],
        ["top-right", "W-w-10"],
        ["bottom-left", "overlay=10:H-h-10"],
        ["bottom-right", "W-w-10:H-h-10"],
        ["center", "(W-w)/2"],
      ];
      for (const [pos, expected] of positions) {
        const s: WatermarkSettings = {
          ...DEFAULT_WATERMARK,
          enabled: true,
          type: "image",
          imagePath: "/img.png",
          position: pos,
        };
        const result = buildImageOverlayFilter(s);
        expect(result.filter).toContain(expected);
      }
    });

    it("combines scale and opacity in filter chain", () => {
      const s: WatermarkSettings = {
        ...DEFAULT_WATERMARK,
        enabled: true,
        type: "image",
        imagePath: "/img.png",
        scale: 30,
        opacity: 0.5,
      };
      const result = buildImageOverlayFilter(s);
      expect(result.filter).toContain("scale=-1:30*ih/100");
      expect(result.filter).toContain("colorchannelmixer=aa=0.50");
      // Should have [wm] and [wm2] labels
      expect(result.filter).toContain("[wm]");
      expect(result.filter).toContain("[wm2]");
    });

    it("opacity=1 with scale produces no colorchannelmixer", () => {
      const s: WatermarkSettings = {
        ...DEFAULT_WATERMARK,
        enabled: true,
        type: "image",
        imagePath: "/img.png",
        scale: 50,
        opacity: 1,
      };
      const result = buildImageOverlayFilter(s);
      expect(result.filter).not.toContain("colorchannelmixer");
      expect(result.filter).toContain("[wm]");
      expect(result.filter).not.toContain("[wm2]");
    });
  });

  describe("appendTextWatermarkToVf edge cases", () => {
    it("handles vf with commas already", () => {
      const s = { ...DEFAULT_WATERMARK, enabled: true, text: "WM" };
      const result = appendTextWatermarkToVf("scale=640:480,fps=30", s);
      expect(result).toContain("scale=640:480,fps=30,drawtext=");
    });

    it("handles vf with special filter chars", () => {
      const s = { ...DEFAULT_WATERMARK, enabled: true, text: "WM" };
      const result = appendTextWatermarkToVf("eq=brightness=0.5", s);
      expect(result).toContain("eq=brightness=0.5,drawtext=");
    });
  });

  describe("buildWatermarkArgs edge cases", () => {
    it("appends to -filter_complex when present (text watermark)", () => {
      const baseArgs = ["-i", "input.mp4", "-filter_complex", "scale=640:480", "output.mp4"];
      const s = { ...DEFAULT_WATERMARK, enabled: true, text: "WM" };
      const result = buildWatermarkArgs(baseArgs, s);
      expect(result.args[3]).toContain("scale=640:480");
      expect(result.args[3]).toContain("drawtext=");
    });

    it("inserts -vf when no -vf or -filter_complex exists", () => {
      const baseArgs = ["-i", "input.mp4", "-c:v", "libx264", "output.mp4"];
      const s = { ...DEFAULT_WATERMARK, enabled: true, text: "WM" };
      const result = buildWatermarkArgs(baseArgs, s);
      expect(result.args).toContain("-vf");
      expect(result.args.some((a) => a.includes("drawtext="))).toBe(true);
    });

    it("handles .gif output extension", () => {
      const baseArgs = ["-i", "input.mp4", "output.gif"];
      const s = { ...DEFAULT_WATERMARK, enabled: true, text: "WM" };
      const result = buildWatermarkArgs(baseArgs, s);
      expect(result.args.some((a) => a.includes("drawtext="))).toBe(true);
    });

    it("handles .png output extension", () => {
      const baseArgs = ["-i", "input.mp4", "output.png"];
      const s = { ...DEFAULT_WATERMARK, enabled: true, text: "WM" };
      const result = buildWatermarkArgs(baseArgs, s);
      expect(result.args.some((a) => a.includes("drawtext="))).toBe(true);
    });

    it("does not mutate original args array", () => {
      const original = ["-i", "input.mp4", "-vf", "scale=640:480", "output.mp4"];
      const originalCopy = [...original];
      const s = { ...DEFAULT_WATERMARK, enabled: true, text: "WM" };
      buildWatermarkArgs(original, s);
      expect(original).toEqual(originalCopy);
    });

    it("image watermark inserts extra -i after first input", () => {
      const baseArgs = ["-i", "input.mp4", "-vf", "scale=640:480", "output.mp4"];
      const s: WatermarkSettings = {
        ...DEFAULT_WATERMARK,
        enabled: true,
        type: "image",
        imagePath: "/logo.png",
        scale: 20,
        opacity: 0.5,
      };
      const result = buildWatermarkArgs(baseArgs, s);
      // Should have a second -i with the image path
      const inputIndices: number[] = [];
      result.args.forEach((a, i) => {
        if (a === "-i") inputIndices.push(i);
      });
      expect(inputIndices.length).toBe(2);
      expect(result.args[inputIndices[1] + 1]).toBe("/logo.png");
    });
  });
});
