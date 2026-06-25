import { useEffect, useRef, useCallback, useState } from "react";
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

  // Refs to hold latest state without retriggering the interval
  const stateRef = useRef({
    effectStack: useAppStore.getState().effectStack,
    currentTime: useAppStore.getState().currentTime,
    filePath: useAppStore.getState().filePath,
    keyframes: useAppStore.getState().keyframes,
    audioFilePath: useAppStore.getState().audioFilePath,
    audioBindings: useAppStore.getState().audioBindings,
  });

  // Subscribe to store updates and sync into ref (single subscription)
  useEffect(() => {
    const unsub = useAppStore.subscribe((s) => {
      stateRef.current.effectStack = s.effectStack;
      stateRef.current.currentTime = s.currentTime;
      stateRef.current.filePath = s.filePath;
      stateRef.current.keyframes = s.keyframes;
      stateRef.current.audioFilePath = s.audioFilePath;
      stateRef.current.audioBindings = s.audioBindings;
    });
    return unsub;
  }, []);

  const setStatusMessage = useAppStore((s) => s.setStatusMessage);

  // Auto-save interval — set up once, reads from refs
  useEffect(() => {
    autoSaveTimerRef.current = setInterval(() => {
      const { effectStack, currentTime, filePath, keyframes, audioFilePath, audioBindings } =
        stateRef.current;
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
  }, []);

  const addToRecent = useCallback((path: string, name: string) => {
    const recent = loadRecentProjects();
    const filtered = recent.filter((p) => p.path !== path);
    const updated: RecentProject[] = [
      { path, name, openedAt: new Date().toISOString() },
      ...filtered,
    ];
    saveRecentProjects(updated);
  }, []);

  const restoreSession = useCallback(
    (session: ProjectSession) => {
      const store = useAppStore.getState();
      if (session.effectStack) {
        // Clear and rebuild stack
        store.clearStack();
        setTimeout(() => {
          const s = useAppStore.getState();
          for (const entry of session.effectStack) {
            const effect = s.allEffects.find((e) => e.id === entry.effectId);
            if (!effect) continue;
            s.addToStack(effect);
            const last = s.effectStack[s.effectStack.length - 1];
            if (last && last.effectId === entry.effectId) {
              s.updateStackParams(last.id, entry.params);
              if (!entry.enabled) s.toggleStackItem(last.id);
              if (entry.maskId !== undefined) s.setStackItemMask(last.id, entry.maskId);
            }
          }
        }, 0);
      }
      if (session.currentTime !== undefined) store.setCurrentTime(session.currentTime);
      if (session.filePath !== undefined) store.setFilePath(session.filePath);
      if (session.keyframes !== undefined) {
        store.setKeyframes(session.keyframes);
      }
      if (session.audioFilePath !== undefined) store.setAudioFilePath(session.audioFilePath);
      if (session.audioBindings !== undefined) {
        store.setAudioBindings(session.audioBindings);
      }
      setStatusMessage("Session restored");
    },
    [setStatusMessage]
  );

  const clearAutoSave = useCallback(() => {
    localStorage.removeItem(AUTO_SAVE_KEY);
  }, []);

  const [autoSave] = useState(loadAutoSave);
  const [recentProjects] = useState(loadRecentProjects);

  return {
    autoSave,
    recentProjects,
    addToRecent,
    restoreSession,
    clearAutoSave,
  };
}
