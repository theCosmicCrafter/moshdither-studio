/**
 * SAM 3 / AI Masking integration for MoshDither Studio.
 *
 * Rebuilt with TRIX_ patterns:
 *   - Multi-click positive + negative point segmentation
 *   - Hover preview with debounce + abort
 *   - Model selection & download progress
 *   - Background removal integration
 *   - Threshold control
 *
 * Model loading and inference run in the MAIN PROCESS via IPC.
 */

import { useCallback, useEffect, useRef, useSyncExternalStore } from "react";

export type SAM3Status =
  | "idle"
  | "loading"
  | "ready"
  | "error"
  | "segmenting"
  | "hovering";

export type SAMModelId = "sam-vit-base" | "sam-vit-large" | "sam-vit-huge";

export interface SAM3Mask {
  data: Uint8Array;
  width: number;
  height: number;
  score?: number;
}

export interface SAM3Point {
  x: number; // normalized 0..1
  y: number; // normalized 0..1
  label: 1 | 0; // 1 = positive (include), 0 = negative (exclude)
}

interface SAM3State {
  status: SAM3Status;
  progress: number;
  loadingStep: string;
  error: string | null;
  selectedModel: SAMModelId;
  threshold: number;
  modelDownloadProgress: Record<string, number>;
  hoverMask: SAM3Mask | null;
}

