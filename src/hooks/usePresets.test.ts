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

import { usePresets } from "./usePresets";

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
    const written = JSON.parse(savePresetsFile.mock.calls[0][0]);
    expect(written.map((p: { id: string }) => p.id)).toEqual(["old-1", "old-2"]);
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
