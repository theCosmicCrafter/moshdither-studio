import { useState, useCallback, useRef } from "react";
import { useAppStore } from "../store";
import { exportVideo } from "../lib/tauri";
import { stackToRustPayload } from "../utils/effectConverter";

export interface BatchJob {
  id: string;
  name: string;
  format: "mp4" | "webm" | "gif" | "png_seq";
  codec: string;
  resolutionW: number | undefined;
  resolutionH: number | undefined;
  fps: number;
  quality: "draft" | "good" | "best";
  status: "pending" | "running" | "completed" | "failed";
  outputPath?: string;
  error?: string;
}

export function useBatchQueue() {
  const [queue, setQueue] = useState<BatchJob[]>([]);
  const [isProcessing, setIsProcessing] = useState(false);
  const [currentJobId, setCurrentJobId] = useState<string | null>(null);
  const abortRef = useRef(false);

  const filePath = useAppStore((s) => s.filePath);
  const mediaInfo = useAppStore((s) => s.mediaInfo);
  const effectStack = useAppStore((s) => s.effectStack);
  const activeMask = useAppStore((s) => s.activeMask);
  const setStatusMessage = useAppStore((s) => s.setStatusMessage);
  const setExportProgress = useAppStore((s) => s.setExportProgress);
  const setExportIsRunning = useAppStore((s) => s.setExportIsRunning);

  const addJob = useCallback(
    (job: Omit<BatchJob, "id" | "status">) => {
      const newJob: BatchJob = {
        ...job,
        id: `job-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
        status: "pending",
      };
      setQueue((prev) => [...prev, newJob]);
      setStatusMessage(`Added "${newJob.name}" to batch queue`);
    },
    [setStatusMessage]
  );

  const removeJob = useCallback((id: string) => {
    setQueue((prev) => prev.filter((j) => j.id !== id));
  }, []);

  const clearQueue = useCallback(() => {
    setQueue([]);
    setCurrentJobId(null);
    setIsProcessing(false);
    abortRef.current = true;
  }, []);

  const processQueue = useCallback(async () => {
    if (isProcessing || queue.length === 0) return;
    if (!mediaInfo || !filePath) {
      setStatusMessage("Load media before processing batch queue");
      return;
    }

    abortRef.current = false;
    setIsProcessing(true);
    setExportIsRunning(true);

    const pending = queue.filter((j) => j.status === "pending");

    for (const job of pending) {
      if (abortRef.current) break;

      setCurrentJobId(job.id);
      setQueue((prev) => prev.map((j) => (j.id === job.id ? { ...j, status: "running" } : j)));
      setStatusMessage(`Exporting: ${job.name}`);
      setExportProgress(0);

      try {
        const state = useAppStore.getState();
        const activeEffects = effectStack.filter((e) => e.enabled);
        const stack = stackToRustPayload(activeEffects, state.activeMask, state.sam3Masks);

        const outputPath = await exportVideo(filePath, stack, {
          maskB64: activeMask,
          codec: job.codec,
          fps: job.fps,
          width: job.resolutionW,
          height: job.resolutionH,
        });

        if (abortRef.current) break;

        setQueue((prev) =>
          prev.map((j) => (j.id === job.id ? { ...j, status: "completed", outputPath } : j))
        );
        setExportProgress(100);
        setStatusMessage(`Completed: ${job.name}`);
      } catch (err) {
        if (abortRef.current) break;
        const msg = err instanceof Error ? err.message : String(err);
        setQueue((prev) =>
          prev.map((j) => (j.id === job.id ? { ...j, status: "failed", error: msg } : j))
        );
        setStatusMessage(`Failed: ${job.name} — ${msg}`);
      }
    }

    setCurrentJobId(null);
    setIsProcessing(false);
    setExportIsRunning(false);
    setExportProgress(0);
    setStatusMessage("Batch queue complete");
  }, [
    queue,
    isProcessing,
    mediaInfo,
    filePath,
    effectStack,
    activeMask,
    setStatusMessage,
    setExportProgress,
    setExportIsRunning,
  ]);

  return {
    queue,
    isProcessing,
    currentJobId,
    addJob,
    removeJob,
    clearQueue,
    processQueue,
  };
}
