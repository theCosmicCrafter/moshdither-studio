import { useState, useCallback, useEffect } from "react";

/**
 * Persist sensitive data using Electron's safeStorage API (encrypted with
 * OS-level keys: DPAPI on Windows, Keychain on macOS, Secret Service on Linux).
 *
 * Falls back to an in-memory-only store if safeStorage is unavailable.
 */
export function useSafeStorage(
  key: string,
): [string | null, (val: string | null) => Promise<void>] {
  const [value, setValueState] = useState<string | null>(null);

  // Load encrypted value from main process on mount
  useEffect(() => {
    if (!window.ipcRenderer) return;
    let cancelled = false;
    window.ipcRenderer
      .invoke<string | null>("safe-storage:read", key)
      .then((val) => {
        if (!cancelled) setValueState(val);
      })
      .catch(() => {
        // If safeStorage is unavailable, stay at null (in-memory fallback)
      });
    return () => {
      cancelled = true;
    };
  }, [key]);

  const setValue = useCallback(
    async (val: string | null) => {
      if (!window.ipcRenderer) {
        setValueState(val);
        return;
      }
      try {
        if (val === null) {
          await window.ipcRenderer.invoke("safe-storage:delete", key);
        } else {
          await window.ipcRenderer.invoke("safe-storage:write", key, val);
        }
        setValueState(val);
      } catch {
        // If safeStorage fails (e.g. not available), keep in memory only
        setValueState(val);
      }
    },
    [key],
  );

  return [value, setValue];
}
