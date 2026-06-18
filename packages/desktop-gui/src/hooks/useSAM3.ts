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

export interface SAM3Mask {
  data: Uint8Array;
  width: number;
  height: number;
  score?: number;
  dataUrl?: string; // base64 PNG data URL from Python backend
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
  threshold: number;
  hoverMask: SAM3Mask | null;
  proMode: boolean;
}

// ---------------------------------------------------------------------------
// Module-level shared store
// ---------------------------------------------------------------------------
let storeState: SAM3State = {
  status: "idle",
  progress: 0,
  loadingStep: "",
  error: null,
  threshold: 0.5,
  hoverMask: null,
  proMode: false,
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
let listenerRefCount = 0;

function attachProgressListener(): void {
  if (!window.ipcRenderer) return;

  listenerRefCount++;
  if (listenerRefCount > 1) return; // Already attached by another consumer

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
        const info = args[0] as {
          model: string;
          progress: number;
          status: string;
          file?: string;
        };
        // Skip per-file progress to avoid flickering; only use total progress
        if (info.status === "success") {
          _modelReady = true;
          setStoreState({
            status: "ready",
            progress: 100,
            loadingStep: "",
            error: null,
          });
        } else {
          setStoreState({
            progress: Math.round(info.progress),
            loadingStep: `Downloading model... ${Math.round(info.progress)}%`,
          });
        }
      },
    );
  }
}

function detachProgressListener(): void {
  listenerRefCount = Math.max(0, listenerRefCount - 1);
  if (listenerRefCount > 0) return; // Still have other consumers

  if (progressUnsubscribe) {
    progressUnsubscribe();
    progressUnsubscribe = null;
  }
  if (downloadProgressUnsubscribe) {
    downloadProgressUnsubscribe();
    downloadProgressUnsubscribe = null;
  }
}

let _modelReady = false;

async function ensureModelReady(): Promise<boolean> {
  if (_modelReady) return true;
  if (!window.ipcRenderer) return false;

  setStoreState({
    status: "loading",
    progress: 0,
    loadingStep: "Downloading SAM 3 model (one-time)...",
    error: null,
  });

  try {
    // First check if model is already loaded
    const checkResult = (await window.ipcRenderer.invoke("sam3:load-model", {
      model: "sam3",
    })) as {
      ok: boolean;
      loaded?: boolean;
      progress?: number;
      step?: string;
      error?: string;
    };

    if (!checkResult.ok) {
      setStoreState({
        status: "error",
        progress: 0,
        loadingStep: "",
        error: checkResult.error || "Failed to load SAM 3",
      });
      return false;
    }

    if (checkResult.loaded) {
      _modelReady = true;
      setStoreState({
        status: "ready",
        progress: 100,
        loadingStep: "",
        error: null,
      });
      return true;
    }

    // Model not loaded — trigger actual loading via preload-model
    setStoreState({
      status: "loading",
      progress: 10,
      loadingStep: "Loading SAM 3 model into memory...",
      error: null,
    });

    const loadResult = (await window.ipcRenderer.invoke(
      "sam3:preload-model",
    )) as {
      ok: boolean;
      loaded?: boolean;
      error?: string;
    };

    if (!loadResult.ok || !loadResult.loaded) {
      setStoreState({
        status: "error",
        progress: 0,
        loadingStep: "",
        error: loadResult.error || "Failed to load SAM 3 model",
      });
      return false;
    }

    _modelReady = true;
    setStoreState({
      status: "ready",
      progress: 100,
      loadingStep: "",
      error: null,
    });
    return true;
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    setStoreState({
      status: "error",
      progress: 0,
      loadingStep: "",
      error: msg,
    });
    return false;
  }
}

async function predictBoxShared(
  imagePath: string,
  box: { x1: number; y1: number; x2: number; y2: number },
): Promise<SAM3Mask | null> {
  console.log("[SAM3 predictBoxShared] called", { imagePath, box });
  if (!window.ipcRenderer) {
    console.warn("IPC not available. Run inside Electron.");
    return null;
  }

  if (!(await ensureModelReady())) return null;

  setStoreState({
    status: "segmenting",
    loadingStep: "Segmenting with box...",
    hoverMask: null,
  });

  try {
    const payload = {
      imagePath,
      x1: box.x1,
      y1: box.y1,
      x2: box.x2,
      y2: box.y2,
    };
    console.log("[SAM3 predictBoxShared] IPC payload", payload);
    const result = (await window.ipcRenderer.invoke(
      "sam3:predict-box",
      payload,
    )) as {
      ok: boolean;
      maskBase64?: string;
      width?: number;
      height?: number;
      score?: number;
      error?: string;
    };
    console.log("[SAM3 predictBoxShared] IPC result", {
      ok: result?.ok,
      hasMask: !!result?.maskBase64,
      error: result?.error,
    });

    if (!result.ok || !result.maskBase64 || !result.width || !result.height) {
      throw new Error(result.error || "Box segmentation failed");
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
      dataUrl: `data:image/png;base64,${result.maskBase64}`,
    };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    setStoreState({ status: "error", loadingStep: "", error: msg });
    return null;
  }
}

