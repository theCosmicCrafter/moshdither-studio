import { describe, it, expect, beforeEach, vi } from "vitest";
import { useAppStore, type StackEntry } from "../store";
import type { ProjectFile } from "./useProject";

// Mock Tauri APIs
vi.mock("@tauri-apps/plugin-dialog", () => ({
  open: vi.fn(),
  save: vi.fn(),
}));

vi.mock("@tauri-apps/api/core", () => ({
  invoke: vi.fn(),
}));

describe("ProjectFile serialization with masks", () => {
  beforeEach(() => {
    useAppStore.setState(useAppStore.getInitialState());
  });

  it("ProjectFile interface includes activeMask field", () => {
    const project: ProjectFile = {
      version: 1,
      createdAt: "2024-01-01T00:00:00Z",
      effectStack: [],
      keyframes: {},
      audioBindings: {},
      mediaFilePath: null,
      activeMask: null,
    };
    expect(project.activeMask).toBe(null);
  });

  it("ProjectFile can serialize activeMask as base64 string", () => {
    const project: ProjectFile = {
      version: 1,
      createdAt: "2024-01-01T00:00:00Z",
      effectStack: [],
      keyframes: {},
      audioBindings: {},
      mediaFilePath: null,
      activeMask: "data:image/png;base64,abc123",
    };
    const json = JSON.stringify(project);
    const parsed = JSON.parse(json) as ProjectFile;
    expect(parsed.activeMask).toBe("data:image/png;base64,abc123");
  });

  it("StackEntry preserves maskId and maskMode through JSON round-trip", () => {
    const entry: StackEntry = {
      id: "test-1",
      effectId: "color.invert",
      effectName: "Invert",
      params: {},
      enabled: true,
      maskId: "active",
      maskMode: "outside",
    };
    const json = JSON.stringify(entry);
    const parsed = JSON.parse(json) as StackEntry;
    expect(parsed.maskId).toBe("active");
    expect(parsed.maskMode).toBe("outside");
  });

  it("StackEntry with null maskId survives JSON round-trip", () => {
    const entry: StackEntry = {
      id: "test-2",
      effectId: "color.invert",
      effectName: "Invert",
      params: {},
      enabled: true,
      maskId: null,
      maskMode: "inside",
    };
    const json = JSON.stringify(entry);
    const parsed = JSON.parse(json) as StackEntry;
    expect(parsed.maskId).toBe(null);
    expect(parsed.maskMode).toBe("inside");
  });

  it("StackEntry with alpha mask mode survives JSON round-trip", () => {
    const entry: StackEntry = {
      id: "test-3",
      effectId: "glitch.databend",
      effectName: "Databend",
      params: { amount: 50 },
      enabled: false,
      maskId: "sam3-2",
      maskMode: "alpha",
    };
    const json = JSON.stringify(entry);
    const parsed = JSON.parse(json) as StackEntry;
    expect(parsed.maskId).toBe("sam3-2");
    expect(parsed.maskMode).toBe("alpha");
    expect(parsed.enabled).toBe(false);
    expect(parsed.params.amount).toBe(50);
  });

  it("full project with masked effects serializes correctly", () => {
    const stack: StackEntry[] = [
      {
        id: "s1",
        effectId: "color.invert",
        effectName: "Invert",
        params: {},
        enabled: true,
        maskId: "active",
        maskMode: "inside",
      },
      {
        id: "s2",
        effectId: "noise.salt_pepper",
        effectName: "Salt & Pepper",
        params: { density: 0.3 },
        enabled: true,
        maskId: "sam3-0",
        maskMode: "outside",
      },
      {
        id: "s3",
        effectId: "dithering.bayer",
        effectName: "Bayer Dither",
        params: {},
        enabled: false,
        maskId: null,
        maskMode: "inside",
      },
    ];

    const project: ProjectFile = {
      version: 1,
      createdAt: new Date().toISOString(),
      effectStack: stack,
      keyframes: {},
      audioBindings: {},
      mediaFilePath: "/test/video.mp4",
      activeMask: "data:image/png;base64,maskdata",
    };

    const json = JSON.stringify(project);
    const parsed = JSON.parse(json) as ProjectFile;

    expect(parsed.effectStack).toHaveLength(3);
    expect(parsed.effectStack[0].maskId).toBe("active");
    expect(parsed.effectStack[0].maskMode).toBe("inside");
    expect(parsed.effectStack[1].maskId).toBe("sam3-0");
    expect(parsed.effectStack[1].maskMode).toBe("outside");
    expect(parsed.effectStack[2].maskId).toBe(null);
    expect(parsed.activeMask).toBe("data:image/png;base64,maskdata");
    expect(parsed.mediaFilePath).toBe("/test/video.mp4");
  });

  it("project with null activeMask serializes correctly", () => {
    const project: ProjectFile = {
      version: 1,
      createdAt: "2024-01-01",
      effectStack: [],
      keyframes: {},
      audioBindings: {},
      mediaFilePath: null,
      activeMask: null,
    };
    const json = JSON.stringify(project);
    const parsed = JSON.parse(json) as ProjectFile;
    expect(parsed.activeMask).toBe(null);
  });

  it("deep clone via JSON preserves mask data integrity", () => {
    const original: StackEntry = {
      id: "clone-test",
      effectId: "color.rgb_shift",
      effectName: "RGB Shift",
      params: { shift: 10 },
      enabled: true,
      maskId: "sam3-1",
      maskMode: "alpha",
    };
    // This is the pattern used in useProject.ts saveProject
    const cloned = JSON.parse(JSON.stringify(original)) as StackEntry;
    expect(cloned).toEqual(original);
    // Verify it's a deep copy (not same reference)
    expect(cloned).not.toBe(original);
    expect(cloned.params).not.toBe(original.params);
  });
});

