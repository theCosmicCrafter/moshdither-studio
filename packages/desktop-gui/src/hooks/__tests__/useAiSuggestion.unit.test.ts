import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { useAiSuggestion } from "../useAiSuggestion";

describe("useAiSuggestion", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("parses Ollama JSON response", async () => {
    const mockResponse = {
      effects: [
        {
          type: "datamosh",
          params: { mode: "classic" },
          reason: "fits glitch request",
        },
      ],
      explanation: "Try datamosh",
    };

    vi.stubGlobal("fetch", () =>
      Promise.resolve({
        ok: true,
        json: () => Promise.resolve({ response: JSON.stringify(mockResponse) }),
      }),
    );

    const { result } = renderHook(() => useAiSuggestion());
    await act(async () => {
      await result.current.suggest("glitch effect");
    });

    expect(result.current.loading).toBe(false);
    expect(result.current.result).toEqual(mockResponse);
    expect(result.current.error).toBeNull();
  });

  it("sets error on failed fetch", async () => {
    vi.stubGlobal("fetch", () => Promise.resolve({ ok: false, status: 500 }));

    const { result } = renderHook(() => useAiSuggestion());
    await act(async () => {
      await result.current.suggest("glitch effect");
    });

    expect(result.current.loading).toBe(false);
    expect(result.current.error).toContain("500");
  });
});
