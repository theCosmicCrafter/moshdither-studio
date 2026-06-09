import { useState, useEffect, useCallback } from "react";

export interface UpdateInfo {
  version: string;
  releaseDate: string;
}

export interface UpdateProgress {
  percent: number;
  bytesPerSecond: number;
  total: number;
  transferred: number;
}

export interface UpdaterState {
  status:
    | "idle"
    | "checking"
    | "available"
    | "downloading"
    | "downloaded"
    | "error";
  info: UpdateInfo | null;
  progress: UpdateProgress | null;
  error: string | null;
}

/**
 * Renderer-side hook for auto-updater events.
 * Listens to main-process update notifications and exposes check/install actions.
 */
export function useAutoUpdater(): UpdaterState & {
  checkNow: () => Promise<unknown>;
  installNow: () => void;
} {
  const [state, setState] = useState<UpdaterState>({
    status: "idle",
    info: null,
    progress: null,
    error: null,
  });

  useEffect(() => {
    if (!window.ipcRenderer) return;

    const unsubChecking = window.ipcRenderer.on("update:checking", () => {
      setState((s) => ({ ...s, status: "checking", error: null }));
    });

    const unsubAvailable = window.ipcRenderer.on(
      "update:available",
      (_event, info) => {
        setState((s) => ({
          ...s,
          status: "available",
          info: (info as UpdateInfo) ?? null,
        }));
      },
    );

    const unsubNotAvailable = window.ipcRenderer.on(
      "update:not-available",
      () => {
        setState((s) => ({ ...s, status: "idle" }));
      },
    );

    const unsubProgress = window.ipcRenderer.on(
      "update:progress",
      (_event, progress) => {
        setState((s) => ({
          ...s,
          status: "downloading",
          progress: (progress as UpdateProgress) ?? null,
        }));
      },
    );

    const unsubDownloaded = window.ipcRenderer.on(
      "update:downloaded",
      (_event, info) => {
        setState((s) => ({
          ...s,
          status: "downloaded",
          info: (info as UpdateInfo) ?? null,
          progress: null,
        }));
      },
    );

    const unsubError = window.ipcRenderer.on("update:error", (_event, err) => {
      const errorObj = err as { message?: string } | undefined;
      setState((s) => ({
        ...s,
        status: "error",
        error: errorObj?.message ?? String(err),
      }));
    });

    return () => {
      unsubChecking();
      unsubAvailable();
      unsubNotAvailable();
      unsubProgress();
      unsubDownloaded();
      unsubError();
    };
  }, []);

  const checkNow = useCallback(async () => {
    if (!window.ipcRenderer) return null;
    return window.ipcRenderer.invoke("update:check-now");
  }, []);

  const installNow = useCallback(() => {
    if (!window.ipcRenderer) return;
    window.ipcRenderer.invoke("update:install-now");
  }, []);

  return { ...state, checkNow, installNow };
}
