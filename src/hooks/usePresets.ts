import { useCallback, useEffect, useState } from "react";
import { useAppStore, type StackEntry } from "../store";
import { migrateOverlayGuides } from "../utils/migrateOverlayGuides";
import { DEFAULT_PRESETS } from "./defaultPresets";

export interface Preset {
  id: string;
  name: string;
  createdAt: string;
  stack: StackEntry[];
  thumbnail?: string; // base64 PNG data URL
}

const STORAGE_KEY = "moshdither_presets_v2";

function loadPresets(): Preset[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    const userPresets: Preset[] = raw ? (JSON.parse(raw) as Preset[]) : [];
    // Merge default presets (avoid duplicates by id)
    const existingIds = new Set(userPresets.map((p) => p.id));
    const merged = [...userPresets];
    for (const preset of DEFAULT_PRESETS) {
      if (!existingIds.has(preset.id)) {
        merged.push({ ...preset, thumbnail: generateThumbnail(preset.stack) });
      }
    }
    return merged;
  } catch {
    return DEFAULT_PRESETS.map((p) => ({ ...p, thumbnail: generateThumbnail(p.stack) }));
  }
}

function savePresets(presets: Preset[]) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(presets));
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
  const [presets, setPresets] = useState<Preset[]>(loadPresets);
  const effectStack = useAppStore((s) => s.effectStack);
  const replaceStack = useAppStore((s) => s.replaceStack);
  const setStatusMessage = useAppStore((s) => s.setStatusMessage);

  // Persist whenever presets change
  useEffect(() => {
    savePresets(presets);
  }, [presets]);

  const savePreset = useCallback(
    (name: string) => {
      const thumbnail = generateThumbnail(effectStack);
      const preset: Preset = {
        id: `preset-${Date.now()}`,
        name: name.trim() || `Preset ${presets.length + 1}`,
        createdAt: new Date().toISOString(),
        stack: JSON.parse(JSON.stringify(effectStack)), // deep clone
        thumbnail,
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
      const blob = new Blob([JSON.stringify(toExport, null, 2)], { type: "application/json" });
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
          const imported = JSON.parse(reader.result as string) as Preset[];
          if (!Array.isArray(imported)) throw new Error("Invalid file format");
          const valid = imported.filter((p) => p.id && p.name && Array.isArray(p.stack));
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

  return { presets, savePreset, loadPreset, deletePreset, exportPresets, importPresets };
}
