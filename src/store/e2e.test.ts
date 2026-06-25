import { describe, it, expect, beforeEach } from "vitest";
import { useAppStore, applyEasing } from "./index";
import type { EffectMeta, Keyframe, AudioBinding } from "./index";

function mockEffect(id: string, params: Array<{ id: string; default: number }>): EffectMeta {
  return {
    id,
    name: id,
    category: "dithering",
    media_type: "both",
    parameters: params.map((p) => ({
      id: p.id,
      name: p.id,
      type: "slider" as const,
      default: p.default,
      min: 0,
      max: 100,
      step: 1,
      options: null,
    })),
  };
}

describe("Store E2E — State Management", () => {
  beforeEach(() => {
    useAppStore.setState(useAppStore.getInitialState());
  });

  describe("Effect Stack Operations", () => {
    it("addToStack adds effect with default params and pushes undo history", () => {
      const eff = mockEffect("dithering.bayer", [{ id: "matrix_size", default: 4 }]);
      useAppStore.getState().addToStack(eff);
      const stack = useAppStore.getState().effectStack;
      expect(stack).toHaveLength(1);
      expect(stack[0].effectId).toBe("dithering.bayer");
      expect(stack[0].params.matrix_size).toBe(4);
      expect(stack[0].enabled).toBe(true);
      expect(useAppStore.getState().pastStacks).toHaveLength(1);
    });

    it("addToStack generates unique IDs for each entry", () => {
      const eff = mockEffect("dithering.bayer", [{ id: "matrix_size", default: 4 }]);
      useAppStore.getState().addToStack(eff);
      useAppStore.getState().addToStack(eff);
      const stack = useAppStore.getState().effectStack;
      expect(stack).toHaveLength(2);
      expect(stack[0].id).not.toBe(stack[1].id);
    });

    it("removeFromStack removes item and updates selectedStackId", () => {
      const eff = mockEffect("dithering.bayer", [{ id: "matrix_size", default: 4 }]);
      useAppStore.getState().addToStack(eff);
      const id = useAppStore.getState().effectStack[0].id;
      useAppStore.getState().removeFromStack(id);
      expect(useAppStore.getState().effectStack).toHaveLength(0);
      expect(useAppStore.getState().selectedStackId).toBeNull();
    });

    it("moveStackItem reorders entries", () => {
      const e1 = mockEffect("dithering.bayer", [{ id: "a", default: 1 }]);
      const e2 = mockEffect("dithering.floyd_steinberg", [{ id: "b", default: 2 }]);
      useAppStore.getState().addToStack(e1);
      useAppStore.getState().addToStack(e2);
      useAppStore.getState().moveStackItem(1, 0);
      const stack = useAppStore.getState().effectStack;
      expect(stack[0].effectId).toBe("dithering.floyd_steinberg");
      expect(stack[1].effectId).toBe("dithering.bayer");
    });

    it("updateStackParams merges params and pushes undo", () => {
      const eff = mockEffect("dithering.bayer", [{ id: "matrix_size", default: 4 }]);
      useAppStore.getState().addToStack(eff);
      const id = useAppStore.getState().effectStack[0].id;
      useAppStore.getState().updateStackParams(id, { matrix_size: 8 });
      expect(useAppStore.getState().effectStack[0].params.matrix_size).toBe(8);
      expect(useAppStore.getState().pastStacks).toHaveLength(2);
    });

    it("updateStackParamsSilent updates without undo history", () => {
      const eff = mockEffect("dithering.bayer", [{ id: "matrix_size", default: 4 }]);
      useAppStore.getState().addToStack(eff);
      const id = useAppStore.getState().effectStack[0].id;
      const pastLen = useAppStore.getState().pastStacks.length;
      useAppStore.getState().updateStackParamsSilent(id, { matrix_size: 16 });
      expect(useAppStore.getState().effectStack[0].params.matrix_size).toBe(16);
      expect(useAppStore.getState().pastStacks).toHaveLength(pastLen);
    });

    it("toggleStackItem flips enabled state", () => {
      const eff = mockEffect("dithering.bayer", [{ id: "a", default: 1 }]);
      useAppStore.getState().addToStack(eff);
      const id = useAppStore.getState().effectStack[0].id;
      expect(useAppStore.getState().effectStack[0].enabled).toBe(true);
      useAppStore.getState().toggleStackItem(id);
      expect(useAppStore.getState().effectStack[0].enabled).toBe(false);
    });

    it("setStackItemMask and setStackItemMaskMode update mask fields", () => {
      const eff = mockEffect("dithering.bayer", [{ id: "a", default: 1 }]);
      useAppStore.getState().addToStack(eff);
      const id = useAppStore.getState().effectStack[0].id;
      useAppStore.getState().setStackItemMask(id, "sam3-0");
      useAppStore.getState().setStackItemMaskMode(id, "outside");
      expect(useAppStore.getState().effectStack[0].maskId).toBe("sam3-0");
      expect(useAppStore.getState().effectStack[0].maskMode).toBe("outside");
    });

    it("clearStack empties stack and resets selectedStackId", () => {
      const eff = mockEffect("dithering.bayer", [{ id: "a", default: 1 }]);
      useAppStore.getState().addToStack(eff);
      useAppStore.getState().clearStack();
      expect(useAppStore.getState().effectStack).toHaveLength(0);
      expect(useAppStore.getState().selectedStackId).toBeNull();
    });
  });

  describe("Undo / Redo", () => {
    it("undo restores previous stack", () => {
      const e1 = mockEffect("dithering.bayer", [{ id: "a", default: 1 }]);
      useAppStore.getState().addToStack(e1);
      useAppStore.getState().clearStack();
      expect(useAppStore.getState().effectStack).toHaveLength(0);
      useAppStore.getState().undo();
      expect(useAppStore.getState().effectStack).toHaveLength(1);
    });

    it("redo re-applies cleared stack", () => {
      const e1 = mockEffect("dithering.bayer", [{ id: "a", default: 1 }]);
      useAppStore.getState().addToStack(e1);
      useAppStore.getState().clearStack();
      useAppStore.getState().undo();
      useAppStore.getState().redo();
      expect(useAppStore.getState().effectStack).toHaveLength(0);
    });

    it("canUndo/canRedo report correct state", () => {
      expect(useAppStore.getState().canUndo()).toBe(false);
      expect(useAppStore.getState().canRedo()).toBe(false);
      const e1 = mockEffect("dithering.bayer", [{ id: "a", default: 1 }]);
      useAppStore.getState().addToStack(e1);
      expect(useAppStore.getState().canUndo()).toBe(true);
      useAppStore.getState().undo();
      expect(useAppStore.getState().canRedo()).toBe(true);
    });

    it("new action clears redo history", () => {
      const e1 = mockEffect("dithering.bayer", [{ id: "a", default: 1 }]);
      useAppStore.getState().addToStack(e1);
      useAppStore.getState().undo();
      expect(useAppStore.getState().canRedo()).toBe(true);
      const e2 = mockEffect("dithering.floyd_steinberg", [{ id: "b", default: 2 }]);
      useAppStore.getState().addToStack(e2);
      expect(useAppStore.getState().canRedo()).toBe(false);
    });
  });

  describe("Audio State", () => {
    it("setAudioEnabled toggles audio", () => {
      useAppStore.getState().setAudioEnabled(true);
      expect(useAppStore.getState().audioEnabled).toBe(true);
    });

    it("setAudioVolume clamps to [0,1]", () => {
      useAppStore.getState().setAudioVolume(1.5);
      expect(useAppStore.getState().audioVolume).toBe(1);
      useAppStore.getState().setAudioVolume(-0.5);
      expect(useAppStore.getState().audioVolume).toBe(0);
    });

    it("setAudioBinding adds and removes bindings", () => {
      const binding: AudioBinding = {
        source: "bass",
        inputMin: 0,
        inputMax: 1,
        outputMin: 0,
        outputMax: 100,
        attack: 0.01,
        decay: 0.1,
        gateEnabled: false,
        gateThreshold: 0,
        invert: false,
      };
      useAppStore.getState().setAudioBinding("stack-1", "intensity", binding);
      expect(useAppStore.getState().audioBindings["stack-1"]["intensity"]).toEqual(binding);
      useAppStore.getState().setAudioBinding("stack-1", "intensity", null);
      expect(useAppStore.getState().audioBindings["stack-1"]).not.toHaveProperty("intensity");
    });

    it("setAudioBpm sets BPM", () => {
      useAppStore.getState().setAudioBpm(120);
      expect(useAppStore.getState().audioBpm).toBe(120);
    });

    it("setAudioManifest stores manifest", () => {
      const manifest = {
        version: 1,
        features: [],
      } as unknown as import("../engine/audio/types").AudioManifest;
      useAppStore.getState().setAudioManifest(manifest);
      expect(useAppStore.getState().audioManifest).toBe(manifest);
    });
  });

  describe("Keyframes", () => {
    it("addKeyframe adds and sorts by time", () => {
      const kf1: Keyframe = { id: "kf1", time: 1.0, value: 10, easing: "linear" };
      const kf2: Keyframe = { id: "kf2", time: 0.5, value: 5, easing: "linear" };
      useAppStore.getState().addKeyframe("stack-1", "intensity", kf1);
      useAppStore.getState().addKeyframe("stack-1", "intensity", kf2);
      const track = useAppStore.getState().keyframes["stack-1"]["intensity"];
      expect(track).toHaveLength(2);
      expect(track[0].time).toBe(0.5);
      expect(track[1].time).toBe(1.0);
    });

    it("getKeyframeValue interpolates linearly between keyframes", () => {
      const kf1: Keyframe = { id: "kf1", time: 0, value: 0, easing: "linear" };
      const kf2: Keyframe = { id: "kf2", time: 1, value: 100, easing: "linear" };
      useAppStore.getState().addKeyframe("stack-1", "intensity", kf1);
      useAppStore.getState().addKeyframe("stack-1", "intensity", kf2);
      const val = useAppStore.getState().getKeyframeValue("stack-1", "intensity", 0.5);
      expect(val).toBe(50);
    });

    it("getKeyframeValue returns null for missing track", () => {
      expect(useAppStore.getState().getKeyframeValue("nope", "nope", 0)).toBeNull();
    });

    it("getKeyframeValue clamps before first and after last keyframe", () => {
      const kf1: Keyframe = { id: "kf1", time: 1, value: 10, easing: "linear" };
      const kf2: Keyframe = { id: "kf2", time: 2, value: 20, easing: "linear" };
      useAppStore.getState().addKeyframe("stack-1", "intensity", kf1);
      useAppStore.getState().addKeyframe("stack-1", "intensity", kf2);
      expect(useAppStore.getState().getKeyframeValue("stack-1", "intensity", 0)).toBe(10);
      expect(useAppStore.getState().getKeyframeValue("stack-1", "intensity", 3)).toBe(20);
    });

    it("removeKeyframe removes specific keyframe", () => {
      const kf1: Keyframe = { id: "kf1", time: 0, value: 0, easing: "linear" };
      useAppStore.getState().addKeyframe("stack-1", "intensity", kf1);
      useAppStore.getState().removeKeyframe("stack-1", "intensity", "kf1");
      expect(useAppStore.getState().keyframes["stack-1"]).toBeUndefined();
    });

    it("clearKeyframes clears all when no args", () => {
      const kf: Keyframe = { id: "kf1", time: 0, value: 0, easing: "linear" };
      useAppStore.getState().addKeyframe("s1", "p1", kf);
      useAppStore.getState().addKeyframe("s2", "p2", kf);
      useAppStore.getState().clearKeyframes();
      expect(useAppStore.getState().keyframes).toEqual({});
    });

    it("applyEasing returns correct values", () => {
      expect(applyEasing(0.5, "hold")).toBe(0);
      expect(applyEasing(0.5, "linear")).toBe(0.5);
      expect(applyEasing(0.5, "easeIn")).toBe(0.25);
      expect(applyEasing(0.5, "easeOut")).toBe(0.75);
      const eio = applyEasing(0.5, "easeInOut");
      expect(eio).toBeCloseTo(0.5);
    });
  });

  describe("Mask / SAM3", () => {
    it("setActiveMask sets mask", () => {
      useAppStore.getState().setActiveMask("base64data");
      expect(useAppStore.getState().activeMask).toBe("base64data");
    });

    it("setSam3Masks sets masks and scores and picks first", () => {
      useAppStore.getState().setSam3Masks(["mask1", "mask2", "mask3"], [0.9, 0.7, 0.5]);
      expect(useAppStore.getState().sam3Masks).toHaveLength(3);
      expect(useAppStore.getState().sam3MaskIndex).toBe(0);
      expect(useAppStore.getState().activeMask).toBe("mask1");
    });

    it("setSam3MaskIndex clamps to valid range", () => {
      useAppStore.getState().setSam3Masks(["m0", "m1"], [0.9, 0.7]);
      useAppStore.getState().setSam3MaskIndex(5);
      expect(useAppStore.getState().sam3MaskIndex).toBe(1);
      useAppStore.getState().setSam3MaskIndex(-1);
      expect(useAppStore.getState().sam3MaskIndex).toBe(0);
    });

    it("addSam3Point/removeSam3Point/clearSam3Points manage points", () => {
      useAppStore.getState().addSam3Point({ x: 10, y: 20, label: 1 });
      useAppStore.getState().addSam3Point({ x: 30, y: 40, label: 0 });
      expect(useAppStore.getState().sam3Points).toHaveLength(2);
      useAppStore.getState().removeSam3Point(0);
      expect(useAppStore.getState().sam3Points).toHaveLength(1);
      useAppStore.getState().clearSam3Points();
      expect(useAppStore.getState().sam3Points).toHaveLength(0);
    });

    it("setBrushSize clamps to [1,200]", () => {
      useAppStore.getState().setBrushSize(500);
      expect(useAppStore.getState().brushSize).toBe(200);
      useAppStore.getState().setBrushSize(0);
      expect(useAppStore.getState().brushSize).toBe(1);
    });
  });

  describe("Tracks", () => {
    it("addTrack creates track with unique ID and sets active", () => {
      const id1 = useAppStore.getState().addTrack();
      const id2 = useAppStore.getState().addTrack("Custom");
      expect(id1).not.toBe(id2);
      void id1;
      void id2;
      expect(useAppStore.getState().tracks).toHaveLength(2);
      expect(useAppStore.getState().activeTrackId).toBe(id2);
      expect(useAppStore.getState().tracks[1].name).toBe("Custom");
    });

    it("removeTrack removes and clears activeTrackId if needed", () => {
      const id = useAppStore.getState().addTrack();
      useAppStore.getState().removeTrack(id);
      expect(useAppStore.getState().tracks).toHaveLength(0);
      expect(useAppStore.getState().activeTrackId).toBeNull();
    });

    it("setTrackOpacity clamps [0,1]", () => {
      const id = useAppStore.getState().addTrack();
      useAppStore.getState().setTrackOpacity(id, 2);
      expect(useAppStore.getState().tracks[0].opacity).toBe(1);
    });

    it("moveTrack reorders", () => {
      useAppStore.getState().addTrack("A");
      useAppStore.getState().addTrack("B");
      useAppStore.getState().moveTrack(1, 0);
      expect(useAppStore.getState().tracks[0].name).toBe("B");
      expect(useAppStore.getState().tracks[1].name).toBe("A");
    });

    it("moveTrack ignores invalid indices", () => {
      useAppStore.getState().addTrack("A");
      useAppStore.getState().addTrack("B");
      const before = [...useAppStore.getState().tracks];
      useAppStore.getState().moveTrack(-1, 0);
      useAppStore.getState().moveTrack(0, 99);
      expect(useAppStore.getState().tracks).toEqual(before);
    });

    it("getActiveTrack returns active track or null", () => {
      expect(useAppStore.getState().getActiveTrack()).toBeNull();
      const id = useAppStore.getState().addTrack();
      expect(useAppStore.getState().getActiveTrack()?.id).toBe(id);
    });
  });

  describe("Export State", () => {
    it("setExportProgress clamps [0,100]", () => {
      useAppStore.getState().setExportProgress(150);
      expect(useAppStore.getState().exportProgress).toBe(100);
      useAppStore.getState().setExportProgress(-10);
      expect(useAppStore.getState().exportProgress).toBe(0);
    });

    it("requestExportCancel sets flag", () => {
      useAppStore.getState().requestExportCancel();
      expect(useAppStore.getState().exportCancelRequested).toBe(true);
    });

    it("resetExport clears all export state", () => {
      useAppStore.getState().setExportProgress(50);
      useAppStore.getState().setExportIsRunning(true);
      useAppStore.getState().requestExportCancel();
      useAppStore.getState().resetExport();
      expect(useAppStore.getState().exportProgress).toBe(0);
      expect(useAppStore.getState().exportIsRunning).toBe(false);
      expect(useAppStore.getState().exportCancelRequested).toBe(false);
    });

    it("setWatermark merges partial settings", () => {
      useAppStore.getState().setWatermark({ text: "Test" });
      expect(useAppStore.getState().watermark.text).toBe("Test");
    });
  });

  describe("UI State", () => {
    it("setZoom clamps to [0.1, 5]", () => {
      useAppStore.getState().setZoom(10);
      expect(useAppStore.getState().zoom).toBe(5);
      useAppStore.getState().setZoom(0);
      expect(useAppStore.getState().zoom).toBe(0.1);
    });

    it("setPlaybackSpeed clamps to [0.25, 4]", () => {
      useAppStore.getState().setPlaybackSpeed(10);
      expect(useAppStore.getState().playbackSpeed).toBe(4);
      useAppStore.getState().setPlaybackSpeed(0.1);
      expect(useAppStore.getState().playbackSpeed).toBe(0.25);
    });

    it("toggleTheme switches dark/light", () => {
      expect(useAppStore.getState().theme).toBe("dark");
      useAppStore.getState().toggleTheme();
      expect(useAppStore.getState().theme).toBe("light");
    });

    it("setInPoint/setOutPoint validate ordering", () => {
      useAppStore.getState().setInPoint(5);
      useAppStore.getState().setOutPoint(3);
      // outPoint=3 is set, but inPoint is cleared because 5 >= 3
      expect(useAppStore.getState().outPoint).toBe(3);
      expect(useAppStore.getState().inPoint).toBeNull();
      useAppStore.getState().setOutPoint(10);
      useAppStore.getState().setInPoint(15);
      // inPoint=15 is set, but outPoint is cleared because 10 <= 15
      expect(useAppStore.getState().inPoint).toBe(15);
      expect(useAppStore.getState().outPoint).toBeNull();
    });

    it("clearInOut resets both", () => {
      useAppStore.getState().setInPoint(1);
      useAppStore.getState().setOutPoint(5);
      useAppStore.getState().clearInOut();
      expect(useAppStore.getState().inPoint).toBeNull();
      expect(useAppStore.getState().outPoint).toBeNull();
    });
  });

  describe("addLUTEffect", () => {
    it("adds LUT effect with URL param", () => {
      useAppStore
        .getState()
        .setAllEffects([mockEffect("color.lut_grading", [{ id: "amount", default: 1.0 }])]);
      useAppStore.getState().addLUTEffect("file:///test.cube");
      const stack = useAppStore.getState().effectStack;
      expect(stack).toHaveLength(1);
      expect(stack[0].effectId).toBe("color.lut_grading");
      expect(stack[0].params.tLUT).toBe("file:///test.cube");
    });
  });
});
