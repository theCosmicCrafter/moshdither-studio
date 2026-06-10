/**
 * SAM 3 / AI Masking integration for MoshDither Studio.
 *
 * Model loading and inference run in the MAIN PROCESS via IPC,
 * because Transformers.js filesystem cache requires Node.js fs access
 * which is unavailable in Electron's sandboxed renderer.
 *
 * The renderer sends only the image file path + click coordinates.
 * Main loads the image from disk, runs inference, returns mask bytes.
 */

import { useState, useCallback } from "react";

export type SAM3Status = "idle" | "loading" | "ready" | "error" | "segmenting";

interface SAM3State {
  status: SAM3Status;
  progress: number;
  loadingStep: string;
  error: string | null;
}

export function useSAM3() {
  const [state, setState] = useState<SAM3State>({
    status: "idle",
    progress: 0,
    loadingStep: "",
    error: null,
  });

  const loadModel = useCallback(async (): Promise<boolean> => {
    if (!window.ipcRenderer) {
      setState((s) => ({
        ...s,
        status: "error",
        error: "IPC not available. Run inside Electron.",
      }));
      return false;
    }

    setState({
      status: "loading",
      progress: 10,
      loadingStep: "Downloading model files...",
      error: null,
    });

    try {
      const result = (await window.ipcRenderer.invoke("sam3:load-model")) as {
        ok: boolean;
        error?: string;
      };

      if (result.ok) {
        setState({
          status: "ready",
          progress: 100,
          loadingStep: "",
          error: null,
        });
        return true;
      } else {
        setState({
          status: "error",
          progress: 0,
          loadingStep: "",
          error: result.error || "Unknown model load error",
        });
        return false;
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      setState({
        status: "error",
        progress: 0,
        loadingStep: "",
        error: msg,
      });
      return false;
    }
  }, []);

  const unloadModel = useCallback(() => {
    setState({ status: "idle", progress: 0, loadingStep: "", error: null });
  }, []);

  /**
   * Segment an object at the given pixel coordinates.
   *
   * @param imagePath - Path to the image file (e.g. media://C:/.../img.jpg)
   * @param point - Click coordinate in image pixel space {x, y}
   * @returns Promise<Uint8Array> - Binary mask as 1-byte-per-pixel, or null on error
   */
  const segmentAtPoint = useCallback(
    async (
      imagePath: string,
      point: { x: number; y: number },
    ): Promise<Uint8Array | null> => {
      if (!window.ipcRenderer) {
        console.warn("IPC not available. Run inside Electron.");
        return null;
      }

      setState((s) => ({
        ...s,
        status: "segmenting",
        loadingStep: "Segmenting object...",
      }));

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

        if (!result.ok || !result.maskBase64) {
          throw new Error(result.error || "Segmentation failed");
        }

        // Decode raw mask bytes from base64
        const rawBytes = Uint8Array.from(atob(result.maskBase64), (c) =>
          c.charCodeAt(0),
        );

        setState((s) => ({ ...s, status: "ready", loadingStep: "" }));
        return rawBytes;
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        setState((s) => ({
          ...s,
          status: "error",
          loadingStep: "",
          error: msg,
        }));
        return null;
      }
    },
    [],
  );

  return {
    ...state,
    progress: state.progress,
    loadModel,
    unloadModel,
    segmentAtPoint,
  };
}
