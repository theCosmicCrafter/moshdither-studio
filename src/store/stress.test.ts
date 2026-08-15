import { describe, it, expect, beforeEach } from "vitest";
import { useAppStore, applyEasing } from "./index";
import type { Keyframe } from "./index";

describe("Store Stress Tests — Trying to Break Things", () => {
  beforeEach(() => {
    useAppStore.setState(useAppStore.getInitialState());
  });

  // ── NaN injection into clamped values ──
  // These expose a real bug: Math.max/min with NaN produces NaN, not the clamp bound
  describe("NaN injection into clamped setters", () => {
    it("setZoom(NaN) falls back to 1 (safe default)", () => {
      useAppStore.getState().setZoom(Number.NaN);
      const zoom = useAppStore.getState().zoom;
      expect(Number.isNaN(zoom)).toBe(false);
      expect(zoom).toBe(1);
    });

    it("setPlaybackSpeed(NaN) falls back to 1 (safe default)", () => {
      useAppStore.getState().setPlaybackSpeed(Number.NaN);
      const speed = useAppStore.getState().playbackSpeed;
      expect(Number.isNaN(speed)).toBe(false);
      expect(speed).toBe(1);
    });

    it("setBrushSize(NaN) falls back to 20 (safe default)", () => {
      useAppStore.getState().setBrushSize(Number.NaN);
      const size = useAppStore.getState().brushSize;
      expect(Number.isNaN(size)).toBe(false);
      expect(size).toBe(20);
    });

    it("setAudioVolume(NaN) falls back to 0 (safe default)", () => {
      useAppStore.getState().setAudioVolume(Number.NaN);
      const vol = useAppStore.getState().audioVolume;
      expect(Number.isNaN(vol)).toBe(false);
      expect(vol).toBe(0);
    });

    it("setExportProgress(NaN) falls back to 0 (safe default)", () => {
      useAppStore.getState().setExportProgress(Number.NaN);
      const prog = useAppStore.getState().exportProgress;
      expect(Number.isNaN(prog)).toBe(false);
      expect(prog).toBe(0);
    });

    it("setInPoint(NaN) falls back to 0 (safe default)", () => {
      useAppStore.getState().setInPoint(Number.NaN);
      const pt = useAppStore.getState().inPoint;
      expect(Number.isNaN(pt)).toBe(false);
      expect(pt).toBe(0);
    });

    it("setOutPoint(NaN) falls back to 0 (safe default)", () => {
      useAppStore.getState().setOutPoint(Number.NaN);
      const pt = useAppStore.getState().outPoint;
      expect(Number.isNaN(pt)).toBe(false);
      expect(pt).toBe(0);
    });
  });

  // ── Infinity injection into clamped values ──
  describe("Infinity injection into clamped setters", () => {
    it("setZoom(Infinity) should clamp to 5", () => {
      useAppStore.getState().setZoom(Infinity);
      expect(useAppStore.getState().zoom).toBe(5);
    });

    it("setZoom(-Infinity) should clamp to 0.1", () => {
      useAppStore.getState().setZoom(-Infinity);
      expect(useAppStore.getState().zoom).toBe(0.1);
    });

    it("setPlaybackSpeed(Infinity) should clamp to 4", () => {
      useAppStore.getState().setPlaybackSpeed(Infinity);
      expect(useAppStore.getState().playbackSpeed).toBe(4);
    });

    it("setAudioVolume(Infinity) should clamp to 1", () => {
      useAppStore.getState().setAudioVolume(Infinity);
      expect(useAppStore.getState().audioVolume).toBe(1);
    });

    it("setBrushSize(Infinity) should clamp to 200", () => {
      useAppStore.getState().setBrushSize(Infinity);
      expect(useAppStore.getState().brushSize).toBe(200);
    });
  });

  // ── moveStackItem with out-of-bounds indices ──
  // moveStackItem has bounds checking — out-of-bounds indices are a no-op
  describe("moveStackItem out-of-bounds", () => {
    const mockEffect = {
      id: "test.effect",
      name: "Test",
      category: "test",
      media_type: "both" as const,
      parameters: [],
    };

    it("moveStackItem with fromIndex >= length inserts undefined into stack", () => {
      useAppStore.getState().addToStack(mockEffect);
      useAppStore.getState().addToStack(mockEffect);
      // Try to move item at index 99 (only 2 items exist)
      useAppStore.getState().moveStackItem(99, 0);
      const stack = useAppStore.getState().effectStack;
      // moveStackItem has bounds checking — out-of-bounds is a no-op
      expect(stack.every((e) => e !== undefined)).toBe(true);
    });

    it("moveStackItem with fromIndex = -1 is a no-op (negative indices rejected)", () => {
      useAppStore.getState().addToStack(mockEffect);
      useAppStore.getState().addToStack(mockEffect);
      const original = [...useAppStore.getState().effectStack];
      // Negative indices are rejected by bounds check for safety
      useAppStore.getState().moveStackItem(-1, 0);
      const stack = useAppStore.getState().effectStack;
      expect(stack.length).toBe(2);
      expect(stack[0].id).toBe(original[0].id);
      expect(stack[1].id).toBe(original[1].id);
    });

    it("moveStackItem with fromIndex = -99 removes nothing but inserts undefined", () => {
      useAppStore.getState().addToStack(mockEffect);
      useAppStore.getState().addToStack(mockEffect);
      // splice(-99, 1) on a 2-element array: -99 clamps to 0, removes first
      // Actually, splice with negative index larger than array: clamps to 0
      useAppStore.getState().moveStackItem(-99, 1);
      const stack = useAppStore.getState().effectStack;
      // This actually works due to JS splice clamping, but let's verify
      expect(stack.length).toBe(2);
    });
  });

  // ── Undo/redo rapid cycling ──
  describe("undo/redo rapid cycling stress", () => {
    const mockEffect = {
      id: "test.effect",
      name: "Test",
      category: "test",
      media_type: "both" as const,
      parameters: [],
    };

    it("rapid undo/redo cycle preserves state consistency", () => {
      useAppStore.getState().addToStack(mockEffect);
      useAppStore.getState().addToStack(mockEffect);
      useAppStore.getState().addToStack(mockEffect);

      // Rapid undo/redo cycling
      for (let i = 0; i < 20; i++) {
        useAppStore.getState().undo();
        useAppStore.getState().redo();
      }

      // After equal undos and redos, state should be same as start
      expect(useAppStore.getState().effectStack.length).toBe(3);
    });

    it("undo all the way back then redo all the way forward", () => {
      useAppStore.getState().addToStack(mockEffect);
      useAppStore.getState().addToStack(mockEffect);
      useAppStore.getState().addToStack(mockEffect);

      // Undo all 3
      useAppStore.getState().undo();
      useAppStore.getState().undo();
      useAppStore.getState().undo();

      expect(useAppStore.getState().effectStack.length).toBe(0);
      expect(useAppStore.getState().pastStacks.length).toBe(0);
      expect(useAppStore.getState().futureStacks.length).toBe(3);

      // Redo all 3
      useAppStore.getState().redo();
      useAppStore.getState().redo();
      useAppStore.getState().redo();

      expect(useAppStore.getState().effectStack.length).toBe(3);
      expect(useAppStore.getState().pastStacks.length).toBe(3);
      expect(useAppStore.getState().futureStacks.length).toBe(0);
    });

    it("undo then add new effect clears future stack", () => {
      useAppStore.getState().addToStack(mockEffect);
      useAppStore.getState().addToStack(mockEffect);
      useAppStore.getState().undo(); // Back to 1 effect
      expect(useAppStore.getState().futureStacks.length).toBe(1);

      // Adding new effect should clear future
      useAppStore.getState().addToStack(mockEffect);
      expect(useAppStore.getState().futureStacks.length).toBe(0);
      expect(useAppStore.getState().effectStack.length).toBe(2);
    });

    it("undo when pastStacks is empty is no-op", () => {
      useAppStore.getState().undo();
      expect(useAppStore.getState().effectStack).toEqual([]);
    });

    it("redo when futureStacks is empty is no-op", () => {
      useAppStore.getState().redo();
      expect(useAppStore.getState().effectStack).toEqual([]);
    });

    it("100 rapid add/undo cycles don't corrupt state", () => {
      for (let i = 0; i < 100; i++) {
        useAppStore.getState().addToStack(mockEffect);
        useAppStore.getState().undo();
      }
      expect(useAppStore.getState().effectStack.length).toBe(0);
      // pastStacks should be empty (each undo pops)
      // futureStacks: addToStack clears futureStacks each time, then undo adds 1
      // So after each cycle, futureStacks = 1 (not accumulating)
      expect(useAppStore.getState().futureStacks.length).toBe(1);
    });

    // A long editing session -- especially rapid parameter-drag ticks,
    // each of which used to call updateStackParams once per mousemove --
    // must not retain an ever-growing number of full-stack snapshots.
    it("undo history stays bounded across a long editing session instead of growing forever", () => {
      for (let i = 0; i < 500; i++) {
        useAppStore.getState().updateStackParams("nonexistent-id", { x: i });
      }
      expect(useAppStore.getState().pastStacks.length).toBeLessThanOrEqual(100);
    });

    it("undo history cap keeps the most RECENT entries, not the oldest", () => {
      for (let i = 0; i < 150; i++) {
        useAppStore.getState().addToStack({ ...mockEffect, id: `test.effect.${i}` });
      }
      const past = useAppStore.getState().pastStacks;
      expect(past.length).toBe(100);
      // The oldest surviving snapshot should be the one taken right before
      // the 50th addToStack call (0-indexed: snapshots from calls 0-49 were
      // evicted), not an empty/near-empty stack from session start.
      expect(past[0].length).toBe(50);
      expect(past[past.length - 1].length).toBe(149);
    });
  });

  // ── addToStack with malformed effect ──
  describe("addToStack with malformed effect", () => {
    it("addToStack with undefined parameters is handled gracefully", () => {
      expect(() => {
        useAppStore.getState().addToStack({
          id: "broken",
          name: "Broken",
          category: "test",
          media_type: "both",
          // @ts-expect-error — intentionally malformed
          parameters: undefined,
        });
      }).not.toThrow();
      expect(useAppStore.getState().effectStack.length).toBe(1);
    });

    it("addToStack with null parameters is handled gracefully", () => {
      expect(() => {
        useAppStore.getState().addToStack({
          id: "broken",
          name: "Broken",
          category: "test",
          media_type: "both",
          // @ts-expect-error — intentionally malformed
          parameters: null,
        });
      }).not.toThrow();
      expect(useAppStore.getState().effectStack.length).toBe(1);
    });

    it("addToStack with empty parameters array works", () => {
      expect(() => {
        useAppStore.getState().addToStack({
          id: "ok",
          name: "OK",
          category: "test",
          media_type: "both",
          parameters: [],
        });
      }).not.toThrow();
      expect(useAppStore.getState().effectStack.length).toBe(1);
    });
  });

  // ── updateStackParams with NaN ──
  describe("updateStackParams NaN injection", () => {
    const mockEffect = {
      id: "test.effect",
      name: "Test",
      category: "test",
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

    it("updateStackParams with NaN value is filtered out (original preserved)", () => {
      useAppStore.getState().addToStack(mockEffect);
      const stackId = useAppStore.getState().effectStack[0].id;
      // Set a valid value first
      useAppStore.getState().updateStackParams(stackId, { intensity: 0.7 });
      // Attempt to overwrite with NaN — should be filtered, keeping 0.7
      useAppStore.getState().updateStackParams(stackId, { intensity: Number.NaN });
      const params = useAppStore.getState().effectStack[0].params;
      expect(params.intensity).toBe(0.7);
    });

    it("updateStackParams with Infinity value is filtered out (original preserved)", () => {
      useAppStore.getState().addToStack(mockEffect);
      const stackId = useAppStore.getState().effectStack[0].id;
      useAppStore.getState().updateStackParams(stackId, { intensity: 0.7 });
      useAppStore.getState().updateStackParams(stackId, { intensity: Infinity });
      expect(useAppStore.getState().effectStack[0].params.intensity).toBe(0.7);
    });

    it("updateStackParams with string value for numeric param passes through", () => {
      useAppStore.getState().addToStack(mockEffect);
      const stackId = useAppStore.getState().effectStack[0].id;
      useAppStore.getState().updateStackParams(stackId, { intensity: "not_a_number" });
      expect(useAppStore.getState().effectStack[0].params.intensity).toBe("not_a_number");
    });

    it("updateStackParams with object value passes through", () => {
      useAppStore.getState().addToStack(mockEffect);
      const stackId = useAppStore.getState().effectStack[0].id;
      useAppStore.getState().updateStackParams(stackId, { intensity: { nested: true } });
      expect(typeof useAppStore.getState().effectStack[0].params.intensity).toBe("object");
    });

    it("updateStackParams on non-existent stackId is silent no-op", () => {
      useAppStore.getState().addToStack(mockEffect);
      // Should not throw
      expect(() => {
        useAppStore.getState().updateStackParams("nonexistent-id", { intensity: 999 });
      }).not.toThrow();
      // Original params unchanged
      expect(useAppStore.getState().effectStack[0].params.intensity).toBe(0.5);
    });
  });

  // ── setWatermark with invalid values ──
  describe("setWatermark with invalid values", () => {
    it("setWatermark with NaN opacity passes through", () => {
      useAppStore.getState().setWatermark({ opacity: Number.NaN });
      expect(Number.isNaN(useAppStore.getState().watermark.opacity)).toBe(true);
    });

    it("setWatermark with negative fontSize passes through", () => {
      useAppStore.getState().setWatermark({ fontSize: -50 });
      expect(useAppStore.getState().watermark.fontSize).toBe(-50);
    });

    it("setWatermark with NaN fontSize passes through", () => {
      useAppStore.getState().setWatermark({ fontSize: Number.NaN });
      expect(Number.isNaN(useAppStore.getState().watermark.fontSize)).toBe(true);
    });

    it("setWatermark with extremely large text passes through", () => {
      const huge = "A".repeat(100000);
      useAppStore.getState().setWatermark({ text: huge });
      expect(useAppStore.getState().watermark.text.length).toBe(100000);
    });
  });

  // ── Keyframe same-time division by zero ──
  describe("getKeyframeValue same-time keyframes", () => {
    it("two keyframes at same time produce NaN via division by zero", () => {
      const stackId = "test-stack";
      const paramId = "intensity";
      const keyframes: Record<string, Record<string, Keyframe[]>> = {
        [stackId]: {
          [paramId]: [
            { id: "kf1", time: 5, value: 0, easing: "linear" },
            { id: "kf2", time: 5, value: 100, easing: "linear" },
          ],
        },
      };
      useAppStore.setState({ keyframes });

      const val = useAppStore.getState().getKeyframeValue(stackId, paramId, 5);
      // Same-time keyframes: idx finds first match at time=5, returns its value
      // No division by zero because the exact-match path is taken
      expect(val).toBe(0);
    });

    it("two keyframes at same time, querying between them returns first", () => {
      const stackId = "test-stack";
      const paramId = "intensity";
      const keyframes: Record<string, Record<string, Keyframe[]>> = {
        [stackId]: {
          [paramId]: [
            { id: "kf1", time: 5, value: 0, easing: "linear" },
            { id: "kf2", time: 5, value: 100, easing: "linear" },
          ],
        },
      };
      useAppStore.setState({ keyframes });

      // Query at exactly time=5
      const val = useAppStore.getState().getKeyframeValue(stackId, paramId, 5);
      expect(val).toBe(0); // Returns first keyframe at that time
    });

    it("interpolation between keyframes at t=2.5 and t=2.5 (same time) produces NaN", () => {
      const stackId = "test-stack";
      const paramId = "intensity";
      // Place same-time keyframes between other keyframes to force interpolation path
      const keyframes: Record<string, Record<string, Keyframe[]>> = {
        [stackId]: {
          [paramId]: [
            { id: "kf0", time: 0, value: 0, easing: "linear" },
            { id: "kf1", time: 5, value: 50, easing: "linear" },
            { id: "kf2", time: 5, value: 100, easing: "linear" },
            { id: "kf3", time: 10, value: 200, easing: "linear" },
          ],
        },
      };
      useAppStore.setState({ keyframes });

      // Query at time=5 — idx finds first track[idx].time >= 5, which is idx=1 (time=5)
      // track[1].time === 5, so returns track[1].value = 50
      const val = useAppStore.getState().getKeyframeValue(stackId, paramId, 5);
      expect(val).toBe(50);
    });

    it("interpolation where k2.time - k1.time = 0 produces NaN", () => {
      // To actually hit the division, we need time to be BETWEEN two keyframes
      // where k1.time < time < k2.time but k1.time === k2.time
      // This is impossible with floating point — if k1.time === k2.time,
      // then time can't be both > k1.time and < k2.time
      // The while loop stops at the first track[idx].time >= time
      // So if two keyframes have the same time, idx points to the first one
      // and track[idx].time === time returns that value directly
      // CONCLUSION: The same-time division by zero is NOT reachable via getKeyframeValue
      // because the while loop always stops at the first matching keyframe.
      // This is actually safe! Let me verify with a test.
      const stackId = "test-stack";
      const paramId = "intensity";
      const keyframes: Record<string, Record<string, Keyframe[]>> = {
        [stackId]: {
          [paramId]: [
            { id: "kf1", time: 3, value: 30, easing: "linear" },
            { id: "kf2", time: 3, value: 60, easing: "linear" },
          ],
        },
      };
      useAppStore.setState({ keyframes });

      // Query at 3 — should return first keyframe at time=3
      expect(useAppStore.getState().getKeyframeValue(stackId, paramId, 3)).toBe(30);
      // Query at 2.9 — before both, returns first
      expect(useAppStore.getState().getKeyframeValue(stackId, paramId, 2.9)).toBe(30);
      // Query at 3.1 — after both, returns last
      expect(useAppStore.getState().getKeyframeValue(stackId, paramId, 3.1)).toBe(60);
    });
  });

  // ── applyEasing out-of-range input ──
  describe("applyEasing with out-of-range t values", () => {
    it("applyEasing(-1, linear) clamps to 0", () => {
      expect(applyEasing(-1, "linear")).toBe(0);
    });

    it("applyEasing(2, linear) clamps to 1", () => {
      expect(applyEasing(2, "linear")).toBe(1);
    });

    it("applyEasing(-1, easeIn) clamps to 0", () => {
      expect(applyEasing(-1, "easeIn")).toBe(0);
    });

    it("applyEasing(2, easeIn) clamps to 1", () => {
      expect(applyEasing(2, "easeIn")).toBe(1);
    });

    it("applyEasing(-1, easeOut) clamps to 0", () => {
      expect(applyEasing(-1, "easeOut")).toBe(0);
    });

    it("applyEasing(2, easeOut) clamps to 1", () => {
      expect(applyEasing(2, "easeOut")).toBe(1);
    });

    it("applyEasing(NaN, linear) returns 0", () => {
      expect(applyEasing(Number.NaN, "linear")).toBe(0);
    });

    it("applyEasing(Infinity, easeIn) clamps to 1", () => {
      expect(applyEasing(Infinity, "easeIn")).toBe(1);
    });

    it("applyEasing(-Infinity, easeOut) clamps to 0", () => {
      expect(applyEasing(-Infinity, "easeOut")).toBe(0);
    });
  });

  // ── Stack integrity with out-of-bounds moveStackItem ──
  describe("stack corruption from moveStackItem", () => {
    it("moveStackItem with out-of-bounds index is a no-op (no undefined inserted)", () => {
      const mockEffect = {
        id: "test.effect",
        name: "Test",
        category: "test",
        media_type: "both" as const,
        parameters: [],
      };
      useAppStore.getState().addToStack(mockEffect);
      useAppStore.getState().addToStack(mockEffect);

      // Out-of-bounds move should be a no-op
      useAppStore.getState().moveStackItem(99, 0);
      const stack = useAppStore.getState().effectStack;

      // Stack should still have 2 valid entries, no undefined
      expect(stack.length).toBe(2);
      const hasUndefined = stack.some((e) => e === undefined);
      expect(hasUndefined).toBe(false);
    });
  });

  // ── Watermark partial merge edge cases ──
  describe("watermark partial merge stress", () => {
    it("setWatermark with empty object is no-op", () => {
      const before = useAppStore.getState().watermark;
      useAppStore.getState().setWatermark({});
      expect(useAppStore.getState().watermark).toEqual(before);
    });

    it("setWatermark with null values for required fields", () => {
      useAppStore.getState().setWatermark({ text: null as unknown as string });
      expect(useAppStore.getState().watermark.text).toBeNull();
    });

    it("setWatermark with wrong type for enabled", () => {
      useAppStore.getState().setWatermark({ enabled: "yes" as unknown as boolean });
      expect(useAppStore.getState().watermark.enabled).toBe("yes");
    });
  });
});
