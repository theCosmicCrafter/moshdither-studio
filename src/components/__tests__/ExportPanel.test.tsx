/**
 * Tests for ExportPanel: export button states, no-effects warning, format selection.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, cleanup, waitFor } from "@testing-library/react";
import { useAppStore, type EffectMeta } from "../../store";
import { cancelExport } from "../../lib/tauri";

vi.mock("@tauri-apps/api/core", () => ({
  invoke: vi.fn(() => Promise.resolve({})),
  convertFileSrc: vi.fn((path: string) => path),
}));

vi.mock("@tauri-apps/plugin-dialog", () => ({
  open: vi.fn(() => Promise.resolve(null)),
  save: vi.fn(() => Promise.resolve(null)),
}));

vi.mock("@tauri-apps/api/event", () => ({
  listen: vi.fn(() => Promise.resolve(() => {})),
}));

vi.mock("../../utils/effectConverter", () => ({
  stackToRustPayload: vi.fn(() => []),
  stackRequiresCpuPreview: vi.fn(() => false),
}));

vi.mock("../../lib/tauri", () => ({
  invoke: vi.fn(() => Promise.resolve({})),
  convertFileSrc: vi.fn((path: string) => path),
  exportVideo: vi.fn(() => Promise.resolve("/output/test.mp4")),
  applyFfglitch: vi.fn(() => Promise.resolve("/output/ffglitch.mp4")),
  cancelExport: vi.fn(() => Promise.resolve()),
}));

vi.mock("../../lib/browserFallback", () => ({
  getFallbackEffects: vi.fn(() => []),
  isTauriAvailable: vi.fn(() => false),
}));

vi.mock("../../hooks/useBatchQueue", () => ({
  useBatchQueue: () => ({
    queue: [],
    isProcessing: false,
    currentJobId: null,
    addJob: vi.fn(),
    removeJob: vi.fn(),
    clearQueue: vi.fn(),
    processQueue: vi.fn(),
  }),
}));

import ExportPanel from "../ExportPanel";
import { exportDimensions } from "../../utils/exportDimensions";

function mockEffectMeta(id: string, name: string, category: string): EffectMeta {
  return {
    id,
    name,
    category,
    media_type: "both",
    parameters: [
      { id: "intensity", name: "Intensity", type: "slider", min: 0, max: 1, default: 0.5, step: 0.01 },
    ],
  };
}

function resetStore() {
  useAppStore.setState({
    effectStack: [],
    pastStacks: [],
    futureStacks: [],
    selectedStackId: null,
    mediaLoaded: false,
    mediaInfo: null,
    filePath: null,
    audioEnabled: false,
    audioFilePath: null,
    audioBakeData: null,
    exportProgress: 0,
    exportIsRunning: false,
    exportCancelRequested: false,
    exportTriggerId: 0,
    statusMessage: "Ready",
    inPoint: null,
    outPoint: null,
    duration: 10,
    activeMask: null,
    sam3Masks: [],
    watermark: { enabled: false, type: "text", text: "", opacity: 0.5, position: "bottom-right", imagePath: null, fontSize: 24, fontPath: null, color: "white", scale: 20, rotation: 0 },
    aspectRatioLock: false,
    aspectRatio: null,
  });
}

describe("ExportPanel", () => {
  beforeEach(() => {
    resetStore();
    localStorage.clear();
  });

  afterEach(() => {
    cleanup();
  });

  it("renders without crashing", () => {
    render(<ExportPanel />);
    expect(screen.getByText("Export Video")).toBeInTheDocument();
  });

  it("renders format buttons", () => {
    render(<ExportPanel />);
    expect(screen.getByText("MP4")).toBeInTheDocument();
    expect(screen.getByText("WEBM")).toBeInTheDocument();
    expect(screen.getByText("GIF")).toBeInTheDocument();
  });

  it("renders quality buttons", () => {
    render(<ExportPanel />);
    expect(screen.getByText("draft")).toBeInTheDocument();
    expect(screen.getByText("good")).toBeInTheDocument();
    expect(screen.getByText("best")).toBeInTheDocument();
  });

  it("renders codec buttons", () => {
    render(<ExportPanel />);
    expect(screen.getByText("H.264")).toBeInTheDocument();
    expect(screen.getByText("H.265 / HEVC")).toBeInTheDocument();
    expect(screen.getByText("VP9")).toBeInTheDocument();
    expect(screen.getByText("ProRes 422")).toBeInTheDocument();
  });

  it("renders resolution buttons", () => {
    render(<ExportPanel />);
    expect(screen.getByText("Source")).toBeInTheDocument();
    expect(screen.getByText("4K UHD")).toBeInTheDocument();
    expect(screen.getByText("1080p HD")).toBeInTheDocument();
  });

  it("shows 0 effects queued when stack is empty", () => {
    render(<ExportPanel />);
    expect(screen.getByText(/0 effects queued/)).toBeInTheDocument();
  });

  it("shows effect count when stack has items", () => {
    useAppStore.getState().addToStack(mockEffectMeta("dithering.bayer", "Bayer", "dithering"));
    render(<ExportPanel />);
    expect(screen.getByText(/1 effect queued/)).toBeInTheDocument();
  });

  it("export button is present when not running", () => {
    render(<ExportPanel />);
    expect(screen.getByText("Export Video")).toBeInTheDocument();
  });

  it("shows no-effects warning in status message when exporting without effects", async () => {
    useAppStore.getState().setMediaLoaded(true);
    useAppStore.getState().setMediaInfo({ width: 1920, height: 1080 });
    useAppStore.getState().setFilePath("/test/video.mp4");
    render(<ExportPanel />);
    fireEvent.click(screen.getByText("Export Video"));
    await waitFor(() => {
      expect(useAppStore.getState().statusMessage).toContain("No effects enabled");
    });
  });

  it("shows load media warning when no media loaded", async () => {
    render(<ExportPanel />);
    fireEvent.click(screen.getByText("Export Video"));
    await waitFor(() => {
      expect(useAppStore.getState().statusMessage).toContain("Load media");
    });
  });

  it("FFglitch export button is disabled without media", () => {
    render(<ExportPanel />);
    const ffglitchBtn = screen.getByText(/Export FFglitch/);
    expect(ffglitchBtn).toBeDisabled();
  });

  it("Add to Queue button is disabled without media", () => {
    render(<ExportPanel />);
    const addQueueBtn = screen.getByText("Add to Queue");
    expect(addQueueBtn).toBeDisabled();
  });

  it("changes format on click", () => {
    render(<ExportPanel />);
    fireEvent.click(screen.getByText("WEBM"));
    // Format state is internal; we can verify the button is highlighted by checking style
    // Just ensure no crash
    expect(screen.getByText("WEBM")).toBeInTheDocument();
  });

  it("changes quality on click", () => {
    render(<ExportPanel />);
    fireEvent.click(screen.getByText("best"));
    expect(screen.getByText("best")).toBeInTheDocument();
  });

  it("changes codec on click", () => {
    render(<ExportPanel />);
    fireEvent.click(screen.getByText("VP9"));
    expect(screen.getByText("VP9")).toBeInTheDocument();
  });

  it("renders FPS slider", () => {
    render(<ExportPanel />);
    expect(screen.getByLabelText("FPS")).toBeInTheDocument();
  });

  it("renders watermark checkbox", () => {
    render(<ExportPanel />);
    expect(screen.getByText("Watermark")).toBeInTheDocument();
  });

  it("shows watermark options when enabled", () => {
    render(<ExportPanel />);
    // Click the watermark checkbox label
    const wmLabel = screen.getByText("Watermark").closest("label")!;
    const checkbox = wmLabel.querySelector('input[type="checkbox"]')!;
    fireEvent.click(checkbox);
    expect(screen.getByText("Text")).toBeInTheDocument();
    expect(screen.getByText("Image")).toBeInTheDocument();
  });

  it("shows aspect ratio lock checkbox", () => {
    render(<ExportPanel />);
    expect(screen.getByText("Lock Aspect Ratio")).toBeInTheDocument();
  });

  it("shows aspect ratio options when locked", () => {
    render(<ExportPanel />);
    const arText = screen.getByText("Lock Aspect Ratio");
    const container = arText.parentElement!;
    const checkbox = container.querySelector('input[type="checkbox"]')!;
    fireEvent.click(checkbox);
    expect(screen.getByText("16:9")).toBeInTheDocument();
    expect(screen.getByText("4:3")).toBeInTheDocument();
    expect(screen.getByText("1:1")).toBeInTheDocument();
  });

  // The mode dropdown used to be the whole UI: every mode ran on its script's
  // baked-in constants and applyFfglitch was called with `{}`.
  describe("datamosh mode knobs", () => {
    it("renders the selected mode's knobs and sends changes to the store", () => {
      useAppStore.setState({ ffglitchMode: "zoom", ffglitchParams: {} });
      render(<ExportPanel />);
      const slider = screen.getByLabelText("Zoom");
      fireEvent.change(slider, { target: { value: "55" } });
      expect(useAppStore.getState().ffglitchParams.zoom).toEqual({ zoom: 55 });
    });

    it("switching mode shows that mode's knobs", () => {
      useAppStore.setState({ ffglitchMode: "zoom", ffglitchParams: {} });
      render(<ExportPanel />);
      fireEvent.change(screen.getByLabelText(/Bitstream datamosh/), { target: { value: "sort" } });
      expect(screen.getByLabelText("Keep the first frame")).toBeInTheDocument();
      expect(screen.queryByLabelText("Zoom")).not.toBeInTheDocument();
    });

    it("Reset returns a mode to its defaults", () => {
      useAppStore.setState({ ffglitchMode: "zoom", ffglitchParams: { zoom: { zoom: 5 } } });
      render(<ExportPanel />);
      fireEvent.click(screen.getByTitle("Back to this mode's defaults"));
      expect(useAppStore.getState().ffglitchParams.zoom).toBeUndefined();
    });
  });

  it("shows in/out range when set", () => {
    useAppStore.getState().setInPoint(2);
    useAppStore.getState().setOutPoint(8);
    render(<ExportPanel />);
    // Timecode, not bare seconds: in/out are frame-accurate now, and "2.4999s"
    // is not a readout anyone wants.
    expect(screen.getByText(/IN 00:02\.00/)).toBeInTheDocument();
    expect(screen.getByText(/OUT 00:08\.00/)).toBeInTheDocument();
  });

  it("does not show export button when export is running", () => {
    useAppStore.getState().setExportIsRunning(true);
    render(<ExportPanel />);
    expect(screen.queryByText("Export Video")).not.toBeInTheDocument();
  });

  it("shows cancel button when export is running", () => {
    useAppStore.getState().setExportIsRunning(true);
    render(<ExportPanel />);
    expect(screen.getByText("Cancel")).toBeInTheDocument();
  });

  it("cancel button resets export state", () => {
    useAppStore.getState().setExportIsRunning(true);
    useAppStore.getState().setExportProgress(50);
    render(<ExportPanel />);
    fireEvent.click(screen.getByText("Cancel"));
    expect(useAppStore.getState().exportIsRunning).toBe(false);
    expect(useAppStore.getState().exportProgress).toBe(0);
  });

  it("cancel button notifies the backend, not just local UI state", () => {
    // Previously requestExportCancel() only flipped a Zustand flag nothing
    // read -- the UI showed "Export cancelled" while the actual
    // ffmpeg/mosh_cli.py subprocess kept running untouched. This is the
    // regression test for that fix: clicking Cancel must actually invoke
    // the backend command, not just reset local state.
    vi.mocked(cancelExport).mockClear();
    useAppStore.getState().setExportIsRunning(true);
    render(<ExportPanel />);
    fireEvent.click(screen.getByText("Cancel"));
    expect(cancelExport).toHaveBeenCalledTimes(1);
  });
});

/**
 * "Lock Aspect Ratio" and its six ratio chips wrote to the store and nothing
 * read them; the control had no effect on any export.
 */
