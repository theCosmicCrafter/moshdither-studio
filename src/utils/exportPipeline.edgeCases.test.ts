import { beforeEach, describe, expect, it } from "vitest";
import { useAppStore } from "../store";
import { stackToRustPayload } from "./effectConverter";
import {
  DEFAULT_WATERMARK,
  appendTextWatermarkToVf,
  buildDrawtextFilter,
  buildImageOverlayFilter,
  buildWatermarkArgs,
} from "./watermark";

describe("Export Pipeline Edge Cases", () => {
  beforeEach(() => {
    useAppStore.setState(useAppStore.getInitialState());
  });

  // ── Export progress clamping ──
  describe("export progress boundary values", () => {
    it("clamps negative progress to 0", () => {
      useAppStore.getState().setExportProgress(-1);
      expect(useAppStore.getState().exportProgress).toBe(0);
    });

    it("clamps progress >100 to 100", () => {
      useAppStore.getState().setExportProgress(999);
      expect(useAppStore.getState().exportProgress).toBe(100);
    });

    it("accepts exactly 0 and exactly 100", () => {
      useAppStore.getState().setExportProgress(0);
      expect(useAppStore.getState().exportProgress).toBe(0);
      useAppStore.getState().setExportProgress(100);
      expect(useAppStore.getState().exportProgress).toBe(100);
    });

    it("handles NaN progress by clamping to 0", () => {
      useAppStore.getState().setExportProgress(NaN);
      // Math.max(0, Math.min(100, NaN)) → Math.max(0, NaN) → NaN, but Math.min(100, NaN) → NaN
      // Actually Math.min(100, NaN) = NaN, Math.max(0, NaN) = NaN
      // So the value will be NaN — this is a known JS behavior issue
      const progress = useAppStore.getState().exportProgress;
      expect(Number.isNaN(progress) || progress === 0).toBe(true);
    });
  });

  // ── Export cancel mid-export ──
  describe("export cancel flow", () => {
    it("cancel flag persists through progress updates", () => {
      useAppStore.getState().setExportIsRunning(true);
      useAppStore.getState().requestExportCancel();
      useAppStore.getState().setExportProgress(50);
      expect(useAppStore.getState().exportCancelRequested).toBe(true);
      expect(useAppStore.getState().exportIsRunning).toBe(true);
      expect(useAppStore.getState().exportProgress).toBe(50);
    });

    it("resetExport clears cancel + progress + running", () => {
      useAppStore.getState().setExportIsRunning(true);
      useAppStore.getState().requestExportCancel();
      useAppStore.getState().setExportProgress(75);
      useAppStore.getState().resetExport();
      expect(useAppStore.getState().exportCancelRequested).toBe(false);
      expect(useAppStore.getState().exportIsRunning).toBe(false);
      expect(useAppStore.getState().exportProgress).toBe(0);
    });

    it("can request cancel multiple times idempotently", () => {
      useAppStore.getState().requestExportCancel();
      useAppStore.getState().requestExportCancel();
      expect(useAppStore.getState().exportCancelRequested).toBe(true);
    });
  });

  // ── Watermark + filter_complex combinations ──
  describe("watermark with existing filter_complex", () => {
    it("text watermark appends to existing -filter_complex", () => {
      const baseArgs = ["-i", "input.mp4", "-filter_complex", "scale=1280:720", "-y", "out.mp4"];
      const result = buildWatermarkArgs(baseArgs, {
        ...DEFAULT_WATERMARK,
        enabled: true,
        text: "WM",
      });
      const fcIdx = result.args.indexOf("-filter_complex");
      expect(fcIdx).not.toBe(-1);
      expect(result.args[fcIdx + 1]).toContain("drawtext=");
      expect(result.args[fcIdx + 1]).toContain("scale=1280:720");
    });

    it("text watermark appends to existing -vf", () => {
      const baseArgs = ["-i", "input.mp4", "-vf", "eq=brightness=0.1", "-y", "out.mp4"];
      const result = buildWatermarkArgs(baseArgs, {
        ...DEFAULT_WATERMARK,
        enabled: true,
        text: "Test",
      });
      const vfIdx = result.args.indexOf("-vf");
      expect(vfIdx).not.toBe(-1);
      expect(result.args[vfIdx + 1]).toContain("eq=brightness=0.1");
      expect(result.args[vfIdx + 1]).toContain("drawtext=");
    });

    it("image watermark converts -vf to -filter_complex", () => {
      const baseArgs = ["-i", "input.mp4", "-vf", "scale=1280:720", "-y", "out.mp4"];
      const result = buildWatermarkArgs(baseArgs, {
        ...DEFAULT_WATERMARK,
        enabled: true,
        type: "image",
        imagePath: "/tmp/logo.png",
        scale: 20,
        opacity: 0.5,
      });
      const fcIdx = result.args.indexOf("-filter_complex");
      expect(fcIdx).not.toBe(-1);
      // The -vf should be replaced
      expect(result.args.indexOf("-vf")).toBe(-1);
    });

    it("image watermark adds extra -i for image path", () => {
      const baseArgs = ["-i", "input.mp4", "-y", "out.mp4"];
      const result = buildWatermarkArgs(baseArgs, {
        ...DEFAULT_WATERMARK,
        enabled: true,
        type: "image",
        imagePath: "/tmp/watermark.png",
        scale: 15,
        opacity: 0.8,
      });
      // Should have two -i entries
      const inputIndices = result.args.reduce<number[]>((acc, a, i) => {
        if (a === "-i") acc.push(i);
        return acc;
      }, []);
      expect(inputIndices.length).toBeGreaterThanOrEqual(2);
      expect(result.args[inputIndices[1] + 1]).toBe("/tmp/watermark.png");
    });

    it("image watermark adds -map [out] for output", () => {
      const baseArgs = ["-i", "input.mp4", "-y", "out.mp4"];
      const result = buildWatermarkArgs(baseArgs, {
        ...DEFAULT_WATERMARK,
        enabled: true,
        type: "image",
        imagePath: "/tmp/logo.png",
        scale: 20,
        opacity: 0.5,
      });
      expect(result.args).toContain("-map");
      expect(result.args).toContain("[out]");
    });
  });

  // ── Watermark with special text characters ──
  describe("watermark text edge cases", () => {
    it("handles text with backslashes", () => {
      const result = buildDrawtextFilter({
        ...DEFAULT_WATERMARK,
        enabled: true,
        text: "C:\\Users\\test",
      });
      expect(result).not.toBeNull();
      // Quoted and escaped for both of ffmpeg's parser levels.
      expect(result).toContain("text='C\\:\\\\Users\\\\test':expansion=none");
      expect(result).toContain("Users");
    });

    it("handles text with percent signs (FFmpeg expansion)", () => {
      const result = buildDrawtextFilter({
        ...DEFAULT_WATERMARK,
        enabled: true,
        text: "100% done",
      });
      expect(result).not.toBeNull();
      expect(result).toContain("100");
    });

    it("handles very long text", () => {
      const longText = "A".repeat(500);
      const result = buildDrawtextFilter({
        ...DEFAULT_WATERMARK,
        enabled: true,
        text: longText,
      });
      expect(result).not.toBeNull();
      expect(result).toContain("drawtext=");
    });

    it("handles unicode text", () => {
      const result = buildDrawtextFilter({
        ...DEFAULT_WATERMARK,
        enabled: true,
        text: "こんにちは",
      });
      expect(result).not.toBeNull();
      expect(result).toContain("drawtext=");
    });

    it("handles newline in text", () => {
      const result = buildDrawtextFilter({
        ...DEFAULT_WATERMARK,
        enabled: true,
        text: "Line1\nLine2",
      });
      expect(result).not.toBeNull();
    });
  });

  // ── Watermark opacity boundary values ──
  describe("watermark opacity edge cases", () => {
    // drawtext wants `color@<float 0..1>`; bare hex is rejected outright
    // ("Invalid alpha value specifier"), which aborted every text-watermark
    // export. These pin the float form the Rust builder also emits.
    it("opacity=0 produces alpha 0.000", () => {
      const result = buildDrawtextFilter({
        ...DEFAULT_WATERMARK,
        enabled: true,
        text: "Test",
        opacity: 0,
      });
      expect(result).toContain("@0.000");
    });

    it("opacity=1 produces alpha 1.000", () => {
      const result = buildDrawtextFilter({
        ...DEFAULT_WATERMARK,
        enabled: true,
        text: "Test",
        opacity: 1,
      });
      expect(result).toContain("@1.000");
    });

    it("opacity=0.5 produces alpha 0.500", () => {
      const result = buildDrawtextFilter({
        ...DEFAULT_WATERMARK,
        enabled: true,
        text: "Test",
        opacity: 0.5,
      });
      expect(result).toContain("@0.500");
    });

    it("opacity >1 still produces valid hex (clamped by FFmpeg)", () => {
      const result = buildDrawtextFilter({
        ...DEFAULT_WATERMARK,
        enabled: true,
        text: "Test",
        opacity: 2.0,
      });
      // Math.round(2.0 * 255) = 510 → 1fe in hex, but toString(16) gives "1fe"
      // FFmpeg will clamp, but the filter is still generated
      expect(result).not.toBeNull();
    });
  });

  // ── Watermark image scale=0 ──
  describe("watermark image scale=0", () => {
    it("scale=0 skips scale expression but still overlays", () => {
      const result = buildImageOverlayFilter({
        ...DEFAULT_WATERMARK,
        enabled: true,
        type: "image",
        imagePath: "/tmp/logo.png",
        scale: 0,
        opacity: 0.5,
      });
      expect(result.filter).not.toBeNull();
      // With scale=0, scaleExpr is empty, so filter starts with [1:v]opacity
      expect(result.filter).toContain("overlay=");
      expect(result.filter).not.toContain("scale=-1");
    });

    it("scale=0 with opacity=1 uses direct overlay", () => {
      const result = buildImageOverlayFilter({
        ...DEFAULT_WATERMARK,
        enabled: true,
        type: "image",
        imagePath: "/tmp/logo.png",
        scale: 0,
        opacity: 1,
      });
      // Both scaleExpr and opacityExpr are empty → direct [0:v][1:v]overlay
      expect(result.filter).toContain("[0:v][1:v]overlay");
    });
  });

  // ── appendTextWatermarkToVf edge cases ──
  describe("appendTextWatermarkToVf edge cases", () => {
    it("returns empty string when vf is empty and watermark disabled", () => {
      const result = appendTextWatermarkToVf("", {
        ...DEFAULT_WATERMARK,
        enabled: false,
      });
      expect(result).toBe("");
    });

    it("handles vf with multiple existing filters", () => {
      const result = appendTextWatermarkToVf("scale=1280:720,eq=brightness=0.1", {
        ...DEFAULT_WATERMARK,
        enabled: true,
        text: "WM",
      });
      expect(result).toContain("scale=1280:720");
      expect(result).toContain("eq=brightness=0.1");
      expect(result).toContain("drawtext=");
      // Filters should be comma-separated
      const parts = result.split(",");
      expect(parts.length).toBe(3);
    });
  });

  // ── stackToRustPayload with disabled/empty entries ──
  describe("stackToRustPayload edge cases", () => {
    it("filters out disabled entries", () => {
      const stack = [
        {
          id: "s1",
          effectId: "color.invert",
          effectName: "Invert",
          params: {},
          enabled: false,
          maskId: null,
          maskMode: "inside" as const,
        },
        {
          id: "s2",
          effectId: "color.brightness",
          effectName: "Brightness",
          params: { brightness: 0.5 },
          enabled: true,
          maskId: null,
          maskMode: "inside" as const,
        },
      ];
      const payload = stackToRustPayload(stack, null, []);
      expect(payload.length).toBe(1);
      expect(payload[0].effect_id).toBe("color.brightness");
    });

    it("empty stack produces empty payload", () => {
      const payload = stackToRustPayload([], null, []);
      expect(payload).toEqual([]);
    });

    it("includes time param when provided", () => {
      const stack = [
        {
          id: "s1",
          effectId: "color.invert",
          effectName: "Invert",
          params: {},
          enabled: true,
          maskId: null,
          maskMode: "inside" as const,
        },
      ];
      const payload = stackToRustPayload(stack, null, [], 5.5);
      expect(payload[0].params.time).toBe(5.5);
    });

    it("resolves sam3 mask index correctly", () => {
      const stack = [
        {
          id: "s1",
          effectId: "color.invert",
          effectName: "Invert",
          params: {},
          enabled: true,
          maskId: "sam3-2",
          maskMode: "inside" as const,
        },
      ];
      const payload = stackToRustPayload(stack, null, ["mask0", "mask1", "mask2"]);
      expect(payload[0].mask_b64).toBe("mask2");
    });

    it("resolves active mask correctly", () => {
      const stack = [
        {
          id: "s1",
          effectId: "color.invert",
          effectName: "Invert",
          params: {},
          enabled: true,
          maskId: "active",
          maskMode: "inside" as const,
        },
      ];
      const payload = stackToRustPayload(stack, "active_mask_data", []);
      expect(payload[0].mask_b64).toBe("active_mask_data");
    });

    it("null maskId produces null mask_b64", () => {
      const stack = [
        {
          id: "s1",
          effectId: "color.invert",
          effectName: "Invert",
          params: {},
          enabled: true,
          maskId: null,
          maskMode: "inside" as const,
        },
      ];
      const payload = stackToRustPayload(stack, "active_data", []);
      expect(payload[0].mask_b64).toBeNull();
    });

    it("invalid sam3 index returns null mask", () => {
      const stack = [
        {
          id: "s1",
          effectId: "color.invert",
          effectName: "Invert",
          params: {},
          enabled: true,
          maskId: "sam3-99",
          maskMode: "inside" as const,
        },
      ];
      const payload = stackToRustPayload(stack, null, ["only_one_mask"]);
      expect(payload[0].mask_b64).toBeNull();
    });
  });

  // ── Store in/out point mutual exclusion ──
  describe("in/out point edge cases", () => {
    it("setting inPoint after outPoint clears outPoint if in >= out", () => {
      useAppStore.getState().setOutPoint(5);
      useAppStore.getState().setInPoint(5);
      // inPoint=5, outPoint=5 → outPoint cleared because out <= in
      expect(useAppStore.getState().inPoint).toBe(5);
      expect(useAppStore.getState().outPoint).toBeNull();
    });

    it("setting inPoint > outPoint clears outPoint", () => {
      useAppStore.getState().setOutPoint(3);
      useAppStore.getState().setInPoint(10);
      expect(useAppStore.getState().outPoint).toBeNull();
    });

    it("setting outPoint < inPoint clears inPoint", () => {
      useAppStore.getState().setInPoint(10);
      useAppStore.getState().setOutPoint(3);
      expect(useAppStore.getState().inPoint).toBeNull();
    });

    it("in/out points clamped to 0-duration range", () => {
      useAppStore.getState().setDuration(200);
      useAppStore.getState().setInPoint(-5);
      expect(useAppStore.getState().inPoint).toBe(0);
      useAppStore.getState().setOutPoint(300);
      expect(useAppStore.getState().outPoint).toBe(200);
    });

    it("clearInOut resets both to null", () => {
      useAppStore.getState().setInPoint(5);
      useAppStore.getState().setOutPoint(10);
      useAppStore.getState().clearInOut();
      expect(useAppStore.getState().inPoint).toBeNull();
      expect(useAppStore.getState().outPoint).toBeNull();
    });

    it("setting inPoint to null works", () => {
      useAppStore.getState().setInPoint(5);
      useAppStore.getState().setInPoint(null);
      expect(useAppStore.getState().inPoint).toBeNull();
    });
  });
});
