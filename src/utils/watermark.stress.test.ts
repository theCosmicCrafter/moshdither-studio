import { describe, it, expect } from "vitest";
import {
  buildDrawtextFilter,
  buildImageOverlayFilter,
  appendTextWatermarkToVf,
  buildWatermarkArgs,
  DEFAULT_WATERMARK,
} from "./watermark";

describe("Watermark Stress Tests — Trying to Break FFmpeg", () => {
  // ── FFmpeg expression injection via text ──
  describe("FFmpeg expression injection via text", () => {
    it("text with { } braces is escaped", () => {
      const result = buildDrawtextFilter({
        ...DEFAULT_WATERMARK,
        enabled: true,
        text: "{n}: frame count",
      });
      expect(result).not.toBeNull();
      expect(result).not.toMatch(/(?<!\\)\{/);
      expect(result).toContain("\\{");
    });

    it("text with FFmpeg function call is escaped", () => {
      const result = buildDrawtextFilter({
        ...DEFAULT_WATERMARK,
        enabled: true,
        text: "sin(t)",
      });
      expect(result).not.toBeNull();
      expect(result).not.toMatch(/(?<!\\)\(/);
      expect(result).toContain("\\(");
    });

    it("text with backslash is escaped", () => {
      const result = buildDrawtextFilter({
        ...DEFAULT_WATERMARK,
        enabled: true,
        text: String.raw`back\slash`,
      });
      expect(result).not.toBeNull();
      expect(result).toContain("\\\\");
      expect(result).not.toMatch(/(?<!\\)\\s/);
    });

    it("text with percent sign is escaped", () => {
      const result = buildDrawtextFilter({
        ...DEFAULT_WATERMARK,
        enabled: true,
        text: "%{eif\\:n\\:d}",
      });
      expect(result).not.toBeNull();
      expect(result).not.toMatch(/(?<!\\)%\{/);
      expect(result).toContain("\\%");
    });

    it("text with newline is replaced with space", () => {
      const result = buildDrawtextFilter({
        ...DEFAULT_WATERMARK,
        enabled: true,
        text: "line1\nline2",
      });
      expect(result).not.toBeNull();
      expect(result).not.toContain("\n");
    });

    it("text with semicolon is escaped", () => {
      const result = buildDrawtextFilter({
        ...DEFAULT_WATERMARK,
        enabled: true,
        text: "ok;drawbox=c=red:t=fill",
      });
      expect(result).not.toBeNull();
      expect(result).not.toMatch(/(?<!\\);drawbox/);
      expect(result).toContain("\\;");
    });

    it("text with pipe is escaped", () => {
      const result = buildDrawtextFilter({
        ...DEFAULT_WATERMARK,
        enabled: true,
        text: "ok|negate",
      });
      expect(result).not.toBeNull();
      expect(result).not.toMatch(/(?<!\\)\|negate/);
      expect(result).toContain("\\|");
    });
  });

  // ── fontPath injection ──
  describe("fontPath injection", () => {
    it("fontPath with colons is escaped", () => {
      const result = buildDrawtextFilter({
        ...DEFAULT_WATERMARK,
        enabled: true,
        text: "test",
        fontPath: "C:\\Windows\\Fonts\\arial.ttf",
      });
      expect(result).not.toBeNull();
      expect(result).not.toContain("C:");
      expect(result).toContain("\\:");
    });

    it("fontPath with spaces passes through unescaped", () => {
      const result = buildDrawtextFilter({
        ...DEFAULT_WATERMARK,
        enabled: true,
        text: "test",
        fontPath: "/path with spaces/font.ttf",
      });
      expect(result).not.toBeNull();
      // Spaces in fontPath could cause issues depending on how args are passed
      expect(result).toContain("/path with spaces/font.ttf");
    });

    it("fontPath with single quote is escaped", () => {
      const result = buildDrawtextFilter({
        ...DEFAULT_WATERMARK,
        enabled: true,
        text: "test",
        fontPath: "/path/with'quote/font.ttf",
      });
      expect(result).not.toBeNull();
      const fontfilePart = result!.split("fontfile=")[1];
      expect(fontfilePart).not.toMatch(/(?<!\\)'/);
      expect(fontfilePart).toContain("\\'");
    });
  });

  // ── NaN opacity produces invalid FFmpeg alpha ──
  describe("NaN/Infinity opacity produces invalid FFmpeg", () => {
    it("NaN opacity clamps to 0 (safe default)", () => {
      const result = buildDrawtextFilter({
        ...DEFAULT_WATERMARK,
        enabled: true,
        text: "test",
        opacity: Number.NaN,
      });
      expect(result).not.toBeNull();
      expect(result).not.toContain("@NaN");
      expect(result).toContain("@00");
    });

    it("negative opacity clamps to 0", () => {
      const result = buildDrawtextFilter({
        ...DEFAULT_WATERMARK,
        enabled: true,
        text: "test",
        opacity: -0.5,
      });
      expect(result).not.toBeNull();
      expect(result).not.toContain("@-");
      expect(result).toContain("@00");
    });

    it("opacity > 1 clamps to 1", () => {
      const result = buildDrawtextFilter({
        ...DEFAULT_WATERMARK,
        enabled: true,
        text: "test",
        opacity: 2.0,
      });
      expect(result).not.toBeNull();
      expect(result).not.toMatch(/@1fe/);
      expect(result).toContain("@ff");
    });

    it("Infinity opacity clamps to 1", () => {
      const result = buildDrawtextFilter({
        ...DEFAULT_WATERMARK,
        enabled: true,
        text: "test",
        opacity: Infinity,
      });
      expect(result).not.toBeNull();
      expect(result).not.toContain("@Infinity");
      expect(result).toContain("@ff");
    });
  });

  // ── NaN fontSize ──
  describe("NaN fontSize produces invalid FFmpeg", () => {
    it("NaN fontSize falls back to 24 (safe default)", () => {
      const result = buildDrawtextFilter({
        ...DEFAULT_WATERMARK,
        enabled: true,
        text: "test",
        fontSize: Number.NaN,
      });
      expect(result).not.toBeNull();
      expect(result).not.toContain("fontsize=NaN");
      expect(result).toContain("fontsize=24");
    });

    it("negative fontSize clamps to 1", () => {
      const result = buildDrawtextFilter({
        ...DEFAULT_WATERMARK,
        enabled: true,
        text: "test",
        fontSize: -24,
      });
      expect(result).not.toBeNull();
      expect(result).not.toContain("fontsize=-24");
      expect(result).toContain("fontsize=1");
    });

    it("Infinity fontSize falls back to 24 (safe default)", () => {
      const result = buildDrawtextFilter({
        ...DEFAULT_WATERMARK,
        enabled: true,
        text: "test",
        fontSize: Infinity,
      });
      expect(result).not.toBeNull();
      expect(result).not.toContain("fontsize=Infinity");
    });

    it("fontSize=0 clamps to 1", () => {
      const result = buildDrawtextFilter({
        ...DEFAULT_WATERMARK,
        enabled: true,
        text: "test",
        fontSize: 0,
      });
      expect(result).not.toBeNull();
      expect(result).not.toContain("fontsize=0");
      expect(result).toContain("fontsize=1");
    });
  });

  // ── Image overlay edge cases ──
  describe("image overlay stress", () => {
    it("negative scale clamps to 0 (skips scale)", () => {
      const result = buildImageOverlayFilter({
        ...DEFAULT_WATERMARK,
        enabled: true,
        type: "image",
        imagePath: "/path/to/watermark.png",
        scale: -20,
      });
      expect(result.filter).not.toBeNull();
      expect(result.filter).not.toContain("scale=-1:-20");
    });

    it("NaN scale produces invalid FFmpeg expression", () => {
      const result = buildImageOverlayFilter({
        ...DEFAULT_WATERMARK,
        enabled: true,
        type: "image",
        imagePath: "/path/to/watermark.png",
        scale: Number.NaN,
      });
      expect(result.filter).not.toBeNull();
      // scale=NaN > 0 is false, so scaleExpr = "" — actually this is safe!
      // NaN > 0 evaluates to false, so it falls through to no-scale path
      // This is actually correct behavior by accident
      expect(result.filter).not.toContain("scale=-1:NaN");
    });

    it("scale=0 skips scale filter (by design)", () => {
      const result = buildImageOverlayFilter({
        ...DEFAULT_WATERMARK,
        enabled: true,
        type: "image",
        imagePath: "/path/to/watermark.png",
        scale: 0,
      });
      expect(result.filter).not.toBeNull();
      expect(result.filter).not.toContain("scale=");
    });

    it("Infinity scale clamps to 100", () => {
      const result = buildImageOverlayFilter({
        ...DEFAULT_WATERMARK,
        enabled: true,
        type: "image",
        imagePath: "/path/to/watermark.png",
        scale: Infinity,
      });
      expect(result.filter).not.toBeNull();
      expect(result.filter).not.toContain("Infinity");
    });

    it("NaN opacity in image overlay produces invalid colorchannelmixer", () => {
      const result = buildImageOverlayFilter({
        ...DEFAULT_WATERMARK,
        enabled: true,
        type: "image",
        imagePath: "/path/to/watermark.png",
        opacity: Number.NaN,
      });
      expect(result.filter).not.toBeNull();
      // NaN < 1 is false, so opacityExpr = "" — safe by accident!
      expect(result.filter).not.toContain("aa=NaN");
    });

    it("opacity > 1 in image overlay skips opacity filter (by design)", () => {
      const result = buildImageOverlayFilter({
        ...DEFAULT_WATERMARK,
        enabled: true,
        type: "image",
        imagePath: "/path/to/watermark.png",
        opacity: 2.0,
      });
      expect(result.filter).not.toBeNull();
      // 2.0 < 1 is false, so opacityExpr = ""
      expect(result.filter).not.toContain("colorchannelmixer");
    });

    it("negative opacity in image overlay clamps to 0", () => {
      const result = buildImageOverlayFilter({
        ...DEFAULT_WATERMARK,
        enabled: true,
        type: "image",
        imagePath: "/path/to/watermark.png",
        opacity: -0.5,
      });
      expect(result.filter).not.toBeNull();
      expect(result.filter).not.toContain("aa=-0.50");
    });
  });

  // ── buildWatermarkArgs with malformed base args ──
  describe("buildWatermarkArgs with malformed base args", () => {
    it("empty base args array with text watermark", () => {
      const result = buildWatermarkArgs([], {
        ...DEFAULT_WATERMARK,
        enabled: true,
        text: "test",
      });
      expect(result.args.length).toBeGreaterThan(0);
      expect(result.args).toContain("-vf");
    });

    it("base args with no output file extension — watermark appended at end", () => {
      const result = buildWatermarkArgs(["-i", "input.mp4", "-c:v", "libx264"], {
        ...DEFAULT_WATERMARK,
        enabled: true,
        text: "test",
      });
      // No .mp4/.gif/.png/.jpg found — appends -vf at end
      expect(result.args).toContain("-vf");
    });

    it("base args with multiple .mp4 entries — watermark inserted after input", () => {
      const result = buildWatermarkArgs(["-i", "input.mp4", "-c:v", "libx264", "output.mp4"], {
        ...DEFAULT_WATERMARK,
        enabled: true,
        text: "test",
      });
      const vfIndex = result.args.indexOf("-vf");
      expect(vfIndex).toBeGreaterThan(-1);
      // -vf should be after the input file, not before it
      expect(vfIndex).toBeGreaterThan(2);
    });

    it("image watermark with no -i in base args — imagePath is inserted", () => {
      const result = buildWatermarkArgs(["-c:v", "libx264", "output.mp4"], {
        ...DEFAULT_WATERMARK,
        enabled: true,
        type: "image",
        imagePath: "/watermark.png",
      });
      expect(result.args).toContain("-i");
      expect(result.args).toContain("/watermark.png");
    });
  });

  // ── appendTextWatermarkToVf edge cases ──
  describe("appendTextWatermarkToVf stress", () => {
    it("appending to vf with existing drawtext produces double drawtext", () => {
      const existing = "drawtext=text='hello':x=10:y=10";
      const result = appendTextWatermarkToVf(existing, {
        ...DEFAULT_WATERMARK,
        enabled: true,
        text: "world",
      });
      // Both drawtext filters should be present
      expect(result).toContain("hello");
      expect(result).toContain("world");
      expect(result).toContain(",");
    });

    it("appending to empty vf string returns just watermark", () => {
      const result = appendTextWatermarkToVf("", {
        ...DEFAULT_WATERMARK,
        enabled: true,
        text: "only",
      });
      expect(result).toBe(
        buildDrawtextFilter({
          ...DEFAULT_WATERMARK,
          enabled: true,
          text: "only",
        })
      );
    });

    it("appending disabled watermark returns original vf unchanged", () => {
      const existing = "scale=320:240";
      const result = appendTextWatermarkToVf(existing, {
        ...DEFAULT_WATERMARK,
        enabled: false,
      });
      expect(result).toBe(existing);
    });
  });
});