describe("exportDimensions", () => {
  const src = { width: 640, height: 1146 }; // the vertical test clip
  const p1080 = { w: 1920, h: 1080 };
  const source = { w: 0, h: 0 };

  it("passes the preset through untouched when nothing is locked", () => {
    expect(exportDimensions(p1080, null, src)).toEqual({ width: 1920, height: 1080 });
  });

  it("lets 'Source' mean source when nothing is locked", () => {
    expect(exportDimensions(source, null, src)).toEqual({ width: undefined, height: undefined });
  });

  it("reshapes a preset to the locked ratio without growing it", () => {
    // 1920x1080 locked to 1:1 -> the 1080 side is kept.
    expect(exportDimensions(p1080, 1, src)).toEqual({ width: 1080, height: 1080 });
    // ...and to 9:16 -> still bounded by 1080 tall.
    const portrait = exportDimensions(p1080, 9 / 16, src);
    expect(portrait.height).toBe(1080);
    expect(portrait.width).toBe(608);
  });

  it("derives the box from the media when the resolution is 'Source'", () => {
    const r = exportDimensions(source, 16 / 9, src);
    expect(r.width).toBe(640);
    expect(r.height).toBe(360);
  });

  it("always returns even dimensions, which yuv420p requires", () => {
    for (const ratio of [16 / 9, 4 / 3, 1, 9 / 16, 21 / 9, 3 / 2]) {
      const r = exportDimensions(p1080, ratio, src);
      expect(r.width! % 2, `width for ${ratio}`).toBe(0);
      expect(r.height! % 2, `height for ${ratio}`).toBe(0);
    }
  });

  it("falls back to no override when a lock has nothing to work from", () => {
    expect(exportDimensions(source, 16 / 9, null)).toEqual({ width: undefined, height: undefined });
    expect(exportDimensions(p1080, Number.NaN, src)).toEqual({ width: 1920, height: 1080 });
  });
});
