import { describe, it, expect, vi } from "vitest";
import {
  addJob,
  cancelJob,
  removeJob,
  clearCompleted,
  getQueue,
  subscribeToQueue,
} from "../renderQueue";

describe("Render Queue", () => {
  it("adds a job to the queue", () => {
    const job = addJob({
      projectState: {},
      outputPath: "/tmp/out.mp4",
      format: "mp4",
      fps: 30,
      priority: 1,
    });
    // processQueue auto-starts the job, so it may already be rendering
    expect(["queued", "rendering"]).toContain(job.status);
    expect(job.progress).toBe(0);
    expect(getQueue()).toHaveLength(1);
    removeJob(job.id);
  });

  it("notifies subscribers on changes", () => {
    const listener = vi.fn();
    const unsub = subscribeToQueue(listener);
    expect(listener).toHaveBeenCalledTimes(1);

    const job = addJob({
      projectState: {},
      outputPath: "/tmp/out.mp4",
      format: "mp4",
      fps: 30,
      priority: 1,
    });
    // Listener gets called for add + processQueue state change = 3 total
    expect(listener).toHaveBeenCalledTimes(3);

    removeJob(job.id);
    unsub();
  });

  it("cancels a queued job", () => {
    const job = addJob({
      projectState: {},
      outputPath: "/tmp/out.mp4",
      format: "mp4",
      fps: 30,
      priority: 1,
    });
    cancelJob(job.id);
    expect(getQueue().find((j) => j.id === job.id)?.status).toBe("cancelled");
    removeJob(job.id);
  });

  it("clears completed jobs", () => {
    const job = addJob({
      projectState: {},
      outputPath: "/tmp/out.mp4",
      format: "mp4",
      fps: 30,
      priority: 1,
    });
    cancelJob(job.id);
    clearCompleted();
    // Module-level state may have leftover jobs from other tests' simulateRender intervals,
    // so we just verify the target job was removed
    expect(getQueue().find((j) => j.id === job.id)).toBeUndefined();
  });
});
