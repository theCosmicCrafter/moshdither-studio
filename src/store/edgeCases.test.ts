import { describe, it, expect, beforeEach } from "vitest";
import { useAppStore, applyEasing, type Keyframe } from "./index";

function makeKf(time: number, value: number, easing: Keyframe["easing"] = "linear"): Keyframe {
  return { id: `kf-${time}-${value}`, time, value, easing };
}

function addEffect(): string {
  useAppStore.getState().addToStack({
    id: "test.effect",
    name: "Test",
    category: "test",
    parameters: [],
  } as never);
  const stack = useAppStore.getState().effectStack;
  return stack[stack.length - 1].id;
}

describe("Store Edge Cases", () => {
  beforeEach(() => {
    useAppStore.setState(useAppStore.getInitialState());
  });

  describe("undo/redo edge cases", () => {
    it("undo on empty history is a no-op", () => {
      const stackBefore = useAppStore.getState().effectStack;
      useAppStore.getState().undo();
      expect(useAppStore.getState().effectStack).toBe(stackBefore);
    });

    it("redo on empty future is a no-op", () => {
      const stackBefore = useAppStore.getState().effectStack;
      useAppStore.getState().redo();
      expect(useAppStore.getState().effectStack).toBe(stackBefore);
    });

    it("multiple undos restore through history", () => {
      addEffect();
      addEffect();
      addEffect();
      expect(useAppStore.getState().effectStack).toHaveLength(3);

      useAppStore.getState().undo();
      expect(useAppStore.getState().effectStack).toHaveLength(2);
      useAppStore.getState().undo();
      expect(useAppStore.getState().effectStack).toHaveLength(1);
      useAppStore.getState().undo();
      expect(useAppStore.getState().effectStack).toHaveLength(0);
    });

    it("undo after redo re-clears future", () => {
      addEffect();
      useAppStore.getState().undo();
      useAppStore.getState().redo();
      expect(useAppStore.getState().futureStacks).toHaveLength(0);
      useAppStore.getState().undo();
      expect(useAppStore.getState().futureStacks).toHaveLength(1);
    });

    it("clearStack pushes to undo history and clears future", () => {
      addEffect();
      addEffect();
      useAppStore.getState().undo(); // creates a future entry
      expect(useAppStore.getState().futureStacks.length).toBeGreaterThan(0);

      useAppStore.getState().clearStack();
      expect(useAppStore.getState().effectStack).toHaveLength(0);
      expect(useAppStore.getState().futureStacks).toHaveLength(0);
      expect(useAppStore.getState().pastStacks.length).toBeGreaterThan(0);
    });

    it("canRedo returns false after undo when no more future", () => {
      addEffect();
      useAppStore.getState().undo();
      expect(useAppStore.getState().canRedo()).toBe(true);
      useAppStore.getState().redo();
      expect(useAppStore.getState().canRedo()).toBe(false);
    });
  });

  describe("keyframe interpolation edge cases", () => {
    it("getKeyframeValue returns null for non-existent stack", () => {
      expect(useAppStore.getState().getKeyframeValue("nonexistent", "param", 0)).toBeNull();
    });

    it("getKeyframeValue returns null for non-existent param", () => {
      const id = addEffect();
      expect(useAppStore.getState().getKeyframeValue(id, "nonexistent", 0)).toBeNull();
    });

    it("getKeyframeValue returns null for empty track", () => {
      const id = addEffect();
      useAppStore.getState().setKeyframesForTrack(id, "param", []);
      expect(useAppStore.getState().getKeyframeValue(id, "param", 0)).toBeNull();
    });

    it("getKeyframeValue returns exact value at keyframe time", () => {
      const id = addEffect();
      useAppStore.getState().setKeyframesForTrack(id, "param", [
        makeKf(0, 10),
        makeKf(1, 20),
      ]);
      expect(useAppStore.getState().getKeyframeValue(id, "param", 0)).toBe(10);
      expect(useAppStore.getState().getKeyframeValue(id, "param", 1)).toBe(20);
    });

    it("getKeyframeValue clamps before first keyframe", () => {
      const id = addEffect();
      useAppStore.getState().setKeyframesForTrack(id, "param", [
        makeKf(1, 10),
        makeKf(2, 20),
      ]);
      expect(useAppStore.getState().getKeyframeValue(id, "param", 0)).toBe(10);
    });

    it("getKeyframeValue clamps after last keyframe", () => {
      const id = addEffect();
      useAppStore.getState().setKeyframesForTrack(id, "param", [
        makeKf(0, 10),
        makeKf(1, 20),
      ]);
      expect(useAppStore.getState().getKeyframeValue(id, "param", 5)).toBe(20);
    });

    it("getKeyframeValue interpolates linearly between keyframes", () => {
      const id = addEffect();
      useAppStore.getState().setKeyframesForTrack(id, "param", [
        makeKf(0, 0),
        makeKf(1, 100),
      ]);
      expect(useAppStore.getState().getKeyframeValue(id, "param", 0.5)).toBe(50);
    });

    it("getKeyframeValue applies easeIn interpolation", () => {
      const id = addEffect();
      useAppStore.getState().setKeyframesForTrack(id, "param", [
        makeKf(0, 0, "easeIn"),
        makeKf(1, 100, "linear"),
      ]);
      // easeIn at t=0.5 = 0.25, so value = 0 + 100*0.25 = 25
      expect(useAppStore.getState().getKeyframeValue(id, "param", 0.5)).toBe(25);
    });

    it("getKeyframeValue applies easeOut interpolation", () => {
      const id = addEffect();
      useAppStore.getState().setKeyframesForTrack(id, "param", [
        makeKf(0, 0, "easeOut"),
        makeKf(1, 100, "linear"),
      ]);
      // easeOut at t=0.5 = 0.75, so value = 0 + 100*0.75 = 75
      expect(useAppStore.getState().getKeyframeValue(id, "param", 0.5)).toBe(75);
    });

    it("getKeyframeValue with hold easing returns first value", () => {
      const id = addEffect();
      useAppStore.getState().setKeyframesForTrack(id, "param", [
        makeKf(0, 50, "hold"),
        makeKf(1, 100, "linear"),
      ]);
      // hold returns 0 for t, so value = 50 + (100-50)*0 = 50
      expect(useAppStore.getState().getKeyframeValue(id, "param", 0.5)).toBe(50);
    });

    it("getKeyframeValue with easeInOut at t=0.5 returns midpoint", () => {
      const id = addEffect();
      useAppStore.getState().setKeyframesForTrack(id, "param", [
        makeKf(0, 0, "easeInOut"),
        makeKf(1, 100, "linear"),
      ]);
      expect(useAppStore.getState().getKeyframeValue(id, "param", 0.5)).toBeCloseTo(50);
    });
  });

  describe("keyframe CRUD edge cases", () => {
    it("addKeyframe sorts by time", () => {
      const id = addEffect();
      useAppStore.getState().addKeyframe(id, "param", makeKf(2, 20));
      useAppStore.getState().addKeyframe(id, "param", makeKf(0, 0));
      useAppStore.getState().addKeyframe(id, "param", makeKf(1, 10));
      const val = useAppStore.getState().getKeyframeValue(id, "param", 0.5);
      expect(val).toBe(5); // between 0 and 10
    });

    // getKeyframeValue divides by (k2.time - k1.time). Nothing stops two
    // keyframes sharing a timestamp -- addKeyframe pushes and sorts without
    // deduplicating -- so that denominator can be zero, and the query time
    // itself is not validated. Both survive only because applyEasing clamps
    // its input and maps NaN to 0, which is easy to "tidy away" later. These
    // pin the behaviour so that removal shows up as a failure rather than as
    // NaN reaching a shader uniform.
    it("keyframes sharing a timestamp still interpolate to finite values", () => {
      const id = addEffect();
      useAppStore.getState().addKeyframe(id, "param", makeKf(1, 10));
      useAppStore.getState().addKeyframe(id, "param", makeKf(1, 20));
      useAppStore.getState().addKeyframe(id, "param", makeKf(2, 30));

      for (const t of [0.5, 1, 1.5, 2, 2.5]) {
        const val = useAppStore.getState().getKeyframeValue(id, "param", t);
        expect(Number.isFinite(val as number), `t=${t} produced ${val}`).toBe(true);
      }
      // Landing exactly on the duplicate resolves to the first of the pair.
      expect(useAppStore.getState().getKeyframeValue(id, "param", 1)).toBe(10);
      // Past it, interpolation runs from the second (20) toward 30.
      expect(useAppStore.getState().getKeyframeValue(id, "param", 1.5)).toBe(25);
    });

    it("non-finite query times clamp to the track ends instead of returning NaN", () => {
      const id = addEffect();
      useAppStore.getState().addKeyframe(id, "param", makeKf(0, 5));
      useAppStore.getState().addKeyframe(id, "param", makeKf(10, 15));

      expect(useAppStore.getState().getKeyframeValue(id, "param", NaN)).toBe(5);
      expect(useAppStore.getState().getKeyframeValue(id, "param", Infinity)).toBe(15);
      expect(useAppStore.getState().getKeyframeValue(id, "param", -Infinity)).toBe(5);
      expect(useAppStore.getState().getKeyframeValue(id, "param", -5)).toBe(5);
    });

    it("removeKeyframe on non-existent entry is a no-op", () => {
      const id = addEffect();
      useAppStore.getState().removeKeyframe(id, "param", "nonexistent");
      // Should not throw
      expect(useAppStore.getState().keyframes).toBeDefined();
    });

    it("removeKeyframe cleans up empty tracks", () => {
      const id = addEffect();
      useAppStore.getState().addKeyframe(id, "param", makeKf(0, 10));
      useAppStore.getState().removeKeyframe(id, "param", "kf-0-10");
      expect(useAppStore.getState().keyframes[id]).toBeUndefined();
    });

    it("updateKeyframe updates and re-sorts", () => {
      const id = addEffect();
      useAppStore.getState().addKeyframe(id, "param", makeKf(0, 0));
      useAppFrame_update(id);
    });

    it("clearKeyframes with no stackId clears everything", () => {
      const id = addEffect();
      useAppStore.getState().addKeyframe(id, "param", makeKf(0, 0));
      useAppStore.getState().clearKeyframes("", "param");
      expect(useAppStore.getState().keyframes).toEqual({});
    });

    it("clearKeyframes with stackId but no paramId clears all params for that stack", () => {
      const id = addEffect();
      useAppStore.getState().addKeyframe(id, "param1", makeKf(0, 0));
      useAppStore.getState().addKeyframe(id, "param2", makeKf(0, 1));
      useAppStore.getState().clearKeyframes(id, "");
      expect(useAppStore.getState().keyframes[id]).toBeUndefined();
    });

    it("setKeyframesForTrack sorts unsorted input", () => {
      const id = addEffect();
      useAppStore.getState().setKeyframesForTrack(id, "param", [
        makeKf(2, 20),
        makeKf(0, 0),
        makeKf(1, 10),
      ]);
      // If sorted, value at 0.5 should be 5 (between 0 and 10)
      expect(useAppStore.getState().getKeyframeValue(id, "param", 0.5)).toBe(5);
    });
  });

  describe("playhead (currentTime) edge cases", () => {
    // currentTime is fed to shader uniforms as animTime and used to index
    // sam3FrameMasks, so a non-finite value corrupts the render silently
    // instead of throwing. setDuration/setInPoint/setOutPoint were already
    // guarded; this one was not.
    it("rejects non-finite times instead of storing them", () => {
      const s = useAppStore.getState();
      for (const bad of [NaN, Infinity, -Infinity]) {
        s.setCurrentTime(bad);
        expect(Number.isFinite(useAppStore.getState().currentTime)).toBe(true);
      }
    });

    it("never stores a negative playhead", () => {
      useAppStore.getState().setCurrentTime(-42);
      expect(useAppStore.getState().currentTime).toBe(0);
    });

    // Deliberately NOT clamped to duration: duration arrives asynchronously as
    // media loads, so clamping here would truncate a seek that lands first.
    // The playback loop wraps to 0 before calling this, and the call sites that
    // know the end (Go to end, frame-step) bound it themselves.
    it("allows a time beyond the current duration, which loads may not have set yet", () => {
      useAppStore.getState().setDuration(5);
      useAppStore.getState().setCurrentTime(30);
      expect(useAppStore.getState().currentTime).toBe(30);
    });
  });

  describe("audio state edge cases", () => {
    it("setAudioVolume clamps to [0, 1]", () => {
      useAppStore.getState().setAudioVolume(0.5);
      expect(useAppStore.getState().audioVolume).toBe(0.5);
      useAppStore.getState().setAudioVolume(-1);
      expect(useAppStore.getState().audioVolume).toBe(0);
      useAppStore.getState().setAudioVolume(2);
      expect(useAppStore.getState().audioVolume).toBe(1);
    });

    it("setAudioVolume handles exactly 0 and 1", () => {
      useAppStore.getState().setAudioVolume(0);
      expect(useAppStore.getState().audioVolume).toBe(0);
      useAppStore.getState().setAudioVolume(1);
      expect(useAppStore.getState().audioVolume).toBe(1);
    });

    it("setAudioBinding adds binding", () => {
      const id = addEffect();
      const binding = {
        source: "bass",
        inputMin: 0,
        inputMax: 1,
        outputMin: 0,
        outputMax: 100,
        attack: 0.1,
        decay: 0.5,
        gateEnabled: false,
        gateThreshold: 0,
        invert: false,
      };
      useAppStore.getState().setAudioBinding(id, "intensity", binding);
      expect(useAppStore.getState().audioBindings[id]?.intensity).toEqual(binding);
    });

    it("setAudioBinding with null removes binding", () => {
      const id = addEffect();
      useAppStore.getState().setAudioBinding(id, "intensity", {
        source: "bass", inputMin: 0, inputMax: 1, outputMin: 0, outputMax: 100,
        attack: 0.1, decay: 0.5, gateEnabled: false, gateThreshold: 0, invert: false,
      });
      useAppStore.getState().setAudioBinding(id, "intensity", null);
      expect(useAppStore.getState().audioBindings[id]?.intensity).toBeUndefined();
    });

    it("setAudioBinding for different params on same stack item are independent", () => {
      const id = addEffect();
      useAppStore.getState().setAudioBinding(id, "param1", {
        source: "bass", inputMin: 0, inputMax: 1, outputMin: 0, outputMax: 100,
        attack: 0.1, decay: 0.5, gateEnabled: false, gateThreshold: 0, invert: false,
      });
      useAppStore.getState().setAudioBinding(id, "param2", {
        source: "treble", inputMin: 0, inputMax: 1, outputMin: 0, outputMax: 50,
        attack: 0.2, decay: 0.3, gateEnabled: true, gateThreshold: 0.5, invert: true,
      });
      const bindings = useAppStore.getState().audioBindings[id];
      expect(bindings?.param1.source).toBe("bass");
      expect(bindings?.param2.source).toBe("treble");
      expect(bindings?.param2.invert).toBe(true);
    });
  });

  describe("applyEasing edge cases", () => {
    it("returns 0 for hold at any t", () => {
      expect(applyEasing(0, "hold")).toBe(0);
      expect(applyEasing(0.5, "hold")).toBe(0);
      expect(applyEasing(1, "hold")).toBe(0);
    });

    it("returns t for linear", () => {
      expect(applyEasing(0, "linear")).toBe(0);
      expect(applyEasing(0.5, "linear")).toBe(0.5);
      expect(applyEasing(1, "linear")).toBe(1);
    });

    it("easeIn at t=0 is 0, at t=1 is 1", () => {
      expect(applyEasing(0, "easeIn")).toBe(0);
      expect(applyEasing(1, "easeIn")).toBe(1);
    });

    it("easeOut at t=0 is 0, at t=1 is 1", () => {
      expect(applyEasing(0, "easeOut")).toBe(0);
      expect(applyEasing(1, "easeOut")).toBe(1);
    });

    it("easeInOut at t=0 is 0, at t=1 is 1", () => {
      expect(applyEasing(0, "easeInOut")).toBe(0);
      expect(applyEasing(1, "easeInOut")).toBe(1);
    });

    it("easeInOut uses easeIn for t<0.5 and easeOut for t>=0.5", () => {
      const low = applyEasing(0.25, "easeInOut");
      const high = applyEasing(0.75, "easeInOut");
      // At 0.25: 2*0.25*0.25 = 0.125
      expect(low).toBeCloseTo(0.125);
      // At 0.75: 1 - pow(-2*0.75+2, 2)/2 = 1 - pow(0.5, 2)/2 = 1 - 0.125 = 0.875
      expect(high).toBeCloseTo(0.875);
    });
  });

  describe("export state edge cases", () => {
    it("setExportProgress at exactly 0 and 100", () => {
      useAppStore.getState().setExportProgress(0);
      expect(useAppStore.getState().exportProgress).toBe(0);
      useAppStore.getState().setExportProgress(100);
      expect(useAppStore.getState().exportProgress).toBe(100);
    });

    it("setExportProgress at 99.99 does not clamp", () => {
      useAppStore.getState().setExportProgress(99.99);
      expect(useAppStore.getState().exportProgress).toBe(99.99);
    });

    it("resetExport after partial progress", () => {
      useAppStore.getState().setExportProgress(42);
      useAppStore.getState().setExportIsRunning(true);
      useAppStore.getState().requestExportCancel();
      useAppStore.getState().resetExport();
      expect(useAppStore.getState().exportProgress).toBe(0);
      expect(useAppStore.getState().exportIsRunning).toBe(false);
      expect(useAppStore.getState().exportCancelRequested).toBe(false);
    });
  });
});

// Helper function to avoid lint issues with inline code
function useAppFrame_update(id: string) {
  useAppStore.getState().updateKeyframe(id, "param", "kf-0-0", { time: 1.5, value: 50 });
  // After update, keyframe should be at time 1.5
  const val = useAppStore.getState().getKeyframeValue(id, "param", 1.5);
  expect(val).toBe(50);
}
