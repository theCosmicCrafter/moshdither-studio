import { describe, it, expect } from "vitest";
import { getCacheStats, clearFrameCache } from "../frameCache";

describe("frameCache IPC client", () => {
  it("getCacheStats returns fallback when IPC is unavailable", async () => {
    const stats = await getCacheStats();
    expect(typeof stats.entries).toBe("number");
    expect(typeof stats.sizeMB).toBe("number");
    expect(stats.entries).toBe(0);
    expect(stats.sizeMB).toBe(0);
  });

  it("clearFrameCache resolves without error when IPC is unavailable", async () => {
    await expect(clearFrameCache()).resolves.toBeUndefined();
  });
});
