import { useCallback, useEffect, useRef, useState } from "react";
import { useAppStore, type StackEntry } from "../store";
import { migrateOverlayGuides } from "../utils/migrateOverlayGuides";
import { getPresetsPath, loadPresetsFile, savePresetsFile } from "../lib/tauri";
import { isTauriAvailable } from "../lib/browserFallback";
import { DEFAULT_PRESETS } from "./defaultPresets";

export interface Preset {
  id: string;
  name: string;
  createdAt: string;
  stack: StackEntry[];
  thumbnail?: string; // base64 PNG data URL
  /** The FFglitch bitstream-datamosh mode this look was built with.
   *
   *  Optional so every preset saved before this still loads. Without it a
   *  preset captured only half the look: you could save a 28-effect stack and
   *  share it, but the datamosh mode -- the thing that makes it a MOSH -- was
   *  picked once at export and forgotten. */
  ffglitchMode?: string;
}

/**
 * Legacy home for the preset library.
 *
 * Presets now live in a JSON file under Documents (see `src-tauri/src/presets.rs`)
 * so users can find, back up, move and share them — none of which is possible
 * with webview storage, which is also wiped whenever the webview's data is
 * cleared. This key is still read once to migrate an existing library, and is
 * deliberately **not** deleted afterwards: it costs nothing to leave and is the
 * only fallback if the migration write fails.
 */
const LEGACY_STORAGE_KEY = "moshdither_presets_v2";

function readLegacyPresets(): Preset[] {
  try {
    const raw = localStorage.getItem(LEGACY_STORAGE_KEY);
    return raw ? (JSON.parse(raw) as Preset[]) : [];
  } catch {
    return [];
  }
}

function writeLegacyPresets(presets: Preset[]) {
  try {
    localStorage.setItem(LEGACY_STORAGE_KEY, JSON.stringify(presets));
  } catch {
    // Quota or a privacy mode that blocks storage. In Tauri the file is the
    // real store, so this is a best-effort mirror and not worth surfacing.
  }
}

/** Merge the bundled presets in, skipping any the user already has by id. */
function withDefaults(userPresets: Preset[]): Preset[] {
  const existing = new Set(userPresets.map((p) => p.id));
  const merged = [...userPresets];
  for (const preset of DEFAULT_PRESETS) {
    if (!existing.has(preset.id)) {
      merged.push({ ...preset, thumbnail: generateThumbnail(preset.stack) });
    }
  }
  return merged;
}

/**
 * Schema version of the preset file.
 *
 * The library is a portable file now — users copy it between machines and send
 * it to each other — so a version field is the difference between being able to
 * migrate an old library and having to guess at its shape. Effect IDs are the
 * likely thing to move: an unknown ID is a hard error in Rust (`Effect '...'
 * not found` aborts the whole render), which is exactly the wall the overlay
 * guides hit. This gives that migration somewhere to hook in.
 *
 * Version 1 is the first versioned format. A bare array is version 0, written
 * before this existed, and is still read.
 */
export const PRESET_SCHEMA_VERSION = 1;

interface PresetFile {
  version: number;
  presets: Preset[];
}

function isValidPreset(p: unknown): p is Preset {
  const preset = p as Preset | null;
  return !!preset && !!preset.id && !!preset.name && Array.isArray(preset.stack);
}

/**
 * Read a preset library, accepting both the versioned envelope and the bare
 * array written before versioning existed.
 */
export function parsePresets(json: string): Preset[] {
  if (!json.trim()) return [];
  try {
    const parsed = JSON.parse(json) as PresetFile | Preset[];

    // Version 0: the file was a bare array.
    if (Array.isArray(parsed)) return parsed.filter(isValidPreset);

    if (!parsed || !Array.isArray(parsed.presets)) return [];

    // A file from a future version may contain fields this build does not
    // understand. Reading it is still better than discarding the user's
    // library, so load what parses and leave the rest alone.
    return parsed.presets.filter(isValidPreset);
  } catch {
    return [];
  }
}

/** Serialise a preset library in the current schema version. */
export function serialisePresets(presets: Preset[]): string {
  const file: PresetFile = { version: PRESET_SCHEMA_VERSION, presets };
  return JSON.stringify(file, null, 2);
}

