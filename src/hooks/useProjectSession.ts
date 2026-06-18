import { useEffect, useRef, useCallback } from "react";
import { useAppStore, type StackEntry, type KeyframeTrack, type AudioBinding } from "../store";

const AUTO_SAVE_KEY = "moshdither_autosave_v1";
const RECENT_PROJECTS_KEY = "moshdither_recent_projects_v1";
const AUTO_SAVE_INTERVAL_MS = 30000; // 30 seconds

export interface ProjectSession {
  filePath: string | null;
  effectStack: StackEntry[];
  currentTime: number;
  keyframes: Record<string, KeyframeTrack>;
  audioFilePath: string | null;
  audioBindings: Record<string, Record<string, AudioBinding>>;
  savedAt: string;
}

export interface RecentProject {
  path: string;
  name: string;
  openedAt: string;
}

function loadAutoSave(): ProjectSession | null {
  try {
    const raw = localStorage.getItem(AUTO_SAVE_KEY);
    if (!raw) return null;
    return JSON.parse(raw) as ProjectSession;
  } catch {
    return null;
  }
}

function saveAutoSave(session: ProjectSession) {
  localStorage.setItem(AUTO_SAVE_KEY, JSON.stringify(session));
}

function loadRecentProjects(): RecentProject[] {
  try {
    const raw = localStorage.getItem(RECENT_PROJECTS_KEY);
    if (!raw) return [];
    return JSON.parse(raw) as RecentProject[];
  } catch {
    return [];
  }
}

function saveRecentProjects(projects: RecentProject[]) {
  const trimmed = projects.slice(0, 10);
  localStorage.setItem(RECENT_PROJECTS_KEY, JSON.stringify(trimmed));
}

export function useProjectSession() {
  const autoSaveTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const effectStack = useAppStore((s) => s.effectStack);
  const currentTime = useAppStore((s) => s.currentTime);
  const filePath = useAppStore((s) => s.filePath);
  const keyframes = useAppStore((s) => s.keyframes);
  const audioFilePath = useAppStore((s) => s.audioFilePath);
  const audioBindings = useAppStore((s) => s.audioBindings);
  const setStatusMessage = useAppStore((s) => s.setStatusMessage);

  // Auto-save interval
  useEffect(() => {
    if (autoSaveTimerRef.current) {
      clearInterval(autoSaveTimerRef.current);
    }
    autoSaveTimerRef.current = setInterval(() => {
      const session: ProjectSession = {
        filePath,
        effectStack: JSON.parse(JSON.stringify(effectStack)),
        currentTime,
        keyframes: JSON.parse(JSON.stringify(keyframes)),
        audioFilePath,
        audioBindings: JSON.parse(JSON.stringify(audioBindings)),
        savedAt: new Date().toISOString(),
      };
      saveAutoSave(session);
    }, AUTO_SAVE_INTERVAL_MS);

    return () => {
      if (autoSaveTimerRef.current) {
        clearInterval(autoSaveTimerRef.current);
      }
    };
  }, [effectStack, currentTime, filePath, keyframes, audioFilePath, audioBindings]);

  const addToRecent = useCallback((path: string, name: string) => {
    const recent = loadRecentProjects();
    const filtered = recent.filter((p) => p.path !== path);
    const updated: RecentProject[] = [{ path, name, openedAt: new Date().toISOString() }, ...filtered];
    saveRecentProjects(updated);
  }, []);

  const restoreSession = useCallback(
    (session: ProjectSession) => {
      const store = useAppStore.getState();
      if (session.effectStack) {
        // Clear and rebuild stack
        store.clearStack();
        setTimeout(() => {
          for (const entry of session.effectStack) {
            const effect = store.allEffects.find((e) => e.id === entry.effectId);
            if (!effect) continue;
            store.addToStack(effect);
            const last = store.effectStack[store.effectStack.length - 1];
            if (last && last.effectId === entry.effectId) {
              store.updateStackParams(last.id, entry.params);
              if (!entry.enabled) store.toggleStackItem(last.id);
              if (entry.maskId !== undefined) store.setStackItemMask(last.id, entry.maskId);
            }
          }
        }, 0);
      }
      if (session.currentTime !== undefined) store.setCurrentTime(session.currentTime);
      if (session.filePath !== undefined) store.setFilePath(session.filePath);
      if (session.keyframes !== undefined) {
        // Direct mutation since keyframes is a Record, replace wholesale
        const storeAny = store as unknown as Record<string, unknown>;
        storeAny.keyframes = session.keyframes;
      }
      if (session.audioFilePath !== undefined) store.setFilePath(session.audioFilePath);
      if (session.audioBindings !== undefined) {
        const storeAny = store as unknown as Record<string, unknown>;
        storeAny.audioBindings = session.audioBindings;
      }
      setStatusMessage("Session restored");
    },
    [setStatusMessage]
  );

  const clearAutoSave = useCallback(() => {
    localStorage.removeItem(AUTO_SAVE_KEY);
  }, []);

  return {
    autoSave: loadAutoSave(),
    recentProjects: loadRecentProjects(),
    addToRecent,
    restoreSession,
    clearAutoSave,
  };
}
