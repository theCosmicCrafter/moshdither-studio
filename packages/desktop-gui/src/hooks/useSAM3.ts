/**
 * SAM 3 / AI Masking integration for MoshDither Studio.
 *
 * Model loading and inference run in the MAIN PROCESS via IPC,
 * because Transformers.js filesystem cache requires Node.js fs access
 * which is unavailable in Electron's sandboxed renderer.
 *
 * The renderer sends only the image file path + click coordinates.
 * Main loads the image from disk, runs inference, returns mask bytes.
 *
 * State lives in a module-level store shared by every component that
 * calls useSAM3(), so loading/segmenting status stays consistent
 * across the Viewport, PropertiesPanel, and anywhere else.
 */

import { useCallback, useSyncExternalStore } from "react";

export type SAM3Status = "idle" | "loading" | "ready" | "error" | "segmenting";

export interface SAM3Mask {
  data: Uint8Array;
  width: number;
  height: number;
}

interface SAM3State {
  status: SAM3Status;
  progress: number;
  loadingStep: string;
  error: string | null;
}

// ---------------------------------------------------------------------------
// Module-level shared store
// ---------------------------------------------------------------------------
let storeState: SAM3State = {
  status: "idle",
  progress: 0,
  loadingStep: "",
  error: null,
};

const listeners = new Set<() => void>();

function setStoreState(partial: Partial<SAM3State>): void {
  storeState = { ...storeState, ...partial };
  listeners.forEach((l) => l());
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

function getSnapshot(): SAM3State {
  return storeState;
}

interface SAM3ProgressEvent {
  status: string;
  file?: string;
  progress?: number;
}

let progressUnsubscribe: (() => void) | null = null;

function attachProgressListener(): void {
  if (progressUnsubscribe || !window.ipcRenderer) return;
  progressUnsubscribe = window.ipcRenderer.on(
    "sam3:progress",
    (_event: unknown, ...args: unknown[]) => {
      const info = args[0] as SAM3ProgressEvent;
      if (storeState.status !== "loading") return;
      if (info.status === "progress" && typeof info.progress === "number") {
        setStoreState({
          progress: Math.max(storeState.progress, Math.round(info.progress)),
          loadingStep: info.file
            ? `Downloading ${info.file}...`
            : "Downloading model files...",
        });
      } else if (info.status === "done" && info.file) {
        setStoreState({ loadingStep: `Loaded ${info.file}` });
      }
    },
  );
}

function detachProgressListener(): void {
  if (progressUnsubscribe) {
    progressUnsubscribe();
    progressUnsubscribe = null;
  }
}

let loadInFlight: Promise<boolean> | null = null;

async function loadModelShared(): Promise<boolean> {
  if (storeState.status === "ready") return true;
  if (loadInFlight) return loadInFlight;

  if (!window.ipcRenderer) {
    setStoreState({
      status: "error",
      error: "IPC not available. Run inside Electron.",
    });
    return false;
  }

  setStoreState({
    status: "loading",
    progress: 0,
    loadingStep: "Downloading model files...",
    error: null,
  });
  attachProgressListener();

  loadInFlight = (async () => {
    try {
      const result = (await window.ipcRenderer.invoke("sam3:load-model")) as {
        ok: boolean;
        error?: string;
      };

      if (result.ok) {
        setStoreState({ status: "ready", progress: 100, loadingStep: "" });
        return true;
      }
      setStoreState({
        status: "error",
        progress: 0,
        loadingStep: "",
        error: result.error || "Unknown model load error",
      });
      return false;
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      setStoreState({
        status: "error",
        progress: 0,
        loadingStep: "",
        error: msg,
      });
      return false;
    } finally {
      loadInFlight = null;
      detachProgressListener();
    }
  })();

  return loadInFlight;
}

async function segmentAtPointShared(
  imagePath: string,
  point: { x: number; y: number },
): Promise<SAM3Mask | null> {
  if (!window.ipcRenderer) {
    console.warn("IPC not available. Run inside Electron.");
    return null;
  }

  setStoreState({ status: "segmenting", loadingStep: "Segmenting object..." });

  try {
    const result = (await window.ipcRenderer.invoke("sam3:segment", {
      imagePath,
      point,
    })) as {
      ok: boolean;
      maskBase64?: string;
      width?: number;
      height?: number;
      error?: string;
    };

    if (!result.ok || !result.maskBase64 || !result.width || !result.height) {
      throw new Error(result.error || "Segmentation failed");
    }

    // Decode raw mask bytes from base64
    const rawBytes = Uint8Array.from(atob(result.maskBase64), (c) =>
      c.charCodeAt(0),
    );

    setStoreState({ status: "ready", loadingStep: "" });
    return { data: rawBytes, width: result.width, height: result.height };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    setStoreState({ status: "error", loadingStep: "", error: msg });
    return null;
  }
}

function unloadModelShared(): void {
  setStoreState({ status: "idle", progress: 0, loadingStep: "", error: null });
}

// ---------------------------------------------------------------------------
// Hook
// ---------------------------------------------------------------------------
export function useSAM3() {
  const state = useSyncExternalStore(subscribe, getSnapshot);

  const loadModel = useCallback(() => loadModelShared(), []);
  const unloadModel = useCallback(() => unloadModelShared(), []);
  const segmentAtPoint = useCallback(
    (imagePath: string, point: { x: number; y: number }) =>
      segmentAtPointShared(imagePath, point),
    [],
  );

  return {
    ...state,
    loadModel,
    unloadModel,
    segmentAtPoint,
  };
}