async function predictBatchShared(
  imagePath: string,
  positivePoints: { x: number; y: number }[],
  negativePoints: { x: number; y: number }[],
): Promise<SAM3Mask | null> {
  console.log("[SAM3 predictBatchShared] called", {
    imagePath,
    positiveCount: positivePoints.length,
    negativeCount: negativePoints.length,
  });
  if (!window.ipcRenderer) {
    console.warn("IPC not available. Run inside Electron.");
    return null;
  }

  if (!(await ensureModelReady())) return null;

  setStoreState({
    status: "segmenting",
    loadingStep: "Segmenting object...",
    hoverMask: null,
  });

  try {
    const payload = {
      imagePath,
      positivePoints,
      negativePoints,
      threshold: storeState.threshold,
      model: "sam3",
    };
    console.log("[SAM3 predictBatchShared] IPC payload", payload);
    const result = (await window.ipcRenderer.invoke(
      "sam3:predict-batch",
      payload,
    )) as {
      ok: boolean;
      maskBase64?: string;
      width?: number;
      height?: number;
      score?: number;
      error?: string;
    };
    console.log("[SAM3 predictBatchShared] IPC result", {
      ok: result?.ok,
      hasMask: !!result?.maskBase64,
      error: result?.error,
    });

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
      dataUrl: `data:image/png;base64,${result.maskBase64}`,
    };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    setStoreState({ status: "error", loadingStep: "", error: msg });
    return null;
  }
}

