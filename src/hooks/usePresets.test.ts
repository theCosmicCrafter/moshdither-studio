import { renderHook, waitFor, act } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const loadPresetsFile = vi.fn<() => Promise<string>>();
const savePresetsFile = vi.fn<(json: string) => Promise<void>>();
const getPresetsPath = vi.fn<() => Promise<string | null>>();
const isTauriAvailable = vi.fn<() => boolean>();

vi.mock("../lib/tauri", () => ({
  loadPresetsFile: () => loadPresetsFile(),
  savePresetsFile: (json: string) => savePresetsFile(json),
  getPresetsPath: () => getPresetsPath(),
}));

vi.mock("../lib/browserFallback", () => ({
  isTauriAvailable: () => isTauriAvailable(),
}));

vi.mock("./defaultPresets", () => ({ DEFAULT_PRESETS: [] }));

import {
  PRESET_SCHEMA_VERSION,
  parsePresets,
  serialisePresets,
  usePresets,
} from "./usePresets";

const LEGACY_KEY = "moshdither_presets_v2";

function legacyPreset(id: string) {
  return {
    id,
    name: id,
    createdAt: "2026-07-26T00:00:00.000Z",
    stack: [],
  };
}

describe("usePresets file-backed storage", () => {
  beforeEach(() => {
    localStorage.clear();
    loadPresetsFile.mockReset().mockResolvedValue("");
    savePresetsFile.mockReset().mockResolvedValue(undefined);
    getPresetsPath.mockReset().mockResolvedValue("C:/Users/x/Documents/MoshDither Studio/presets.json");
    isTauriAvailable.mockReset().mockReturnValue(true);
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it("loads the library from the file", async () => {
    loadPresetsFile.mockResolvedValue(JSON.stringify([legacyPreset("a"), legacyPreset("b")]));

    const { result } = renderHook(() => usePresets());
    await waitFor(() => expect(result.current.loaded).toBe(true));

    expect(result.current.presets.map((p) => p.id)).toEqual(["a", "b"]);
  });

  it("does not write an empty library before the initial load resolves", async () => {
    // The load is asynchronous, so a persist effect that fires on the first
    // render would overwrite the user's file with `[]` before its real contents
    // ever arrive. This is the regression that guard exists for.
    let resolveLoad: (v: string) => void = () => {};
    loadPresetsFile.mockReturnValue(
      new Promise<string>((resolve) => {
        resolveLoad = resolve;
      })
    );

    const { result } = renderHook(() => usePresets());
    expect(savePresetsFile).not.toHaveBeenCalled();

    await act(async () => {
      resolveLoad(JSON.stringify([legacyPreset("keep-me")]));
    });
    await waitFor(() => expect(result.current.loaded).toBe(true));

    for (const [json] of savePresetsFile.mock.calls) {
      expect(JSON.parse(json)).not.toEqual([]);
    }
  });

  it("migrates a localStorage library to the file on first run", async () => {
    localStorage.setItem(LEGACY_KEY, JSON.stringify([legacyPreset("old-1"), legacyPreset("old-2")]));
    loadPresetsFile.mockResolvedValue(""); // no file yet

    const { result } = renderHook(() => usePresets());
    await waitFor(() => expect(result.current.loaded).toBe(true));

    expect(savePresetsFile).toHaveBeenCalled();
    // Migrated libraries are written in the current schema, not the bare array
    // they came from, so the file is self-describing from the first write.
    const written = JSON.parse(savePresetsFile.mock.calls[0][0]);
    expect(written.version).toBe(PRESET_SCHEMA_VERSION);
    expect(written.presets.map((p: { id: string }) => p.id)).toEqual(["old-1", "old-2"]);
    expect(result.current.presets.map((p) => p.id)).toEqual(["old-1", "old-2"]);
  });

  it("leaves the legacy localStorage copy in place after migrating", async () => {
    const legacy = JSON.stringify([legacyPreset("old-1")]);
    localStorage.setItem(LEGACY_KEY, legacy);
    loadPresetsFile.mockResolvedValue("");

    const { result } = renderHook(() => usePresets());
    await waitFor(() => expect(result.current.loaded).toBe(true));

    // Kept deliberately: it is the only fallback if the file write failed.
    expect(localStorage.getItem(LEGACY_KEY)).not.toBeNull();
  });

  it("prefers the file over localStorage once the file exists", async () => {
    localStorage.setItem(LEGACY_KEY, JSON.stringify([legacyPreset("stale")]));
    loadPresetsFile.mockResolvedValue(JSON.stringify([legacyPreset("current")]));

    const { result } = renderHook(() => usePresets());
    await waitFor(() => expect(result.current.loaded).toBe(true));

    expect(result.current.presets.map((p) => p.id)).toEqual(["current"]);
  });

  it("does not present an empty library when the file read fails", async () => {
    // Showing zero presets after a read error would look like data loss, and
    // the next persist would turn that appearance into the real thing.
    loadPresetsFile.mockRejectedValue(new Error("disk on fire"));

    const { result } = renderHook(() => usePresets());
    await waitFor(() => expect(loadPresetsFile).toHaveBeenCalled());

    expect(result.current.loaded).toBe(false);
    expect(savePresetsFile).not.toHaveBeenCalled();
  });

  it("tolerates a malformed preset file without wiping it", async () => {
    loadPresetsFile.mockResolvedValue("{ this is not json");

    const { result } = renderHook(() => usePresets());
    await waitFor(() => expect(result.current.loaded).toBe(true));

    expect(result.current.presets).toEqual([]);
  });

  it("exposes the library path for display", async () => {
    const { result } = renderHook(() => usePresets());
    await waitFor(() => expect(result.current.presetsPath).toBeTruthy());

    expect(result.current.presetsPath).toContain("presets.json");
  });

  it("falls back to localStorage outside Tauri", async () => {
    isTauriAvailable.mockReturnValue(false);
    localStorage.setItem(LEGACY_KEY, JSON.stringify([legacyPreset("browser-1")]));

    const { result } = renderHook(() => usePresets());
    await waitFor(() => expect(result.current.loaded).toBe(true));

    expect(result.current.presets.map((p) => p.id)).toEqual(["browser-1"]);
    expect(loadPresetsFile).not.toHaveBeenCalled();
    expect(savePresetsFile).not.toHaveBeenCalled();
  });
});

describe("preset file schema", () => {
  it("writes a versioned envelope", () => {
    const json = serialisePresets([legacyPreset("a")]);
    const parsed = JSON.parse(json);
    expect(parsed.version).toBe(PRESET_SCHEMA_VERSION);
    expect(parsed.presets).toHaveLength(1);
  });

  it("reads a versioned envelope", () => {
    const json = serialisePresets([legacyPreset("a"), legacyPreset("b")]);
    expect(parsePresets(json).map((p) => p.id)).toEqual(["a", "b"]);
  });

  it("still reads a bare array written before versioning", () => {
    // Version 0. Libraries written by earlier builds must keep loading.
    const json = JSON.stringify([legacyPreset("old")]);
    expect(parsePresets(json).map((p) => p.id)).toEqual(["old"]);
  });

  it("reads what it can from a newer schema version", () => {
    // Discarding a user's library because the version is unfamiliar is worse
    // than loading the presets that do parse.
    const json = JSON.stringify({
      version: PRESET_SCHEMA_VERSION + 99,
      presets: [legacyPreset("future")],
      somethingNew: { unknown: true },
    });
    expect(parsePresets(json).map((p) => p.id)).toEqual(["future"]);
  });

  it("drops malformed entries rather than the whole library", () => {
    const json = JSON.stringify({
      version: PRESET_SCHEMA_VERSION,
      presets: [legacyPreset("good"), { id: "no-name" }, null, { name: "no-id", stack: [] }],
    });
    expect(parsePresets(json).map((p) => p.id)).toEqual(["good"]);
  });

  it("returns an empty library for unparseable content", () => {
    expect(parsePresets("{ not json")).toEqual([]);
    expect(parsePresets("")).toEqual([]);
    expect(parsePresets("null")).toEqual([]);
  });

  it("round-trips", () => {
    const original = [legacyPreset("a"), legacyPreset("b")];
    expect(parsePresets(serialisePresets(original))).toEqual(original);
  });
});

describe("ffglitchMode round-trip", () => {
  // A preset used to capture only the effect stack, so a saved look lost the
  // datamosh mode entirely -- you could share a 28-effect stack and the thing
  // that makes it a MOSH was not in it.
  it("survives serialise -> parse", () => {
    const preset = {
      id: "p1",
      name: "Vaporwave Mosh",
      createdAt: new Date(0).toISOString(),
      stack: [],
      ffglitchMode: "pulse",
    };
    const back = parsePresets(serialisePresets([preset]));
    expect(back).toHaveLength(1);
    expect(back[0].ffglitchMode).toBe("pulse");
  });

  it("still accepts a preset saved before the field existed", () => {
    // Every library already on disk lacks it; dropping those would read as
    // data loss and the next write would make it real.
    const legacy = JSON.stringify({
      version: 2,
      presets: [{ id: "old", name: "Old", createdAt: "x", stack: [] }],
    });
    const back = parsePresets(legacy);
    expect(back).toHaveLength(1);
    expect(back[0].ffglitchMode).toBeUndefined();
  });
});
