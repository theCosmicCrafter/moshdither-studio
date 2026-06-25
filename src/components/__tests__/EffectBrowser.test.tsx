/**
 * Tests for EffectBrowser: search filtering, category switching, effect selection.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, cleanup, within } from "@testing-library/react";
import { useAppStore, type EffectMeta } from "../../store";

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
import CategoryTabs from "../EffectBrowser/CategoryTabs";
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

function resetStore() {
  useAppStore.setState({
    allEffects: [],
    activeCategory: "dithering",
    searchQuery: "",
    effectStack: [],
    pastStacks: [],
    futureStacks: [],
    selectedStackId: null,
  });
}

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

  it("changes active category on tab click", () => {
    render(<CategoryTabs />);
    fireEvent.click(screen.getByText("Glitch"));
    expect(useAppStore.getState().activeCategory).toBe("glitch");
  });

  it("shows effect count badge per category", () => {
    useAppStore.getState().setAllEffects([
      mockEffectMeta("dithering.bayer", "Bayer", "dithering"),
      mockEffectMeta("dithering.floyd", "Floyd", "dithering"),
      mockEffectMeta("dithering.atkinson", "Atkinson", "dithering"),
    ]);
    render(<CategoryTabs />);
    const ditherBtn = screen.getByText("Dither").closest("button")!;
    expect(within(ditherBtn).getByText("3")).toBeInTheDocument();
  });

  it("does not show count badge for empty categories", () => {
    useAppStore.getState().setAllEffects([
      mockEffectMeta("dithering.bayer", "Bayer", "dithering"),
    ]);
    render(<CategoryTabs />);
    const analogBtn = screen.getByText("Analog").closest("button")!;
    expect(within(analogBtn).queryByText("0")).not.toBeInTheDocument();
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
    useAppStore.getState().setActiveCategory("analog");
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
