import { renderHook, act } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { useBatchQueue } from "./useBatchQueue";
import { useAppStore } from "../store";
import { DEFAULT_WATERMARK } from "../utils/watermark";

const mockExportVideo = vi.fn<(...args: unknown[]) => Promise<string>>();

vi.mock("../lib/tauri", () => ({
  exportVideo: (...args: unknown[]) => mockExportVideo(...args),
}));

describe("useBatchQueue", () => {
  beforeEach(() => {
    mockExportVideo.mockReset().mockResolvedValue("C:/exports/output.mp4");
    useAppStore.setState({
      filePath: "C:/videos/input.mp4",
      mediaInfo: {
        width: 1920,
        height: 1080,
      },
      duration: 10,
      inPoint: null,
      outPoint: null,
      exportIncludeAudio: true,
      watermark: { ...DEFAULT_WATERMARK },
      audioBakeData: null,
      effectStack: [],
    });
  });

  it("adds and removes jobs with complete configuration", () => {
    const { result } = renderHook(() => useBatchQueue());

    act(() => {
      result.current.addJob({
        name: "Test Job",
        format: "mp4",
        codec: "h264",
        resolutionW: 1280,
        resolutionH: 720,
        fps: 30,
        quality: "good",
        trimStart: 2.0,
        trimEnd: 8.0,
        includeAudio: true,
        processingScale: 0.5,
      });
    });

    expect(result.current.queue.length).toBe(1);
    const job = result.current.queue[0];
    expect(job.name).toBe("Test Job");
    expect(job.trimStart).toBe(2.0);
    expect(job.trimEnd).toBe(8.0);
    expect(job.processingScale).toBe(0.5);
    expect(job.status).toBe("pending");

    act(() => {
      result.current.removeJob(job.id);
    });

    expect(result.current.queue.length).toBe(0);
  });

  it("passes full export options to exportVideo when processing queue", async () => {
    const { result } = renderHook(() => useBatchQueue());

    const customWatermark = {
      ...DEFAULT_WATERMARK,
      enabled: true,
      text: "CUSTOM_WM",
      position: "top-left" as const,
      opacity: 0.5,
    };

    act(() => {
      result.current.addJob({
        name: "Job 1",
        format: "mp4",
        codec: "h264",
        resolutionW: 1920,
        resolutionH: 1080,
        fps: 30,
        quality: "best",
        trimStart: 1.5,
        trimEnd: 6.0,
        includeAudio: false,
        processingScale: 1,
        watermark: customWatermark,
      });
    });

    await act(async () => {
      await result.current.processQueue();
    });

    expect(mockExportVideo).toHaveBeenCalledTimes(1);
    const [path, stack, options] = mockExportVideo.mock.calls[0] as [
      string,
      unknown[],
      Record<string, unknown>,
    ];
    expect(path).toBe("C:/videos/input.mp4");
    expect(Array.isArray(stack)).toBe(true);
    expect(options.format).toBe("mp4");
    expect(options.codec).toBe("h264");
    expect(options.width).toBe(1920);
    expect(options.height).toBe(1080);
    expect(options.trimStart).toBe(1.5);
    expect(options.trimEnd).toBe(6.0);
    expect(options.includeAudio).toBe(false);
    expect(options.processingScale).toBe(1);
    expect(options.watermark).toEqual(customWatermark);
  });
});
