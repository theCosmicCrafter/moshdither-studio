import { describe, it, expect, vi } from "vitest";
import {
  getCollabState,
  getCollabRoomId,
  getCollabClientId,
  onCollabEvent,
  createAddOp,
  createRemoveOp,
  createUpdateOp,
  createReorderOp,
} from "../collaboration";
import type { Effect } from "../../types/effectTypes";

describe("collaboration utilities", () => {
  it("returns disconnected by default", () => {
    expect(getCollabState()).toBe("disconnected");
    expect(getCollabRoomId()).toBe("");
    expect(getCollabClientId()).toBe("");
  });

  it("creates an add op", () => {
    const effect: Effect = {
      id: "fx-1",
      name: "Dither",
      type: "dither",
      enabled: true,
      params: { intensity: 0.5 },
      startTime: 0,
      endTime: 10,
      mask: { type: "none", invert: false },
    };
    const op = createAddOp(effect);
    expect(op.type).toBe("effect:add");
    expect((op.payload as { effect: Effect }).effect).toEqual(effect);
    expect(op.timestamp).toBeGreaterThan(0);
  });

  it("creates a remove op", () => {
    const op = createRemoveOp("fx-1");
    expect(op.type).toBe("effect:remove");
    expect((op.payload as { effectId: string }).effectId).toBe("fx-1");
  });

  it("creates an update op", () => {
    const op = createUpdateOp("fx-1", { intensity: 0.8 });
    expect(op.type).toBe("effect:update");
    expect((op.payload as { effectId: string }).effectId).toBe("fx-1");
    expect((op.payload as { params: object }).params).toEqual({
      intensity: 0.8,
    });
  });

  it("creates a reorder op", () => {
    const op = createReorderOp(["fx-2", "fx-1"]);
    expect(op.type).toBe("effect:reorder");
    expect((op.payload as { effectIds: string[] }).effectIds).toEqual([
      "fx-2",
      "fx-1",
    ]);
  });

  it("emits and receives events", () => {
    const handler = vi.fn();
    const unsub = onCollabEvent("test-event", handler);

    // Simulate internal emit by importing the module again won't help,
    // but we can test the subscription mechanics
    expect(typeof unsub).toBe("function");

    // Unsubscribe should not throw
    expect(() => unsub()).not.toThrow();
  });
});
