import { useState, useCallback, useEffect } from "react";
import { useAppStore, type StackEntry } from "../store";

export interface Preset {
  id: string;
  name: string;
  createdAt: string;
  stack: StackEntry[];
}

const STORAGE_KEY = "moshdither_presets_v1";

function loadPresets(): Preset[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    return JSON.parse(raw) as Preset[];
  } catch {
    return [];
  }
}

function savePresets(presets: Preset[]) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(presets));
}

export function usePresets() {
  const [presets, setPresets] = useState<Preset[]>(loadPresets);
  const effectStack = useAppStore((s) => s.effectStack);
  const clearStack = useAppStore((s) => s.clearStack);
  const addToStack = useAppStore((s) => s.addToStack);
  const allEffects = useAppStore((s) => s.allEffects);
  const setStatusMessage = useAppStore((s) => s.setStatusMessage);

  // Persist whenever presets change
  useEffect(() => {
    savePresets(presets);
  }, [presets]);

  const savePreset = useCallback(
    (name: string) => {
      const preset: Preset = {
        id: `preset-${Date.now()}`,
        name: name.trim() || `Preset ${presets.length + 1}`,
        createdAt: new Date().toISOString(),
        stack: JSON.parse(JSON.stringify(effectStack)), // deep clone
      };
      setPresets((prev) => [preset, ...prev]);
      setStatusMessage(`Preset "${preset.name}" saved`);
    },
    [effectStack, presets.length, setStatusMessage]
  );

  const loadPreset = useCallback(
    (preset: Preset) => {
      clearStack();
      // Small delay to let clearStack propagate before adding
      setTimeout(() => {
        for (const entry of preset.stack) {
          const effect = allEffects.find((e) => e.id === entry.effectId);
          if (!effect) continue;
          // Add to stack then update params to match preset
          addToStack(effect);
          // The last added item will be selected; update its params
          const store = useAppStore.getState();
          const last = store.effectStack[store.effectStack.length - 1];
          if (last && last.effectId === entry.effectId) {
            store.updateStackParams(last.id, entry.params);
            if (!entry.enabled) store.toggleStackItem(last.id);
          }
        }
      }, 0);
      setStatusMessage(`Preset "${preset.name}" loaded`);
    },
    [allEffects, clearStack, addToStack, setStatusMessage]
  );

  const deletePreset = useCallback(
    (id: string) => {
      setPresets((prev) => prev.filter((p) => p.id !== id));
      setStatusMessage("Preset deleted");
    },
    [setStatusMessage]
  );

  return { presets, savePreset, loadPreset, deletePreset };
}
