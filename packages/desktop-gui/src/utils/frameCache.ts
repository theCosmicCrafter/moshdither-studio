/**
 * Frame cache IPC client for MoshDither Studio.
 *
 * All disk I/O is delegated to the main process via IPC.
 * The renderer never touches fs/path/os/crypto directly.
 */

export async function getCachedFrame(key: string): Promise<string | null> {
  if (!window.ipcRenderer) return null;
  return window.ipcRenderer.invoke<string | null>("cache:get-frame", key);
}

export async function setCachedFrame(
  key: string,
  data: Uint8Array,
): Promise<void> {
  if (!window.ipcRenderer) return;
  await window.ipcRenderer.invoke("cache:set-frame", key, data);
}

export async function clearFrameCache(): Promise<void> {
  if (!window.ipcRenderer) return;
  await window.ipcRenderer.invoke("cache:clear");
}

export async function getCacheStats(): Promise<{
  entries: number;
  sizeMB: number;
}> {
  if (!window.ipcRenderer) return { entries: 0, sizeMB: 0 };
  return window.ipcRenderer.invoke<{ entries: number; sizeMB: number }>(
    "cache:stats",
  );
}