async function predictTextShared(
  imagePath: string,
  textPrompt: string,
): Promise<SAM3Mask | null> {
  console.log("[SAM3 predictTextShared] called", { imagePath, textPrompt });
  if (!window.ipcRenderer) {
    console.warn("IPC not available. Run inside Electron.");
    return null;
  }

  if (!(await ensureModelReady())) return null;

  setStoreState({
    status: "segmenting",
    loadingStep: `Detecting "${textPrompt}"...`,
    hoverMask: null,
  });

  try {
    const result = (await window.ipcRenderer.invoke("sam3:predict-text", {
      imagePath,
      textPrompt,
    })) as {
      ok: boolean;
      maskBase64?: string;
      width?: number;
      height?: number;
      score?: number;
      error?: string;
    };
    console.log("[SAM3 predictTextShared] IPC result", {
      ok: result?.ok,
      hasMask: !!result?.maskBase64,
      error: result?.error,
    });

    if (!result.ok || !result.maskBase64 || !result.width || !result.height) {
      throw new Error(result.error || "Text-prompt segmentation failed");
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
      dataUrl: `data:image/png;base64,${result.maskBase64}`,
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

  // Skip hover if model not ready (don't trigger download from hover)
  if (!_modelReady) return null;

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

        // Model should already be ready since we checked _modelReady above
        // but double-check just in case
        if (!(await ensureModelReady())) {
          resolve(null);
          return;
        }

        const result = (await window.ipcRenderer.invoke("sam3:hover-preview", {
          imagePath,
          point,
          model: "sam3",
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
          dataUrl: `data:image/png;base64,${result.maskBase64}`,
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

async function predictPointProShared(
  imagePath: string,
  point: { x: number; y: number },
): Promise<SAM3Mask | null> {
  if (!window.ipcRenderer) {
    console.warn("IPC not available. Run inside Electron.");
    return null;
  }

  if (!(await ensureModelReady())) return null;

  setStoreState({
    status: "segmenting",
    loadingStep: "Segmenting (PRO mode)...",
    hoverMask: null,
  });
  try {
    const result = (await window.ipcRenderer.invoke("sam3:predict-point-pro", {
      imagePath,
      point,
    })) as {
      ok: boolean;
      maskBase64?: string;
      width?: number;
      height?: number;
      score?: number;
      error?: string;
    };
    if (!result.ok || !result.maskBase64 || !result.width || !result.height) {
      throw new Error(result.error || "PRO point segmentation failed");
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
      dataUrl: `data:image/png;base64,${result.maskBase64}`,
    };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    setStoreState({ status: "error", loadingStep: "", error: msg });
    return null;
  }
}

async function predictTextProShared(
  imagePath: string,
  textPrompt: string,
): Promise<SAM3Mask | null> {
  if (!window.ipcRenderer) {
    console.warn("IPC not available. Run inside Electron.");
    return null;
  }

  if (!(await ensureModelReady())) return null;

  setStoreState({
    status: "segmenting",
    loadingStep: `Detecting PRO "${textPrompt}"...`,
    hoverMask: null,
  });
  try {
    const result = (await window.ipcRenderer.invoke("sam3:predict-text-pro", {
      imagePath,
      textPrompt,
    })) as {
      ok: boolean;
      maskBase64?: string;
      width?: number;
      height?: number;
      score?: number;
      error?: string;
    };
    if (!result.ok || !result.maskBase64 || !result.width || !result.height) {
      throw new Error(result.error || "PRO text segmentation failed");
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
      dataUrl: `data:image/png;base64,${result.maskBase64}`,
    };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    setStoreState({ status: "error", loadingStep: "", error: msg });
    return null;
  }
}

async function predictGroundingDINOShared(
  imagePath: string,
  textPrompt: string,
  threshold: number = 0.3,
): Promise<SAM3Mask | null> {
  if (!window.ipcRenderer) {
    console.warn("IPC not available. Run inside Electron.");
    return null;
  }

  if (!(await ensureModelReady())) return null;

  setStoreState({
    status: "segmenting",
    loadingStep: `GroundingDINO: "${textPrompt}"...`,
    hoverMask: null,
  });
  try {
    const result = (await window.ipcRenderer.invoke(
      "sam3:predict-groundingdino",
      {
        imagePath,
        textPrompt,
        threshold,
      },
    )) as {
      ok: boolean;
      maskBase64?: string;
      width?: number;
      height?: number;
      boxes?: number[][];
      scores?: number[];
      error?: string;
    };
    if (!result.ok || !result.maskBase64 || !result.width || !result.height) {
      throw new Error(result.error || "GroundingDINO segmentation failed");
    }
    const rawBytes = Uint8Array.from(atob(result.maskBase64), (c) =>
      c.charCodeAt(0),
    );
    setStoreState({ status: "ready", loadingStep: "" });
    return {
      data: rawBytes,
      width: result.width,
      height: result.height,
      score: result.scores?.[0],
      dataUrl: `data:image/png;base64,${result.maskBase64}`,
    };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    setStoreState({ status: "error", loadingStep: "", error: msg });
    return null;
  }
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

async function unloadModelShared(): Promise<void> {
  if (!window.ipcRenderer) return;
  await window.ipcRenderer.invoke("sam3:unload-model");
  _modelReady = false;
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

  // Attach IPC progress listeners on mount
  useEffect(() => {
    attachProgressListener();
    return () => detachProgressListener();
  }, []);

  const unloadModel = useCallback(() => unloadModelShared(), []);
  const segmentAtPoint = useCallback(
    (imagePath: string, point: { x: number; y: number }) =>
      predictBatchShared(imagePath, [point], []),
    [],
  );
  const setProMode = useCallback((enabled: boolean) => {
    setStoreState({ proMode: enabled });
  }, []);
  const loadModel = useCallback(async () => {
    if (!window.ipcRenderer) return false;
    setStoreState({
      status: "loading",
      progress: 0,
      loadingStep: "Downloading SAM 3 model (one-time)...",
      error: null,
    });
    try {
      const result = (await window.ipcRenderer.invoke(
        "sam3:preload-model",
        {},
      )) as {
        ok: boolean;
        loaded?: boolean;
        error?: string;
      };
      if (result.ok) {
        if (result.loaded) {
          _modelReady = true;
          setStoreState({
            status: "ready",
            progress: 100,
            loadingStep: "",
            error: null,
          });
          return true;
        } else {
          // Asynchronous download successfully initiated
          setStoreState({
            status: "loading",
            progress: 0,
            loadingStep: "Downloading SAM 3 model...",
            error: null,
          });
          return false;
        }
      }
      setStoreState({
        status: "error",
        progress: 0,
        loadingStep: "",
        error: result.error || "Failed to preload SAM 3 model",
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
    }
  }, []);
  const predictBox = useCallback(
    (
      imagePath: string,
      box: { x1: number; y1: number; x2: number; y2: number },
    ) => predictBoxShared(imagePath, box),
    [],
  );
  const predictBatch = useCallback(
    (
      imagePath: string,
      positivePoints: { x: number; y: number }[],
      negativePoints: { x: number; y: number }[],
    ) => {
      if (
        storeState.proMode &&
        positivePoints.length === 1 &&
        negativePoints.length === 0
      ) {
        return predictPointProShared(imagePath, positivePoints[0]);
      }
      return predictBatchShared(imagePath, positivePoints, negativePoints);
    },
    [],
  );
  const predictText = useCallback(
    (imagePath: string, textPrompt: string) =>
      predictTextShared(imagePath, textPrompt),
    [],
  );
  const predictPointPro = useCallback(
    (imagePath: string, point: { x: number; y: number }) =>
      predictPointProShared(imagePath, point),
    [],
  );
  const predictTextPro = useCallback(
    (imagePath: string, textPrompt: string) =>
      predictTextProShared(imagePath, textPrompt),
    [],
  );
  const predictGroundingDINO = useCallback(
    (imagePath: string, textPrompt: string, threshold?: number) =>
      predictGroundingDINOShared(imagePath, textPrompt, threshold),
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
  const setThreshold = useCallback((t: number) => setThresholdShared(t), []);

  return {
    ...state,
    unloadModel,
    loadModel,
    segmentAtPoint,
    predictBox,
    predictBatch,
    predictText,
    predictPointPro,
    predictTextPro,
    predictGroundingDINO,
    hoverPreview,
    cancelHover,
    removeBackground,
    setThreshold,
    setProMode,
  };
}
