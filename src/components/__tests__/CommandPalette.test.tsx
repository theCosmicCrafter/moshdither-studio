/**
 * Tests for CommandPalette: command search, keyboard navigation, command execution.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, cleanup } from "@testing-library/react";
import { useAppStore } from "../../store";

vi.mock("@tauri-apps/api/core", () => ({
  invoke: vi.fn(() => Promise.resolve({})),
  convertFileSrc: vi.fn((path: string) => path),
}));

vi.mock("@tauri-apps/plugin-dialog", () => ({
  open: vi.fn(() => Promise.resolve(null)),
  save: vi.fn(() => Promise.resolve(null)),
}));

import CommandPalette from "../CommandPalette";

function resetStore() {
  useAppStore.setState({
    currentTime: 0,
    isPlaying: true,
    audioPlaying: false,
    effectStack: [],
    pastStacks: [],
    futureStacks: [],
    selectedStackId: null,
    mediaLoaded: false,
    mediaInfo: null,
    previewDataUrl: null,
    originalDataUrl: null,
    filePath: null,
    inPoint: null,
    outPoint: null,
    scopesVisible: false,
    statusMessage: "Ready",
  });
}

describe("CommandPalette", () => {
  beforeEach(() => {
    resetStore();
    localStorage.clear();
  });

  afterEach(() => {
    cleanup();
  });

  it("does not render when closed", () => {
    render(<CommandPalette />);
    expect(screen.queryByPlaceholderText("Type a command...")).not.toBeInTheDocument();
  });

  it("opens on Ctrl+Shift+P", () => {
    render(<CommandPalette />);
    fireEvent.keyDown(window, { key: "p", ctrlKey: true, shiftKey: true });
    expect(screen.getByPlaceholderText("Type a command...")).toBeInTheDocument();
  });

  it("opens on Meta+Shift+P", () => {
    render(<CommandPalette />);
    fireEvent.keyDown(window, { key: "p", metaKey: true, shiftKey: true });
    expect(screen.getByPlaceholderText("Type a command...")).toBeInTheDocument();
  });

  it("closes on Escape key", () => {
    render(<CommandPalette />);
    // Open it first
    fireEvent.keyDown(window, { key: "p", ctrlKey: true, shiftKey: true });
    expect(screen.getByPlaceholderText("Type a command...")).toBeInTheDocument();
    // Close with Escape
    fireEvent.keyDown(window, { key: "Escape" });
    expect(screen.queryByPlaceholderText("Type a command...")).not.toBeInTheDocument();
  });

  it("closes on backdrop click", () => {
    render(<CommandPalette />);
    fireEvent.keyDown(window, { key: "p", ctrlKey: true, shiftKey: true });
    const input = screen.getByPlaceholderText("Type a command...");
    // Click on the backdrop (the outer div)
    fireEvent.click(input.parentElement!.parentElement!);
    expect(screen.queryByPlaceholderText("Type a command...")).not.toBeInTheDocument();
  });

  it("registers commands on mount and displays them", () => {
    render(<CommandPalette />);
    fireEvent.keyDown(window, { key: "p", ctrlKey: true, shiftKey: true });
    // Should show registered commands
    expect(screen.getByText("Go to start")).toBeInTheDocument();
    expect(screen.getByText("Play / pause")).toBeInTheDocument();
    expect(screen.getByText("Undo")).toBeInTheDocument();
    expect(screen.getByText("Redo")).toBeInTheDocument();
  });

  it("shows category labels for commands", () => {
    render(<CommandPalette />);
    fireEvent.keyDown(window, { key: "p", ctrlKey: true, shiftKey: true });
    // Commands have category labels (multiple commands share the same category)
    expect(screen.getAllByText("Timeline").length).toBeGreaterThan(0);
    expect(screen.getAllByText("Edit").length).toBeGreaterThan(0);
  });

  it("shows keyboard shortcuts when defined", () => {
    render(<CommandPalette />);
    fireEvent.keyDown(window, { key: "p", ctrlKey: true, shiftKey: true });
    expect(screen.getByText("Home")).toBeInTheDocument();
    expect(screen.getByText("End")).toBeInTheDocument();
    expect(screen.getByText("Space")).toBeInTheDocument();
  });

  it("shows navigation hints at bottom", () => {
    render(<CommandPalette />);
    fireEvent.keyDown(window, { key: "p", ctrlKey: true, shiftKey: true });
    expect(screen.getByText("↑↓ to navigate")).toBeInTheDocument();
    expect(screen.getByText("↵ to execute")).toBeInTheDocument();
    expect(screen.getByText("esc to close")).toBeInTheDocument();
  });

  // ── Search filtering ───────────────────────────────────────
  describe("Search filtering", () => {
    it("filters commands by query", () => {
      render(<CommandPalette />);
      fireEvent.keyDown(window, { key: "p", ctrlKey: true, shiftKey: true });
      const input = screen.getByPlaceholderText("Type a command...");
      fireEvent.change(input, { target: { value: "undo" } });
      expect(screen.getByText("Undo")).toBeInTheDocument();
      expect(screen.queryByText("Go to start")).not.toBeInTheDocument();
    });

    it("shows no commands found for non-matching query", () => {
      render(<CommandPalette />);
      fireEvent.keyDown(window, { key: "p", ctrlKey: true, shiftKey: true });
      const input = screen.getByPlaceholderText("Type a command...");
      fireEvent.change(input, { target: { value: "zzzzz" } });
      expect(screen.getByText("No commands found")).toBeInTheDocument();
    });

    it("clears filter when query is cleared", () => {
      render(<CommandPalette />);
      fireEvent.keyDown(window, { key: "p", ctrlKey: true, shiftKey: true });
      const input = screen.getByPlaceholderText("Type a command...");
      fireEvent.change(input, { target: { value: "undo" } });
      expect(screen.queryByText("Go to start")).not.toBeInTheDocument();
      fireEvent.change(input, { target: { value: "" } });
      expect(screen.getByText("Go to start")).toBeInTheDocument();
    });

    it("fuzzy match works for partial queries", () => {
      render(<CommandPalette />);
      fireEvent.keyDown(window, { key: "p", ctrlKey: true, shiftKey: true });
      const input = screen.getByPlaceholderText("Type a command...");
      // "clr" should match "Clear effect stack" or "Clear in/out points"
      fireEvent.change(input, { target: { value: "clr" } });
      // Should find at least one clear-related command
      const commands = screen.getAllByRole("option");
      // Filter out the ones that are just navigation
      const commandButtons = commands.filter((b) => b.textContent && !b.textContent.includes("navigate"));
      expect(commandButtons.length).toBeGreaterThan(0);
    });
  });

  // ── Keyboard navigation ────────────────────────────────────
  describe("Keyboard navigation", () => {
    it("ArrowDown moves selection down", () => {
      render(<CommandPalette />);
      fireEvent.keyDown(window, { key: "p", ctrlKey: true, shiftKey: true });
      const input = screen.getByPlaceholderText("Type a command...");
      fireEvent.keyDown(input, { key: "ArrowDown" });
      // selectedIndex should be 1 — we can verify by checking the highlighted button
      // The selected button has a specific background style
      const buttons = screen.getAllByRole("option").filter(
        (b) => b.textContent && !b.textContent.includes("navigate") && !b.textContent.includes("No commands")
      );
      // The second button should be highlighted (selectedIndex = 1)
      expect(buttons[1].style.background).toContain("rgba(255, 255, 255, 0.06)");
    });

    it("ArrowUp moves selection up", () => {
      render(<CommandPalette />);
      fireEvent.keyDown(window, { key: "p", ctrlKey: true, shiftKey: true });
      const input = screen.getByPlaceholderText("Type a command...");
      // Move down twice
      fireEvent.keyDown(input, { key: "ArrowDown" });
      fireEvent.keyDown(input, { key: "ArrowDown" });
      // Move up once
      fireEvent.keyDown(input, { key: "ArrowUp" });
      const buttons = screen.getAllByRole("option").filter(
        (b) => b.textContent && !b.textContent.includes("navigate") && !b.textContent.includes("No commands")
      );
      // selectedIndex should be 1
      expect(buttons[1].style.background).toContain("rgba(255, 255, 255, 0.06)");
    });

    it("ArrowDown does not go beyond last command", () => {
      render(<CommandPalette />);
      fireEvent.keyDown(window, { key: "p", ctrlKey: true, shiftKey: true });
      const input = screen.getByPlaceholderText("Type a command...");
      const buttons = screen.getAllByRole("option").filter(
        (b) => b.textContent && !b.textContent.includes("navigate") && !b.textContent.includes("No commands")
      );
      const count = buttons.length;
      // Press ArrowDown many times
      for (let i = 0; i < count + 5; i++) {
        fireEvent.keyDown(input, { key: "ArrowDown" });
      }
      // Last button should be highlighted
      expect(buttons[count - 1].style.background).toContain("rgba(255, 255, 255, 0.06)");
    });

    it("ArrowUp does not go before first command", () => {
      render(<CommandPalette />);
      fireEvent.keyDown(window, { key: "p", ctrlKey: true, shiftKey: true });
      const input = screen.getByPlaceholderText("Type a command...");
      // Try to go up from index 0
      fireEvent.keyDown(input, { key: "ArrowUp" });
      const buttons = screen.getAllByRole("option").filter(
        (b) => b.textContent && !b.textContent.includes("navigate") && !b.textContent.includes("No commands")
      );
      // First button should still be highlighted (index 0)
      expect(buttons[0].style.background).toContain("rgba(255, 255, 255, 0.06)");
    });

    it("Enter executes selected command and closes palette", () => {
      render(<CommandPalette />);
      fireEvent.keyDown(window, { key: "p", ctrlKey: true, shiftKey: true });
      const input = screen.getByPlaceholderText("Type a command...");
      // First command is "Go to start" — execute it
      fireEvent.keyDown(input, { key: "Enter" });
      // Palette should be closed
      expect(screen.queryByPlaceholderText("Type a command...")).not.toBeInTheDocument();
      // Command should have been executed (currentTime set to 0)
      expect(useAppStore.getState().currentTime).toBe(0);
    });

    it("mouse enter updates selected index", () => {
      render(<CommandPalette />);
      fireEvent.keyDown(window, { key: "p", ctrlKey: true, shiftKey: true });
      const buttons = screen.getAllByRole("option").filter(
        (b) => b.textContent && !b.textContent.includes("navigate") && !b.textContent.includes("No commands")
      );
      // Hover over the third button
      fireEvent.mouseEnter(buttons[2]);
      expect(buttons[2].style.background).toContain("rgba(255, 255, 255, 0.06)");
    });

    it("click on command executes it and closes palette", () => {
      render(<CommandPalette />);
      fireEvent.keyDown(window, { key: "p", ctrlKey: true, shiftKey: true });
      // Click on "Play / pause"
      const playPauseBtn = screen.getByText("Play / pause").closest("button")!;
      fireEvent.click(playPauseBtn);
      // Palette should be closed
      expect(screen.queryByPlaceholderText("Type a command...")).not.toBeInTheDocument();
    });
  });

  // ── Command execution ──────────────────────────────────────
  describe("Command execution", () => {
    it("Go to start sets currentTime to 0", () => {
      useAppStore.getState().setCurrentTime(5);
      render(<CommandPalette />);
      fireEvent.keyDown(window, { key: "p", ctrlKey: true, shiftKey: true });
      fireEvent.click(screen.getByText("Go to start").closest("button")!);
      expect(useAppStore.getState().currentTime).toBe(0);
    });

    it("Go to end sets currentTime to 300", () => {
      render(<CommandPalette />);
      fireEvent.keyDown(window, { key: "p", ctrlKey: true, shiftKey: true });
      fireEvent.click(screen.getByText("Go to end").closest("button")!);
      expect(useAppStore.getState().currentTime).toBe(300);
    });

    it("Clear effect stack clears the stack", () => {
      useAppStore.setState({
        effectStack: [
          { id: "s1", effectId: "test", effectName: "Test", params: {}, enabled: true, maskId: null, maskMode: "inside" },
        ],
      });
      render(<CommandPalette />);
      fireEvent.keyDown(window, { key: "p", ctrlKey: true, shiftKey: true });
      fireEvent.click(screen.getByText("Clear effect stack").closest("button")!);
      expect(useAppStore.getState().effectStack.length).toBe(0);
    });

    it("Set in point sets inPoint", () => {
      render(<CommandPalette />);
      fireEvent.keyDown(window, { key: "p", ctrlKey: true, shiftKey: true });
      fireEvent.click(screen.getByText("Set in point").closest("button")!);
      expect(useAppStore.getState().inPoint).toBe(0);
    });

    it("Set out point sets outPoint", () => {
      render(<CommandPalette />);
      fireEvent.keyDown(window, { key: "p", ctrlKey: true, shiftKey: true });
      fireEvent.click(screen.getByText("Set out point").closest("button")!);
      // setOutPoint clamps to a maximum of 99
      expect(useAppStore.getState().outPoint).toBe(99);
    });

    it("Clear in/out points clears both", () => {
      useAppStore.getState().setInPoint(2);
      useAppStore.getState().setOutPoint(8);
      render(<CommandPalette />);
      fireEvent.keyDown(window, { key: "p", ctrlKey: true, shiftKey: true });
      fireEvent.click(screen.getByText("Clear in/out points").closest("button")!);
      expect(useAppStore.getState().inPoint).toBeNull();
      expect(useAppStore.getState().outPoint).toBeNull();
    });

    it("Toggle scopes toggles scopesVisible", () => {
      render(<CommandPalette />);
      fireEvent.keyDown(window, { key: "p", ctrlKey: true, shiftKey: true });
      fireEvent.click(screen.getByText("Toggle scopes").closest("button")!);
      expect(useAppStore.getState().scopesVisible).toBe(true);
    });

    it("Close media resets media state", () => {
      useAppStore.getState().setMediaLoaded(true);
      useAppStore.getState().setFilePath("/test/file.mp4");
      useAppStore.getState().setMediaInfo({ width: 100, height: 100 });
      render(<CommandPalette />);
      fireEvent.keyDown(window, { key: "p", ctrlKey: true, shiftKey: true });
      fireEvent.click(screen.getByText("Close media").closest("button")!);
      expect(useAppStore.getState().mediaLoaded).toBe(false);
      expect(useAppStore.getState().filePath).toBeNull();
      expect(useAppStore.getState().mediaInfo).toBeNull();
    });
  });
});
