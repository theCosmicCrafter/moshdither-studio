/**
 * SAM 3 Tracker integration for MoshDither Studio.
 *
 * Lazy-loads the ONNX model from Hugging Face, caches it in app data,
 * and provides a click-to-segment function.
 *
 * Model: onnx-community/sam3-tracker-ONNX (point/box prompts, no text encoder)
 */

import { useState, useCallback, useRef } from "react";

export type SAM3Status = "idle" | "loading" | "ready" | "error" | "segmenting";

interface SAM3State {
  status: SAM3Status;
  progress: number; // 0-100 download progress
  error: string | null;
}

let globalModel: unknown | null = null;
let globalProcessor: unknown | null = null;
let loadPromise: Promise<void> | null = null;

export function useSAM3() {
  const [state, setState] = useState<SAM3State>({
    status: "idle",
    progress: 0,
    error: null,
  });

  const abortRef = useRef(false);

  const loadModel = useCallback(async (): Promise<void> => {
    if (globalModel && globalProcessor) {
      setState((s) => ({ ...s, status: "ready", progress: 100 }));
      return;
    }
    if (loadPromise) {
      await loadPromise;
      return;
    }

    setState({ status: "loading", progress: 0, error: null });
    abortRef.current = false;

    loadPromise = (async () => {
      try {
        // Dynamic import to avoid bundling the large transformers library
        // unless the user actually uses SAM 3
        const { Sam3TrackerModel, AutoProcessor } =
          await import("@huggingface/transformers");

        if (abortRef.current) throw new Error("Aborted");

        setState((s) => ({ ...s, progress: 20 }));

        const MODEL_ID = "onnx-community/sam3-tracker-ONNX";
        const cacheDir = await getCacheDir();

        if (abortRef.current) throw new Error("Aborted");

        const processor = await AutoProcessor.from_pretrained(MODEL_ID, {
          cache_dir: cacheDir,
          dtype: "fp16",
        });

        if (abortRef.current) throw new Error("Aborted");

        setState((s) => ({ ...s, progress: 60 }));

        const model = await Sam3TrackerModel.from_pretrained(MODEL_ID, {
          cache_dir: cacheDir,
          dtype: "fp16",
        });

        if (abortRef.current) throw new Error("Aborted");

        globalModel = model;
        globalProcessor = processor;
        setState({ status: "ready", progress: 100, error: null });
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        setState({ status: "error", progress: 0, error: msg });
        loadPromise = null;
        throw err;
      }
    })();

    await loadPromise;
  }, []);

  const unloadModel = useCallback(() => {
    abortRef.current = true;
    globalModel = null;
    globalProcessor = null;
    loadPromise = null;
    setState({ status: "idle", progress: 0, error: null });
  }, []);

  /**
   * Segment an object at the given pixel coordinates.
   *
   * @param image - The source image or video frame (HTMLImageElement or HTMLVideoElement)
   * @param point - Click coordinate in image pixel space {x, y}
   * @returns Promise<Uint8Array> - Binary mask as 1-byte-per-pixel, or null on error
   */
  const segmentAtPoint = useCallback(
    async (
      image: HTMLImageElement | HTMLVideoElement,
      point: { x: number; y: number },
    ): Promise<Uint8Array | null> => {
      if (!globalModel || !globalProcessor) {
        await loadModel();
      }
      if (!globalModel || !globalProcessor) return null;

      setState((s) => ({ ...s, status: "segmenting" }));

      try {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const processor = globalProcessor as any;
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const model = globalModel as any;

        // Convert image/video to a canvas frame for the processor
        const rawImage = await elementToRawImage(image);

        const input_points = [[[[point.x, point.y]]]];
        const input_labels = [[[1]]]; // 1 = foreground

        const inputs = await processor(rawImage, {
          input_points,
          input_labels,
        });

        const outputs = await model(inputs);

        const masks = await processor.post_process_masks(
          outputs.pred_masks,
          inputs.original_sizes,
          inputs.reshaped_input_sizes,
        );

        // masks is a boolean Tensor [1, 3, H, W] (3 hypothesis masks)
        // Take the best one (index 0 typically has highest score)
        const maskTensor = masks[0][0]; // [H, W] boolean

        // Convert tensor to Uint8Array
        const [h, w] = maskTensor.dims;
        const maskData = new Uint8Array(h * w);
        const data = maskTensor.data as Uint8Array; // bool tensor data

        for (let i = 0; i < h * w; i++) {
          maskData[i] = data[i] ? 255 : 0;
        }

        setState((s) => ({ ...s, status: "ready" }));
        return maskData;
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        setState((s) => ({ ...s, status: "error", error: msg }));
        return null;
      }
    },
    [loadModel],
  );

  return {
    ...state,
    loadModel,
    unloadModel,
    segmentAtPoint,
  };
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

async function getCacheDir(): Promise<string | undefined> {
  // In Electron, ask main process for app data path
  if (window.ipcRenderer) {
    try {
      return await window.ipcRenderer.invoke<string>("sam3:get-cache-dir");
    } catch {
      return undefined;
    }
  }
  return undefined;
}

/**
 * Convert an HTMLImageElement or HTMLVideoElement to a RawImage
 * compatible with the Transformers.js processor.
 */
async function elementToRawImage(
  element: HTMLImageElement | HTMLVideoElement,
): Promise<unknown> {
  // Create a canvas to extract the frame
  const canvas = document.createElement("canvas");
  const width =
    element instanceof HTMLImageElement
      ? element.naturalWidth
      : element.videoWidth;
  const height =
    element instanceof HTMLImageElement
      ? element.naturalHeight
      : element.videoHeight;
  canvas.width = width || element.width;
  canvas.height = height || element.height;

  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Cannot create 2D context");

  ctx.drawImage(element, 0, 0, canvas.width, canvas.height);

  // Convert to RawImage format expected by Transformers.js
  const { RawImage } = await import("@huggingface/transformers");
  return RawImage.fromURL(canvas.toDataURL("image/png"));
}
