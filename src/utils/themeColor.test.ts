import { describe, it, expect, afterEach } from "vitest";
import { getThemeColor } from "./themeColor";

describe("getThemeColor", () => {
  afterEach(() => {
    document.documentElement.style.removeProperty("--test-token");
  });

  it("returns the resolved value of a defined CSS custom property", () => {
    document.documentElement.style.setProperty("--test-token", "#123456");
    expect(getThemeColor("--test-token", "#000000")).toBe("#123456");
  });

  it("returns the fallback when the custom property is not defined", () => {
    expect(getThemeColor("--does-not-exist", "#abcdef")).toBe("#abcdef");
  });

  it("returns the fallback when the custom property is defined but blank", () => {
    document.documentElement.style.setProperty("--test-token", "");
    expect(getThemeColor("--test-token", "#fallback")).toBe("#fallback");
  });
});
