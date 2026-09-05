import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { ErrorBoundary } from "../ErrorBoundary";
import { logger } from "../../utils/logger";

function Bomb(): never {
  throw new Error("boom");
}

describe("ErrorBoundary", () => {
  it("renders children normally when there is no error", () => {
    render(
      <ErrorBoundary>
        <div>fine</div>
      </ErrorBoundary>
    );
    expect(screen.getByText("fine")).toBeInTheDocument();
  });

  it("records a UI crash in the log, not just the console", () => {
    // A release build has no console, so console.error made a UI crash -- the
    // single most important thing to have a record of -- the one failure
    // guaranteed to leave none.
    const consoleSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    const logSpy = vi.spyOn(logger, "error").mockImplementation(() => {});
    render(
      <ErrorBoundary>
        <Bomb />
      </ErrorBoundary>
    );
    expect(logSpy).toHaveBeenCalledWith(
      "ErrorBoundary",
      "boom",
      expect.objectContaining({ stack: expect.any(String) })
    );
    logSpy.mockRestore();
    consoleSpy.mockRestore();
  });

  it("shows where the log file is when the backend can say", async () => {
    const consoleSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    (globalThis as Record<string, unknown>).__TAURI_INTERNALS__ = {
      invoke: (cmd: string) =>
        cmd === "get_log_path"
          ? Promise.resolve("C:/Users/x/.moshdither/logs/moshdither-1-2.log")
          : Promise.resolve(null),
    };
    render(
      <ErrorBoundary>
        <Bomb />
      </ErrorBoundary>
    );
    expect(await screen.findByText(/moshdither-1-2\.log/)).toBeInTheDocument();
    delete (globalThis as Record<string, unknown>).__TAURI_INTERNALS__;
    consoleSpy.mockRestore();
  });

  it("renders the default fallback when a child throws", () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    render(
      <ErrorBoundary>
        <Bomb />
      </ErrorBoundary>
    );
    expect(screen.getByText("Something went wrong")).toBeInTheDocument();
    spy.mockRestore();
  });

  it("invokes a function fallback with the caught error, and its reset re-renders the children", () => {
    // This is the capability per-panel error boundaries (DockLayout.tsx) rely
    // on: a scoped fallback that names which panel failed, plus a working
    // retry -- without this, wrapping ErrorBoundary around individual dock
    // panels would only be able to show the full-viewport default fallback.
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    let shouldThrow = true;
    function MaybeBomb() {
      if (shouldThrow) throw new Error("panel exploded");
      return <div>recovered</div>;
    }
    render(
      <ErrorBoundary
        fallback={(error, reset) => (
          <div>
            <p>custom fallback: {error.message}</p>
            <button
              onClick={() => {
                shouldThrow = false;
                reset();
              }}
            >
              retry
            </button>
          </div>
        )}
      >
        <MaybeBomb />
      </ErrorBoundary>
    );

    expect(screen.getByText("custom fallback: panel exploded")).toBeInTheDocument();
    fireEvent.click(screen.getByText("retry"));
    expect(screen.getByText("recovered")).toBeInTheDocument();

    spy.mockRestore();
  });
});
