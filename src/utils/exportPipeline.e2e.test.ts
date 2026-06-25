import { describe, it, expect, beforeEach } from "vitest";
import { useAppStore } from "../store";
import {
  DEFAULT_WATERMARK,
  buildDrawtextFilter,
  buildImageOverlayFilter,
  appendTextWatermarkToVf,
  buildWatermarkArgs,
  type WatermarkSettings,
} from "./watermark";
import { stackToRustPayload } from "../utils/effectConverter";

describe("Export Pipeline E2E", () => {
  beforeEach(() => {
    useAppStore.setState(useAppStore.getInitialState());
  });

  describe("Store export state", () => {
    it("initial export state is idle", () => {
      const state = useAppStore.getState();
      expect(state.exportProgress).toBe(0);
      expect(state.exportIsRunning).toBe(false);
      expect(state.exportCancelRequested).toBe(false);
    });

    it("setExportProgress clamps to 0-100", () => {
      useAppStore.getState().setExportProgress(50);
      expect(useAppStore.getState().exportProgress).toBe(50);

      useAppStore.getState().setExportProgress(150);
      expect(useAppStore.getState().exportProgress).toBe(100);

      useAppStore.getState().setExportProgress(-10);
      expect(useAppStore.getState().exportProgress).toBe(0);
    });

    it("setExportIsRunning sets flag", () => {
      useAppStore.getState().setExportIsRunning(true);
      expect(useAppStore.getState().exportIsRunning).toBe(true);
    });

    it("requestExportCancel sets cancel flag", () => {
      useAppStore.getState().requestExportCancel();
      expect(useAppStore.getState().exportCancelRequested).toBe(true);
    });

    it("resetExport clears all export state", () => {
      useAppStore.getState().setExportProgress(75);
      useAppStore.getState().setExportIsRunning(true);
      useAppStore.getState().requestExportCancel();
      useAppStore.getState().resetExport();
      expect(useAppStore.getState().exportProgress).toBe(0);
      expect(useAppStore.getState().exportIsRunning).toBe(false);
      expect(useAppStore.getState().exportCancelRequested).toBe(false);
    });
  });

  describe("Watermark settings in store", () => {
    it("initial watermark is DEFAULT_WATERMARK", () => {
      expect(useAppStore.getState().watermark).toEqual(DEFAULT_WATERMARK);
    });

    it("setWatermark merges partial settings", () => {
      useAppStore.getState().setWatermark({ enabled: true, text: "Test" });
      const wm = useAppStore.getState().watermark;
      expect(wm.enabled).toBe(true);
      expect(wm.text).toBe("Test");
      expect(wm.position).toBe(DEFAULT_WATERMARK.position);
    });
  });

  describe("Proxy media state", () => {
    it("initial proxy state is disabled", () => {
      const state = useAppStore.getState();
      expect(state.proxyEnabled).toBe(false);
      expect(state.proxyPath).toBeNull();
      expect(state.proxyMaxWidth).toBe(1280);
      expect(state.proxyCrf).toBe(28);
      expect(state.proxyGenerating).toBe(false);
    });

    it("setProxyEnabled toggles flag", () => {
      useAppStore.getState().setProxyEnabled(true);
      expect(useAppStore.getState().proxyEnabled).toBe(true);
    });

    it("setProxyPath sets path", () => {
      useAppStore.getState().setProxyPath("/tmp/proxy.mp4");
      expect(useAppStore.getState().proxyPath).toBe("/tmp/proxy.mp4");
    });

    it("setProxyMaxWidth sets width", () => {
      useAppStore.getState().setProxyMaxWidth(1920);
      expect(useAppStore.getState().proxyMaxWidth).toBe(1920);
    });

    it("setProxyCrf sets crf", () => {
      useAppStore.getState().setProxyCrf(20);
      expect(useAppStore.getState().proxyCrf).toBe(20);
    });

    it("setProxyGenerating sets flag", () => {
      useAppStore.getState().setProxyGenerating(true);
      expect(useAppStore.getState().proxyGenerating).toBe(true);
    });
  });

  describe("buildDrawtextFilter", () => {
    it("returns null when disabled", () => {
      const result = buildDrawtextFilter({ ...DEFAULT_WATERMARK, enabled: false });
      expect(result).toBeNull();
    });

    it("returns null for image type", () => {
      const result = buildDrawtextFilter({ ...DEFAULT_WATERMARK, type: "image" });
      expect(result).toBeNull();
    });

    it("returns null for empty text", () => {
      const result = buildDrawtextFilter({ ...DEFAULT_WATERMARK, enabled: true, text: "" });
      expect(result).toBeNull();
    });

    it("generates drawtext filter for enabled text watermark", () => {
      const settings: WatermarkSettings = {
        ...DEFAULT_WATERMARK,
        enabled: true,
        text: "Hello",
        position: "bottom-right",
        fontSize: 32,
        color: "white",
        opacity: 0.7,
      };
      const result = buildDrawtextFilter(settings);
      expect(result).not.toBeNull();
      expect(result).toContain("drawtext=");
      expect(result).toContain("text='Hello'");
      expect(result).toContain("fontsize=32");
      expect(result).toContain("fontcolor=white");
    });

    it("includes fontfile when fontPath is set", () => {
      const result = buildDrawtextFilter({
        ...DEFAULT_WATERMARK,
        enabled: true,
        text: "Test",
        fontPath: "/usr/share/fonts/arial.ttf",
      });
      expect(result).toContain("fontfile=/usr/share/fonts/arial.ttf");
    });

    it("escapes special characters in text", () => {
      const result = buildDrawtextFilter({
        ...DEFAULT_WATERMARK,
        enabled: true,
        text: "it's a: test",
      });
      expect(result).toContain("\\'");
      expect(result).toContain("\\:");
    });
  });

  describe("buildImageOverlayFilter", () => {
    it("returns null when disabled", () => {
      const result = buildImageOverlayFilter({ ...DEFAULT_WATERMARK, enabled: false });
      expect(result.filter).toBeNull();
      expect(result.extraInputIndex).toBeNull();
    });

    it("returns null for text type", () => {
      const result = buildImageOverlayFilter({ ...DEFAULT_WATERMARK, type: "text" });
      expect(result.filter).toBeNull();
    });

    it("returns null when no image path", () => {
      const result = buildImageOverlayFilter({
        ...DEFAULT_WATERMARK,
        enabled: true,
        type: "image",
        imagePath: null,
      });
      expect(result.filter).toBeNull();
    });

    it("generates overlay filter for enabled image watermark", () => {
      const result = buildImageOverlayFilter({
        ...DEFAULT_WATERMARK,
        enabled: true,
        type: "image",
        imagePath: "/tmp/logo.png",
        position: "bottom-right",
        scale: 20,
        opacity: 0.5,
      });
      expect(result.filter).not.toBeNull();
      expect(result.filter).toContain("overlay=");
      expect(result.extraInputIndex).toBe(1);
    });
  });

  describe("appendTextWatermarkToVf", () => {
    it("returns vf unchanged when watermark disabled", () => {
      const result = appendTextWatermarkToVf("scale=1280:720", {
        ...DEFAULT_WATERMARK,
        enabled: false,
      });
      expect(result).toBe("scale=1280:720");
    });

    it("appends drawtext to existing vf", () => {
      const result = appendTextWatermarkToVf("scale=1280:720", {
        ...DEFAULT_WATERMARK,
        enabled: true,
        text: "WM",
      });
      expect(result).toContain("scale=1280:720");
      expect(result).toContain("drawtext=");
    });

    it("returns just drawtext when vf is empty", () => {
      const result = appendTextWatermarkToVf("", {
        ...DEFAULT_WATERMARK,
        enabled: true,
        text: "WM",
      });
      expect(result).toContain("drawtext=");
      expect(result).not.toContain(",");
    });
  });

  describe("buildWatermarkArgs", () => {
    it("returns args unchanged when disabled", () => {
      const baseArgs = ["-i", "input.mp4", "-y", "output.mp4"];
      const result = buildWatermarkArgs(baseArgs, { ...DEFAULT_WATERMARK, enabled: false });
      expect(result.args).toEqual(baseArgs);
      expect(result.extraInputs).toEqual([]);
    });

    it("adds -vf drawtext for text watermark", () => {
      const baseArgs = ["-i", "input.mp4", "-y", "output.mp4"];
      const result = buildWatermarkArgs(baseArgs, {
        ...DEFAULT_WATERMARK,
        enabled: true,
        text: "Test",
      });
      expect(result.args.some((a) => a.includes("drawtext"))).toBe(true);
    });
  });

  describe("stackToRustPayload integration", () => {
    const mockEffect = {
      id: "bayer_dither",
      name: "Bayer Dither",
      category: "dithering",
      media_type: "both" as const,
      parameters: [
        {
          id: "intensity",
          name: "Intensity",
          type: "slider" as const,
          min: 0,
          max: 1,
          default: 0.5,
          step: 0.01,
        },
      ],
    };

    it("converts effect stack to Rust-compatible payload", () => {
      useAppStore.getState().addToStack(mockEffect);
      const stack = useAppStore.getState().effectStack;
      const payload = stackToRustPayload(stack, null, []);
      expect(payload.length).toBe(1);
      expect(payload[0].effect_id).toBe("bayer_dither");
      expect(payload[0].params).toBeDefined();
    });

    it("preserves mask info in payload", () => {
      useAppStore.getState().addToStack(mockEffect);
      const stack = useAppStore.getState().effectStack;
      stack[0].maskId = "mask1";
      stack[0].maskMode = "inside";
      const payload = stackToRustPayload(stack, null, ["mask1base64"]);
      expect(payload[0].mask_b64).toBeDefined();
      expect(payload[0].mask_mode).toBe("inside");
    });
  });
});