// ---------------------------------------------------------------------------
// Module-level shared store
// ---------------------------------------------------------------------------
let storeState: SAM3State = {
  status: "idle",
  progress: 0,
  loadingStep: "",
  error: null,
  selectedModel: "sam-vit-base",
  threshold: 0.0,
  modelDownloadProgress: {},
  hoverMask: null,
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
let downloadProgressUnsubscribe: (() => void) | null = null;

function attachProgressListener(): void {
  if (!window.ipcRenderer) return;

  if (!progressUnsubscribe) {
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

  if (!downloadProgressUnsubscribe) {
    downloadProgressUnsubscribe = window.ipcRenderer.on(
      "sam3:download-progress",
      (_event: unknown, ...args: unknown[]) => {
        const info = args[0] as { model: string; progress: number };
        setStoreState({
          modelDownloadProgress: {
            ...storeState.modelDownloadProgress,
            [info.model]: info.progress,
          },
        });
      },
    );
  }
}

function detachProgressListener(): void {
  if (progressUnsubscribe) {
    progressUnsubscribe();
    progressUnsubscribe = null;
  }
  if (downloadProgressUnsubscribe) {
    downloadProgressUnsubscribe();
    downloadProgressUnsubscribe = null;
  }
}

let loadInFlight: Promise<boolean> | null = null;

async function loadModelShared(model?: SAMModelId): Promise<boolean> {
  if (
    storeState.status === "ready" &&
    (!model || model === storeState.selectedModel)
  ) {
    return true;
  }
  if (loadInFlight) return loadInFlight;

  if (!window.ipcRenderer) {
    setStoreState({
      status: "error",
      error: "IPC not available. Run inside Electron.",
    });
    return false;
  }

  const targetModel = model ?? storeState.selectedModel;

  setStoreState({
    status: "loading",
    progress: 0,
    loadingStep: "Downloading model files...",
    error: null,
    selectedModel: targetModel,
  });
  attachProgressListener();

  loadInFlight = (async () => {
    try {
      const result = (await window.ipcRenderer.invoke("sam3:load-model", {
        model: targetModel,
      })) as {
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
  return predictBatchShared(imagePath, [point], []);
}

async function predictBatchShared(
  imagePath: string,
  positivePoints: { x: number; y: number }[],
  negativePoints: { x: number; y: number }[],
): Promise<SAM3Mask | null> {
  if (!window.ipcRenderer) {
    console.warn("IPC not available. Run inside Electron.");
    return null;
  }

  setStoreState({
    status: "segmenting",
    loadingStep: "Segmenting object...",
    hoverMask: null,
  });

  try {
    const result = (await window.ipcRenderer.invoke("sam3:predict-batch", {
      imagePath,
      positivePoints,
      negativePoints,
      threshold: storeState.threshold,
    })) as {
      ok: boolean;
      maskBase64?: string;
      width?: number;
      height?: number;
      score?: number;
      error?: string;
    };

    if (!result.ok || !result.maskBase64 || !result.width || !result.height) {
      throw new Error(result.error || "Segmentation failed");
    }

    const rawBytes = Uint8Array.from(atob(result.maskBase64), (c) =>
      c.charCodeAt(0),
    );

    setStoreState({ status: "ready", loadingStep: "" });
    return {
      data: rawBytes,
      width: result.width,
      height: result.height,
      score: result.score,
    };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    setStoreState({ status: "error", loadingStep: "", error: msg });
    return null;
  }
}

let hoverAbort: AbortController | null = null;
let hoverTimeout: ReturnType<typeof setTimeout> | null = null;

async function hoverPreviewShared(
  imagePath: string,
  point: { x: number; y: number },
  debounceMs = 80,
): Promise<SAM3Mask | null> {
  if (!window.ipcRenderer) return null;

  // Cancel previous hover
  if (hoverAbort) {
    hoverAbort.abort();
    hoverAbort = null;
  }
  if (hoverTimeout) {
    clearTimeout(hoverTimeout);
    hoverTimeout = null;
  }

  return new Promise((resolve) => {
    hoverTimeout = setTimeout(async () => {
      const abort = new AbortController();
      hoverAbort = abort;

      try {
        setStoreState({ status: "hovering" });

        const result = (await window.ipcRenderer.invoke("sam3:hover-preview", {
          imagePath,
          point,
          model: storeState.selectedModel,
        })) as {
          ok: boolean;
          maskBase64?: string;
          width?: number;
          height?: number;
          error?: string;
        };

        if (abort.signal.aborted) {
          resolve(null);
          return;
        }

        if (
          !result.ok ||
          !result.maskBase64 ||
          !result.width ||
          !result.height
        ) {
          setStoreState({ status: "ready", hoverMask: null });
          resolve(null);
          return;
        }

        const rawBytes = Uint8Array.from(atob(result.maskBase64), (c) =>
          c.charCodeAt(0),
        );

        const mask = {
          data: rawBytes,
          width: result.width,
          height: result.height,
        };

        setStoreState({ status: "ready", hoverMask: mask });
        resolve(mask);
      } catch {
        if (!abort.signal.aborted) {
          setStoreState({ status: "ready", hoverMask: null });
        }
        resolve(null);
      } finally {
        if (hoverAbort === abort) {
          hoverAbort = null;
        }
      }
    }, debounceMs);
  });
}

function cancelHoverShared(): void {
  if (hoverAbort) {
    hoverAbort.abort();
    hoverAbort = null;
  }
  if (hoverTimeout) {
    clearTimeout(hoverTimeout);
    hoverTimeout = null;
  }
  setStoreState({ status: "ready", hoverMask: null });
}

async function removeBackgroundShared(
  imagePath: string,
  model: string,
  alphaMatting: boolean,
): Promise<SAM3Mask | null> {
  if (!window.ipcRenderer) {
    console.warn("IPC not available. Run inside Electron.");
    return null;
  }

  setStoreState({
    status: "segmenting",
    loadingStep: "Removing background...",
  });

  try {
    const result = (await window.ipcRenderer.invoke("sam3:remove-background", {
      imagePath,
      model,
      alphaMatting,
    })) as {
      ok: boolean;
      maskBase64?: string;
      width?: number;
      height?: number;
      error?: string;
    };

    if (!result.ok || !result.maskBase64 || !result.width || !result.height) {
      throw new Error(result.error || "Background removal failed");
    }

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

async function listModelsShared(): Promise<{
  sam: Record<string, boolean>;
  background_removal: Record<string, boolean>;
}> {
  if (!window.ipcRenderer) {
    return { sam: {}, background_removal: {} };
  }
  return (await window.ipcRenderer.invoke("sam3:list-models")) as {
    sam: Record<string, boolean>;
    background_removal: Record<string, boolean>;
  };
}

async function downloadModelShared(model: string): Promise<boolean> {
  if (!window.ipcRenderer) return false;
  const result = (await window.ipcRenderer.invoke("sam3:download-model", {
    model,
  })) as { ok: boolean; error?: string };
  if (!result.ok) {
    setStoreState({ error: result.error || `Failed to download ${model}` });
  }
  return result.ok;
}

async function unloadModelShared(): Promise<void> {
  if (!window.ipcRenderer) return;
  await window.ipcRenderer.invoke("sam3:unload-model");
  setStoreState({
    status: "idle",
    progress: 0,
    loadingStep: "",
    error: null,
    hoverMask: null,
  });
}

function setThresholdShared(threshold: number): void {
  setStoreState({ threshold });
}

function setSelectedModelShared(model: SAMModelId): void {
  setStoreState({ selectedModel: model });
}

// ---------------------------------------------------------------------------
// Hook
// ---------------------------------------------------------------------------
export function useSAM3() {
  const state = useSyncExternalStore(subscribe, getSnapshot);

  // Use refs to avoid stale closures in callbacks
  const stateRef = useRef(state);
  useEffect(() => {
    stateRef.current = state;
  }, [state]);

  const loadModel = useCallback(
    (model?: SAMModelId) => loadModelShared(model),
    [],
  );
  const unloadModel = useCallback(() => unloadModelShared(), []);
  const segmentAtPoint = useCallback(
    (imagePath: string, point: { x: number; y: number }) =>
      segmentAtPointShared(imagePath, point),
    [],
  );
  const predictBatch = useCallback(
    (
      imagePath: string,
      positivePoints: { x: number; y: number }[],
      negativePoints: { x: number; y: number }[],
    ) => predictBatchShared(imagePath, positivePoints, negativePoints),
    [],
  );
  const hoverPreview = useCallback(
    (imagePath: string, point: { x: number; y: number }, debounceMs?: number) =>
      hoverPreviewShared(imagePath, point, debounceMs),
    [],
  );
  const cancelHover = useCallback(() => cancelHoverShared(), []);
  const removeBackground = useCallback(
    (imagePath: string, model: string, alphaMatting: boolean) =>
      removeBackgroundShared(imagePath, model, alphaMatting),
    [],
  );
  const listModels = useCallback(() => listModelsShared(), []);
  const downloadModel = useCallback(
    (model: string) => downloadModelShared(model),
    [],
  );
  const setThreshold = useCallback((t: number) => setThresholdShared(t), []);
  const setSelectedModel = useCallback(
    (m: SAMModelId) => setSelectedModelShared(m),
    [],
  );

  return {
    ...state,
    loadModel,
    unloadModel,
    segmentAtPoint,
    predictBatch,
    hoverPreview,
    cancelHover,
    removeBackground,
    listModels,
    downloadModel,
    setThreshold,
    setSelectedModel,
  };
}
