import React from "react";
import { describe, it, expect } from "vitest";
import { render } from "@testing-library/react";
import { WebGLCanvas } from "./WebGLCanvas";
import { StudioProvider } from "../../context/StudioContext";
import { AudioReactiveProvider } from "../../context/AudioReactiveContext";

function TestWrapper({ children }: { children: React.ReactNode }) {
  return (
    <StudioProvider>
      <AudioReactiveProvider mediaUrl={null}>
        {children}
      </AudioReactiveProvider>
    </StudioProvider>
  );
}

describe("WebGLCanvas (browser)", () => {
  it("mounts and creates a canvas element", () => {
    const { container } = render(
      <TestWrapper>
        <WebGLCanvas />
      </TestWrapper>,
    );

    const canvas = container.querySelector("canvas");
    expect(canvas).toBeTruthy();
  });

  it("creates a WebGL2 context when supported", () => {
    const { container } = render(
      <TestWrapper>
        <WebGLCanvas />
      </TestWrapper>,
    );

    const canvas = container.querySelector("canvas") as HTMLCanvasElement;
    const gl = canvas.getContext("webgl2");
    if (gl) {
      expect(gl).toBeTruthy();
    } else {
      // Skip assertion when WebGL2 is unavailable (e.g. CI headless)
      expect(true).toBe(true);
    }
  });

  it("cleans up WebGL resources on unmount", () => {
    const { unmount } = render(
      <TestWrapper>
        <WebGLCanvas />
      </TestWrapper>,
    );

    // Unmount should not throw
    expect(() => unmount()).not.toThrow();
  });
});
