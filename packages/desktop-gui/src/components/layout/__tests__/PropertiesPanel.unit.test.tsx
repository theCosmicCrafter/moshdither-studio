/**
 * Component tests for PropertiesPanel — Auto-Keyframe from Beats section.
 *
 * Uses @testing-library/user-event for realistic user interactions.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { PropertiesPanel } from "../PropertiesPanel";
import * as StudioContextModule from "../../../context/StudioContext";
import { installMockIpc } from "../../../test/ipcMock";

// Mock useStudio to provide controlled context values
const mockSetActiveEffects = vi.fn();
const mockAddToast = vi.fn();

function createMockStudioContext(overrides: Partial<StudioContextModule.StudioContextType> = {}) {
  const defaultEffect = {
    id: "test-effect-1",
    name: "Dither",
    type: "dither" as const,
    enabled: true,
    opacity: 1,
    blendMode: "normal" as const,
    params: { intensity: 0.5, scale: 1.0 },
    keyframes: {},
  };

  return {
    activeEffects: [defaultEffect],
    setActiveEffects: mockSetActiveEffects,
    selectedEffectId: "test-effect-1",
    setSelectedEffectId: vi.fn(),
    mediaUrl: "media://test.mp4",
    currentTime: 0,
    duration: 10,
    isPaintingMask: false,
    setIsPaintingMask: vi.fn(),
    maskBrushSize: 10,
    setMaskBrushSize: vi.fn(),
    maskBrushEraser: false,
    setMaskBrushEraser: vi.fn(),
    outputDirectory: "",
    setOutputDirectory: vi.fn(),
    exportFormat: "mp4" as const,
    setExportFormat: vi.fn(),
    exportFps: 30,
    setExportFps: vi.fn(),
    isRendering: false,
    addRenderJob: vi.fn(),
    addToast: mockAddToast,
    watermarkSettings: { enabled: false, text: "", imagePath: null, position: "bottom-right" as const, scale: 10, opacity: 0.5 },
    setWatermarkSettings: vi.fn(),
    undo: vi.fn(),
    redo: vi.fn(),
    setRenderProgress: vi.fn(),
    setIsRendering: vi.fn(),
    setMediaUrl: vi.fn(),
    toasts: [],
    removeToast: vi.fn(),
    ...overrides,
  } as StudioContextModule.StudioContextType;
}

describe("PropertiesPanel — Auto-Keyframe from Beats", () => {
  let user: ReturnType<typeof userEvent.setup>;

  beforeEach(() => {
    const mockIpc = installMockIpc();
    // Default invoke returns resolved promise so .then() doesn't crash
    mockIpc.invoke.mockImplementation(() => Promise.resolve(null));
    vi.spyOn(StudioContextModule, "useStudio").mockReturnValue(
      createMockStudioContext(),
    );
    user = userEvent.setup();
    vi.clearAllMocks();
  });

  function renderPanel() {
    return render(<PropertiesPanel />);
  }

  it("renders Auto-Keyframe section when media is loaded", async () => {
    renderPanel();

    expect(await screen.findByText("Auto-Keyframe from Beats")).toBeTruthy();
  });

  it("hides Auto-Keyframe section when no media is loaded", async () => {
    vi.spyOn(StudioContextModule, "useStudio").mockReturnValue(
      createMockStudioContext({ mediaUrl: null }),
    );
    renderPanel();

    await waitFor(() => {
      expect(screen.queryByText("Auto-Keyframe from Beats")).toBeNull();
    });
  });

  it("expands configuration panel on 'Generate from Audio' click", async () => {
    renderPanel();

    await screen.findByText("Auto-Keyframe from Beats");
    await user.click(screen.getByText(/generate from audio/i));

    expect(screen.getByLabelText(/parameter to animate/i)).toBeTruthy();
    expect(screen.getByLabelText(/beat keyframe mode/i)).toBeTruthy();
  });

  it("shows all beat keyframe modes in dropdown", async () => {
    renderPanel();

    await screen.findByText("Auto-Keyframe from Beats");
    await user.click(screen.getByText(/generate from audio/i));

    const modeSelect = screen.getByLabelText(/beat keyframe mode/i) as HTMLSelectElement;
    await user.click(modeSelect);

    const options = Array.from(modeSelect.options).map((o) => o.textContent);
    expect(options).toContainEqual(expect.stringMatching(/pulse/i));
    expect(options).toContainEqual(expect.stringMatching(/toggle/i));
    expect(options).toContainEqual(expect.stringMatching(/ramp/i));
    expect(options).toContainEqual(expect.stringMatching(/decay/i));
  });
});
