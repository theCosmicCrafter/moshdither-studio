import { useEffect, useRef, useCallback, useState } from "react";
import { useAppStore, type StackEntry, type KeyframeTrack, type AudioBinding } from "../store";
import { loadMediaFromPath, loadMediaFromBase64 } from "../lib/tauri";
import { migrateOverlayGuides } from "../utils/migrateOverlayGuides";

const AUTO_SAVE_KEY = "moshdither_autosave_v1";
const RECENT_PROJECTS_KEY = "moshdither_recent_projects_v1";
const AUTO_SAVE_INTERVAL_MS = 5000; // 5 seconds for reliable autosave

export interface ProjectSession {
  filePath: string | null;
  mediaDataUrl?: string | null;
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
  try {
    localStorage.setItem(AUTO_SAVE_KEY, JSON.stringify(session));
  } catch {
    // If base64 media exceeds localStorage quota, save session without mediaDataUrl
    if (session.mediaDataUrl) {
      try {
        const fallback = { ...session, mediaDataUrl: null };
        localStorage.setItem(AUTO_SAVE_KEY, JSON.stringify(fallback));
      } catch {
        // Quota still exceeded
      }
    }
  }
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
    previewDataUrl: useAppStore.getState().previewDataUrl,
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
      stateRef.current.previewDataUrl = s.previewDataUrl;
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
      const {
        effectStack,
        currentTime,
        filePath,
        previewDataUrl,
        keyframes,
        audioFilePath,
        audioBindings,
      } = stateRef.current;

      // Only save if there is content to save
      if (filePath || previewDataUrl || effectStack.length > 0 || audioFilePath) {
        const session: ProjectSession = {
          filePath,
          mediaDataUrl: previewDataUrl,
          effectStack: JSON.parse(JSON.stringify(effectStack)),
          currentTime,
          keyframes: JSON.parse(JSON.stringify(keyframes)),
          audioFilePath,
          audioBindings: JSON.parse(JSON.stringify(audioBindings)),
          savedAt: new Date().toISOString(),
        };
        saveAutoSave(session);
      }
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
    async (session: ProjectSession, onRefreshPreview?: () => Promise<boolean>) => {
      const store = useAppStore.getState();

      // 1. Restore effect stack directly.
      // Sessions auto-saved before the composition guides left the effect
      // registry still contain overlay.* entries, which no longer resolve in
      // Rust and would abort the render. Strip them into viewport guides.
      if (session.effectStack && session.effectStack.length > 0) {
        const { stack, guides, migrated } = migrateOverlayGuides(session.effectStack);
        if (migrated) store.setViewportGuides(guides);
        store.setEffectStack(stack);
      } else {
        store.clearStack();
      }

      // 2. Restore timeline time, keyframes, audio
      if (session.currentTime !== undefined) store.setCurrentTime(session.currentTime);
      if (session.keyframes !== undefined) store.setKeyframes(session.keyframes);
      if (session.audioFilePath !== undefined) store.setAudioFilePath(session.audioFilePath);
      if (session.audioBindings !== undefined) store.setAudioBindings(session.audioBindings);

      // 3. Reload media file or base64 data into memory
      let mediaRestored = false;
      if (session.filePath) {
        store.setFilePath(session.filePath);
        try {
          await loadMediaFromPath(session.filePath);
          if (onRefreshPreview) {
            await onRefreshPreview();
          }
          mediaRestored = true;
        } catch (err) {
          console.error("[useProjectSession] Failed to load media from filePath:", err);
        }
      }

      if (!mediaRestored && session.mediaDataUrl) {
        try {
          await loadMediaFromBase64(session.mediaDataUrl);
          if (onRefreshPreview) {
            await onRefreshPreview();
          }
          mediaRestored = true;
        } catch (err) {
          console.error("[useProjectSession] Failed to load media from base64:", err);
        }
      }

      setStatusMessage(
        mediaRestored
          ? `Session restored (${session.effectStack?.length ?? 0} effects)`
          : "Session restored"
      );
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

