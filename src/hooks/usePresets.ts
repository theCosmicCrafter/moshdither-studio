import { useCallback, useEffect, useRef, useState } from "react";
import { sanitizeFfglitchParams } from "../lib/ffglitchModes";
import { useAppStore, type Keyframe, type KeyframeTrack, type LfoSpec, type StackEntry } from "../store";
import { migrateOverlayGuides } from "../utils/migrateOverlayGuides";
import { stackToRustPayload } from "../utils/effectConverter";
import { applyEffectStack, getPresetsPath, loadPresetsFile, savePresetsFile } from "../lib/tauri";
import { isTauriAvailable } from "../lib/browserFallback";
import { logger } from "../utils/logger";
import { DEFAULT_PRESETS } from "./defaultPresets";

/**
 * A stack entry as it appears inside a preset file.
 *
 * The animation tracks live ON the entry rather than in a top-level map:
 * the store keys keyframes by stack-entry id, but `loadPreset` regenerates
 * every entry id — so an id-keyed format would save data it could never
 * restore. Embedding the tracks beside the params they animate sidesteps
 * the id problem entirely and mirrors the `keyframes` field
 * `stackToRustPayload` already attaches to each effect call at export.
 * Optional: presets saved before animated looks existed have no field, and
 * load just means "no animation".
 */
export interface PresetStackEntry extends StackEntry {
  /** Per-parameter animation: paramId -> keyframe list, same shape as the
   *  store's `keyframes[entryId]`. */
  keyframes?: KeyframeTrack;
  /** Per-parameter LFO specs — same per-entry reasoning as `keyframes`:
   *  `lfos[entryId]` in the store could never survive the id regeneration
   *  on load. */
  lfos?: Record<string, LfoSpec>;
}

export interface Preset {
  id: string;
  name: string;
  createdAt: string;
  stack: PresetStackEntry[];
  thumbnail?: string; // base64 PNG data URL
  /** The FFglitch bitstream-datamosh mode this look was built with.
   *
   *  Optional so every preset saved before this still loads. Without it a
   *  preset captured only half the look: you could save a 28-effect stack and
   *  share it, but the datamosh mode -- the thing that makes it a MOSH -- was
   *  picked once at export and forgotten. */
  ffglitchMode?: string;
  /** The knobs for that mode, if the user changed any. Same optionality. */
  ffglitchParams?: Record<string, number | boolean | string>;
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
      merged.push({ ...preset, thumbnail: generatePlaceholderThumb(preset.stack) });
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
  if (!preset || !preset.id || !preset.name || !Array.isArray(preset.stack)) return false;
  // Entries render unconditionally (name, effectId, params reads), so a
  // malformed one would crash the panel every open — the file is
  // user-editable, so reject bad entries at the door.
  return preset.stack.every(
    (e) =>
      !!e &&
      typeof e === "object" &&
      typeof e.effectId === "string" &&
      !!e.params &&
      typeof e.params === "object"
  );
}

/**
 * Read a preset library, accepting both the versioned envelope and the bare
 * array written before versioning existed.
 */
export function parsePresets(json: string): Preset[] {
  // A non-string means the read itself failed or was mocked; the E2E mock's
  // default `{}` reply for unknown commands crashed this on every load.
  if (typeof json !== "string" || !json.trim()) return [];
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

/** Thumbnail geometry — matches the mock's 16:9 preset-strip cells. */
const THUMB_W = 128;
const THUMB_H = 72;

/** Cover-fit a full-size render data URL into the thumbnail box. */
function downscaleToThumb(dataUrl: string): Promise<string | null> {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => {
      const canvas = document.createElement("canvas");
      canvas.width = THUMB_W;
      canvas.height = THUMB_H;
      const ctx = canvas.getContext("2d");
      if (!ctx) {
        resolve(null);
        return;
      }
      // Cover crop: fill the box, centre the overflow.
      const scale = Math.max(THUMB_W / img.naturalWidth, THUMB_H / img.naturalHeight);
      const w = img.naturalWidth * scale;
      const h = img.naturalHeight * scale;
      ctx.drawImage(img, (THUMB_W - w) / 2, (THUMB_H - h) / 2, w, h);
      try {
        resolve(canvas.toDataURL("image/png"));
      } catch {
        resolve(null);
      }
    };
    img.onerror = () => resolve(null);
    img.src = dataUrl;
  });
}

