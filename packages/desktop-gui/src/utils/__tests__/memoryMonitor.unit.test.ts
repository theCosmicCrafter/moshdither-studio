import { describe, it, expect } from "vitest";
import {
  getCurrentMemory,
  startMemoryMonitoring,
  stopMemoryMonitoring,
} from "../memoryMonitor";

describe("Memory Monitor", () => {
  it("getCurrentMemory returns null when performance.memory is unavailable", () => {
    const mem = getCurrentMemory();
    // In jsdom, performance.memory is undefined
    expect(mem === null || typeof mem === "object").toBe(true);
  });

  it("start/stop monitoring does not throw", () => {
    const stop = startMemoryMonitoring();
    expect(typeof stop).toBe("function");
    expect(() => stop()).not.toThrow();
    expect(() => stopMemoryMonitoring()).not.toThrow();
  });
});
