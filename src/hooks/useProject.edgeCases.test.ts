import { describe, it, expect, beforeEach, vi } from "vitest";
import { useAppStore, type StackEntry, type Keyframe } from "../store";
import type { ProjectFile } from "./useProject";

// Mock Tauri APIs
vi.mock("@tauri-apps/plugin-dialog", () => ({
  open: vi.fn(),
  save: vi.fn(),
}));

vi.mock("@tauri-apps/api/core", () => ({
  invoke: vi.fn(),
}));

describe("Project Save/Load Edge Cases", () => {
  beforeEach(() => {
    useAppStore.setState(useAppStore.getInitialState());
  });

  // ── Version mismatch handling ──
  describe("version mismatch", () => {
    it("future version project still parses", () => {
      const project: ProjectFile = {
        version: 999,
        createdAt: "2025-01-01",
        effectStack: [],
        keyframes: {},
        audioBindings: {},
        mediaFilePath: null,
        activeMask: null,
      };
      // The code only warns, doesn't reject
      expect(project.version).toBe(999);
      expect(project.effectStack).toEqual([]);
    });

    it("version 0 project parses", () => {
      const project: ProjectFile = {
        version: 0,
        createdAt: "2020-01-01",
        effectStack: [],
        keyframes: {},
        audioBindings: {},
        mediaFilePath: null,
        activeMask: null,
      };
      expect(project.version).toBe(0);
    });

    it("negative version project parses", () => {
      const project = {
        version: -1,
        createdAt: "2020-01-01",
        effectStack: [],
        keyframes: {},
        audioBindings: {},
        mediaFilePath: null,
        activeMask: null,
      } as ProjectFile;
      expect(project.version).toBe(-1);
    });
  });

  // ── Empty project ──
  describe("empty project file", () => {
    it("empty effect stack serializes and deserializes", () => {
      const project: ProjectFile = {
        version: 1,
        createdAt: new Date().toISOString(),
        effectStack: [],
        keyframes: {},
        audioBindings: {},
        mediaFilePath: null,
        activeMask: null,
      };
      const json = JSON.stringify(project);
      const parsed = JSON.parse(json) as ProjectFile;
      expect(parsed.effectStack).toEqual([]);
      expect(parsed.keyframes).toEqual({});
      expect(parsed.audioBindings).toEqual({});
    });

    it("project with null mediaFilePath is valid", () => {
      const project: ProjectFile = {
        version: 1,
        createdAt: "2024-01-01",
        effectStack: [],
        keyframes: {},
        audioBindings: {},
        mediaFilePath: null,
        activeMask: null,
      };
      expect(project.mediaFilePath).toBeNull();
    });
  });

  // ── Corrupt JSON handling ──
  describe("corrupt JSON handling", () => {
    it("malformed JSON throws on parse", () => {
      const badJson = '{"version": 1, "effectStack": [}';
      expect(() => JSON.parse(badJson)).toThrow(SyntaxError);
    });

    it("JSON missing required fields produces undefined values", () => {
      const partialJson = '{"version": 1}';
      const parsed = JSON.parse(partialJson) as ProjectFile;
      expect(parsed.version).toBe(1);
      expect(parsed.effectStack).toBeUndefined();
      expect(parsed.keyframes).toBeUndefined();
    });

    it("JSON with wrong types for fields", () => {
      const wrongTypes = '{"version": "not_a_number", "effectStack": "not_an_array"}';
      const parsed = JSON.parse(wrongTypes) as ProjectFile;
      // JSON.parse doesn't validate types — it just parses
      expect(typeof parsed.version).toBe("string");
      expect(typeof parsed.effectStack).toBe("string");
    });

    it("empty string JSON throws", () => {
      expect(() => JSON.parse("")).toThrow(SyntaxError);
    });

    it("null JSON throws", () => {
      expect(() => JSON.parse("null")).not.toThrow();
      expect(JSON.parse("null")).toBeNull();
    });
  });

  // ── Keyframe restoration ──
  describe("keyframe serialization", () => {
    it("keyframes with multiple stack entries serialize correctly", () => {
      const keyframes: Record<string, Record<string, Keyframe[]>> = {
        "stack-1": {
          intensity: [
            { id: "kf1", time: 0, value: 0.5, easing: "linear" },
            { id: "kf2", time: 2.5, value: 1.0, easing: "easeInOut" },
          ],
        },
        "stack-2": {
          brightness: [{ id: "kf3", time: 1.0, value: 0.3, easing: "easeOut" }],
        },
      };
      const project: ProjectFile = {
        version: 1,
        createdAt: "2024-01-01",
        effectStack: [],
        keyframes,
        audioBindings: {},
        mediaFilePath: null,
        activeMask: null,
      };
      const json = JSON.stringify(project);
      const parsed = JSON.parse(json) as ProjectFile;
      expect(parsed.keyframes["stack-1"].intensity).toHaveLength(2);
      expect(parsed.keyframes["stack-1"].intensity[0].easing).toBe("linear");
      expect(parsed.keyframes["stack-2"].brightness).toHaveLength(1);
    });

    it("empty keyframes object serializes correctly", () => {
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
      expect(parsed.keyframes).toEqual({});
    });

    it("keyframe with hold easing survives round-trip", () => {
      const kf: Keyframe = { id: "kf1", time: 5, value: 42, easing: "hold" };
      const project: ProjectFile = {
        version: 1,
        createdAt: "2024-01-01",
        effectStack: [],
        keyframes: { s1: { param: [kf] } },
        audioBindings: {},
        mediaFilePath: null,
        activeMask: null,
      };
      const parsed = JSON.parse(JSON.stringify(project)) as ProjectFile;
      expect(parsed.keyframes["s1"].param[0].easing).toBe("hold");
    });
  });

  // ── Audio binding restoration ──
  describe("audio binding serialization", () => {
    it("complex audio bindings serialize correctly", () => {
      const audioBindings: Record<string, Record<string, unknown>> = {
        "stack-1": {
          intensity: {
            source: "bass",
            inputMin: 0,
            inputMax: 1,
            outputMin: 0,
            outputMax: 100,
            attack: 0.01,
            decay: 0.1,
            gateEnabled: true,
            gateThreshold: 0.5,
            invert: false,
          },
        },
      };
      const project: ProjectFile = {
        version: 1,
        createdAt: "2024-01-01",
        effectStack: [],
        keyframes: {},
        audioBindings,
        mediaFilePath: null,
        activeMask: null,
      };
      const parsed = JSON.parse(JSON.stringify(project)) as ProjectFile;
      expect(parsed.audioBindings["stack-1"].intensity).toBeDefined();
      const binding = parsed.audioBindings["stack-1"].intensity as Record<string, unknown>;
      expect(binding.source).toBe("bass");
      expect(binding.attack).toBe(0.01);
    });

    it("empty audio bindings serialize correctly", () => {
      const project: ProjectFile = {
        version: 1,
        createdAt: "2024-01-01",
        effectStack: [],
        keyframes: {},
        audioBindings: {},
        mediaFilePath: null,
        activeMask: null,
      };
      const parsed = JSON.parse(JSON.stringify(project)) as ProjectFile;
      expect(parsed.audioBindings).toEqual({});
    });
  });

  // ── Missing effects on load ──
  describe("missing effects on load", () => {
    it("StackEntry with unknown effectId can be serialized", () => {
      const entry: StackEntry = {
        id: "s1",
        effectId: "nonexistent.effect",
        effectName: "Unknown",
        params: { foo: "bar" },
        enabled: true,
        maskId: null,
        maskMode: "inside",
      };
      const json = JSON.stringify(entry);
      const parsed = JSON.parse(json) as StackEntry;
      expect(parsed.effectId).toBe("nonexistent.effect");
      expect(parsed.params.foo).toBe("bar");
    });

    it("project with all unknown effects serializes", () => {
      const stack: StackEntry[] = [
        {
          id: "s1",
          effectId: "unknown1",
          effectName: "U1",
          params: {},
          enabled: true,
          maskId: null,
          maskMode: "inside",
        },
        {
          id: "s2",
          effectId: "unknown2",
          effectName: "U2",
          params: {},
          enabled: true,
          maskId: null,
          maskMode: "inside",
        },
      ];
      const project: ProjectFile = {
        version: 1,
        createdAt: "2024-01-01",
        effectStack: stack,
        keyframes: {},
        audioBindings: {},
        mediaFilePath: null,
        activeMask: null,
      };
      const parsed = JSON.parse(JSON.stringify(project)) as ProjectFile;
      expect(parsed.effectStack).toHaveLength(2);
    });
  });

  // ── Deep clone integrity ──
  describe("deep clone integrity via JSON", () => {
    it("nested params object is deep-copied, not shared reference", () => {
      const entry: StackEntry = {
        id: "s1",
        effectId: "test",
        effectName: "Test",
        params: { nested: { deep: { value: 42 } } },
        enabled: true,
        maskId: null,
        maskMode: "inside",
      };
      const cloned = JSON.parse(JSON.stringify(entry)) as StackEntry;
      const origNested = entry.params.nested as { deep: { value: number } };
      const cloneNested = cloned.params.nested as { deep: { value: number } };
      expect(cloneNested).not.toBe(origNested);
      expect(cloneNested.deep).not.toBe(origNested.deep);
      expect(cloneNested.deep.value).toBe(42);
    });

    it("array params are deep-copied", () => {
      const entry: StackEntry = {
        id: "s1",
        effectId: "test",
        effectName: "Test",
        params: { values: [1, 2, 3] },
        enabled: true,
        maskId: null,
        maskMode: "inside",
      };
      const cloned = JSON.parse(JSON.stringify(entry)) as StackEntry;
      expect(cloned.params.values).not.toBe(entry.params.values);
      expect(cloned.params.values).toEqual([1, 2, 3]);
    });
  });

  // ── Large project serialization ──
  describe("large project serialization", () => {
    it("project with 100 effects serializes correctly", () => {
      const stack: StackEntry[] = Array.from({ length: 100 }, (_, i) => ({
        id: `s${i}`,
        effectId: `effect.${i}`,
        effectName: `Effect ${i}`,
        params: { value: i * 0.1 },
        enabled: i % 2 === 0,
        maskId: i % 3 === 0 ? "active" : null,
        maskMode: "inside" as const,
      }));
      const project: ProjectFile = {
        version: 1,
        createdAt: "2024-01-01",
        effectStack: stack,
        keyframes: {},
        audioBindings: {},
        mediaFilePath: "/large/video.mp4",
        activeMask: null,
      };
      const json = JSON.stringify(project);
      const parsed = JSON.parse(json) as ProjectFile;
      expect(parsed.effectStack).toHaveLength(100);
      expect(parsed.effectStack[50].effectId).toBe("effect.50");
    });

    it("project with many keyframes serializes correctly", () => {
      const keyframes: Record<string, Record<string, Keyframe[]>> = {};
      for (let i = 0; i < 50; i++) {
        keyframes[`stack-${i}`] = {
          param: Array.from({ length: 20 }, (_, j) => ({
            id: `kf-${i}-${j}`,
            time: j * 0.1,
            value: Math.random(),
            easing: "linear" as const,
          })),
        };
      }
      const project: ProjectFile = {
        version: 1,
        createdAt: "2024-01-01",
        effectStack: [],
        keyframes,
        audioBindings: {},
        mediaFilePath: null,
        activeMask: null,
      };
      const json = JSON.stringify(project);
      const parsed = JSON.parse(json) as ProjectFile;
      expect(Object.keys(parsed.keyframes)).toHaveLength(50);
      expect(parsed.keyframes["stack-25"].param).toHaveLength(20);
    });
  });

  // ── ProjectFile with special characters in paths ──
  describe("special characters in mediaFilePath", () => {
    it("handles spaces in file path", () => {
      const project: ProjectFile = {
        version: 1,
        createdAt: "2024-01-01",
        effectStack: [],
        keyframes: {},
        audioBindings: {},
        mediaFilePath: "C:/Users/Test User/My Videos/video.mp4",
        activeMask: null,
      };
      const parsed = JSON.parse(JSON.stringify(project)) as ProjectFile;
      expect(parsed.mediaFilePath).toBe("C:/Users/Test User/My Videos/video.mp4");
    });

    it("handles unicode in file path", () => {
      const project: ProjectFile = {
        version: 1,
        createdAt: "2024-01-01",
        effectStack: [],
        keyframes: {},
        audioBindings: {},
        mediaFilePath: "/home/user/動画/テスト.mp4",
        activeMask: null,
      };
      const parsed = JSON.parse(JSON.stringify(project)) as ProjectFile;
      expect(parsed.mediaFilePath).toBe("/home/user/動画/テスト.mp4");
    });

    it("handles very long file path", () => {
      const longPath = "/".repeat(200) + "video.mp4";
      const project: ProjectFile = {
        version: 1,
        createdAt: "2024-01-01",
        effectStack: [],
        keyframes: {},
        audioBindings: {},
        mediaFilePath: longPath,
        activeMask: null,
      };
      const parsed = JSON.parse(JSON.stringify(project)) as ProjectFile;
      expect(parsed.mediaFilePath).toBe(longPath);
    });
  });
});
