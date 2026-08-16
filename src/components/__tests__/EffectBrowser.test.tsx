/**
 * Tests for EffectBrowser: search filtering, category switching, effect selection.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, cleanup, act } from "@testing-library/react";
import { useAppStore, type EffectMeta } from "../../store";
import { VIDEO_ONLY_ON_IMAGE_WARNING } from "../../utils/effectConverter";

vi.mock("@tauri-apps/api/core", () => ({
  invoke: vi.fn(() => Promise.resolve({})),
  convertFileSrc: vi.fn((path: string) => path),
}));

vi.mock("@tauri-apps/plugin-dialog", () => ({
  open: vi.fn(() => Promise.resolve(null)),
  save: vi.fn(() => Promise.resolve(null)),
}));

vi.mock("../../lib/browserFallback", () => ({
  getFallbackEffects: vi.fn(() => []),
  isTauriAvailable: vi.fn(() => false),
}));

import EffectBrowser from "../EffectBrowser";
import SearchBar from "../EffectBrowser/SearchBar";
import EffectList from "../EffectBrowser/EffectList";
import CategoryAccordion from "../EffectBrowser/CategoryAccordion";

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

function mockVideoOnlyEffectMeta(id: string, name: string, category: string): EffectMeta {
  return { ...mockEffectMeta(id, name, category), media_type: "video" };
}

function resetStore() {
  useAppStore.setState({
    allEffects: [],
    activeCategory: "dithering",
    searchQuery: "",
    effectStack: [],
    pastStacks: [],
    futureStacks: [],
    selectedStackId: null,
    mediaLoaded: false,
    isVideo: false,
  });
}

const VIDEO_ONLY_TITLE = VIDEO_ONLY_ON_IMAGE_WARNING;

describe("EffectBrowser — Search Filtering", () => {
  beforeEach(() => {
    resetStore();
    localStorage.clear();
  });

  afterEach(() => {
    cleanup();
  });

  it("filters effects by name in EffectList", () => {
    useAppStore.getState().setAllEffects([
      mockEffectMeta("dithering.bayer", "Bayer Dither", "dithering"),
      mockEffectMeta("dithering.floyd", "Floyd Steinberg", "dithering"),
      mockEffectMeta("analog.vhs", "VHS Effect", "analog"),
    ]);
    useAppStore.getState().setSearchQuery("bayer");
    render(<EffectList />);
    expect(screen.getByText("Bayer Dither")).toBeInTheDocument();
    expect(screen.queryByText("Floyd Steinberg")).not.toBeInTheDocument();
    expect(screen.queryByText("VHS Effect")).not.toBeInTheDocument();
  });

  it("filters effects by category name in EffectList", () => {
    useAppStore.getState().setAllEffects([
      mockEffectMeta("dithering.bayer", "Bayer", "dithering"),
      mockEffectMeta("analog.vhs", "VHS", "analog"),
    ]);
    useAppStore.getState().setSearchQuery("analog");
    render(<EffectList />);
    expect(screen.getByText("VHS")).toBeInTheDocument();
    expect(screen.queryByText("Bayer")).not.toBeInTheDocument();
  });

  it("shows no effects found for non-matching query", () => {
    useAppStore.getState().setAllEffects([
      mockEffectMeta("dithering.bayer", "Bayer", "dithering"),
    ]);
    useAppStore.getState().setSearchQuery("zzzzz");
    render(<EffectList />);
    expect(screen.getByText("No effects found")).toBeInTheDocument();
  });

  it("clears search query via clear button in SearchBar", () => {
    useAppStore.getState().setSearchQuery("test query");
    render(<SearchBar />);
    expect(screen.getByPlaceholderText("Search effects...")).toHaveValue("test query");
    fireEvent.click(screen.getByRole("button"));
    expect(useAppStore.getState().searchQuery).toBe("");
  });

  it("search overrides category filter in EffectList", () => {
    useAppStore.getState().setAllEffects([
      mockEffectMeta("dithering.bayer", "Bayer", "dithering"),
      mockEffectMeta("analog.vhs", "VHS", "analog"),
    ]);
    useAppStore.getState().setActiveCategory("dithering");
    useAppStore.getState().setSearchQuery("vhs");
    render(<EffectList />);
    // Even though activeCategory is dithering, search should show VHS
    expect(screen.getByText("VHS")).toBeInTheDocument();
    expect(screen.queryByText("Bayer")).not.toBeInTheDocument();
  });

  it("CategoryAccordion shows flat search results across categories", () => {
    useAppStore.getState().setAllEffects([
      mockEffectMeta("dithering.bayer", "Bayer", "dithering"),
      mockEffectMeta("analog.vhs", "VHS", "analog"),
      mockEffectMeta("glitch.pixel_sort", "Pixel Sort", "glitch"),
    ]);
    useAppStore.getState().setSearchQuery("a"); // matches Bayer, VHS, Pixel Sort? no, only names containing 'a'
    render(<CategoryAccordion />);
    // "Bayer" contains 'a', "VHS" doesn't, "Pixel Sort" doesn't
    // But category "analog" contains 'a' so VHS should show too
    expect(screen.getByText("Bayer")).toBeInTheDocument();
    expect(screen.getByText("VHS")).toBeInTheDocument();
  });
});

describe("EffectBrowser — Category Switching", () => {
  beforeEach(() => {
    resetStore();
    localStorage.clear();
  });

  afterEach(() => {
    cleanup();
  });

  it("shows effects for active category in EffectList", () => {
    useAppStore.getState().setAllEffects([
      mockEffectMeta("dithering.bayer", "Bayer", "dithering"),
      mockEffectMeta("analog.vhs", "VHS", "analog"),
      mockEffectMeta("glitch.pixel_sort", "Pixel Sort", "glitch"),
    ]);
    useAppStore.getState().setActiveCategory("analog");
    render(<EffectList />);
    expect(screen.getByText("VHS")).toBeInTheDocument();
    expect(screen.queryByText("Bayer")).not.toBeInTheDocument();
    expect(screen.queryByText("Pixel Sort")).not.toBeInTheDocument();
  });

  it("CategoryAccordion expands and collapses categories", () => {
    useAppStore.getState().setAllEffects([
      mockEffectMeta("dithering.bayer", "Bayer", "dithering"),
    ]);
    // Start with a different active category so "Dither" begins collapsed
    useAppStore.getState().setActiveCategory("color");
    render(<CategoryAccordion />);
    // Initially collapsed — no effect visible
    expect(screen.queryByText("Bayer")).not.toBeInTheDocument();
    // Expand
    fireEvent.click(screen.getByText("Dither"));
    expect(screen.getByText("Bayer")).toBeInTheDocument();
    // Collapse
    fireEvent.click(screen.getByText("Dither"));
    expect(screen.queryByText("Bayer")).not.toBeInTheDocument();
  });

  it("CategoryAccordion sets activeCategory on expand", () => {
    render(<CategoryAccordion />);
    fireEvent.click(screen.getByText("Noise"));
    expect(useAppStore.getState().activeCategory).toBe("noise");
  });
});

describe("EffectBrowser — Effect Selection", () => {
  beforeEach(() => {
    resetStore();
    localStorage.clear();
  });

  afterEach(() => {
    cleanup();
  });

  it("adds effect to stack on click in EffectList", () => {
    const meta = mockEffectMeta("dithering.bayer", "Bayer", "dithering");
    useAppStore.getState().setAllEffects([meta]);
    useAppStore.getState().setActiveCategory("dithering");
    render(<EffectList />);
    fireEvent.click(screen.getByText("Bayer"));
    expect(useAppStore.getState().effectStack.length).toBe(1);
    expect(useAppStore.getState().effectStack[0].effectId).toBe("dithering.bayer");
  });

  it("adds effect to stack on click in CategoryAccordion", () => {
    const meta = mockEffectMeta("dithering.bayer", "Bayer", "dithering");
    useAppStore.getState().setAllEffects([meta]);
    // Start with a different active category so "Dither" begins collapsed
    useAppStore.getState().setActiveCategory("color");
    render(<CategoryAccordion />);
    fireEvent.click(screen.getByText("Dither"));
    fireEvent.click(screen.getByText("Bayer"));
    expect(useAppStore.getState().effectStack.length).toBe(1);
  });

  it("shows in-stack indicator after adding", () => {
    const meta = mockEffectMeta("dithering.bayer", "Bayer", "dithering");
    useAppStore.getState().setAllEffects([meta]);
    useAppStore.getState().setActiveCategory("dithering");
    useAppStore.getState().addToStack(meta);
    render(<EffectList />);
    expect(screen.getByText(/in stack/)).toBeInTheDocument();
  });

  it("can add multiple different effects", () => {
    useAppStore.getState().setAllEffects([
      mockEffectMeta("dithering.bayer", "Bayer", "dithering"),
      mockEffectMeta("analog.vhs", "VHS", "analog"),
    ]);
    useAppStore.getState().setActiveCategory("dithering");
    render(<EffectList />);
    fireEvent.click(screen.getByText("Bayer"));
    // Mutating the store while a component is mounted must be wrapped in act
    act(() => {
      useAppStore.getState().setActiveCategory("analog");
    });
    // Need to re-render to pick up new state
    cleanup();
    render(<EffectList />);
    fireEvent.click(screen.getByText("VHS"));
    expect(useAppStore.getState().effectStack.length).toBe(2);
  });

  it("sets selectedStackId when adding to stack", () => {
    const meta = mockEffectMeta("dithering.bayer", "Bayer", "dithering");
    useAppStore.getState().setAllEffects([meta]);
    useAppStore.getState().setActiveCategory("dithering");
    render(<EffectList />);
    fireEvent.click(screen.getByText("Bayer"));
    expect(useAppStore.getState().selectedStackId).not.toBeNull();
  });

  it("full EffectBrowser renders and allows adding effects", () => {
    useAppStore.getState().setAllEffects([
      mockEffectMeta("dithering.bayer", "Bayer", "dithering"),
    ]);
    // Start with a different active category so "Dither" begins collapsed
    useAppStore.getState().setActiveCategory("color");
    render(<EffectBrowser />);
    // Expand the Dither category
    fireEvent.click(screen.getByText("Dither"));
    fireEvent.click(screen.getByText("Bayer"));
    expect(useAppStore.getState().effectStack.length).toBe(1);
  });
});

describe("EffectBrowser — Media Type Compatibility Indicator", () => {
  beforeEach(() => {
    resetStore();
    localStorage.clear();
  });

  afterEach(() => {
    cleanup();
  });

  it("marks a video-only effect as incompatible in EffectList when a still image is loaded", () => {
    useAppStore.getState().setAllEffects([
      mockVideoOnlyEffectMeta("datamoshing.bloom", "Bloom", "datamoshing"),
    ]);
    useAppStore.getState().setActiveCategory("datamoshing");
    useAppStore.getState().setMediaLoaded(true);
    useAppStore.getState().setIsVideo(false);
    render(<EffectList />);
    expect(screen.getAllByTitle(VIDEO_ONLY_TITLE).length).toBeGreaterThan(0);
  });

  it("does not mark anything incompatible when no media is loaded", () => {
    useAppStore.getState().setAllEffects([
      mockVideoOnlyEffectMeta("datamoshing.bloom", "Bloom", "datamoshing"),
    ]);
    useAppStore.getState().setActiveCategory("datamoshing");
    // mediaLoaded defaults to false via resetStore
    render(<EffectList />);
    expect(screen.queryByTitle(VIDEO_ONLY_TITLE)).not.toBeInTheDocument();
  });

  it("does not mark anything incompatible when a video is loaded", () => {
    useAppStore.getState().setAllEffects([
      mockVideoOnlyEffectMeta("datamoshing.bloom", "Bloom", "datamoshing"),
    ]);
    useAppStore.getState().setActiveCategory("datamoshing");
    useAppStore.getState().setMediaLoaded(true);
    useAppStore.getState().setIsVideo(true);
    render(<EffectList />);
    expect(screen.queryByTitle(VIDEO_ONLY_TITLE)).not.toBeInTheDocument();
  });

  it("does not mark effects that support images as incompatible", () => {
    useAppStore.getState().setAllEffects([
      mockEffectMeta("dithering.bayer", "Bayer", "dithering"), // media_type: "both"
    ]);
    useAppStore.getState().setActiveCategory("dithering");
    useAppStore.getState().setMediaLoaded(true);
    useAppStore.getState().setIsVideo(false);
    render(<EffectList />);
    expect(screen.queryByTitle(VIDEO_ONLY_TITLE)).not.toBeInTheDocument();
  });

  it("still allows adding a video-only effect to the stack while a still image is loaded (visual hint only, not a hard block)", () => {
    useAppStore.getState().setAllEffects([
      mockVideoOnlyEffectMeta("datamoshing.bloom", "Bloom", "datamoshing"),
    ]);
    useAppStore.getState().setActiveCategory("datamoshing");
    useAppStore.getState().setMediaLoaded(true);
    useAppStore.getState().setIsVideo(false);
    render(<EffectList />);
    fireEvent.click(screen.getByText("Bloom"));
    expect(useAppStore.getState().effectStack.length).toBe(1);
    expect(useAppStore.getState().effectStack[0].effectId).toBe("datamoshing.bloom");
  });

  it("marks a video-only effect as incompatible in CategoryAccordion when a still image is loaded", () => {
    useAppStore.getState().setAllEffects([
      mockVideoOnlyEffectMeta("datamoshing.bloom", "Bloom", "datamoshing"),
    ]);
    useAppStore.getState().setActiveCategory("color");
    useAppStore.getState().setMediaLoaded(true);
    useAppStore.getState().setIsVideo(false);
    render(<CategoryAccordion />);
    fireEvent.click(screen.getByText("Mosh"));
    expect(screen.getAllByTitle(VIDEO_ONLY_TITLE).length).toBeGreaterThan(0);
  });
});
