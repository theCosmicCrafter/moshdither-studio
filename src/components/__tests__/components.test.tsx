/**
 * Comprehensive component tests for untested React components.
 * Tests render behavior, key interactions, and store integration.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, cleanup, within, waitFor } from "@testing-library/react";
import { useAppStore, type EffectMeta } from "../../store";

// ── Mock external dependencies ──────────────────────────────
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

vi.mock("@tauri-apps/api/window", () => ({
  getCurrentWindow: vi.fn(() => ({
    minimize: vi.fn(() => Promise.resolve()),
    maximize: vi.fn(() => Promise.resolve()),
    unmaximize: vi.fn(() => Promise.resolve()),
    setFullscreen: vi.fn(() => Promise.resolve()),
    close: vi.fn(() => Promise.resolve()),
    isMaximized: vi.fn(() => Promise.resolve(false)),
    isFullscreen: vi.fn(() => Promise.resolve(false)),
    onResized: vi.fn(() => Promise.resolve(() => {})),
  })),
}));

// Mock the audio engine
vi.mock("../../engine/audio/AudioEngine", () => ({
  AudioEngine: vi.fn().mockImplementation(() => ({
    getTimeDomainData: vi.fn(() => new Uint8Array(128)),
    loadFile: vi.fn(() => Promise.resolve()),
    play: vi.fn(),
    pause: vi.fn(),
    stop: vi.fn(),
    setVolume: vi.fn(),
  })),
  getGlobalAudioEngine: vi.fn(() => null),
  setGlobalAudioEngine: vi.fn(),
}));

vi.mock("../../engine/audio/ManifestAudioEngine", () => ({
  ManifestAudioEngine: vi.fn().mockImplementation(() => ({
    loadManifest: vi.fn(() => Promise.resolve()),
    play: vi.fn(),
    pause: vi.fn(),
    stop: vi.fn(),
  })),
}));

vi.mock("../../engine/audio/AudioParameterMapper", () => ({
  AudioParameterMapper: vi.fn().mockImplementation(() => ({
    map: vi.fn(() => ({})),
  })),
}));

vi.mock("../../engine/audio/AudioFeatureExtractor", () => ({
  AudioFeatureExtractor: vi.fn().mockImplementation(() => ({
    extract: vi.fn(() => Promise.resolve({})),
  })),
}));

vi.mock("../../utils/beatDetection", () => ({
  detectBeats: vi.fn(() => ({ bpm: 120, beats: [{ time: 0 }, { time: 0.5 }] })),
  decodeAudioFile: vi.fn(() => Promise.resolve({ sampleRate: 44100, length: 1000, getChannelData: () => new Float32Array(1000) })),
}));

vi.mock("../../utils/beatKeyframeGenerator", () => ({
  generateBeatKeyframes: vi.fn(() => [{ id: "kf-1", time: 0, value: 1, easing: "easeInOut" }]),
}));

vi.mock("../../utils/effectConverter", () => ({
  stackToRustPayload: vi.fn(() => []),
  stackRequiresCpuPreview: vi.fn(() => false),
}));

vi.mock("../../lib/tauri", () => ({
  invoke: vi.fn(() => Promise.resolve({})),
  convertFileSrc: vi.fn((path: string) => path),
  sam3Init: vi.fn(() => Promise.resolve("ok")),
  sam3LoadImage: vi.fn(() => Promise.resolve({ width: 100, height: 100 })),
  sam3TextPrompt: vi.fn(() => Promise.resolve({ count: 1, masks: ["mask1"], scores: [0.9] })),
  sam3PointPrompt: vi.fn(() => Promise.resolve({ count: 1, masks: ["mask1"], scores: [0.9] })),
  sam3BoxPrompt: vi.fn(() => Promise.resolve({ count: 0, masks: [], scores: [] })),
  sam3AutoMask: vi.fn(() => Promise.resolve({ count: 2, masks: ["m1", "m2"], scores: [0.9, 0.8] })),
  sam3RefineMask: vi.fn(() => Promise.resolve({ status: "ok", count: 1, masks: ["m1"], scores: [0.9] })),
  sam3PostprocessMask: vi.fn(() => Promise.resolve("processed-mask")),
  sam3Clear: vi.fn(() => Promise.resolve("ok")),
  getFrameData: vi.fn(() => Promise.resolve("data:image/png;base64,abc")),
  getMediaMetadata: vi.fn(() => Promise.resolve({})),
  loadMediaFile: vi.fn(() => Promise.resolve({})),
  applyEffectStack: vi.fn(() => Promise.resolve("data:image/png;base64,abc")),
  applyFfglitch: vi.fn(() => Promise.resolve("/output/path.mp4")),
  exportVideo: vi.fn(() => Promise.resolve("/output/path.mp4")),
  verifyEffects: vi.fn(() => Promise.resolve({
    total_effects: 2,
    passed: 1,
    failed: 1,
    summary: "1/2 passed",
    timestamp: "2026-01-01T00:00:00Z",
    results: [
      {
        effect_id: "dithering.bayer",
        effect_name: "Bayer",
        category: "dithering",
        overall_pass: true,
        checks: { no_crash: true, non_empty_output: true, animates: true, mask_inside_correct: true, mask_outside_correct: true },
        error_message: null,
        duration_ms: 12,
      },
      {
        effect_id: "analog.vhs",
        effect_name: "VHS",
        category: "analog",
        overall_pass: false,
        checks: { no_crash: true, non_empty_output: false, animates: true, mask_inside_correct: true, mask_outside_correct: false },
        error_message: "output empty",
        duration_ms: 15,
      },
    ],
  })),
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

vi.mock("../../hooks/useAudioEngine", () => ({
  useAudioEngine: () => ({
    loadAudioFile: vi.fn(() => Promise.resolve()),
    startMicrophone: vi.fn(() => Promise.resolve()),
    play: vi.fn(),
    pause: vi.fn(),
    stop: vi.fn(),
  }),
}));

vi.mock("../../engine/palettePresets", () => ({
  PALETTE_PRESETS: [{ name: "Gameboy", colors: [[0.1, 0.2, 0.1], [0.3, 0.4, 0.3], [0.6, 0.7, 0.6], [0.9, 1.0, 0.9]] }],
  fillPaletteParams: vi.fn((_preset: unknown, params: Record<string, unknown>) => params),
}));

// ── Import components after mocks ────────────────────────────
import StatusBar from "../StatusBar";
import FloatingPanel from "../FloatingPanel";
import PanelMenu from "../PanelMenu";
import OnboardingModal from "../OnboardingModal";
import WindowControls from "../WindowControls";
import PlaybackOverlay from "../PlaybackOverlay";
import PostProcessControls from "../PostProcessControls";
import TrackPanel from "../TrackPanel";
import MaskSelector from "../MaskSelector";
import EffectStack from "../EffectStack";
import EffectBrowser from "../EffectBrowser";
import SearchBar from "../EffectBrowser/SearchBar";
import CategoryTabs from "../EffectBrowser/CategoryTabs";
import EffectList from "../EffectBrowser/EffectList";
import CategoryAccordion from "../EffectBrowser/CategoryAccordion";
import PresetPanel from "../PresetPanel";
import VerificationPanel from "../VerificationPanel";
import AudioPanel from "../AudioPanel";
import { PANEL_REGISTRY, getPanelMeta } from "../DockSystem/panelRegistry";

// ── Helpers ──────────────────────────────────────────────────
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
    currentTime: 0,
    isPlaying: true,
    loopMode: "off",
    duration: 10,
    mediaLoaded: false,
    mediaInfo: null,
    mediaMetadata: null,
    previewDataUrl: null,
    originalDataUrl: null,
    filePath: null,
    proxyUrl: null,
    isVideo: false,
    useCpuPreview: false,
    allEffects: [],
    activeCategory: "dithering",
    searchQuery: "",
    effectStack: [],
    pastStacks: [],
    futureStacks: [],
    selectedStackId: null,
    audioEnabled: false,
    audioFilePath: null,
    audioPlaying: false,
    audioVolume: 1,
    audioBpm: null,
    audioBandEnergies: {},
    audioBeatFlags: { bass: false, mid: false, treble: false },
    audioBindings: {},
    audioMappedValues: {},
    audioBakeData: null,
    audioManifest: null,
    audioManifestProgress: 0,
    audioManifestPhase: "",
    isProcessing: false,
    showBeforeAfter: false,
    zoom: 1,
    statusMessage: "Ready",
    playbackSpeed: 1,
    scopeMode: "none",
    scopesVisible: false,
    panelVisibility: {
      browser: true, preview: true, stack: true, audio: true,
      export: true, presets: true, mask: true, lut: true, proxy: true, tracks: true,
      verify: false,
    },
    dockedPanels: [],
    layoutTrigger: null,
    theme: "dark",
    panelOpacity: 0.65,
    aspectRatioLock: false,
    aspectRatio: null,
    proxyEnabled: false,
    proxyPath: null,
    proxyMaxWidth: 1280,
    proxyCrf: 28,
    proxyGenerating: false,
    tracks: [],
    activeTrackId: null,
    inPoint: null,
    outPoint: null,
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
    keyframes: {},
    exportProgress: 0,
    exportIsRunning: false,
    exportCancelRequested: false,
    exportTriggerId: 0,
  });
}

// ── Tests ────────────────────────────────────────────────────
describe("Component Test Suite", () => {
  beforeEach(() => {
    resetStore();
    localStorage.clear();
  });

  afterEach(() => {
    cleanup();
  });



  // ── StatusBar ──────────────────────────────────────────────
  describe("StatusBar", () => {
    it("renders status message from store", () => {
      useAppStore.getState().setStatusMessage("Test status");
      render(<StatusBar />);
      expect(screen.getByText("Test status")).toBeInTheDocument();
    });

    it("shows processing icon when isProcessing", () => {
      useAppStore.getState().setIsProcessing(true);
      render(<StatusBar />);
      expect(screen.getByText("cloud_sync")).toBeInTheDocument();
    });

    it("displays effect count and active stack count", () => {
      useAppStore.getState().setAllEffects([
        mockEffectMeta("dithering.bayer", "Bayer", "dithering"),
        mockEffectMeta("analog.vhs", "VHS", "analog"),
      ]);
      useAppStore.getState().addToStack(mockEffectMeta("dithering.bayer", "Bayer", "dithering"));
      render(<StatusBar />);
      expect(screen.getByText(/2 effects available/)).toBeInTheDocument();
      expect(screen.getByText(/1 active in stack/)).toBeInTheDocument();
    });

    it("renders scope buttons", () => {
      render(<StatusBar />);
      expect(screen.getByTitle("Histogram")).toBeInTheDocument();
      expect(screen.getByTitle("Waveform")).toBeInTheDocument();
      expect(screen.getByTitle("RGB Parade")).toBeInTheDocument();
    });

    it("toggles scope visibility on click", () => {
      render(<StatusBar />);
      const histBtn = screen.getByTitle("Histogram");
      fireEvent.click(histBtn);
      expect(useAppStore.getState().scopesVisible).toBe(true);
      expect(useAppStore.getState().scopeMode).toBe("histogram");
    });
  });

  // ── FloatingPanel ──────────────────────────────────────────
  describe("FloatingPanel", () => {
    it("renders title and children", () => {
      render(
        <FloatingPanel id="test" title="Test Panel" defaultX={10} defaultY={10} defaultWidth={300} defaultHeight={200}>
          <div data-testid="child">Content</div>
        </FloatingPanel>
      );
      expect(screen.getByText("Test Panel")).toBeInTheDocument();
      expect(screen.getByTestId("child")).toBeInTheDocument();
    });

    it("minimize button hides children", () => {
      render(
        <FloatingPanel id="test" title="Test" defaultX={0} defaultY={0} defaultWidth={300} defaultHeight={200}>
          <div data-testid="child">Content</div>
        </FloatingPanel>
      );
      expect(screen.getByTestId("child")).toBeInTheDocument();
      fireEvent.click(screen.getByLabelText("Minimize panel"));
      expect(screen.queryByTestId("child")).not.toBeInTheDocument();
    });

    it("restore button shows children again", () => {
      render(
        <FloatingPanel id="test" title="Test" defaultX={0} defaultY={0} defaultWidth={300} defaultHeight={200}>
          <div data-testid="child">Content</div>
        </FloatingPanel>
      );
      fireEvent.click(screen.getByLabelText("Minimize panel"));
      expect(screen.queryByTestId("child")).not.toBeInTheDocument();
      fireEvent.click(screen.getByLabelText("Restore panel"));
      expect(screen.getByTestId("child")).toBeInTheDocument();
    });

    it("calls onActivate on mousedown", () => {
      let activated = false;
      render(
        <FloatingPanel id="test" title="Test" defaultX={0} defaultY={0} defaultWidth={300} defaultHeight={200} onActivate={() => { activated = true; }}>
          <div>Content</div>
        </FloatingPanel>
      );
      fireEvent.mouseDown(screen.getByText("Test"));
      expect(activated).toBe(true);
    });

    it("calls onClose when close button is clicked", () => {
      let closedId: string | null = null;
      render(
        <FloatingPanel id="test" title="Test" defaultX={0} defaultY={0} defaultWidth={300} defaultHeight={200} onClose={(id) => { closedId = id; }}>
          <div>Content</div>
        </FloatingPanel>
      );
      fireEvent.click(screen.getByLabelText("Close panel"));
      expect(closedId).toBe("test");
    });
  });

  // ── PanelMenu ──────────────────────────────────────────────
  describe("PanelMenu", () => {
    it("renders toggle button with panel count", () => {
      render(<PanelMenu />);
      expect(screen.getByTitle("Toggle panels")).toBeInTheDocument();
    });

    it("opens dropdown on click", () => {
      render(<PanelMenu />);
      fireEvent.click(screen.getByTitle("Toggle panels"));
      expect(screen.getByText("Panels")).toBeInTheDocument();
    });

    it("lists all panels from registry", () => {
      render(<PanelMenu />);
      fireEvent.click(screen.getByTitle("Toggle panels"));
      for (const p of PANEL_REGISTRY) {
        expect(screen.getByText(p.label)).toBeInTheDocument();
      }
    });

    it("shows Show All and Hide All buttons", () => {
      render(<PanelMenu />);
      fireEvent.click(screen.getByTitle("Toggle panels"));
      expect(screen.getByText("Show All")).toBeInTheDocument();
      expect(screen.getByText("Hide All")).toBeInTheDocument();
    });

    it("removes panel from dock on click when docked", () => {
      render(<PanelMenu />);
      fireEvent.click(screen.getByTitle("Toggle panels"));
      // "browser" is docked by default
      const browserBtn = screen.getByText("Effects").closest("button")!;
      fireEvent.click(browserBtn);
      const docked = useAppStore.getState().dockedPanels;
      expect(docked.includes("browser")).toBe(false);
    });
  });

  // ── OnboardingModal ────────────────────────────────────────
  describe("OnboardingModal", () => {
    it("renders when not dismissed", () => {
      render(<OnboardingModal />);
      expect(screen.getByText("Welcome to MoshDither Studio")).toBeInTheDocument();
    });

    it("does not render when dismissed in localStorage", () => {
      localStorage.setItem("onboardingDismissed", "true");
      render(<OnboardingModal />);
      expect(screen.queryByText("Welcome to MoshDither Studio")).not.toBeInTheDocument();
    });

    it("dismisses on Get Started click", () => {
      render(<OnboardingModal />);
      fireEvent.click(screen.getByText("Get Started"));
      expect(localStorage.getItem("onboardingDismissed")).toBe("true");
    });

    it("dismisses on Skip click", () => {
      render(<OnboardingModal />);
      fireEvent.click(screen.getByText("Skip"));
      expect(localStorage.getItem("onboardingDismissed")).toBe("true");
    });

    it("lists feature highlights", () => {
      render(<OnboardingModal />);
      expect(screen.getByText("Import images or videos to start")).toBeInTheDocument();
      expect(screen.getByText("Export to PNG, JPG, GIF, or MP4")).toBeInTheDocument();
    });
  });

  // ── WindowControls ─────────────────────────────────────────
  describe("WindowControls", () => {
    it("renders all four control buttons", () => {
      render(<WindowControls />);
      expect(screen.getByTitle("Minimize")).toBeInTheDocument();
      expect(screen.getByTitle("Maximize")).toBeInTheDocument();
      expect(screen.getByTitle("Fullscreen")).toBeInTheDocument();
      expect(screen.getByTitle("Close")).toBeInTheDocument();
    });

    it("shows maximize icon initially", () => {
      render(<WindowControls />);
      expect(screen.getByTitle("Maximize").textContent).toContain("maximize");
    });

    it("renders without crashing even without Tauri internals", () => {
      // The component gracefully handles no __TAURI_INTERNALS__
      render(<WindowControls />);
      // Buttons should still be present
      expect(screen.getAllByRole("button").length).toBeGreaterThanOrEqual(4);
    });
  });

  // ── PlaybackOverlay ────────────────────────────────────────
  describe("PlaybackOverlay", () => {
    it("renders a canvas element", () => {
      render(<PlaybackOverlay />);
      const canvas = document.querySelector("canvas");
      expect(canvas).toBeInTheDocument();
    });

    it("renders with custom fps prop", () => {
      render(<PlaybackOverlay fps={60} />);
      const canvas = document.querySelector("canvas");
      expect(canvas).toBeInTheDocument();
    });
  });

  // ── PostProcessControls ────────────────────────────────────
  describe("PostProcessControls", () => {
    const defaultProps = {
      ppGrow: 0,
      setPpGrow: vi.fn(),
      ppShrink: 0,
      setPpShrink: vi.fn(),
      ppFeather: 0,
      setPpFeather: vi.fn(),
      ppFillHoles: false,
      setPpFillHoles: vi.fn(),
      isLoading: false,
      handlePostprocess: vi.fn(),
      showPostProcess: false,
      setShowPostProcess: vi.fn(),
    };

    it("renders toggle button", () => {
      render(<PostProcessControls {...defaultProps} />);
      expect(screen.getByText("Show Post-Process")).toBeInTheDocument();
    });

    it("shows post-process controls when toggled", () => {
      render(<PostProcessControls {...defaultProps} showPostProcess={true} />);
      expect(screen.getByText("Hide Post-Process")).toBeInTheDocument();
      expect(screen.getByLabelText("Grow mask by pixels")).toBeInTheDocument();
      expect(screen.getByLabelText("Shrink mask by pixels")).toBeInTheDocument();
      expect(screen.getByLabelText("Feather mask edge by pixels")).toBeInTheDocument();
    });

    it("apply button is disabled when all values are zero", () => {
      render(<PostProcessControls {...defaultProps} showPostProcess={true} />);
      const applyBtn = screen.getByText("Apply");
      expect(applyBtn).toBeDisabled();
    });

    it("apply button is enabled when grow > 0", () => {
      render(<PostProcessControls {...defaultProps} showPostProcess={true} ppGrow={5} />);
      const applyBtn = screen.getByText("Apply");
      expect(applyBtn).not.toBeDisabled();
    });

    it("calls handlePostprocess on Apply click", () => {
      const handler = vi.fn();
      render(
        <PostProcessControls
          {...defaultProps}
          showPostProcess={true}
          ppGrow={5}
          handlePostprocess={handler}
        />
      );
      fireEvent.click(screen.getByText("Apply"));
      expect(handler).toHaveBeenCalledTimes(1);
    });

    it("calls setPpGrow on slider change", () => {
      const setGrow = vi.fn();
      render(
        <PostProcessControls
          {...defaultProps}
          showPostProcess={true}
          setPpGrow={setGrow}
        />
      );
      fireEvent.change(screen.getByLabelText("Grow mask by pixels"), { target: { value: "10" } });
      expect(setGrow).toHaveBeenCalledWith(10);
    });

    it("shows Processing text when isLoading", () => {
      render(
        <PostProcessControls
          {...defaultProps}
          showPostProcess={true}
          ppGrow={5}
          isLoading={true}
        />
      );
      expect(screen.getByText("Processing...")).toBeInTheDocument();
    });
  });

  // ── TrackPanel ─────────────────────────────────────────────
  describe("TrackPanel", () => {
    it("renders with track count 0 initially", () => {
      render(<TrackPanel />);
      expect(screen.getByText("Tracks (0)")).toBeInTheDocument();
    });

    it("shows empty state message", () => {
      render(<TrackPanel />);
      expect(screen.getByText(/No tracks/)).toBeInTheDocument();
    });

    it("adds a track on Add button click", () => {
      render(<TrackPanel />);
      fireEvent.click(screen.getByText("+ Add"));
      expect(useAppStore.getState().tracks.length).toBe(1);
      expect(screen.getByText("Tracks (1)")).toBeInTheDocument();
    });

    it("removes a track on remove button click", () => {
      render(<TrackPanel />);
      fireEvent.click(screen.getByText("+ Add"));
      expect(useAppStore.getState().tracks.length).toBe(1);
      fireEvent.click(screen.getByText("✕"));
      expect(useAppStore.getState().tracks.length).toBe(0);
    });

    it("sets active track on click", () => {
      render(<TrackPanel />);
      fireEvent.click(screen.getByText("+ Add"));
      const track = useAppStore.getState().tracks[0];
      // Click on the track container (not a button/input)
      fireEvent.click(screen.getByDisplayValue(track.name));
      expect(useAppStore.getState().activeTrackId).toBe(track.id);
    });

    it("toggles track visibility via checkbox", () => {
      render(<TrackPanel />);
      fireEvent.click(screen.getByText("+ Add"));
      const checkbox = screen.getByRole("checkbox");
      expect(checkbox).toBeChecked();
      fireEvent.click(checkbox);
      expect(useAppStore.getState().tracks[0].visible).toBe(false);
    });

    it("renames track via text input", () => {
      render(<TrackPanel />);
      fireEvent.click(screen.getByText("+ Add"));
      const input = screen.getByDisplayValue(useAppStore.getState().tracks[0].name);
      fireEvent.change(input, { target: { value: "My Track" } });
      expect(useAppStore.getState().tracks[0].name).toBe("My Track");
    });
  });

  // ── MaskSelector ───────────────────────────────────────────
  describe("MaskSelector", () => {
    it("renders mask candidates count", () => {
      render(
        <MaskSelector masks={["m1", "m2"]} scores={[0.9, 0.8]} selectedIndex={0} onSelect={vi.fn()} />
      );
      expect(screen.getByText(/Mask Candidates \(2\)/)).toBeInTheDocument();
    });

    it("renders a button for each mask", () => {
      render(
        <MaskSelector masks={["m1", "m2", "m3"]} scores={[0.9, 0.8, 0.7]} selectedIndex={0} onSelect={vi.fn()} />
      );
      expect(screen.getByText("Mask #1")).toBeInTheDocument();
      expect(screen.getByText("Mask #2")).toBeInTheDocument();
      expect(screen.getByText("Mask #3")).toBeInTheDocument();
    });

    it("calls onSelect with index on click", () => {
      const onSelect = vi.fn();
      render(
        <MaskSelector masks={["m1", "m2"]} scores={[0.9, 0.8]} selectedIndex={0} onSelect={onSelect} />
      );
      // First button is the header toggle; second button is mask #1 (index 0)
      const buttons = screen.getAllByRole("button");
      fireEvent.click(buttons[1]);
      expect(onSelect).toHaveBeenCalledWith(0);
      // Third button is mask #2 (index 1)
      fireEvent.click(buttons[2]);
      expect(onSelect).toHaveBeenCalledWith(1);
    });

    it("renders empty state with 0 masks", () => {
      render(
        <MaskSelector masks={[]} scores={[]} selectedIndex={-1} onSelect={vi.fn()} />
      );
      expect(screen.getByText(/Mask Candidates \(0\)/)).toBeInTheDocument();
    });
  });

  // ── EffectStack ────────────────────────────────────────────
  describe("EffectStack", () => {
    it("shows empty state when no effects", () => {
      render(<EffectStack />);
      expect(screen.getByText("Empty stack")).toBeInTheDocument();
      expect(screen.getByText(/No effects in stack/)).toBeInTheDocument();
    });

    it("shows effect count when stack has items", () => {
      useAppStore.getState().addToStack(mockEffectMeta("dithering.bayer", "Bayer Dither", "dithering"));
      render(<EffectStack />);
      expect(screen.getByText(/1 effect in stack/)).toBeInTheDocument();
      expect(screen.getByText("Bayer Dither")).toBeInTheDocument();
    });

    it("removes effect on delete button click", () => {
      useAppStore.getState().addToStack(mockEffectMeta("dithering.bayer", "Bayer Dither", "dithering"));
      render(<EffectStack />);
      expect(screen.getByText("Bayer Dither")).toBeInTheDocument();
      fireEvent.click(screen.getByTitle("Remove"));
      expect(screen.queryByText("Bayer Dither")).not.toBeInTheDocument();
    });

    it("toggles effect visibility", () => {
      useAppStore.getState().addToStack(mockEffectMeta("dithering.bayer", "Bayer Dither", "dithering"));
      render(<EffectStack />);
      fireEvent.click(screen.getByTitle("Disable"));
      expect(useAppStore.getState().effectStack[0].enabled).toBe(false);
    });

    it("selects effect on click", () => {
      useAppStore.getState().addToStack(mockEffectMeta("dithering.bayer", "Bayer Dither", "dithering"));
      render(<EffectStack />);
      fireEvent.click(screen.getByText("Bayer Dither"));
      expect(useAppStore.getState().selectedStackId).not.toBeNull();
    });

    it("moves effect up", () => {
      useAppStore.getState().addToStack(mockEffectMeta("dithering.bayer", "Bayer Dither", "dithering"));
      useAppStore.getState().addToStack(mockEffectMeta("analog.vhs", "VHS Effect", "analog"));
      render(<EffectStack />);
      const moveUpBtn = screen.getByTitle("Move Up");
      fireEvent.click(moveUpBtn);
      const stack = useAppStore.getState().effectStack;
      expect(stack[0].effectName).toBe("VHS Effect");
      expect(stack[1].effectName).toBe("Bayer Dither");
    });

    it("moves the filtered entry itself, not whatever sits at its position in the filtered list", () => {
      // Reproduces the bug directly: the Move buttons are rendered from
      // filteredStack, but moveStackItem splices the full effectStack by
      // position. Filtering down to one entry that isn't at position 0 of
      // the real stack used to pass its FILTERED index (0) to moveStackItem,
      // reordering whichever two effects happened to sit at positions 0/1 of
      // the real stack -- not the effect the user filtered to and clicked.
      useAppStore.getState().addToStack(mockEffectMeta("dithering.bayer", "Bayer Dither", "dithering"));
      useAppStore.getState().addToStack(mockEffectMeta("analog.vhs", "VHS Effect", "analog"));
      useAppStore.getState().addToStack(mockEffectMeta("glitch.databend", "Databend", "glitch"));
      render(<EffectStack />);

      fireEvent.change(screen.getByPlaceholderText("Filter effects..."), {
        target: { value: "databend" },
      });
      expect(screen.getByText("Databend")).toBeInTheDocument();
      expect(screen.queryByText("Bayer Dither")).not.toBeInTheDocument();

      // Databend is real index 2 (last), filtered index 0 (only match).
      fireEvent.click(screen.getByTitle("Move Up"));

      const stack = useAppStore.getState().effectStack;
      expect(stack.map((e) => e.effectName)).toEqual([
        "Bayer Dither",
        "Databend",
        "VHS Effect",
      ]);
    });
  });

  // ── EffectBrowser ──────────────────────────────────────────
  describe("EffectBrowser", () => {
    it("renders header with title", () => {
      render(<EffectBrowser />);
      expect(screen.getByText("Effect Library")).toBeInTheDocument();
    });

    it("renders search bar", () => {
      render(<EffectBrowser />);
      expect(screen.getByPlaceholderText("Search effects...")).toBeInTheDocument();
    });
  });

  // ── SearchBar ──────────────────────────────────────────────
  describe("SearchBar", () => {
    it("updates store searchQuery on input", () => {
      render(<SearchBar />);
      const input = screen.getByPlaceholderText("Search effects...");
      fireEvent.change(input, { target: { value: "bayer" } });
      expect(useAppStore.getState().searchQuery).toBe("bayer");
    });

    it("shows clear button when query is non-empty", () => {
      useAppStore.getState().setSearchQuery("test");
      render(<SearchBar />);
      // Clear button exists
      const clearBtn = screen.getByRole("button");
      fireEvent.click(clearBtn);
      expect(useAppStore.getState().searchQuery).toBe("");
    });

    it("does not show clear button when query is empty", () => {
      render(<SearchBar />);
      expect(screen.queryByRole("button")).not.toBeInTheDocument();
    });
  });

  // ── CategoryTabs ───────────────────────────────────────────
  describe("CategoryTabs", () => {
    it("renders all category buttons", () => {
      render(<CategoryTabs />);
      expect(screen.getByText("Dither")).toBeInTheDocument();
      expect(screen.getByText("Analog")).toBeInTheDocument();
      expect(screen.getByText("Glitch")).toBeInTheDocument();
    });

    it("shows effect count per category", () => {
      useAppStore.getState().setAllEffects([
        mockEffectMeta("dithering.bayer", "Bayer", "dithering"),
        mockEffectMeta("dithering.floyd", "Floyd", "dithering"),
        mockEffectMeta("analog.vhs", "VHS", "analog"),
      ]);
      render(<CategoryTabs />);
      // Dither category should show count 2
      const ditherBtn = screen.getByText("Dither").closest("button")!;
      expect(within(ditherBtn).getByText("2")).toBeInTheDocument();
    });

    it("sets active category on click", () => {
      render(<CategoryTabs />);
      fireEvent.click(screen.getByText("Analog"));
      expect(useAppStore.getState().activeCategory).toBe("analog");
    });
  });

  // ── EffectList ─────────────────────────────────────────────
  describe("EffectList", () => {
    it("shows no effects found when empty", () => {
      render(<EffectList />);
      expect(screen.getByText("No effects found")).toBeInTheDocument();
    });

    it("shows effects for active category", () => {
      useAppStore.getState().setAllEffects([
        mockEffectMeta("dithering.bayer", "Bayer", "dithering"),
        mockEffectMeta("analog.vhs", "VHS", "analog"),
      ]);
      useAppStore.getState().setActiveCategory("dithering");
      render(<EffectList />);
      expect(screen.getByText("Bayer")).toBeInTheDocument();
      expect(screen.queryByText("VHS")).not.toBeInTheDocument();
    });

    it("filters by search query", () => {
      useAppStore.getState().setAllEffects([
        mockEffectMeta("dithering.bayer", "Bayer Dither", "dithering"),
        mockEffectMeta("dithering.floyd", "Floyd Steinberg", "dithering"),
      ]);
      useAppStore.getState().setSearchQuery("bayer");
      render(<EffectList />);
      expect(screen.getByText("Bayer Dither")).toBeInTheDocument();
      expect(screen.queryByText("Floyd Steinberg")).not.toBeInTheDocument();
    });

    it("adds effect to stack on click", () => {
      useAppStore.getState().setAllEffects([
        mockEffectMeta("dithering.bayer", "Bayer", "dithering"),
      ]);
      useAppStore.getState().setActiveCategory("dithering");
      render(<EffectList />);
      fireEvent.click(screen.getByText("Bayer"));
      expect(useAppStore.getState().effectStack.length).toBe(1);
    });

    it("shows in-stack indicator", () => {
      const meta = mockEffectMeta("dithering.bayer", "Bayer", "dithering");
      useAppStore.getState().setAllEffects([meta]);
      useAppStore.getState().setActiveCategory("dithering");
      useAppStore.getState().addToStack(meta);
      render(<EffectList />);
      expect(screen.getByText(/in stack/)).toBeInTheDocument();
    });
  });

  // ── CategoryAccordion ──────────────────────────────────────
  describe("CategoryAccordion", () => {
    it("renders all category headers", () => {
      render(<CategoryAccordion />);
      expect(screen.getByText("Dither")).toBeInTheDocument();
      expect(screen.getByText("Analog")).toBeInTheDocument();
    });

    it("expands category and shows effects on click", () => {
      useAppStore.getState().setAllEffects([
        mockEffectMeta("dithering.bayer", "Bayer", "dithering"),
      ]);
      // Start with a different active category so "Dither" begins collapsed
      useAppStore.getState().setActiveCategory("color");
      render(<CategoryAccordion />);
      // Click Dither to expand
      fireEvent.click(screen.getByText("Dither"));
      expect(screen.getByText("Bayer")).toBeInTheDocument();
    });

    it("shows no effects found in expanded empty category", () => {
      // Start with a different active category so "Dither" begins collapsed
      useAppStore.getState().setActiveCategory("color");
      render(<CategoryAccordion />);
      fireEvent.click(screen.getByText("Dither"));
      expect(screen.getAllByText("No effects found").length).toBeGreaterThan(0);
    });

    it("shows search results in flat list when searching", () => {
      useAppStore.getState().setAllEffects([
        mockEffectMeta("dithering.bayer", "Bayer Dither", "dithering"),
        mockEffectMeta("analog.vhs", "VHS Effect", "analog"),
      ]);
      useAppStore.getState().setSearchQuery("bayer");
      render(<CategoryAccordion />);
      expect(screen.getByText("Bayer Dither")).toBeInTheDocument();
      expect(screen.queryByText("VHS Effect")).not.toBeInTheDocument();
    });
  });

  // ── PresetPanel ────────────────────────────────────────────
  describe("PresetPanel", () => {
    it("renders preset name input", () => {
      render(<PresetPanel />);
      expect(screen.getByLabelText("Preset name")).toBeInTheDocument();
    });

    it("renders Save button", () => {
      render(<PresetPanel />);
      expect(screen.getByText("Save")).toBeInTheDocument();
    });

    it("renders Export and Import buttons", () => {
      render(<PresetPanel />);
      expect(screen.getByText("Export")).toBeInTheDocument();
      expect(screen.getByText("Import")).toBeInTheDocument();
    });
  });

  // ── VerificationPanel ──────────────────────────────────────
  describe("VerificationPanel", () => {
    it("renders Run Verification button", () => {
      render(<VerificationPanel />);
      expect(screen.getByText("Run Verification")).toBeInTheDocument();
    });

    it("shows Running text when clicked", async () => {
      render(<VerificationPanel />);
      fireEvent.click(screen.getByText("Run Verification"));
      // The button should show "Running..." while the async call is in flight
      expect(screen.getByText("Running...")).toBeInTheDocument();
      // Wait for the mocked async call to settle so state updates are flushed
      await waitFor(() =>
        expect(screen.queryByText("Running...")).not.toBeInTheDocument()
      );
    });

    it("shows pass rate after verification completes", async () => {
      render(<VerificationPanel />);
      fireEvent.click(screen.getByText("Run Verification"));
      // Wait for the mock to resolve
      expect(await screen.findByText(/1\/2 passed/)).toBeInTheDocument();
    });
  });

  // ── AudioPanel ─────────────────────────────────────────────
  describe("AudioPanel", () => {
    it("renders without crashing", () => {
      render(<AudioPanel />);
      // AudioPanel should have some content
      expect(document.body.textContent).not.toBe("");
    });

    it("renders file input for audio", () => {
      // The file input is only rendered when audio reactive is enabled
      useAppStore.getState().setAudioEnabled(true);
      render(<AudioPanel />);
      const fileInput = document.querySelector('input[type="file"]');
      expect(fileInput).toBeInTheDocument();
    });
  });

  // ── Panel Registry ─────────────────────────────────────────
  describe("Panel Registry", () => {
    it("exports a non-empty array", () => {
      expect(PANEL_REGISTRY.length).toBeGreaterThan(0);
    });

    it("each panel has required fields", () => {
      for (const p of PANEL_REGISTRY) {
        expect(p.id).toBeTruthy();
        expect(p.label).toBeTruthy();
        expect(p.icon).toBeTruthy();
        expect(p.defaultZone).toBeTruthy();
        expect(p.minWidth).toBeGreaterThan(0);
        expect(p.minHeight).toBeGreaterThan(0);
        expect(p.component).toBeDefined();
      }
    });

    it("getPanelMeta returns correct panel", () => {
      const meta = getPanelMeta("browser");
      expect(meta).toBeDefined();
      expect(meta?.id).toBe("browser");
      expect(meta?.label).toBe("Effects");
    });

    it("getPanelMeta returns undefined for unknown id", () => {
      expect(getPanelMeta("nonexistent")).toBeUndefined();
    });
  });
});