/** Generate a simple gradient thumbnail based on preset effects. */
function generateThumbnail(stack: StackEntry[]): string {
  const canvas = document.createElement("canvas");
  canvas.width = 160;
  canvas.height = 90;
  const ctx = canvas.getContext("2d");
  if (!ctx) return "";

  // Base gradient
  const grd = ctx.createLinearGradient(0, 0, canvas.width, canvas.height);
  grd.addColorStop(0, "#1a1a2e");
  grd.addColorStop(1, "#16213e");
  ctx.fillStyle = grd;
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  // Draw colored bars based on effect categories
  const colors: Record<string, string> = {
    dithering: "#e94560",
    glitch: "#f39c12",
    color: "#3498db",
    artistic: "#9b59b6",
    noise: "#2ecc71",
    analog: "#e74c3c",
    composite: "#a8a8a8",
    pixel_geometry: "#f1c40f",
    datamoshing: "#ff7b2e",
    audio_reactive: "#00d4ff",
    segmentation: "#ff6b6b",
  };

  const barHeight = 6;
  const gap = 2;
  let y = 8;
  for (const entry of stack) {
    if (!entry.enabled) continue;
    const cat = entry.effectId.split(".")[0] || "default";
    ctx.fillStyle = colors[cat] || "#ffffff";
    ctx.fillRect(8, y, Math.max(20, 140 * (Object.keys(entry.params).length / 10)), barHeight);
    y += barHeight + gap;
    if (y > canvas.height - 8) break;
  }

  // Label
  ctx.fillStyle = "rgba(255,255,255,0.8)";
  ctx.font = "10px sans-serif";
  ctx.fillText(`${stack.filter((e) => e.enabled).length} fx`, 8, canvas.height - 8);

  return canvas.toDataURL("image/png");
}

