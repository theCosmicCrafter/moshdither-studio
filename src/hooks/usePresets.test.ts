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

import { useAppStore, type KeyframeTrack } from "../store";
import {
  PRESET_SCHEMA_VERSION,
  parsePresets,
  presetMatchesCurrentStack,
  serialisePresets,
  usePresets,
  type Preset,
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

describe("preset datamosh knobs", () => {
  beforeEach(() => {
    localStorage.clear();
    loadPresetsFile.mockReset().mockResolvedValue("");
    savePresetsFile.mockReset().mockResolvedValue(undefined);
    getPresetsPath.mockReset().mockResolvedValue("C:/Users/x/Documents/MoshDither Studio/presets.json");
    isTauriAvailable.mockReset().mockReturnValue(true);
  });

  it("saves the current mode's knobs with the preset", async () => {
    useAppStore.setState({
      ffglitchMode: "noise",
      ffglitchParams: { noise: { multiple: 33 }, zoom: { zoom: 7 } },
      effectStack: [],
    });
    const { result } = renderHook(() => usePresets());
    await waitFor(() => expect(result.current.loaded).toBe(true));
    act(() => result.current.savePreset("knobs"));
    const saved = result.current.presets.find((p) => p.name === "knobs");
    expect(saved?.ffglitchMode).toBe("noise");
    expect(saved?.ffglitchParams).toEqual({ multiple: 33 });
  });

  it("restores a preset's knobs, replacing what was there and sanitising the file's values", async () => {
    useAppStore.setState({
      ffglitchMode: "classic",
      ffglitchParams: { noise: { multiple: 1, somePercentage: 0.9 } },
    });
    const { result } = renderHook(() => usePresets());
    await waitFor(() => expect(result.current.loaded).toBe(true));
    const preset = {
      id: "p1",
      name: "n",
      createdAt: "2026-01-01",
      stack: [],
      ffglitchMode: "noise",
      ffglitchParams: { multiple: 33, tailLength: 999, bogus: 1 },
    };
    act(() => result.current.loadPreset(preset as never));
    expect(useAppStore.getState().ffglitchMode).toBe("noise");
    // The preset's value is kept, tailLength is clamped to its max, `bogus` is
    // dropped, and every knob the preset did not carry comes back at its
    // DEFAULT -- so the stale somePercentage: 0.9 from before the load is gone
    // rather than surviving underneath. A preset is the whole look.
    expect(useAppStore.getState().ffglitchParams.noise).toEqual({
      somePercentage: 0.5,
      multiple: 33,
      tailLength: 100,
    });
  });
});

describe("parsePresets", () => {
  it("treats a non-string (a mocked or failed read) as an empty library instead of throwing", () => {
    expect(parsePresets(undefined as never)).toEqual([]);
    expect(parsePresets({} as never)).toEqual([]);
  });
});

function liveEntry(id: string, effectId = "glitch.databend") {
  return {
    id,
    effectId,
    effectName: effectId,
    params: { amount: 0.2 },
    enabled: true,
    maskId: null,
    maskMode: "inside" as const,
  };
}

describe("animated presets (keyframes)", () => {
  beforeEach(() => {
    localStorage.clear();
    loadPresetsFile.mockReset().mockResolvedValue("");
    savePresetsFile.mockReset().mockResolvedValue(undefined);
    getPresetsPath.mockReset().mockResolvedValue("C:/Users/x/Documents/MoshDither Studio/presets.json");
    isTauriAvailable.mockReset().mockReturnValue(true);
    useAppStore.setState({ effectStack: [], keyframes: {} });
  });

  it("captures each entry's live keyframes into the preset on save", async () => {
    useAppStore.setState({
      effectStack: [liveEntry("s1"), liveEntry("s2", "color.rgb_shift")],
      keyframes: {
        s1: {
          amount: [
            { id: "k1", time: 0, value: 0, easing: "linear" },
            { id: "k2", time: 5, value: 0.9, easing: "easeIn" },
          ],
          // Empty tracks are not worth serialising.
          other: [],
        },
      },
    });
    const { result } = renderHook(() => usePresets());
    await waitFor(() => expect(result.current.loaded).toBe(true));

    act(() => result.current.savePreset("anim"));
    const saved = result.current.presets.find((p) => p.name === "anim");
    expect(saved?.stack[0].keyframes?.amount).toEqual([
      { id: "k1", time: 0, value: 0, easing: "linear" },
      { id: "k2", time: 5, value: 0.9, easing: "easeIn" },
    ]);
    expect(saved?.stack[0].keyframes?.other).toBeUndefined();
    // Entries with no animation carry no field at all.
    expect(saved?.stack[1].keyframes).toBeUndefined();
    // The store copy must be a clone — later edits can't mutate the preset.
    expect(saved?.stack[0].keyframes?.amount).not.toBe(
      useAppStore.getState().keyframes.s1.amount
    );
  });

  it("restores tracks remapped to the NEW entry ids on load", async () => {
    const { result } = renderHook(() => usePresets());
    await waitFor(() => expect(result.current.loaded).toBe(true));

    const preset = {
      id: "p-anim",
      name: "anim",
      createdAt: "2026-01-01",
      stack: [
        {
          ...liveEntry("preset-entry-a"),
          keyframes: {
            amount: [
              { id: "k1", time: 0, value: 0, easing: "easeIn" },
              { id: "k2", time: 5, value: 0.9, easing: "linear" },
            ],
          },
        },
        liveEntry("preset-entry-b", "color.rgb_shift"),
      ],
    };
    act(() => result.current.loadPreset(preset as never));

    const st = useAppStore.getState();
    expect(st.effectStack).toHaveLength(2);
    const newId = st.effectStack[0].id;
    // loadPreset regenerates ids — the whole reason the store map cannot be
    // keyed by whatever the file held.
    expect(newId).not.toBe("preset-entry-a");
    expect(Object.keys(st.keyframes)).toEqual([newId]);
    expect(st.keyframes[newId].amount.map((k) => k.value)).toEqual([0, 0.9]);
    // And the restored track is live, not decorative: easing rides on the
    // segment's STARTING keyframe, so k1's easeIn at t=2.5/5 gives
    // 0 + 0.9 * (0.5)^2.
    expect(st.getKeyframeValue(newId, "amount", 2.5)).toBeCloseTo(0.225, 3);
    // The loaded entries don't keep a stray `keyframes` field — animation
    // lives in the store map, not on StackEntry.
    expect("keyframes" in st.effectStack[0]).toBe(false);
  });

  it("clears stale tracks when the loaded preset carries no animation", async () => {
    useAppStore.setState({
      keyframes: { dead: { amount: [{ id: "k", time: 0, value: 1, easing: "linear" }] } },
    });
    const { result } = renderHook(() => usePresets());
    await waitFor(() => expect(result.current.loaded).toBe(true));

    const preset = {
      id: "p-static",
      name: "static",
      createdAt: "2026-01-01",
      stack: [liveEntry("old-entry")],
    };
    act(() => result.current.loadPreset(preset as never));

    // The replaced stack's ids are gone, so any tracks keyed to them would
    // be orphans — an animation-free preset loads with an empty map.
    expect(useAppStore.getState().keyframes).toEqual({});
  });

  it("drops malformed tracks from a hand-edited library instead of failing", async () => {
    const { result } = renderHook(() => usePresets());
    await waitFor(() => expect(result.current.loaded).toBe(true));

    const preset = {
      id: "p-bad",
      name: "bad",
      createdAt: "2026-01-01",
      stack: [
        {
          ...liveEntry("entry-a"),
          keyframes: {
            amount: "not-an-array",
            badTime: [{ time: "soon", value: 1 }],
            ok: [{ time: 0, value: 1, easing: "bogus" }],
          },
        },
      ],
    };
    act(() => result.current.loadPreset(preset as never));

    const st = useAppStore.getState();
    const newId = st.effectStack[0].id;
    // `amount` isn't an array and `badTime`'s only key has a non-numeric
    // time — both drop. `ok` survives, easing coerced and id generated.
    expect(st.keyframes[newId]).toEqual({
      ok: [{ id: expect.any(String), time: 0, value: 1, easing: "linear" }],
    });
  });

  it("round-trips entry keyframes through serialise/parse", () => {
    const preset: Preset = {
      id: "p",
      name: "n",
      createdAt: "x",
      stack: [
        {
          ...liveEntry("e1"),
          keyframes: { amount: [{ id: "k", time: 0, value: 1, easing: "easeInOut" }] },
        },
      ],
    };
    const back = parsePresets(serialisePresets([preset]));
    expect(back[0].stack[0].keyframes?.amount).toEqual([
      { id: "k", time: 0, value: 1, easing: "easeInOut" },
    ]);
  });

  it("still parses presets saved before keyframes existed", () => {
    // Every pre-animation library on disk has stack entries with no
    // `keyframes` field — they must keep loading with animation absent.
    const legacy = JSON.stringify({
      version: 1,
      presets: [{ id: "old", name: "Old", createdAt: "x", stack: [liveEntry("e")] }],
    });
    const back = parsePresets(legacy);
    expect(back).toHaveLength(1);
    expect(back[0].stack[0].keyframes).toBeUndefined();
  });
});

describe("preset thumbnails", () => {
  beforeEach(() => {
    localStorage.clear();
    loadPresetsFile.mockReset().mockResolvedValue("");
    savePresetsFile.mockReset().mockResolvedValue(undefined);
    getPresetsPath.mockReset().mockResolvedValue("C:/Users/x/Documents/MoshDither Studio/presets.json");
    isTauriAvailable.mockReset().mockReturnValue(true);
    useAppStore.setState({ effectStack: [], keyframes: {}, mediaLoaded: false });
  });

  it("saves cleanly with no thumbnail when nothing can be rendered", async () => {
    // jsdom has no canvas 2d context (placeholder → "") and no media is
    // loaded (no CPU render) — the preset must still save, thumbnail-less.
    useAppStore.setState({ effectStack: [liveEntry("s1")] });
    const { result } = renderHook(() => usePresets());
    await waitFor(() => expect(result.current.loaded).toBe(true));

    act(() => result.current.savePreset("no thumb"));
    const saved = result.current.presets.find((p) => p.name === "no thumb");
    expect(saved).toBeTruthy();
    expect(saved?.thumbnail).toBeUndefined();
  });

  it("parses presets with and without the thumbnail field", () => {
    const json = serialisePresets([
      { id: "a", name: "a", createdAt: "x", stack: [], thumbnail: "data:image/png;base64,x" },
      { id: "b", name: "b", createdAt: "x", stack: [] },
    ]);
    const back = parsePresets(json);
    expect(back[0].thumbnail).toBe("data:image/png;base64,x");
    expect(back[1].thumbnail).toBeUndefined();
  });
});

describe("presetMatchesCurrentStack", () => {
  const live = [liveEntry("live-a")];

  it("is true for a preset describing the live stack (entry ids aside)", () => {
    // A just-loaded preset has regenerated ids — matching must ignore them.
    const preset = { id: "p", name: "n", createdAt: "x", stack: [liveEntry("file-id")] };
    expect(presetMatchesCurrentStack(preset, live, {}, "classic", {})).toBe(true);
  });

  it("is false when a param differs", () => {
    const preset = {
      id: "p",
      name: "n",
      createdAt: "x",
      stack: [{ ...liveEntry("file-id"), params: { amount: 0.9 } }],
    };
    expect(presetMatchesCurrentStack(preset, live, {}, "classic", {})).toBe(false);
  });

  it("is false when the saved animation differs from the live tracks", () => {
    const preset: Preset = {
      id: "p",
      name: "n",
      createdAt: "x",
      stack: [
        {
          ...liveEntry("file-id"),
          keyframes: { amount: [{ id: "k", time: 0, value: 0, easing: "linear" }] },
        },
      ],
    };
    // Preset has animation, the live entry has none.
    expect(presetMatchesCurrentStack(preset, live, {}, "classic", {})).toBe(false);
    // Same track on the live entry → back to true.
    const keyframes: Record<string, KeyframeTrack> = {
      "live-a": { amount: [{ id: "k", time: 0, value: 0, easing: "linear" }] },
    };
    expect(presetMatchesCurrentStack(preset, live, keyframes, "classic", {})).toBe(true);
  });

  it("compares ffglitchMode only when the preset carries one", () => {
    const withMode = {
      id: "p",
      name: "n",
      createdAt: "x",
      stack: [liveEntry("file-id")],
      ffglitchMode: "noise",
    };
    expect(presetMatchesCurrentStack(withMode, live, {}, "classic", {})).toBe(false);
    expect(presetMatchesCurrentStack(withMode, live, {}, "noise", {})).toBe(true);
    // Presets saved before the field existed stay matchable.
    const withoutMode = { id: "p", name: "n", createdAt: "x", stack: [liveEntry("file-id")] };
    expect(presetMatchesCurrentStack(withoutMode, live, {}, "classic", {})).toBe(true);
  });
});
