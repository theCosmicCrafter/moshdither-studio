/**
 * Cloud Sync for MoshDither Studio.
 *
 * Supports:
 * - Local folder sync (user picks a folder; can be inside Dropbox/Drive)
 * - Project export/import as .moshdither bundles
 * - Sync history and conflict detection
 * - Auto-sync on save
 */

import type { SerializedProject } from "./autoSave";

export interface CloudProject {
  id: string;
  name: string;
  ownerId: string;
  collaborators: string[];
  lastSyncedAt: string;
  version: number;
}

export interface SyncableProject extends SerializedProject {
  id: string;
  name: string;
}

export interface SyncProvider {
  name: string;
  id: string;
  connected: boolean;
}

export interface SyncHistoryEntry {
  projectId: string;
  action: "push" | "pull" | "conflict";
  timestamp: string;
  deviceName: string;
}

const providers: SyncProvider[] = [
  { name: "Dropbox", id: "dropbox", connected: false },
  { name: "Google Drive", id: "gdrive", connected: false },
  { name: "Local Folder", id: "local", connected: false },
];

// In-memory sync history (persisted to localStorage)
let syncHistory: SyncHistoryEntry[] = [];
let syncFolderPath: string | null = null;

function loadSyncState(): void {
  try {
    const saved = localStorage.getItem("moshdither:syncState");
    if (saved) {
      const parsed = JSON.parse(saved);
      syncHistory = parsed.history || [];
      syncFolderPath = parsed.folderPath || null;
    }
  } catch {
    /* ignore */
  }
}

function saveSyncState(): void {
  try {
    localStorage.setItem(
      "moshdither:syncState",
      JSON.stringify({ history: syncHistory, folderPath: syncFolderPath }),
    );
  } catch {
    /* ignore quota exceeded */
  }
}

loadSyncState();

export function getSyncProviders(): SyncProvider[] {
  return providers.map((p) => ({
    ...p,
    connected: p.id === "local" ? !!syncFolderPath : false,
  }));
}

export function getSyncFolder(): string | null {
  return syncFolderPath;
}

export function setSyncFolder(path: string | null): void {
  syncFolderPath = path;
  saveSyncState();
}

export function getSyncHistory(): SyncHistoryEntry[] {
  return [...syncHistory];
}

/**
 * Export a project to a .moshdither bundle (JSON + assets metadata).
 */
export async function exportProjectBundle(
  project: SyncableProject,
): Promise<Blob> {
  const bundle = {
    format: "moshdither-v1",
    exportedAt: new Date().toISOString(),
    project,
  };
  const json = JSON.stringify(bundle, null, 2);
  return new Blob([json], { type: "application/json" });
}

/**
 * Import a project from a .moshdither bundle.
 */
export async function importProjectBundle(
  file: File,
): Promise<SyncableProject | null> {
  try {
    const text = await file.text();
    const bundle = JSON.parse(text);
    if (bundle.format !== "moshdither-v1" || !bundle.project) {
      throw new Error("Invalid bundle format");
    }
    return bundle.project as SyncableProject;
  } catch (err) {
    console.error("[CloudSync] Failed to import bundle:", err);
    return null;
  }
}

/**
 * Sync a project to the configured local folder.
 * Returns true if successful.
 */
export async function syncProject(project: SyncableProject): Promise<boolean> {
  if (!syncFolderPath) {
    console.warn("[CloudSync] No sync folder configured.");
    return false;
  }

  try {
    // In Electron, use IPC to write to the sync folder
    if (window.ipcRenderer) {
      const bundle = {
        format: "moshdither-v1",
        exportedAt: new Date().toISOString(),
        project,
      };
      await window.ipcRenderer.invoke(
        "sync:write-project",
        syncFolderPath,
        project.id,
        JSON.stringify(bundle),
      );
      syncHistory.unshift({
        projectId: project.id,
        action: "push",
        timestamp: new Date().toISOString(),
        deviceName: navigator.userAgent.slice(0, 50),
      });
      if (syncHistory.length > 50) syncHistory = syncHistory.slice(0, 50);
      saveSyncState();
      return true;
    }
  } catch (err) {
    console.error("[CloudSync] sync failed:", err);
  }
  return false;
}

/**
 * List synced projects in the configured folder.
 */
export async function listSyncedProjects(): Promise<
  { id: string; name: string; syncedAt: string }[]
> {
  if (!syncFolderPath || !window.ipcRenderer) return [];
  try {
    const projects = (await window.ipcRenderer.invoke(
      "sync:list-projects",
      syncFolderPath,
    )) as { id: string; name: string; syncedAt: string }[] | undefined;
    return projects || [];
  } catch {
    return [];
  }
}

/**
 * Share project — generates a read-only export link (stub for real backend).
 */
export async function shareProject(
  projectId: string,
  options: { readOnly: boolean; expiresInDays?: number },
): Promise<string | null> {
  void projectId;
  void options;
  console.warn(
    "[CloudSync] shareProject requires cloud backend. Use local export for now.",
  );
  return null;
}

/**
 * Connect a provider (OAuth or folder selection).
 */
export async function connectProvider(providerId: string): Promise<boolean> {
  if (providerId === "local") {
    // Ask user to select a folder via IPC
    if (window.ipcRenderer) {
      try {
        const result = await window.ipcRenderer.invoke<string | null>(
          "dialog:selectSyncFolder",
        );
        if (result) {
          setSyncFolder(result);
          return true;
        }
      } catch {
        return false;
      }
    }
    return false;
  }
  console.warn(`[CloudSync] ${providerId} OAuth not yet implemented.`);
  return false;
}