/**
 * Render the stack against the loaded media through the exact CPU pipeline
 * (`apply_effect_stack`, the same path EXACT preview uses) and shrink the
 * result to a thumbnail.
 *
 * `preview_scale` makes the backend *process* at ~256px, so the effect work
 * is thumbnail-priced — and resolution-dependent looks (dither matrices,
 * block sizes, halftone dots) actually read truer than they would shrunk
 * from a 4K render. The returned frame is still full-resolution, which is
 * what `downscaleToThumb` is for.
 *
 * Returns null whenever a real render is unavailable (no backend, no media,
 * render error) — callers fall back to the procedural placeholder.
 */
async function renderPresetThumbnail(stack: StackEntry[]): Promise<string | null> {
  const state = useAppStore.getState();
  if (!isTauriAvailable() || !state.mediaLoaded) return null;
  try {
    // Params already hold playhead-interpolated values (useKeyframePlayback
    // keeps them there), so the thumb matches what the preview shows.
    const payload = stackToRustPayload(stack, state.activeMask, state.sam3Masks, state.currentTime);
    const maxDim = Math.max(state.mediaInfo?.width ?? 0, state.mediaInfo?.height ?? 0);
    const previewScale = maxDim > 0 ? Math.min(0.99, 256 / maxDim) : 0.25;
    const dataUrl = await applyEffectStack(payload, null, previewScale);
    return await downscaleToThumb(dataUrl);
  } catch (err) {
    logger.warn("presets", "Preset thumbnail render failed; keeping placeholder", {
      error: String(err),
    });
    return null;
  }
}

/**
 * Procedural placeholder art: a flat bar strip derived from the stack's
 * effect categories. It is generated synchronously, so it is what default
 * presets ship with, what a saved preset gets the instant it is created
 * (the real render patches over it asynchronously), and what remains when
 * a real render cannot run.
 */