describe("effectConverter mask pipeline", () => {
  // Test the resolveMaskId and stackToRustPayload logic
  // These are tested more thoroughly in effectConverter.e2e.test.ts
  // but we verify the core contract here

  beforeEach(() => {
    useAppStore.setState(useAppStore.getInitialState());
  });

  it("store activeMask is accessible for mask resolution", () => {
    useAppStore.getState().setActiveMask("data:image/png;base64,testmask");
    expect(useAppStore.getState().activeMask).toBe("data:image/png;base64,testmask");
  });

  it("store sam3Masks are accessible for mask resolution", () => {
    useAppStore.getState().setSam3Masks(["sam3_0_data", "sam3_1_data"], [0.9, 0.8]);
    expect(useAppStore.getState().sam3Masks[0]).toBe("sam3_0_data");
    expect(useAppStore.getState().sam3Masks[1]).toBe("sam3_1_data");
  });

  it("stack entry maskId references can point to active or sam3-N", () => {
    useAppStore.getState().setActiveMask("active_mask_data");
    useAppStore.getState().setSam3Masks(["sam3_0", "sam3_1"], [0.9, 0.8]);

    useAppStore.getState().addToStack({
      id: "test.effect",
      name: "Test",
      category: "Color",
      parameters: [],
    } as never);
    const stack = useAppStore.getState().effectStack;
    const id = stack[stack.length - 1].id;

    // Set mask to active
    useAppStore.getState().setStackItemMask(id, "active");
    expect(useAppStore.getState().effectStack.find((e) => e.id === id)?.maskId).toBe("active");

    // Set mask to sam3-1
    useAppStore.getState().setStackItemMask(id, "sam3-1");
    expect(useAppStore.getState().effectStack.find((e) => e.id === id)?.maskId).toBe("sam3-1");

    // Clear mask
    useAppStore.getState().setStackItemMask(id, null);
    expect(useAppStore.getState().effectStack.find((e) => e.id === id)?.maskId).toBe(null);
  });
});
