import { beforeEach, describe, expect, it } from "vitest";
import { useAppStore } from "./index";

/**
 * The mask's own undo stack. Brush strokes, shapes, Clear and Invert all push
 * to it; the Mask panel's Undo pops it.
 */
describe("mask history", () => {
  beforeEach(() => {
    useAppStore.setState({ activeMask: null, maskHistory: [], maskRevision: 0 });
  });

  it("records the current mask before an action and restores it on undo", () => {
    const s = useAppStore.getState();
    s.setActiveMask("data:one");
    s.pushMaskHistory("Brush stroke");
    s.setActiveMask("data:two");
    const before = useAppStore.getState().maskRevision;

    expect(useAppStore.getState().undoMask()).toBe("Brush stroke");
    expect(useAppStore.getState().activeMask).toBe("data:one");
    expect(useAppStore.getState().maskHistory).toEqual([]);
    // The overlay redraws on revision, so an undo must bump it like a set does.
    expect(useAppStore.getState().maskRevision).toBe(before + 1);
  });

  it("undoes in reverse order, one step at a time", () => {
    const s = useAppStore.getState();
    s.pushMaskHistory("Clear");
    s.setActiveMask("data:a");
    s.pushMaskHistory("Invert");
    s.setActiveMask("data:b");
    expect(useAppStore.getState().undoMask()).toBe("Invert");
    expect(useAppStore.getState().activeMask).toBe("data:a");
    expect(useAppStore.getState().undoMask()).toBe("Clear");
    expect(useAppStore.getState().activeMask).toBeNull();
  });

  it("returns null with nothing to undo and leaves the mask alone", () => {
    useAppStore.getState().setActiveMask("data:keep");
    expect(useAppStore.getState().undoMask()).toBeNull();
    expect(useAppStore.getState().activeMask).toBe("data:keep");
  });

  it("is capped so a long painting session cannot hold hundreds of PNGs", () => {
    for (let i = 0; i < 100; i++) {
      useAppStore.getState().pushMaskHistory(`s${i}`);
      useAppStore.getState().setActiveMask(`data:${i}`);
    }
    const h = useAppStore.getState().maskHistory;
    expect(h.length).toBe(30);
    expect(h[h.length - 1].label).toBe("s99");
    expect(h[0].label).toBe("s70");
  });
});
