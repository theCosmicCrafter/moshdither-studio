import { describe, it, expect } from "vitest";
import { hashKey, getCacheStats } from "../frameCache";

describe("frameCache utilities", () => {
  it("hashKey produces consistent hashes", () => {
    const h1 = hashKey("test-input");
    const h2 = hashKey("test-input");
    expect(h1).toBe(h2);
    expect(typeof h1).toBe("string");
    expect(h1.length).toBe(16);
  });

  it("hashKey produces different hashes for different inputs", () => {
    const h1 = hashKey("input-a");
    const h2 = hashKey("input-b");
    expect(h1).not.toBe(h2);
  });

  it("getCacheStats returns numbers", () => {
    const stats = getCacheStats();
    expect(typeof stats.entries).toBe("number");
    expect(typeof stats.sizeMB).toBe("number");
    expect(stats.entries).toBeGreaterThanOrEqual(0);
    expect(stats.sizeMB).toBeGreaterThanOrEqual(0);
  });
});
