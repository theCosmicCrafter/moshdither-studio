import { describe, it, expect, beforeEach } from "vitest";
import { useAppStore } from "./index";

describe("Store Advanced Edge Cases", () => {
  beforeEach(() => {
    useAppStore.setState(useAppStore.getInitialState());
  });

  // ── Zoom clamping ──
  describe("zoom clamping", () => {
    it("clamps zoom below 0.1 to 0.1", () => {
      useAppStore.getState().setZoom(0.01);
      expect(useAppStore.getState().zoom).toBe(0.1);
    });

    it("clamps zoom above 5 to 5", () => {
      useAppStore.getState().setZoom(10);
      expect(useAppStore.getState().zoom).toBe(5);
    });

    it("accepts zoom exactly 0.1", () => {
      useAppStore.getState().setZoom(0.1);
      expect(useAppStore.getState().zoom).toBe(0.1);
    });

    it("accepts zoom exactly 5", () => {
      useAppStore.getState().setZoom(5);
      expect(useAppStore.getState().zoom).toBe(5);
    });

    it("accepts zoom=1 (default)", () => {
      useAppStore.getState().setZoom(1);
      expect(useAppStore.getState().zoom).toBe(1);
    });

    it("handles NaN zoom (clamped to fallback)", () => {
      useAppStore.getState().setZoom(NaN);
      const zoom = useAppStore.getState().zoom;
      // clampFinite returns fallback (1) for NaN
      expect(zoom).toBe(1);
    });

    it("handles negative zoom", () => {
      useAppStore.getState().setZoom(-1);
      expect(useAppStore.getState().zoom).toBe(0.1);
    });
  });

  // ── Playback speed clamping ──
  describe("playback speed clamping", () => {
    it("clamps speed below 0.25 to 0.25", () => {
      useAppStore.getState().setPlaybackSpeed(0.01);
      expect(useAppStore.getState().playbackSpeed).toBe(0.25);
    });

    it("clamps speed above 4 to 4", () => {
      useAppStore.getState().setPlaybackSpeed(10);
      expect(useAppStore.getState().playbackSpeed).toBe(4);
    });

    it("accepts speed exactly 0.25", () => {
      useAppStore.getState().setPlaybackSpeed(0.25);
      expect(useAppStore.getState().playbackSpeed).toBe(0.25);
    });

    it("accepts speed exactly 4", () => {
      useAppStore.getState().setPlaybackSpeed(4);
      expect(useAppStore.getState().playbackSpeed).toBe(4);
    });

    it("accepts speed=1 (normal)", () => {
      useAppStore.getState().setPlaybackSpeed(1);
      expect(useAppStore.getState().playbackSpeed).toBe(1);
    });

    it("accepts speed=0.5 (slow motion)", () => {
      useAppStore.getState().setPlaybackSpeed(0.5);
      expect(useAppStore.getState().playbackSpeed).toBe(0.5);
    });

    it("accepts speed=2 (fast forward)", () => {
      useAppStore.getState().setPlaybackSpeed(2);
      expect(useAppStore.getState().playbackSpeed).toBe(2);
    });
  });

  // ── Brush size clamping ──
  describe("brush size clamping", () => {
    it("clamps brush size below 1 to 1", () => {
      useAppStore.getState().setBrushSize(0);
      expect(useAppStore.getState().brushSize).toBe(1);
    });

    it("clamps brush size above 200 to 200", () => {
      useAppStore.getState().setBrushSize(500);
      expect(useAppStore.getState().brushSize).toBe(200);
    });

    it("accepts brush size exactly 1", () => {
      useAppStore.getState().setBrushSize(1);
      expect(useAppStore.getState().brushSize).toBe(1);
    });

    it("accepts brush size exactly 200", () => {
      useAppStore.getState().setBrushSize(200);
      expect(useAppStore.getState().brushSize).toBe(200);
    });

    it("accepts default brush size 20", () => {
      useAppStore.getState().setBrushSize(20);
      expect(useAppStore.getState().brushSize).toBe(20);
    });
  });

  // ── SAM3 mask index clamping ──
  describe("SAM3 mask index clamping", () => {
    it("clamps negative index to 0", () => {
      useAppStore.getState().setSam3Masks(["m0", "m1", "m2"], [0.9, 0.8, 0.7]);
      useAppStore.getState().setSam3MaskIndex(-5);
      expect(useAppStore.getState().sam3MaskIndex).toBe(0);
    });

    it("clamps index above array length to last", () => {
      useAppStore.getState().setSam3Masks(["m0", "m1", "m2"], [0.9, 0.8, 0.7]);
      useAppStore.getState().setSam3MaskIndex(99);
      expect(useAppStore.getState().sam3MaskIndex).toBe(2);
    });

    it("index 0 selects first mask", () => {
      useAppStore.getState().setSam3Masks(["first", "second"], [0.9, 0.8]);
      useAppStore.getState().setSam3MaskIndex(0);
      expect(useAppStore.getState().sam3MaskIndex).toBe(0);
      expect(useAppStore.getState().activeMask).toBe("first");
    });

    it("index on empty masks array sets activeMask to null", () => {
      useAppStore.getState().setSam3Masks([], []);
      useAppStore.getState().setSam3MaskIndex(0);
      // Math.max(0, Math.min(-1, 0)) → Math.max(0, -1) → 0
      // sam3Masks[0] → undefined → null
      expect(useAppStore.getState().sam3MaskIndex).toBe(0);
      expect(useAppStore.getState().activeMask).toBeNull();
    });

    it("setSam3Masks resets index to 0 and sets activeMask to first", () => {
      useAppStore.getState().setSam3Masks(["a", "b"], [0.9, 0.8]);
      useAppStore.getState().setSam3MaskIndex(1);
      expect(useAppStore.getState().sam3MaskIndex).toBe(1);
      // Now set new masks
      useAppStore.getState().setSam3Masks(["x", "y", "z"], [0.9, 0.8, 0.7]);
      expect(useAppStore.getState().sam3MaskIndex).toBe(0);
      expect(useAppStore.getState().activeMask).toBe("x");
    });

    it("setSam3Masks with empty array sets activeMask to null", () => {
      useAppStore.getState().setSam3Masks(["existing"], [0.9]);
      expect(useAppStore.getState().activeMask).toBe("existing");
      useAppStore.getState().setSam3Masks([], []);
      expect(useAppStore.getState().activeMask).toBeNull();
    });
  });

  // ── Track management edge cases ──
  describe("track management", () => {
    it("addTrack returns unique track ID", () => {
      const id1 = useAppStore.getState().addTrack("Track A");
      const id2 = useAppStore.getState().addTrack("Track B");
      expect(id1).not.toBe(id2);
      expect(id1).toMatch(/^track-\d+$/);
      expect(id2).toMatch(/^track-\d+$/);
    });

    it("addTrack with no name uses default naming", () => {
      const id = useAppStore.getState().addTrack("");
      const track = useAppStore.getState().tracks.find((t) => t.id === id);
      expect(track).toBeDefined();
      expect(track!.name).toBe("Track 1");
    });

    it("addTrack sets it as active", () => {
      const id = useAppStore.getState().addTrack("Test");
      expect(useAppStore.getState().activeTrackId).toBe(id);
    });

    it("removeTrack clears activeTrackId if it was active", () => {
      const id = useAppStore.getState().addTrack("Test");
      expect(useAppStore.getState().activeTrackId).toBe(id);
      useAppStore.getState().removeTrack(id);
      expect(useAppStore.getState().activeTrackId).toBeNull();
    });

    it("removeTrack preserves activeTrackId if different track removed", () => {
      const id1 = useAppStore.getState().addTrack("A");
      const id2 = useAppStore.getState().addTrack("B");
      useAppStore.getState().setActiveTrack(id1);
      useAppStore.getState().removeTrack(id2);
      expect(useAppStore.getState().activeTrackId).toBe(id1);
    });

    it("setTrackOpacity clamps to 0-1", () => {
      const id = useAppStore.getState().addTrack("T");
      useAppStore.getState().setTrackOpacity(id, -1);
      expect(useAppStore.getState().tracks[0].opacity).toBe(0);
      useAppStore.getState().setTrackOpacity(id, 2);
      expect(useAppStore.getState().tracks[0].opacity).toBe(1);
    });

    it("setTrackOpacity accepts 0 and 1", () => {
      const id = useAppStore.getState().addTrack("T");
      useAppStore.getState().setTrackOpacity(id, 0);
      expect(useAppStore.getState().tracks[0].opacity).toBe(0);
      useAppStore.getState().setTrackOpacity(id, 1);
      expect(useAppStore.getState().tracks[0].opacity).toBe(1);
    });

    it("getActiveTrack returns null when no tracks", () => {
      expect(useAppStore.getState().getActiveTrack()).toBeNull();
    });

    it("getActiveTrack returns the active track", () => {
      const id = useAppStore.getState().addTrack("Active");
      const track = useAppStore.getState().getActiveTrack();
      expect(track).not.toBeNull();
      expect(track!.id).toBe(id);
    });
  });

  // ── moveTrack bounds ──
  describe("moveTrack bounds", () => {
    it("moveTrack with negative fromIndex does nothing", () => {
      useAppStore.getState().addTrack("A");
      useAppStore.getState().addTrack("B");
      const original = [...useAppStore.getState().tracks];
      useAppStore.getState().moveTrack(-1, 0);
      expect(useAppStore.getState().tracks).toEqual(original);
    });

    it("moveTrack with out-of-bounds toIndex does nothing", () => {
      useAppStore.getState().addTrack("A");
      useAppStore.getState().addTrack("B");
      const original = [...useAppStore.getState().tracks];
      useAppStore.getState().moveTrack(0, 99);
      expect(useAppStore.getState().tracks).toEqual(original);
    });

    it("moveTrack with fromIndex >= length does nothing", () => {
      useAppStore.getState().addTrack("A");
      const original = [...useAppStore.getState().tracks];
      useAppStore.getState().moveTrack(5, 0);
      expect(useAppStore.getState().tracks).toEqual(original);
    });

    it("moveTrack swaps correctly for valid indices", () => {
      useAppStore.getState().addTrack("A");
      useAppStore.getState().addTrack("B");
      useAppStore.getState().addTrack("C");
      useAppStore.getState().moveTrack(0, 2);
      const tracks = useAppStore.getState().tracks;
      expect(tracks[0].name).toBe("B");
      expect(tracks[1].name).toBe("C");
      expect(tracks[2].name).toBe("A");
    });

    it("moveTrack same index is no-op", () => {
      useAppStore.getState().addTrack("A");
      useAppStore.getState().addTrack("B");
      const original = [...useAppStore.getState().tracks];
      useAppStore.getState().moveTrack(0, 0);
      expect(useAppStore.getState().tracks).toEqual(original);
    });
  });

  // ── Audio volume clamping ──
  describe("audio volume clamping", () => {
    it("clamps negative volume to 0", () => {
      useAppStore.getState().setAudioVolume(-1);
      expect(useAppStore.getState().audioVolume).toBe(0);
    });

    it("clamps volume >1 to 1", () => {
      useAppStore.getState().setAudioVolume(5);
      expect(useAppStore.getState().audioVolume).toBe(1);
    });

    it("accepts volume=0 (mute)", () => {
      useAppStore.getState().setAudioVolume(0);
      expect(useAppStore.getState().audioVolume).toBe(0);
    });

    it("accepts volume=1 (max)", () => {
      useAppStore.getState().setAudioVolume(1);
      expect(useAppStore.getState().audioVolume).toBe(1);
    });

    it("accepts volume=0.5 (half)", () => {
      useAppStore.getState().setAudioVolume(0.5);
      expect(useAppStore.getState().audioVolume).toBe(0.5);
    });
  });

  // ── Audio binding management ──
  describe("audio binding management", () => {
    it("setAudioBinding adds binding for stack+param", () => {
      useAppStore.getState().setAudioBinding("stack-1", "intensity", {
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
      });
      const bindings = useAppStore.getState().audioBindings;
      expect(bindings["stack-1"]).toBeDefined();
      expect(bindings["stack-1"].intensity).toBeDefined();
    });

    it("setAudioBinding with null removes binding", () => {
      useAppStore.getState().setAudioBinding("stack-1", "intensity", {
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
      });
      expect(useAppStore.getState().audioBindings["stack-1"].intensity).toBeDefined();
      useAppStore.getState().setAudioBinding("stack-1", "intensity", null);
      expect(useAppStore.getState().audioBindings["stack-1"].intensity).toBeUndefined();
    });

    it("setAudioBinding preserves other params on same stack", () => {
      useAppStore.getState().setAudioBinding("stack-1", "paramA", {
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
      });
      useAppStore.getState().setAudioBinding("stack-1", "paramB", {
        source: "treble",
        inputMin: 0,
        inputMax: 1,
        outputMin: 0,
        outputMax: 50,
        attack: 0.02,
        decay: 0.2,
        gateEnabled: true,
        gateThreshold: 0.3,
        invert: true,
      });
      const bindings = useAppStore.getState().audioBindings;
      expect(bindings["stack-1"].paramA).toBeDefined();
      expect(bindings["stack-1"].paramB).toBeDefined();
      expect((bindings["stack-1"].paramB as { invert: boolean }).invert).toBe(true);
    });
  });

  // ── Stack item selection after removal ──
  describe("stack item selection after removal", () => {
    const mockEffect = {
      id: "test.effect",
      name: "Test",
      category: "test",
      media_type: "both" as const,
      parameters: [],
    };

    it("removing selected item selects last remaining", () => {
      useAppStore.getState().addToStack(mockEffect);
      useAppStore.getState().addToStack(mockEffect);
      useAppStore.getState().addToStack(mockEffect);
      const stack = useAppStore.getState().effectStack;
      const lastId = stack[stack.length - 1].id;
      useAppStore.getState().selectStackItem(lastId);
      useAppStore.getState().removeFromStack(lastId);
      const newStack = useAppStore.getState().effectStack;
      expect(useAppStore.getState().selectedStackId).toBe(newStack[newStack.length - 1].id);
    });

    it("removing non-selected item preserves selection", () => {
      useAppStore.getState().addToStack(mockEffect);
      useAppStore.getState().addToStack(mockEffect);
      const stack = useAppStore.getState().effectStack;
      const firstId = stack[0].id;
      const secondId = stack[1].id;
      useAppStore.getState().selectStackItem(firstId);
      useAppStore.getState().removeFromStack(secondId);
      expect(useAppStore.getState().selectedStackId).toBe(firstId);
    });

    it("removing last item sets selectedStackId to null", () => {
      useAppStore.getState().addToStack(mockEffect);
      const stack = useAppStore.getState().effectStack;
      useAppStore.getState().removeFromStack(stack[0].id);
      expect(useAppStore.getState().selectedStackId).toBeNull();
    });
  });

  // ── clearStack ──
  describe("clearStack", () => {
    it("clears stack and sets selectedStackId to null", () => {
      useAppStore.getState().addToStack({
        id: "test",
        name: "Test",
        category: "test",
        media_type: "both",
        parameters: [],
      } as never);
      useAppStore.getState().clearStack();
      expect(useAppStore.getState().effectStack).toEqual([]);
      expect(useAppStore.getState().selectedStackId).toBeNull();
    });

    it("clearStack pushes to pastStacks for undo", () => {
      useAppStore.getState().addToStack({
        id: "test",
        name: "Test",
        category: "test",
        media_type: "both",
        parameters: [],
      } as never);
      expect(useAppStore.getState().pastStacks.length).toBe(1); // addToStack pushes
      useAppStore.getState().clearStack();
      expect(useAppStore.getState().pastStacks.length).toBe(2); // clearStack pushes
      // Undo should restore the stack
      useAppStore.getState().undo();
      expect(useAppStore.getState().effectStack.length).toBe(1);
    });
  });

  // ── Export progress with NaN ──
  describe("export progress NaN handling", () => {
    it("NaN progress clamps to 0 via clampFinite", () => {
      useAppStore.getState().setExportProgress(NaN);
      const progress = useAppStore.getState().exportProgress;
      // clampFinite returns fallback (0) for NaN
      expect(progress).toBe(0);
    });
  });
});
