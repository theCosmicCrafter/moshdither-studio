/**
 * Background Removal Pipeline
 *
 * Bridges to the Python backend which runs RMBG/BiRefNet models.
 * Sends the image path, receives a mask.
 *
 * Based on TRIX_ patterns:
 *   POST /trix/remove_background { image, model, alpha_matting }
 */

export type BgRemovalModel =
  | "inspyrenet"
  | "ben2"
  | "birefnet-lite"
  | "birefnet"
  | "birefnet-hr"
  | "birefnet-portrait";

export interface BackgroundRemovalOptions {
  model?: BgRemovalModel;
  alphaMatting?: boolean;
}

export interface BackgroundRemovalResult {
  maskBase64: string;
  width: number;
  height: number;
}

const DEFAULT_MODEL: BgRemovalModel = "birefnet-lite";

/**
 * Send an image to the Python backend for background removal.
 *
 * @param imagePath  Absolute path to the image (media://... or file://...)
 * @param options    Model selection and alpha matting toggle
 */
export async function removeBackground(
  imagePath: string,
  options: BackgroundRemovalOptions = {},
): Promise<BackgroundRemovalResult> {
  if (!window.ipcRenderer) {
    throw new Error("IPC not available. Run inside Electron.");
  }

  const result = (await window.ipcRenderer.invoke("sam3:remove-background", {
    imagePath,
    model: options.model ?? DEFAULT_MODEL,
    alphaMatting: options.alphaMatting ?? false,
  })) as {
    ok: boolean;
    maskBase64?: string;
    width?: number;
    height?: number;
    error?: string;
  };

  if (!result.ok || !result.maskBase64) {
    throw new Error(result.error || "Background removal failed");
  }

  return {
    maskBase64: result.maskBase64,
    width: result.width ?? 0,
    height: result.height ?? 0,
  };
}

/** List available background removal models and their install status */
export async function listBackgroundRemovalModels(): Promise<
  Record<string, boolean>
> {
  if (!window.ipcRenderer) {
    throw new Error("IPC not available. Run inside Electron.");
  }

  const result = (await window.ipcRenderer.invoke("sam3:list-models")) as {
    background_removal: Record<string, boolean>;
  };

  return result.background_removal ?? {};
}

/** Download a background removal model */
export async function downloadModel(
  modelName: string,
  onProgress?: (pct: number) => void,
): Promise<void> {
  if (!window.ipcRenderer) {
    throw new Error("IPC not available. Run inside Electron.");
  }

  // Subscribe to progress updates
  const removeProgress = window.ipcRenderer.on(
    "sam3:download-progress",
    (_event: unknown, ...args: unknown[]) => {
      const payload = args[0] as { model: string; progress: number };
      if (payload.model === modelName) {
        onProgress?.(payload.progress);
      }
    },
  );

  try {
    const result = (await window.ipcRenderer.invoke(
      "sam3:download-model",
      { model: modelName },
    )) as { ok: boolean; error?: string };

    if (!result.ok) {
      throw new Error(result.error || `Failed to download ${modelName}`);
    }
  } finally {
    removeProgress();
  }
}

/** Check if a model is currently downloading */
export async function isModelDownloading(modelName: string): Promise<boolean> {
  if (!window.ipcRenderer) return false;

  const result = (await window.ipcRenderer.invoke(
    "sam3:model-status",
  )) as {
    active_downloads: string[];
  };

  return result.active_downloads?.includes(modelName) ?? false;
}

/** Unload all loaded models from VRAM/RAM */
export async function unloadAllModels(): Promise<void> {
  if (!window.ipcRenderer) {
    throw new Error("IPC not available. Run inside Electron.");
  }

  await window.ipcRenderer.invoke("sam3:unload-model");
}
