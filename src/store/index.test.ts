import { describe, it, expect, beforeEach } from "vitest";
import { useAppStore } from "./index";

describe("Studio Store", () => {
  beforeEach(() => {
    // Reset store to initial state
    useAppStore.setState(useAppStore.getInitialState());
  });

  describe("theme", () => {
    it("defaults to dark theme", () => {
      expect(useAppStore.getState().theme).toBe("dark");
    });

    it("toggleTheme switches dark → light", () => {
      useAppStore.getState().toggleTheme();
      expect(useAppStore.getState().theme).toBe("light");
    });

    it("toggleTheme switches light → dark", () => {
      useAppStore.getState().setTheme("light");
      useAppStore.getState().toggleTheme();
      expect(useAppStore.getState().theme).toBe("dark");
    });

    it("setTheme sets explicitly", () => {
      useAppStore.getState().setTheme("light");
      expect(useAppStore.getState().theme).toBe("light");
      useAppStore.getState().setTheme("dark");
      expect(useAppStore.getState().theme).toBe("dark");
    });
  });

  describe("effect stack", () => {
    it("starts with empty stack", () => {
      expect(useAppStore.getState().effectStack).toHaveLength(0);
    });

    it("addToStack adds an effect", () => {
      const mockEffect = {
        id: "dithering.bayer",
        name: "Bayer Dither",
        category: "dithering",
        media_type: "image",
        parameters: [],
      };
      useAppStore.getState().addToStack(mockEffect);
      expect(useAppStore.getState().effectStack).toHaveLength(1);
      expect(useAppStore.getState().effectStack[0].effectId).toBe("dithering.bayer");
    });

    it("removeFromStack removes an effect", () => {
      const mockEffect = {
        id: "dithering.bayer",
        name: "Bayer Dither",
        category: "dithering",
        media_type: "image",
        parameters: [],
      };
      useAppStore.getState().addToStack(mockEffect);
      const stackId = useAppStore.getState().effectStack[0].id;
      useAppStore.getState().removeFromStack(stackId);
      expect(useAppStore.getState().effectStack).toHaveLength(0);
    });

    it("toggleStackItem flips enabled flag", () => {
      const mockEffect = {
        id: "dithering.bayer",
        name: "Bayer Dither",
        category: "dithering",
        media_type: "image",
        parameters: [],
      };
      useAppStore.getState().addToStack(mockEffect);
      const stackId = useAppStore.getState().effectStack[0].id;
      expect(useAppStore.getState().effectStack[0].enabled).toBe(true);
      useAppStore.getState().toggleStackItem(stackId);
      expect(useAppStore.getState().effectStack[0].enabled).toBe(false);
    });
  });

  describe("undo/redo", () => {
    it("undo restores previous stack", () => {
      const mockEffect = {
        id: "dithering.bayer",
        name: "Bayer Dither",
        category: "dithering",
        media_type: "image",
        parameters: [],
      };
      useAppStore.getState().addToStack(mockEffect);
      expect(useAppStore.getState().effectStack).toHaveLength(1);

      useAppStore.getState().undo();
      expect(useAppStore.getState().effectStack).toHaveLength(0);
    });

    it("redo re-applies undone change", () => {
      const mockEffect = {
        id: "dithering.bayer",
        name: "Bayer Dither",
        category: "dithering",
        media_type: "image",
        parameters: [],
      };
      useAppStore.getState().addToStack(mockEffect);
      useAppStore.getState().undo();
      expect(useAppStore.getState().effectStack).toHaveLength(0);

      useAppStore.getState().redo();
      expect(useAppStore.getState().effectStack).toHaveLength(1);
    });

    it("canUndo returns false initially", () => {
      expect(useAppStore.getState().canUndo()).toBe(false);
    });

    it("canUndo returns true after adding effect", () => {
      const mockEffect = {
        id: "dithering.bayer",
        name: "Bayer Dither",
        category: "dithering",
        media_type: "image",
        parameters: [],
      };
      useAppStore.getState().addToStack(mockEffect);
      expect(useAppStore.getState().canUndo()).toBe(true);
    });
  });

  describe("aspect ratio lock", () => {
    it("defaults to unlocked", () => {
      expect(useAppStore.getState().aspectRatioLock).toBe(false);
      expect(useAppStore.getState().aspectRatio).toBe(null);
    });

    it("setAspectRatioLock enables lock", () => {
      useAppStore.getState().setAspectRatioLock(true);
      expect(useAppStore.getState().aspectRatioLock).toBe(true);
    });

    it("setAspectRatio sets the ratio", () => {
      useAppStore.getState().setAspectRatio(16 / 9);
      expect(useAppStore.getState().aspectRatio).toBeCloseTo(16 / 9);
    });
  });

  describe("active category", () => {
    it("defaults to all or first category", () => {
      // Just verify it's a string
      expect(typeof useAppStore.getState().activeCategory).toBe("string");
    });

    it("setActiveCategory changes category", () => {
      useAppStore.getState().setActiveCategory("glitch");
      expect(useAppStore.getState().activeCategory).toBe("glitch");
    });
  });

  describe("proxy media", () => {
    it("defaults to disabled with no proxy path", () => {
      expect(useAppStore.getState().proxyEnabled).toBe(false);
      expect(useAppStore.getState().proxyPath).toBe(null);
      expect(useAppStore.getState().proxyMaxWidth).toBe(1280);
      expect(useAppStore.getState().proxyCrf).toBe(28);
      expect(useAppStore.getState().proxyGenerating).toBe(false);
    });

    it("setProxyEnabled toggles proxy usage", () => {
      useAppStore.getState().setProxyEnabled(true);
      expect(useAppStore.getState().proxyEnabled).toBe(true);
    });

    it("setProxyPath sets the proxy file path", () => {
      useAppStore.getState().setProxyPath("/tmp/proxy.mp4");
      expect(useAppStore.getState().proxyPath).toBe("/tmp/proxy.mp4");
    });

    it("setProxyMaxWidth changes max width", () => {
      useAppStore.getState().setProxyMaxWidth(640);
      expect(useAppStore.getState().proxyMaxWidth).toBe(640);
    });

    it("setProxyCrf changes quality", () => {
      useAppStore.getState().setProxyCrf(20);
      expect(useAppStore.getState().proxyCrf).toBe(20);
    });

    it("setProxyGenerating toggles generating state", () => {
      useAppStore.getState().setProxyGenerating(true);
      expect(useAppStore.getState().proxyGenerating).toBe(true);
      useAppStore.getState().setProxyGenerating(false);
      expect(useAppStore.getState().proxyGenerating).toBe(false);
    });
  });

  describe("multi-track layering", () => {
    it("starts with no tracks", () => {
      expect(useAppStore.getState().tracks).toHaveLength(0);
      expect(useAppStore.getState().activeTrackId).toBe(null);
    });

    it("addTrack creates a track and sets it active", () => {
      const id = useAppStore.getState().addTrack();
      const state = useAppStore.getState();
      expect(state.tracks).toHaveLength(1);
      expect(state.tracks[0].id).toBe(id);
      expect(state.activeTrackId).toBe(id);
      expect(state.tracks[0].visible).toBe(true);
      expect(state.tracks[0].opacity).toBe(1);
      expect(state.tracks[0].blendMode).toBe("normal");
      expect(state.tracks[0].effectStack).toEqual([]);
    });

    it("addTrack with custom name", () => {
      useAppStore.getState().addTrack("Background");
      expect(useAppStore.getState().tracks[0].name).toBe("Background");
    });

    it("addTrack with default name uses track number", () => {
      useAppStore.getState().addTrack();
      expect(useAppStore.getState().tracks[0].name).toBe("Track 1");
      useAppStore.getState().addTrack();
      expect(useAppStore.getState().tracks[1].name).toBe("Track 2");
    });

    it("removeTrack removes by id and clears active if needed", () => {
      const id1 = useAppStore.getState().addTrack();
      const id2 = useAppStore.getState().addTrack();
      useAppStore.getState().setActiveTrack(id2);
      useAppStore.getState().removeTrack(id2);
      const state = useAppStore.getState();
      expect(state.tracks).toHaveLength(1);
      expect(state.tracks[0].id).toBe(id1);
      expect(state.activeTrackId).toBe(null);
    });

    it("renameTrack changes name", () => {
      const id = useAppStore.getState().addTrack();
      useAppStore.getState().renameTrack(id, "Overlay");
      expect(useAppStore.getState().tracks[0].name).toBe("Overlay");
    });

    it("setTrackVisible toggles visibility", () => {
      const id = useAppStore.getState().addTrack();
      useAppStore.getState().setTrackVisible(id, false);
      expect(useAppStore.getState().tracks[0].visible).toBe(false);
    });

    it("setTrackOpacity clamps to 0-1", () => {
      const id = useAppStore.getState().addTrack();
      useAppStore.getState().setTrackOpacity(id, 1.5);
      expect(useAppStore.getState().tracks[0].opacity).toBe(1);
      useAppStore.getState().setTrackOpacity(id, -0.5);
      expect(useAppStore.getState().tracks[0].opacity).toBe(0);
      useAppStore.getState().setTrackOpacity(id, 0.5);
      expect(useAppStore.getState().tracks[0].opacity).toBe(0.5);
    });

    it("setTrackBlendMode changes blend mode", () => {
      const id = useAppStore.getState().addTrack();
      useAppStore.getState().setTrackBlendMode(id, "screen");
      expect(useAppStore.getState().tracks[0].blendMode).toBe("screen");
    });

    it("moveTrack reorders tracks", () => {
      useAppStore.getState().addTrack("A");
      useAppStore.getState().addTrack("B");
      useAppStore.getState().addTrack("C");
      expect(useAppStore.getState().tracks.map((t) => t.name)).toEqual(["A", "B", "C"]);
      useAppStore.getState().moveTrack(0, 2);
      expect(useAppStore.getState().tracks.map((t) => t.name)).toEqual(["B", "C", "A"]);
    });

    it("moveTrack ignores out-of-bounds indices", () => {
      useAppStore.getState().addTrack("A");
      useAppStore.getState().addTrack("B");
      useAppStore.getState().moveTrack(0, 10);
      expect(useAppStore.getState().tracks.map((t) => t.name)).toEqual(["A", "B"]);
    });

    it("getActiveTrack returns the active track or null", () => {
      expect(useAppStore.getState().getActiveTrack()).toBe(null);
      const id = useAppStore.getState().addTrack();
      expect(useAppStore.getState().getActiveTrack()?.id).toBe(id);
      useAppStore.getState().setActiveTrack(null);
      expect(useAppStore.getState().getActiveTrack()).toBe(null);
    });
  });

  // ── Mask state & actions ───────────────────────────────────
  describe("mask state", () => {
    it("defaults to null activeMask, visible, sam3 tab, brush tool", () => {
      const s = useAppStore.getState();
      expect(s.activeMask).toBe(null);
      expect(s.maskVisible).toBe(true);
      expect(s.maskTab).toBe("sam3");
      expect(s.maskTool).toBe("brush");
      expect(s.brushSize).toBe(20);
    });

    it("setActiveMask sets the mask base64", () => {
      useAppStore.getState().setActiveMask("data:image/png;base64,abc123");
      expect(useAppStore.getState().activeMask).toBe("data:image/png;base64,abc123");
    });

    it("setActiveMask(null) clears the mask", () => {
      useAppStore.getState().setActiveMask("data:image/png;base64,abc");
      useAppStore.getState().setActiveMask(null);
      expect(useAppStore.getState().activeMask).toBe(null);
    });

    it("setMaskVisible toggles visibility", () => {
      useAppStore.getState().setMaskVisible(false);
      expect(useAppStore.getState().maskVisible).toBe(false);
      useAppStore.getState().setMaskVisible(true);
      expect(useAppStore.getState().maskVisible).toBe(true);
    });

    it("setMaskTab switches between sam3 and manual", () => {
      useAppStore.getState().setMaskTab("manual");
      expect(useAppStore.getState().maskTab).toBe("manual");
      useAppStore.getState().setMaskTab("sam3");
      expect(useAppStore.getState().maskTab).toBe("sam3");
    });

    it("setMaskTool switches between all tools", () => {
      const tools = ["brush", "eraser", "rect", "ellipse", "polygon"] as const;
      for (const tool of tools) {
        useAppStore.getState().setMaskTool(tool);
        expect(useAppStore.getState().maskTool).toBe(tool);
      }
    });

    it("setBrushSize sets size clamped to [1, 200]", () => {
      useAppStore.getState().setBrushSize(50);
      expect(useAppStore.getState().brushSize).toBe(50);
      useAppStore.getState().setBrushSize(0);
      expect(useAppStore.getState().brushSize).toBe(1);
      useAppStore.getState().setBrushSize(300);
      expect(useAppStore.getState().brushSize).toBe(200);
    });
  });

  // ── SAM3 multi-mask ────────────────────────────────────────
  describe("sam3 multi-mask", () => {
    it("defaults to empty masks and index 0", () => {
      const s = useAppStore.getState();
      expect(s.sam3Masks).toEqual([]);
      expect(s.sam3MaskScores).toEqual([]);
      expect(s.sam3MaskIndex).toBe(0);
    });

    it("setSam3Masks stores masks, scores, resets index, sets activeMask", () => {
      const masks = ["mask0", "mask1", "mask2"];
      const scores = [0.9, 0.8, 0.7];
      useAppStore.getState().setSam3Masks(masks, scores);
      const s = useAppStore.getState();
      expect(s.sam3Masks).toEqual(masks);
      expect(s.sam3MaskScores).toEqual(scores);
      expect(s.sam3MaskIndex).toBe(0);
      expect(s.activeMask).toBe("mask0");
    });

    it("setSam3Masks with empty array clears activeMask", () => {
      useAppStore.getState().setSam3Masks(["m1"], [0.5]);
      useAppStore.getState().setSam3Masks([], []);
      expect(useAppStore.getState().activeMask).toBe(null);
      expect(useAppStore.getState().sam3Masks).toEqual([]);
    });

    it("setSam3MaskIndex changes index and activeMask", () => {
      const masks = ["mask0", "mask1", "mask2"];
      useAppStore.getState().setSam3Masks(masks, [0.9, 0.8, 0.7]);
      useAppStore.getState().setSam3MaskIndex(2);
      expect(useAppStore.getState().sam3MaskIndex).toBe(2);
      expect(useAppStore.getState().activeMask).toBe("mask2");
    });

    it("setSam3MaskIndex clamps to valid range", () => {
      useAppStore.getState().setSam3Masks(["m0", "m1"], [0.9, 0.8]);
      useAppStore.getState().setSam3MaskIndex(10);
      expect(useAppStore.getState().sam3MaskIndex).toBe(1);
      useAppStore.getState().setSam3MaskIndex(-5);
      expect(useAppStore.getState().sam3MaskIndex).toBe(0);
    });
  });

  // ── SAM3 point prompts ─────────────────────────────────────
  describe("sam3 point prompts", () => {
    it("addSam3Point appends a point", () => {
      useAppStore.getState().addSam3Point({ x: 10, y: 20, label: 1 });
      useAppStore.getState().addSam3Point({ x: 30, y: 40, label: 0 });
      expect(useAppStore.getState().sam3Points).toEqual([
        { x: 10, y: 20, label: 1 },
        { x: 30, y: 40, label: 0 },
      ]);
    });

    it("removeSam3Point removes by index", () => {
      useAppStore.getState().addSam3Point({ x: 10, y: 20, label: 1 });
      useAppStore.getState().addSam3Point({ x: 30, y: 40, label: 0 });
      useAppStore.getState().removeSam3Point(0);
      expect(useAppStore.getState().sam3Points).toEqual([{ x: 30, y: 40, label: 0 }]);
    });

    it("clearSam3Points empties the array", () => {
      useAppStore.getState().addSam3Point({ x: 10, y: 20, label: 1 });
      useAppStore.getState().clearSam3Points();
      expect(useAppStore.getState().sam3Points).toEqual([]);
    });
  });

  // ── SAM3 overlay settings ──────────────────────────────────
  describe("sam3 overlay", () => {
    it("setSam3OverlayOpacity sets opacity", () => {
      useAppStore.getState().setSam3OverlayOpacity(0.7);
      expect(useAppStore.getState().sam3OverlayOpacity).toBe(0.7);
    });

    it("setSam3OverlayColor sets color", () => {
      useAppStore.getState().setSam3OverlayColor("#ff0000");
      expect(useAppStore.getState().sam3OverlayColor).toBe("#ff0000");
    });

    it("setSam3HoverMask sets hover mask", () => {
      useAppStore.getState().setSam3HoverMask("hover_mask_data");
      expect(useAppStore.getState().sam3HoverMask).toBe("hover_mask_data");
      useAppStore.getState().setSam3HoverMask(null);
      expect(useAppStore.getState().sam3HoverMask).toBe(null);
    });

    it("setSam3Ready sets readiness", () => {
      useAppStore.getState().setSam3Ready(true);
      expect(useAppStore.getState().sam3Ready).toBe(true);
    });

    it("setSam3Mode sets mode", () => {
      useAppStore.getState().setSam3Mode("point");
      expect(useAppStore.getState().sam3Mode).toBe("point");
    });

    it("setSam3Clicking sets clicking state", () => {
      useAppStore.getState().setSam3Clicking(true);
      expect(useAppStore.getState().sam3Clicking).toBe(true);
    });
  });

  // ── Per-stack-item mask assignment ─────────────────────────
  describe("stack item masks", () => {
    // Helper: add an effect to the stack and return its id
    function addEffect(effectId = "test.effect", name = "Test Effect"): string {
      useAppStore.getState().addToStack({
        id: effectId,
        name,
        category: "Color",
        parameters: [],
      } as never);
      const stack = useAppStore.getState().effectStack;
      return stack[stack.length - 1].id;
    }

    it("new stack entries default to null maskId and inside mode", () => {
      const id = addEffect();
      const entry = useAppStore.getState().effectStack.find((e) => e.id === id);
      expect(entry?.maskId).toBe(null);
      expect(entry?.maskMode).toBe("inside");
    });

    it("setStackItemMask sets maskId on the correct entry", () => {
      const id = addEffect();
      useAppStore.getState().setStackItemMask(id, "active");
      const entry = useAppStore.getState().effectStack.find((e) => e.id === id);
      expect(entry?.maskId).toBe("active");
    });

    it("setStackItemMask null clears maskId", () => {
      const id = addEffect();
      useAppStore.getState().setStackItemMask(id, "sam3-0");
      useAppStore.getState().setStackItemMask(id, null);
      const entry = useAppStore.getState().effectStack.find((e) => e.id === id);
      expect(entry?.maskId).toBe(null);
    });

    it("setStackItemMaskMode sets mode on the correct entry", () => {
      const id = addEffect();
      useAppStore.getState().setStackItemMaskMode(id, "outside");
      const entry = useAppStore.getState().effectStack.find((e) => e.id === id);
      expect(entry?.maskMode).toBe("outside");
    });

    it("setStackItemMaskMode cycles through all modes", () => {
      const id = addEffect();
      const modes = ["inside", "outside", "alpha"] as const;
      for (const mode of modes) {
        useAppStore.getState().setStackItemMaskMode(id, mode);
        expect(useAppStore.getState().effectStack.find((e) => e.id === id)?.maskMode).toBe(mode);
      }
    });

    it("mask assignment is independent per stack item", () => {
      const id1 = addEffect("test.effect1", "Effect 1");
      const id2 = addEffect("test.effect2", "Effect 2");
      useAppStore.getState().setStackItemMask(id1, "active");
      useAppStore.getState().setStackItemMask(id2, "sam3-1");
      useAppStore.getState().setStackItemMaskMode(id1, "inside");
      useAppStore.getState().setStackItemMaskMode(id2, "outside");
      const stack = useAppStore.getState().effectStack;
      const e1 = stack.find((e) => e.id === id1);
      const e2 = stack.find((e) => e.id === id2);
      expect(e1?.maskId).toBe("active");
      expect(e1?.maskMode).toBe("inside");
      expect(e2?.maskId).toBe("sam3-1");
      expect(e2?.maskMode).toBe("outside");
    });

    it("setStackItemMask pushes undo history", () => {
      const id = addEffect();
      const beforeUndo = useAppStore.getState().pastStacks.length;
      useAppStore.getState().setStackItemMask(id, "active");
      expect(useAppStore.getState().pastStacks.length).toBe(beforeUndo + 1);
    });

    it("setStackItemMaskMode pushes undo history", () => {
      const id = addEffect();
      const beforeUndo = useAppStore.getState().pastStacks.length;
      useAppStore.getState().setStackItemMaskMode(id, "alpha");
      expect(useAppStore.getState().pastStacks.length).toBe(beforeUndo + 1);
    });
  });
});
