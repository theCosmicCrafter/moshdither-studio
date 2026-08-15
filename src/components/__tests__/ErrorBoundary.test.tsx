import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { ErrorBoundary } from "../ErrorBoundary";

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
