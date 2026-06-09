import { describe, it, expect, vi } from "vitest";
import { EventBus } from "../eventBus";

describe("EventBus", () => {
  it("emits events to subscribed listeners", () => {
    const bus = new EventBus();
    const listener = vi.fn();
    bus.on("test", listener);
    bus.emit("test", 42);
    expect(listener).toHaveBeenCalledWith(42);
  });

  it("supports multiple listeners for the same event", () => {
    const bus = new EventBus();
    const a = vi.fn();
    const b = vi.fn();
    bus.on("multi", a);
    bus.on("multi", b);
    bus.emit("multi", "data");
    expect(a).toHaveBeenCalledWith("data");
    expect(b).toHaveBeenCalledWith("data");
  });

  it("off removes a specific listener", () => {
    const bus = new EventBus();
    const listener = vi.fn();
    bus.on("x", listener);
    bus.off("x", listener);
    bus.emit("x", 1);
    expect(listener).not.toHaveBeenCalled();
  });

  it("once only fires once", () => {
    const bus = new EventBus();
    const listener = vi.fn();
    bus.once("y", listener);
    bus.emit("y", 1);
    bus.emit("y", 2);
    expect(listener).toHaveBeenCalledTimes(1);
    expect(listener).toHaveBeenCalledWith(1);
  });

  it("returns false for hasListeners when none exist", () => {
    const bus = new EventBus();
    expect(bus.hasListeners("empty")).toBe(false);
  });

  it("returns true for hasListeners when listeners exist", () => {
    const bus = new EventBus();
    bus.on("populated", vi.fn());
    expect(bus.hasListeners("populated")).toBe(true);
  });

  it("survives errors in listeners without crashing", () => {
    const bus = new EventBus();
    const bad = vi.fn(() => {
      throw new Error("oops");
    });
    const good = vi.fn();
    bus.on("err", bad);
    bus.on("err", good);
    bus.emit("err", 1);
    expect(bad).toHaveBeenCalled();
    expect(good).toHaveBeenCalled();
  });

  it("removeAllListeners clears everything", () => {
    const bus = new EventBus();
    bus.on("a", vi.fn());
    bus.on("b", vi.fn());
    bus.removeAllListeners();
    expect(bus.hasListeners("a")).toBe(false);
    expect(bus.hasListeners("b")).toBe(false);
  });
});
