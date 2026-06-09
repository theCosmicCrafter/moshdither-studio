/**
 * Cloud Sync / Collaboration for MoshDither Studio.
 *
 * STATUS: STUB — requires backend infrastructure.
 *
 * Planned features:
 * - Save projects to cloud (Dropbox, Google Drive, or custom backend)
 * - Sync settings and presets across devices
 * - Share projects via link (read-only or editable)
 * - Real-time collaborative editing
 * - Comments/annotations on timeline
 */

export interface CloudProject {
  id: string;
  name: string;
  ownerId: string;
  collaborators: string[];
  lastSyncedAt: string;
  version: number;
}

export interface SyncProvider {
  name: string;
  id: string;
  connected: boolean;
}

const providers: SyncProvider[] = [
  { name: "Dropbox", id: "dropbox", connected: false },
  { name: "Google Drive", id: "gdrive", connected: false },
  { name: "MoshDither Cloud", id: "moshcloud", connected: false },
];

export function getSyncProviders(): SyncProvider[] {
  return [...providers];
}

export async function connectProvider(providerId: string): Promise<boolean> {
  console.warn(`[CloudSync] ${providerId} integration requires OAuth backend. Not yet implemented.`);
  return false;
}

export async function syncProject(_projectId: string): Promise<boolean> {
  console.warn("[CloudSync] syncProject requires cloud backend. Not yet implemented.");
  return false;
}

export async function shareProject(
  _projectId: string,
  _options: { readOnly: boolean; expiresInDays?: number },
): Promise<string | null> {
  console.warn("[CloudSync] shareProject requires cloud backend. Not yet implemented.");
  return null;
}
