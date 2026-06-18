import { useCallback } from "react";
import { open, save } from "@tauri-apps/plugin-dialog";
import { invoke } from "@tauri-apps/api/core";
import { useAppStore, type StackEntry } from "../store";

export interface ProjectFile {
  version: number;
  createdAt: string;
  effectStack: StackEntry[];
  keyframes: Record<
    string,
    Record<string, { id: string; time: number; value: number; easing: string }[]>
  >;
  audioBindings: Record<string, Record<string, unknown>>;
  mediaFilePath: string | null;
  activeMask: string | null;
}

const PROJECT_VERSION = 1;

export function useProject() {
  const effectStack = useAppStore((s) => s.effectStack);
  const keyframes = useAppStore((s) => s.keyframes);
  const audioBindings = useAppStore((s) => s.audioBindings);
  const filePath = useAppStore((s) => s.filePath);
  const activeMask = useAppStore((s) => s.activeMask);
  const clearStack = useAppStore((s) => s.clearStack);
  const addToStack = useAppStore((s) => s.addToStack);
  const setFilePath = useAppStore((s) => s.setFilePath);
  const setStatusMessage = useAppStore((s) => s.setStatusMessage);
  const allEffects = useAppStore((s) => s.allEffects);

  const saveProject = useCallback(async () => {
    try {
      const path = await save({
        filters: [{ name: "MoshDither Project", extensions: ["moshdither"] }],
        defaultPath: "project.moshdither",
      });
      if (!path) return false;

      const project: ProjectFile = {
        version: PROJECT_VERSION,
        createdAt: new Date().toISOString(),
        effectStack: JSON.parse(JSON.stringify(effectStack)),
        keyframes,
        audioBindings,
        mediaFilePath: filePath,
        activeMask,
      };

      await invoke("save_file", { path, contents: JSON.stringify(project, null, 2) });
      setStatusMessage(`Project saved: ${path}`);
      return true;
    } catch (err) {
      setStatusMessage(`Save failed: ${err}`);
      return false;
    }
  }, [effectStack, keyframes, audioBindings, filePath, activeMask, setStatusMessage]);

  const openProject = useCallback(async () => {
    try {
      const path = await open({
        filters: [{ name: "MoshDither Project", extensions: ["moshdither"] }],
        multiple: false,
      });
      if (!path || typeof path !== "string") return false;

      const raw = await invoke<string>("read_file", { path });
      const project = JSON.parse(raw) as ProjectFile;

      if (project.version !== PROJECT_VERSION) {
        setStatusMessage(`Warning: project version ${project.version} may not be fully compatible`);
      }

      // Restore effect stack
      clearStack();
      setTimeout(() => {
        for (const entry of project.effectStack) {
          const effect = allEffects.find((e) => e.id === entry.effectId);
          if (!effect) continue;
          addToStack(effect);
          const store = useAppStore.getState();
          const last = store.effectStack[store.effectStack.length - 1];
          if (last && last.effectId === entry.effectId) {
            store.updateStackParams(last.id, entry.params);
            if (!entry.enabled) store.toggleStackItem(last.id);
          }
        }
      }, 0);

      if (project.mediaFilePath) {
        setFilePath(project.mediaFilePath);
      }

      setStatusMessage(`Project loaded: ${path}`);
      return true;
    } catch (err) {
      setStatusMessage(`Open failed: ${err}`);
      return false;
    }
  }, [allEffects, clearStack, addToStack, setFilePath, setStatusMessage]);

  return { saveProject, openProject };
}
