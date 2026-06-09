/**
 * Auto-save utility for MoshDither Studio.
 *
 * Serializes project state to disk every 30 seconds and provides
 * crash recovery on next launch.
 */

import type { Effect } from "../types/effectTypes";

export interface SerializedProject {
  version: number;
  savedAt: string;
  activeEffects: Effect[];
  mediaUrl: string | null;
  mediaType: "image" | "video" | null;
  currentTime: number;
  duration: number;
  qualityMode: "full" | "live" | "still";
  zoomLevel: number;
  pixelGrid: boolean;
  aspectRatio: string;
  exportFormat: "same" | "png" | "jpg" | "gif" | "mp4";
  exportFps: number;
  outputDirectory: string | null;
}

const AUTOSAVE_INTERVAL_MS = 30000; // 30 seconds

let autosaveTimer: ReturnType<typeof setInterval> | null = null;

export function startAutoSave(getState: () => SerializedProject) {
  if (autosaveTimer) {
    clearInterval(autosaveTimer);
  }

  autosaveTimer = setInterval(async () => {
    const state = getState();
    if (!state) return;

    // Only save if there are effects or media loaded
    if (!state.mediaUrl && state.activeEffects.length === 0) return;

    try {
      const json = JSON.stringify(state);
      await window.ipcRenderer.invoke("autosave:write", json);
    } catch (err) {
      console.warn("[AutoSave] Failed to save:", err);
    }
  }, AUTOSAVE_INTERVAL_MS);

  console.log("[AutoSave] Started (interval: 30s)");
}

export function stopAutoSave() {
  if (autosaveTimer) {
    clearInterval(autosaveTimer);
    autosaveTimer = null;
    console.log("[AutoSave] Stopped");
  }
}

export async function loadAutoSave(): Promise<SerializedProject | null> {
  try {
    const data = await window.ipcRenderer.invoke<string | null>(
      "autosave:read",
    );
    if (!data) return null;
    const parsed = JSON.parse(data) as SerializedProject;
    console.log("[AutoSave] Loaded snapshot from:", parsed.savedAt);
    return parsed;
  } catch (err) {
    console.warn("[AutoSave] Failed to load:", err);
    return null;
  }
}

export async function clearAutoSave(): Promise<void> {
  try {
    await window.ipcRenderer.invoke("autosave:clear");
  } catch (err) {
    console.warn("[AutoSave] Failed to clear:", err);
  }
}

export async function checkCrashRecovery(): Promise<boolean> {
  try {
    return await window.ipcRenderer.invoke<boolean>("crash:check");
  } catch {
    return false;
  }
}

export async function dismissCrashRecovery(): Promise<void> {
  try {
    await window.ipcRenderer.invoke("crash:dismiss");
  } catch {
    // Ignore
  }
}
