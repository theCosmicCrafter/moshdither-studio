/**
 * Background render queue for MoshDither Studio.
 *
 * Allows queuing multiple export jobs and processing them
 * sequentially or in parallel while the user continues working.
 */

export type RenderJobStatus =
  | "queued"
  | "rendering"
  | "completed"
  | "failed"
  | "cancelled";

export interface RenderJob {
  id: string;
  projectState: unknown; // Serialized project snapshot
  outputPath: string;
  format: "png" | "jpg" | "gif" | "mp4";
  fps: number;
  priority: number; // Higher = earlier
  status: RenderJobStatus;
  progress: number;
  createdAt: number;
  startedAt?: number;
  completedAt?: number;
  error?: string;
}

type JobListener = (jobs: RenderJob[]) => void;

const jobs: RenderJob[] = [];
const listeners: Set<JobListener> = new Set();
let isProcessing = false;
const maxConcurrent = 1; // Sequential by default; can be increased

function notify() {
  const snapshot = [...jobs];
  for (const listener of listeners) {
    try {
      listener(snapshot);
    } catch {
      // Ignore listener errors
    }
  }
}

export function subscribeToQueue(listener: JobListener): () => void {
  listeners.add(listener);
  listener([...jobs]);
  return () => listeners.delete(listener);
}

export function addJob(
  job: Omit<RenderJob, "id" | "status" | "progress" | "createdAt">,
): RenderJob {
  const fullJob: RenderJob = {
    ...job,
    id: `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    status: "queued",
    progress: 0,
    createdAt: Date.now(),
  };
  jobs.push(fullJob);
  notify();
  processQueue();
  return fullJob;
}

export function cancelJob(jobId: string): void {
  const job = jobs.find((j) => j.id === jobId);
  if (!job) return;
  if (job.status === "rendering") {
    // TODO: signal cancellation to the active render process
    job.status = "cancelled";
  } else if (job.status === "queued") {
    job.status = "cancelled";
  }
  notify();
}

export function removeJob(jobId: string): void {
  const idx = jobs.findIndex((j) => j.id === jobId);
  if (idx >= 0) {
    jobs.splice(idx, 1);
    notify();
  }
}

export function clearCompleted(): void {
  for (let i = jobs.length - 1; i >= 0; i--) {
    if (
      jobs[i].status === "completed" ||
      jobs[i].status === "failed" ||
      jobs[i].status === "cancelled"
    ) {
      jobs.splice(i, 1);
    }
  }
  notify();
}

export function getQueue(): RenderJob[] {
  return [...jobs];
}

function processQueue(): void {
  if (isProcessing) return;
  const pending = jobs.filter((j) => j.status === "queued");
  if (pending.length === 0) return;

  // Sort by priority (desc) then creation time (asc)
  pending.sort((a, b) => b.priority - a.priority || a.createdAt - b.createdAt);

  const activeCount = jobs.filter((j) => j.status === "rendering").length;
  if (activeCount >= maxConcurrent) return;

  const nextJob = pending[0];
  nextJob.status = "rendering";
  nextJob.startedAt = Date.now();
  notify();

  // TODO: Actually invoke the render pipeline via IPC
  // For now, simulate progress
  simulateRender(nextJob);
}

function simulateRender(job: RenderJob): void {
  // This is a placeholder. In production, this would call window.ipcRenderer.invoke("render:pipeline", ...)
  let progress = 0;
  const interval = setInterval(() => {
    progress += 5;
    job.progress = Math.min(progress, 99);
    notify();

    if (progress >= 100) {
      clearInterval(interval);
      job.status = "completed";
      job.progress = 100;
      job.completedAt = Date.now();
      notify();
      isProcessing = false;
      processQueue();
    }
  }, 500);
}
