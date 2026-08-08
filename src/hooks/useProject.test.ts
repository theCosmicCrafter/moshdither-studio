import { describe, it, expect, beforeEach, vi } from "vitest";
import { renderHook, act, waitFor } from "@testing-library/react";
import { open } from "@tauri-apps/plugin-dialog";
import { invoke } from "@tauri-apps/api/core";
import { useAppStore, type StackEntry } from "../store";
import { useProject, type ProjectFile } from "./useProject";

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

describe("openProject restores per-effect mask assignments", () => {
  beforeEach(() => {
    useAppStore.setState(useAppStore.getInitialState());
    vi.mocked(open).mockReset();
    vi.mocked(invoke).mockReset();
  });

  it("restores a saved effect's maskId, maskMode, and maskB64 on reopen", async () => {
    // The effect must be resolvable from allEffects for addToStack to fire
    // during the restore loop.
    useAppStore.getState().setAllEffects([
      { id: "color.invert", name: "Invert", category: "Color", media_type: "image", parameters: [] },
    ]);

    const savedProject: ProjectFile = {
      version: 1,
      createdAt: "2024-01-01T00:00:00Z",
      effectStack: [
        {
          id: "orig-1",
          effectId: "color.invert",
          effectName: "Invert",
          params: {},
          enabled: true,
          maskId: "sam3-0",
          maskB64: "data:image/png;base64,savedmaskdata",
          maskMode: "outside",
        },
      ],
      keyframes: {},
      audioBindings: {},
      mediaFilePath: null,
      activeMask: null,
    };

    vi.mocked(open).mockResolvedValue("C:/fake/project.moshdither");
    vi.mocked(invoke).mockImplementation(async (cmd: string) => {
      if (cmd === "read_file") return JSON.stringify(savedProject);
      return undefined;
    });

    // sam3Masks is deliberately left empty here (as it would be right after
    // a fresh app start / project load) to prove maskB64 is restored from
    // the saved snapshot rather than recomputed from live SAM3 state.
    const { result } = renderHook(() => useProject());

    await act(async () => {
      await result.current.openProject();
    });

    // The restore loop runs inside a setTimeout(fn, 0) in openProject, so
    // wait for it to flush before asserting.
    await waitFor(() => {
      expect(useAppStore.getState().effectStack).toHaveLength(1);
    });

    const restored = useAppStore.getState().effectStack[0];
    expect(restored.effectId).toBe("color.invert");
    expect(restored.maskId).toBe("sam3-0");
    expect(restored.maskMode).toBe("outside");
    expect(restored.maskB64).toBe("data:image/png;base64,savedmaskdata");
  });

  it("leaves maskId/maskMode at defaults when the saved entry had no mask", async () => {
    useAppStore.getState().setAllEffects([
      { id: "color.invert", name: "Invert", category: "Color", media_type: "image", parameters: [] },
    ]);

    const savedProject: ProjectFile = {
      version: 1,
      createdAt: "2024-01-01T00:00:00Z",
      effectStack: [
        {
          id: "orig-1",
          effectId: "color.invert",
          effectName: "Invert",
          params: {},
          enabled: true,
          maskId: null,
          maskMode: "inside",
        },
      ],
      keyframes: {},
      audioBindings: {},
      mediaFilePath: null,
      activeMask: null,
    };

    vi.mocked(open).mockResolvedValue("C:/fake/project2.moshdither");
    vi.mocked(invoke).mockImplementation(async (cmd: string) => {
      if (cmd === "read_file") return JSON.stringify(savedProject);
      return undefined;
    });

    const { result } = renderHook(() => useProject());

    await act(async () => {
      await result.current.openProject();
    });

    await waitFor(() => {
      expect(useAppStore.getState().effectStack).toHaveLength(1);
    });

    const restored = useAppStore.getState().effectStack[0];
    expect(restored.maskId).toBe(null);
  });
});