export function usePresets() {
  const [presets, setPresets] = useState<Preset[]>([]);
  const [presetsPath, setPresetsPath] = useState<string | null>(null);
  /**
   * Guards the persist effect. Loading the library is asynchronous now, so
   * without this the first render would persist the initial empty array and
   * wipe the file before the real contents ever arrived.
   */
  const loadedRef = useRef(false);
  const [loaded, setLoaded] = useState(false);

  const effectStack = useAppStore((s) => s.effectStack);
  const replaceStack = useAppStore((s) => s.replaceStack);
  const setStatusMessage = useAppStore((s) => s.setStatusMessage);

  // Initial load, plus one-time migration off localStorage.
  useEffect(() => {
    let cancelled = false;

    (async () => {
      if (!isTauriAvailable()) {
        // Browser build: no filesystem, so localStorage remains the store.
        if (!cancelled) {
          setPresets(withDefaults(readLegacyPresets()));
          loadedRef.current = true;
          setLoaded(true);
        }
        return;
      }

      let fromFile: Preset[] = [];
      try {
        fromFile = parsePresets(await loadPresetsFile());
      } catch (err) {
        // A read failure must not silently present an empty library — that
        // would look like data loss and the next write would make it real.
        if (!cancelled) {
          setStatusMessage(`Could not read presets file: ${String(err)}`);
        }
        return;
      }

      const legacy = readLegacyPresets();
      let initial = fromFile;
      let migratedCount = 0;

      if (fromFile.length === 0 && legacy.length > 0) {
        // First run after the move to a file. Adopt the localStorage library
        // and write it out; localStorage is left in place as a fallback.
        initial = legacy;
        migratedCount = legacy.length;
        try {
          await savePresetsFile(serialisePresets(legacy));
        } catch (err) {
          if (!cancelled) setStatusMessage(`Preset migration failed: ${String(err)}`);
        }
      }

      if (cancelled) return;
      setPresets(withDefaults(initial));
      loadedRef.current = true;
      setLoaded(true);

      try {
        const path = await getPresetsPath();
        if (!cancelled) setPresetsPath(path);
      } catch {
        // Path is display-only; failing to resolve it is not worth an error.
      }

      if (migratedCount > 0 && !cancelled) {
        setStatusMessage(`Moved ${migratedCount} presets to your Documents folder`);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [setStatusMessage]);

  // Persist whenever presets change — but never before the initial load has
  // populated them.
  useEffect(() => {
    if (!loadedRef.current) return;
    // Bundled defaults are regenerated on load; writing them back would bake a
    // copy into the user's file and make them undeletable.
    const userPresets = presets.filter((p) => !p.id.startsWith("default-preset-"));
    if (isTauriAvailable()) {
      savePresetsFile(serialisePresets(userPresets)).catch((err) => {
        setStatusMessage(`Failed to save presets: ${String(err)}`);
      });
    } else {
      writeLegacyPresets(userPresets);
    }
  }, [presets, setStatusMessage]);

  const savePreset = useCallback(
    (name: string) => {
      const thumbnail = generateThumbnail(effectStack);
      const preset: Preset = {
        id: `preset-${Date.now()}`,
        name: name.trim() || `Preset ${presets.length + 1}`,
        createdAt: new Date().toISOString(),
        stack: JSON.parse(JSON.stringify(effectStack)), // deep clone
        thumbnail,
        ffglitchMode: useAppStore.getState().ffglitchMode,
      };
      setPresets((prev) => [preset, ...prev]);
      setStatusMessage(`Preset "${preset.name}" saved`);
    },
    [effectStack, presets.length, setStatusMessage]
  );

  const loadPreset = useCallback(
    (preset: Preset) => {
      // Presets saved before the composition guides left the effect registry
      // still contain overlay.* entries. Those IDs no longer resolve in Rust,
      // and an unknown effect there aborts the whole render, so strip them and
      // switch on the equivalent viewport guides instead.
      const { stack: migratedStack, guides, migrated } = migrateOverlayGuides(preset.stack);
      if (migrated) useAppStore.getState().setViewportGuides(guides);

      // Replace the stack atomically — no clear+setTimeout+add race condition.
      // Deep clone the preset stack so edits to the loaded stack don't mutate the preset.
      const newStack: StackEntry[] = migratedStack.map((entry) => ({
        ...entry,
        id: `${entry.effectId}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
        params: JSON.parse(JSON.stringify(entry.params)),
      }));
      replaceStack(newStack);
      // Older presets have no mode; leave the current one alone rather than
      // silently resetting it to "classic".
      if (preset.ffglitchMode) {
        useAppStore.getState().setFfglitchMode(preset.ffglitchMode);
      }
      setStatusMessage(`Preset "${preset.name}" loaded`);
    },
    [replaceStack, setStatusMessage]
  );

  const deletePreset = useCallback(
    (id: string) => {
      // Prevent deletion of built-in default presets
      if (id.startsWith("default-preset-")) {
        setStatusMessage("Built-in presets cannot be deleted");
        return;
      }
      setPresets((prev) => prev.filter((p) => p.id !== id));
      setStatusMessage("Preset deleted");
    },
    [setStatusMessage]
  );

  const exportPresets = useCallback(
    (ids?: string[]) => {
      const toExport = ids ? presets.filter((p) => ids.includes(p.id)) : presets;
      const blob = new Blob([serialisePresets(toExport)], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `moshdither-presets-${new Date().toISOString().slice(0, 10)}.json`;
      a.click();
      URL.revokeObjectURL(url);
      setStatusMessage(`Exported ${toExport.length} presets`);
    },
    [presets, setStatusMessage]
  );

  const importPresets = useCallback(
    (file: File) => {
      const reader = new FileReader();
      reader.onload = () => {
        try {
          // parsePresets accepts both the versioned envelope and the bare
          // array, so a file exported by any version of the app imports.
          const valid = parsePresets(reader.result as string);
          if (valid.length === 0) throw new Error("No presets in file");
          setPresets((prev) => {
            const existingIds = new Set(prev.map((p) => p.id));
            const newPresets = valid.filter((p) => !existingIds.has(p.id));
            return [...newPresets, ...prev];
          });
          setStatusMessage(`Imported ${valid.length} presets`);
        } catch {
          setStatusMessage("Failed to import presets");
        }
      };
      reader.readAsText(file);
    },
    [setStatusMessage]
  );

  return {
    presets,
    presetsPath,
    loaded,
    savePreset,
    loadPreset,
    deletePreset,
    exportPresets,
    importPresets,
  };
}