function generatePlaceholderThumb(stack: StackEntry[]): string {
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

// ── Keyframes in presets ────────────────────────────────────

/**
 * Deep-clone a store entry's tracks for the preset file, dropping empty
 * ones. Returns undefined when the entry has no animation at all so the
 * field stays absent rather than serialising `{}`.
 */
function captureKeyframeTrack(track: KeyframeTrack | undefined): KeyframeTrack | undefined {
  if (!track) return undefined;
  const clean: KeyframeTrack = {};
  for (const [paramId, keys] of Object.entries(track)) {
    if (keys.length > 0) clean[paramId] = JSON.parse(JSON.stringify(keys)) as Keyframe[];
  }
  return Object.keys(clean).length > 0 ? clean : undefined;
}

const EASING_TYPES = new Set(["linear", "easeIn", "easeOut", "easeInOut", "hold"]);

/**
 * Coerce whatever a preset file carries as `entry.keyframes` into a valid
 * KeyframeTrack. The library is a user-editable JSON file, so the field may
 * be absent, the wrong type, or hold malformed keys — drop what does not
 * parse rather than poison the store's animation state. Tracks come back
 * sorted by time, the invariant `setKeyframesForTrack` maintains.
 */
function sanitizeKeyframeTrack(raw: unknown): KeyframeTrack | undefined {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return undefined;
  const clean: KeyframeTrack = {};
  for (const [paramId, keys] of Object.entries(raw as Record<string, unknown>)) {
    if (paramId === "__proto__" || paramId === "constructor" || paramId === "prototype") continue;
    if (!Array.isArray(keys)) continue;
    const track = keys
      .filter(
        (k): k is Keyframe =>
          !!k && typeof k === "object" && Number.isFinite(k.time) && Number.isFinite(k.value)
      )
      .map((k, i) => ({
        id: typeof k.id === "string" ? k.id : `kf-${i}`,
        time: k.time,
        value: k.value,
        easing: EASING_TYPES.has(k.easing) ? k.easing : "linear",
      }))
      .sort((a, b) => a.time - b.time);
    if (track.length > 0) clean[paramId] = track;
  }
  return Object.keys(clean).length > 0 ? clean : undefined;
}

const LFO_WAVEFORM_SET = new Set(["sine", "square", "triangle", "random"]);

/**
 * Coerce whatever a preset file carries as `entry.lfos` into valid
 * LfoSpecs — same malformed-file posture as sanitizeKeyframeTrack.
 */
function sanitizeLfoMap(raw: unknown): Record<string, LfoSpec> | undefined {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return undefined;
  const clean: Record<string, LfoSpec> = {};
  for (const [paramId, spec] of Object.entries(raw as Record<string, unknown>)) {
    if (!spec || typeof spec !== "object") continue;
    const s = spec as Record<string, unknown>;
    if (
      !LFO_WAVEFORM_SET.has(s.waveform as string) ||
      !Number.isFinite(s.rateHz) ||
      !Number.isFinite(s.depth) ||
      !Number.isFinite(s.offset)
    ) continue;
    if (paramId === "__proto__" || paramId === "constructor" || paramId === "prototype") continue;
    // Boundary clamps mirror the store's sanitizeLfo — a hand-edited file
    // must not plant NaN/Infinity specs that later poison the export bake.
    // The file's `id` is preserved (it seeds the random waveform); only a
    // missing/non-string one is replaced.
    clean[paramId] = {
      id: typeof s.id === "string" && s.id ? s.id : paramId,
      waveform: s.waveform as LfoSpec["waveform"],
      rateHz: Math.max(0, Math.min(100, s.rateHz as number)),
      depth: Math.max(0, Math.min(1, s.depth as number)),
      offset: s.offset as number,
    };
  }
  return Object.keys(clean).length > 0 ? clean : undefined;
}

// ── "Current" preset detection ──────────────────────────────

/** JSON.stringify with sorted object keys, for order-insensitive compares. */
function stableStringify(v: unknown): string {
  if (v === null || typeof v !== "object") return JSON.stringify(v) ?? "null";
  if (Array.isArray(v)) return `[${v.map(stableStringify).join(",")}]`;
  const keys = Object.keys(v as Record<string, unknown>).sort();
  return `{${keys
    .map((k) => `${JSON.stringify(k)}:${stableStringify((v as Record<string, unknown>)[k])}`)
    .join(",")}}`;
}

/** Order-insensitive signature of a keyframe track (keyframe ids ignored —
 *  two tracks that evaluate identically are the same animation). */
function trackSignature(track: KeyframeTrack | undefined): string {
  if (!track) return "";
  const parts: string[] = [];
  for (const paramId of Object.keys(track).sort()) {
    const rawKeys = track[paramId];
    if (!Array.isArray(rawKeys)) continue;
    const keys = [...rawKeys]
      .sort((a, b) => a.time - b.time)
      .map((k) => `${k.time}:${k.value}:${k.easing}`)
      .join("|");
    if (keys) parts.push(`${paramId}=${keys}`);
  }
  return parts.join(";");
}

/**
 * Whether `preset` describes what is on the stack right now — the basis for
 * the panel's CURRENT marker.
 *
 * Compared per position: effectId, enabled flag, params (key order may
 * legitimately differ after a save/load round-trip) and animation tracks.
 * Entry ids are skipped on purpose — a just-loaded preset regenerates them.
 * `ffglitchMode` counts when the preset carries one; presets saved before
 * the field existed stay matchable on the stack alone.
 */
export function presetMatchesCurrentStack(
  preset: Preset,
  stack: StackEntry[],
  keyframes: Record<string, KeyframeTrack>,
  ffglitchMode: string,
  lfos: Record<string, Record<string, LfoSpec>>
): boolean {
  if (preset.stack.length !== stack.length) return false;
  if (preset.ffglitchMode && preset.ffglitchMode !== ffglitchMode) return false;
  for (let i = 0; i < stack.length; i++) {
    const saved = preset.stack[i];
    const live = stack[i];
    if (saved.effectId !== live.effectId) return false;
    if (!!saved.enabled !== !!live.enabled) return false;
    // Modulated params are compared by track/LFO signature below — their
    // `params` entries hold resolved values, which drift with the playhead
    // and would flicker CURRENT off and on during playback.
    const modulated = new Set([
      ...Object.keys(saved.keyframes ?? {}),
      ...Object.keys(sanitizeLfoMap(saved.lfos) ?? {}),
      ...Object.keys(keyframes[live.id] ?? {}),
      ...Object.keys(lfos[live.id] ?? {}),
    ]);
    const strip = (params: Record<string, unknown>) =>
      Object.fromEntries(Object.entries(params).filter(([k]) => !modulated.has(k)));
    if (stableStringify(strip(saved.params)) !== stableStringify(strip(live.params))) return false;
    if (trackSignature(saved.keyframes) !== trackSignature(keyframes[live.id])) return false;
    if (stableStringify(sanitizeLfoMap(saved.lfos) ?? {}) !== stableStringify(sanitizeLfoMap(lfos[live.id]) ?? {})) return false;
  }
  return true;
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
      const state = useAppStore.getState();
      // Deep clone, folding each entry's live keyframe tracks into
      // `entry.keyframes` (see PresetStackEntry for why they live there).
      const stack: PresetStackEntry[] = effectStack.map((entry) => {
        const clone = JSON.parse(JSON.stringify(entry)) as PresetStackEntry;
        const tracks = captureKeyframeTrack(state.keyframes[entry.id]);
        if (tracks) clone.keyframes = tracks;
        const entryLfos = state.lfos[entry.id];
        if (entryLfos && Object.keys(entryLfos).length > 0) {
          clone.lfos = JSON.parse(JSON.stringify(entryLfos));
        }
        return clone;
      });
      const preset: Preset = {
        id: `preset-${Date.now()}`,
        name: name.trim() || `Preset ${presets.length + 1}`,
        createdAt: new Date().toISOString(),
        stack,
        thumbnail: generatePlaceholderThumb(stack) || undefined,
        ffglitchMode: state.ffglitchMode,
        ffglitchParams: state.ffglitchParams[state.ffglitchMode],
      };
      setPresets((prev) => [preset, ...prev]);
      setStatusMessage(`Preset "${preset.name}" saved`);
      // The placeholder is instant; the real render patches over it when it
      // lands. Matching by id stays correct even if the preset is deleted
      // (map over nothing) or the user saves again mid-render.
      void renderPresetThumbnail(stack).then((real) => {
        if (!real) return;
        setPresets((prev) =>
          prev.map((p) => (p.id === preset.id ? { ...p, thumbnail: real } : p))
        );
      });
    },
    [effectStack, presets.length, setStatusMessage]
  );

  const loadPreset = useCallback(
    (preset: Preset) => {
      try {
      // Presets saved before the composition guides left the effect registry
      // still contain overlay.* entries. Those IDs no longer resolve in Rust,
      // and an unknown effect there aborts the whole render, so strip them and
      // switch on the equivalent viewport guides instead.
      const { stack: migratedStack, guides, migrated } = migrateOverlayGuides(preset.stack);
      if (migrated) useAppStore.getState().setViewportGuides(guides);

      // Replace the stack atomically — no clear+setTimeout+add race condition.
      // Deep clone the preset stack so edits to the loaded stack don't mutate the preset.
      // Migrated entries still carry `keyframes` (the migration spreads each
      // entry), but the field is stripped here: live animation state belongs
      // to the store's `keyframes` map, keyed by the NEW ids generated below.
      const newStack: StackEntry[] = [];
      const restoredKeyframes: Record<string, KeyframeTrack> = {};
      const restoredLfos: Record<string, Record<string, LfoSpec>> = {};
      for (const entry of migratedStack as PresetStackEntry[]) {
        const { keyframes: rawTracks, lfos: rawLfos, ...base } = entry;
        const id = `${entry.effectId}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
        newStack.push({ ...base, id, params: JSON.parse(JSON.stringify(entry.params)) });
        const tracks = sanitizeKeyframeTrack(rawTracks);
        if (tracks) restoredKeyframes[id] = tracks;
        const entryLfos = sanitizeLfoMap(rawLfos);
        if (entryLfos) restoredLfos[id] = entryLfos;
      }
      replaceStack(newStack);
      // A preset is the whole look, animation included — so the track map is
      // replaced wholesale. Tracks keyed to the previous stack's ids would
      // all be orphans anyway (every entry id was just regenerated), which
      // is why an animation-free preset loads with an empty map rather than
      // inheriting stale tracks from whatever was on the stack before.
      useAppStore.getState().setKeyframes(restoredKeyframes);
      useAppStore.getState().setLfos(restoredLfos);
      // Older presets have no mode; leave the current one alone rather than
      // silently resetting it to "classic".
      if (preset.ffglitchMode) {
        const { setFfglitchMode, setFfglitchParam, resetFfglitchParams } = useAppStore.getState();
        setFfglitchMode(preset.ffglitchMode);
        // Replace, do not merge: a preset is the whole look. Unknown or
        // out-of-range knobs from a hand-edited file are dropped or clamped.
        resetFfglitchParams(preset.ffglitchMode);
        if (preset.ffglitchParams) {
          const clean = sanitizeFfglitchParams(preset.ffglitchMode, preset.ffglitchParams);
          for (const [id, v] of Object.entries(clean)) setFfglitchParam(preset.ffglitchMode, id, v);
        }
      }
      setStatusMessage(`Preset "${preset.name}" loaded`);
      } catch (err) {
        // The library file is user-editable and shareable — a malformed
        // entry must fail the load, not crash the panel.
        logger.error("presets", `Preset "${preset.name}" failed to load`, {
          error: err instanceof Error ? err.message : String(err),
        });
        setStatusMessage(`Preset "${preset.name}" failed to load`, "error");
      }
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
      // Revoke on a later tick: revoking immediately can cancel the
      // download before the browser has started reading the blob.
      setTimeout(() => URL.revokeObjectURL(url), 0);
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
