import { renderHook, act } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const loadMediaFromPath = vi.fn();
const loadMediaFromBase64 = vi.fn();
vi.mock("../../lib/tauri", () => ({
  loadMediaFromPath: (...a: unknown[]) => loadMediaFromPath(...a),
  loadMediaFromBase64: (...a: unknown[]) => loadMediaFromBase64(...a),
}));

import { useProjectSession } from "../useProjectSession";
import { useAppStore } from "../../store";

function session(overrides = {}) {
  return {
    filePath: "C:/media/clip.png",
    effectStack: [],
    currentTime: 0,
    keyframes: {},
    audioFilePath: null,
    audioBindings: {},
    savedAt: new Date(0).toISOString(),
    ...overrides,
  };
}

describe("restoreSession media reporting", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    loadMediaFromPath.mockResolvedValue(undefined);
    loadMediaFromBase64.mockResolvedValue(undefined);
  });

  it("does not claim the media was restored when the refresh reports it was not", async () => {
    // refreshPreview returning false means the backend still reports no media,
    // so originalDataUrl was never set. PreviewViewport requires that value
    // before it renders the WebGL preview, so reporting success here left the
    // status bar saying "Session restored (N effects)" over a black canvas.
    const { result } = renderHook(() => useProjectSession());
    await act(async () => {
      await result.current.restoreSession(session(), async () => false);
    });
    const status = useAppStore.getState().statusMessage;
    expect(status).not.toMatch(/Session restored \(/);
    expect(status).toMatch(/could not be reloaded/i);
  });

  it("reports success with the effect count when the refresh confirms media", async () => {
    const { result } = renderHook(() => useProjectSession());
    await act(async () => {
      await result.current.restoreSession(session(), async () => true);
    });
    expect(useAppStore.getState().statusMessage).toMatch(/Session restored \(0 effects\)/);
  });

  it("still restores when no refresh callback is supplied", async () => {
    const { result } = renderHook(() => useProjectSession());
    await act(async () => {
      await result.current.restoreSession(session());
    });
    expect(useAppStore.getState().statusMessage).toMatch(/Session restored/);
  });
});
