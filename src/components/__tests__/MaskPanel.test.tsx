/**
 * Tests for MaskPanel: mask creation, SAM3 points, tab switching, mode selection.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, cleanup, waitFor, act } from "@testing-library/react";
import { useAppStore } from "../../store";

vi.mock("@tauri-apps/api/core", () => ({
  invoke: vi.fn(() => Promise.resolve({})),
  convertFileSrc: vi.fn((path: string) => path),
}));

vi.mock("@tauri-apps/plugin-dialog", () => ({
  open: vi.fn(() => Promise.resolve(null)),
  save: vi.fn(() => Promise.resolve(null)),
}));

vi.mock("../../lib/tauri", () => ({
  invoke: vi.fn(() => Promise.resolve({})),
  convertFileSrc: vi.fn((path: string) => path),
  getFrameData: vi.fn(
    () =>
      new Promise((resolve) =>
        setTimeout(() => resolve("data:image/png;base64,abc"), 50)
      )
  ),
  sam3AddonStatus: vi.fn(() =>
    Promise.resolve({
      ready: true,
      sidecar_installed: true,
      sidecar_path: null,
      sidecar_bytes: null,
      checkpoint_installed: true,
      checkpoint_path: null,
      checkpoint_bytes: null,
      dev_override: null,
    })
  ),
  sam3AddonInstall: vi.fn(() => Promise.reject(new Error("not used in tests"))),
  sam3Init: vi.fn(() => Promise.resolve({})),
  sam3LoadImage: vi.fn(() => Promise.resolve({ width: 100, height: 100 })),
  sam3TextPrompt: vi.fn(() => Promise.resolve({ count: 1, masks: ["mask1"], scores: [0.95] })),
  sam3PointPrompt: vi.fn(() => Promise.resolve({ count: 1, masks: ["mask1"], scores: [0.9] })),
  sam3AutoMask: vi.fn(() => Promise.resolve({ count: 2, masks: ["m1", "m2"], scores: [0.9, 0.8] })),
  sam3Clear: vi.fn(() => Promise.resolve("ok")),
  sam3PostprocessMask: vi.fn(() => Promise.resolve("processed-mask")),
}));

vi.mock("../../lib/browserFallback", () => ({
  getFallbackEffects: vi.fn(() => []),
  isTauriAvailable: vi.fn(() => false),
}));

// Mock ManualMaskEditor to avoid canvas complexity
vi.mock("../ManualMaskEditor", () => ({
  default: () => <div data-testid="manual-mask-editor">Manual Mask Editor</div>,
}));

import MaskPanel from "../MaskPanel";

function resetStore() {
  useAppStore.setState({
    mediaLoaded: false,
    activeMask: null,
    maskVisible: true,
    maskTab: "sam3",
    maskTool: "brush",
    brushSize: 20,
    sam3Ready: false,
    sam3Mode: "text",
    sam3Clicking: false,
    sam3Points: [],
    sam3HoverMask: null,
    sam3OverlayOpacity: 0.45,
    sam3OverlayColor: "#00ffff",
    sam3Masks: [],
    sam3MaskScores: [],
    sam3MaskIndex: 0,
    statusMessage: "Ready",
  });
}

describe("MaskPanel", () => {
  beforeEach(() => {
    resetStore();
    localStorage.clear();
  });

  afterEach(() => {
    cleanup();
  });

  it("renders load media message when no media loaded", () => {
    render(<MaskPanel />);
    expect(screen.getByText(/Load media to use SAM3/)).toBeInTheDocument();
  });

  it("renders SAM3 and Manual tabs when media is loaded", () => {
    useAppStore.getState().setMediaLoaded(true);
    render(<MaskPanel />);
    expect(screen.getByText("SAM3")).toBeInTheDocument();
    expect(screen.getByText("Manual")).toBeInTheDocument();
  });

  it("shows SAM3 idle message when sam3 is not ready", () => {
    useAppStore.getState().setMediaLoaded(true);
    render(<MaskPanel />);
    expect(screen.getByText(/SAM3 idle/i)).toBeInTheDocument();
  });

  it("uses a static status indicator while SAM3 is idle", () => {
    useAppStore.getState().setMediaLoaded(true);
    render(<MaskPanel />);

    expect(screen.getByText(/SAM3 idle/i).parentElement?.querySelector(".animate-spin")).toBeNull();
  });

  // "Run Video Predictor" is recycled (recycling/MANIFEST.md, ADR 0006). It ran
  // an independent auto-segment per frame with no identity carried between
  // them, and its output reached only the green overlay -- never the
  // renderer, never the export. This fails if the button comes back without an
  // export path behind it, which is the exact bug being kept out.
  it("offers no video predictor on a video source", () => {
    useAppStore.setState({ mediaLoaded: true, isVideo: true, sam3Ready: true, maskTab: "sam3" });
    render(<MaskPanel />);
    // Positive anchor first, so a silent early return cannot pass this test.
    expect(screen.getByText("Load Current Image")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /video predictor/i })).toBeNull();
    expect(screen.queryByText(/frame timeline/i)).toBeNull();
  });

  it("shows Load Current Image button when sam3 is ready", () => {
    useAppStore.getState().setMediaLoaded(true);
    useAppStore.getState().setSam3Ready(true);
    render(<MaskPanel />);
    expect(screen.getByText("Load Current Image")).toBeInTheDocument();
  });

  it("switches to manual tab on click", () => {
    useAppStore.getState().setMediaLoaded(true);
    render(<MaskPanel />);
    fireEvent.click(screen.getByText("Manual"));
    expect(useAppStore.getState().maskTab).toBe("manual");
    expect(screen.getByTestId("manual-mask-editor")).toBeInTheDocument();
  });

  it("switches back to SAM3 tab on click", () => {
    useAppStore.getState().setMediaLoaded(true);
    useAppStore.getState().setMaskTab("manual");
    render(<MaskPanel />);
    fireEvent.click(screen.getByText("SAM3"));
    expect(useAppStore.getState().maskTab).toBe("sam3");
  });

  it("shows mode selector when sam3 is ready", () => {
    useAppStore.getState().setMediaLoaded(true);
    useAppStore.getState().setSam3Ready(true);
    render(<MaskPanel />);
    // Mode selector is a <select>
    const selects = screen.getAllByRole("combobox");
    expect(selects.length).toBeGreaterThan(0);
  });

  it("shows text prompt input in text mode", () => {
    useAppStore.getState().setMediaLoaded(true);
    useAppStore.getState().setSam3Ready(true);
    useAppStore.getState().setSam3Mode("text");
    render(<MaskPanel />);
    expect(screen.getByPlaceholderText("e.g. sky, person, car...")).toBeInTheDocument();
  });

  it("offers a Start SAM3 button in point mode while idle, instead of a dead click-image hint", async () => {
    useAppStore.getState().setMediaLoaded(true);
    useAppStore.getState().setSam3Mode("point");
    render(<MaskPanel />);

    // While idle, PreviewViewport never mounts the click-catching overlay
    // (isSam3Interactive requires sam3Ready), so the old "Click image to add
    // points" hint here was a dead end with no way out of the idle state.
    expect(screen.queryByText("Click image to add points")).not.toBeInTheDocument();

    const startButton = screen.getByRole("button", { name: /Start SAM3/i });
    fireEvent.click(startButton);

    await waitFor(() => expect(useAppStore.getState().sam3Ready).toBe(true));
  });

  it("offers a Start SAM3 button in box mode while idle, instead of a dead drag-to-draw hint", async () => {
    useAppStore.getState().setMediaLoaded(true);
    useAppStore.getState().setSam3Mode("box");
    render(<MaskPanel />);

    expect(screen.queryByText("Drag on image to draw box")).not.toBeInTheDocument();

    const startButton = screen.getByRole("button", { name: /Start SAM3/i });
    fireEvent.click(startButton);

    await waitFor(() => expect(useAppStore.getState().sam3Ready).toBe(true));
  });

  it("shows point instruction in point mode", () => {
    useAppStore.getState().setMediaLoaded(true);
    useAppStore.getState().setSam3Ready(true);
    useAppStore.getState().setSam3Mode("point");
    render(<MaskPanel />);
    expect(screen.getByText("Click image to add points")).toBeInTheDocument();
  });

  it("shows box instruction in box mode", () => {
    useAppStore.getState().setMediaLoaded(true);
    useAppStore.getState().setSam3Ready(true);
    useAppStore.getState().setSam3Mode("box");
    render(<MaskPanel />);
    expect(screen.getByText("Drag on image to draw box")).toBeInTheDocument();
  });

  it("shows Auto Mask button in auto mode", async () => {
    useAppStore.getState().setMediaLoaded(true);
    useAppStore.getState().setSam3Ready(true);
    useAppStore.getState().setSam3Mode("auto");
    render(<MaskPanel />);
    // The auto-load effect sets isLoading=true on mount; wait for it to settle
    expect(await screen.findByText("Auto Mask")).toBeInTheDocument();
  });

  it("changes sam3 mode on select change", () => {
    useAppStore.getState().setMediaLoaded(true);
    useAppStore.getState().setSam3Ready(true);
    render(<MaskPanel />);
    const select = screen.getAllByRole("combobox")[0];
    fireEvent.change(select, { target: { value: "point" } });
    expect(useAppStore.getState().sam3Mode).toBe("point");
  });

  // ── SAM3 Points ────────────────────────────────────────────
  describe("SAM3 Points", () => {
    it("shows point tree when points exist in point mode", () => {
      useAppStore.getState().setMediaLoaded(true);
      useAppStore.getState().setSam3Ready(true);
      useAppStore.getState().setSam3Mode("point");
      useAppStore.setState({
        sam3Points: [
          { x: 10, y: 20, label: 1 },
          { x: 30, y: 40, label: 0 },
        ],
      });
      render(<MaskPanel />);
      expect(screen.getByText(/Point Tree \(2\)/)).toBeInTheDocument();
      expect(screen.getByText("(10, 20)")).toBeInTheDocument();
      expect(screen.getByText("(30, 40)")).toBeInTheDocument();
    });

    it("does not show point tree when no points", () => {
      useAppStore.getState().setMediaLoaded(true);
      useAppStore.getState().setSam3Ready(true);
      useAppStore.getState().setSam3Mode("point");
      render(<MaskPanel />);
      expect(screen.queryByText(/Point Tree/)).not.toBeInTheDocument();
    });

    it("adds points to store via addSam3Point", () => {
      useAppStore.getState().setMediaLoaded(true);
      useAppStore.getState().setSam3Ready(true);
      useAppStore.getState().setSam3Mode("point");
      render(<MaskPanel />);
      // Add a point via store directly (simulating viewport click)
      act(() => {
        useAppStore.getState().addSam3Point({ x: 50, y: 60, label: 1 });
      });
      expect(useAppStore.getState().sam3Points.length).toBe(1);
      expect(useAppStore.getState().sam3Points[0]).toEqual({ x: 50, y: 60, label: 1 });
    });

    it("removes points from store via removeSam3Point", () => {
      useAppStore.setState({
        sam3Points: [
          { x: 10, y: 20, label: 1 },
          { x: 30, y: 40, label: 0 },
        ],
      });
      useAppStore.getState().removeSam3Point(0);
      expect(useAppStore.getState().sam3Points.length).toBe(1);
      expect(useAppStore.getState().sam3Points[0]).toEqual({ x: 30, y: 40, label: 0 });
    });

    it("clears all points via clearSam3Points", () => {
      useAppStore.setState({
        sam3Points: [
          { x: 10, y: 20, label: 1 },
          { x: 30, y: 40, label: 0 },
        ],
      });
      useAppStore.getState().clearSam3Points();
      expect(useAppStore.getState().sam3Points.length).toBe(0);
    });
  });

  // ── Mask visibility ────────────────────────────────────────
  describe("Mask visibility", () => {
    it("shows Hide/Show button when activeMask is set", () => {
      useAppStore.getState().setMediaLoaded(true);
      useAppStore.getState().setActiveMask("some-mask-data");
      render(<MaskPanel />);
      expect(screen.getByText("Hide")).toBeInTheDocument();
    });

    it("toggles mask visibility on button click", () => {
      useAppStore.getState().setMediaLoaded(true);
      useAppStore.getState().setActiveMask("some-mask-data");
      useAppStore.getState().setMaskVisible(true);
      render(<MaskPanel />);
      fireEvent.click(screen.getByText("Hide"));
      expect(useAppStore.getState().maskVisible).toBe(false);
    });

    it("does not show Hide/Show button when no active mask", () => {
      useAppStore.getState().setMediaLoaded(true);
      render(<MaskPanel />);
      expect(screen.queryByText("Hide")).not.toBeInTheDocument();
      expect(screen.queryByText("Show")).not.toBeInTheDocument();
    });
  });

  // ── Text prompt ────────────────────────────────────────────
  describe("Text prompt", () => {
    it("Go button is disabled when prompt is empty", async () => {
      useAppStore.getState().setMediaLoaded(true);
      useAppStore.getState().setSam3Ready(true);
      useAppStore.getState().setSam3Mode("text");
      render(<MaskPanel />);
      // Wait for the auto-load effect to finish (button shows "..." while loading)
      const goBtn = await screen.findByText("Go");
      expect(goBtn).toBeDisabled();
    });

    it("runs text prompt on Go button click", async () => {
      useAppStore.getState().setMediaLoaded(true);
      useAppStore.getState().setSam3Ready(true);
      useAppStore.getState().setSam3Mode("text");
      render(<MaskPanel />);
      const input = screen.getByPlaceholderText("e.g. sky, person, car...");
      fireEvent.change(input, { target: { value: "sky" } });
      const goBtn = await screen.findByText("Go");
      fireEvent.click(goBtn);
      await waitFor(() => {
        expect(useAppStore.getState().sam3Masks.length).toBe(1);
      });
    });
  });

  // ── Auto mask ──────────────────────────────────────────────
  describe("Auto mask", () => {
    it("runs auto mask on button click", async () => {
      useAppStore.getState().setMediaLoaded(true);
      useAppStore.getState().setSam3Ready(true);
      useAppStore.getState().setSam3Mode("auto");
      render(<MaskPanel />);
      const autoBtn = await screen.findByText("Auto Mask");
      fireEvent.click(autoBtn);
      await waitFor(() => {
        expect(useAppStore.getState().sam3Masks.length).toBe(2);
      });
    });
  });

  // ── Mask candidates ────────────────────────────────────────
  describe("Mask candidates", () => {
    it("shows mask selector when masks are available", () => {
      useAppStore.getState().setMediaLoaded(true);
      useAppStore.getState().setSam3Ready(true);
      useAppStore.getState().setSam3Masks(["mask1", "mask2"], [0.9, 0.8]);
      render(<MaskPanel />);
      expect(screen.getByText(/Mask Candidates \(2\)/)).toBeInTheDocument();
    });
  });
});
