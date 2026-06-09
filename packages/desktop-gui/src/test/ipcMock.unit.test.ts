import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { installMockIpc, uninstallMockIpc } from "./ipcMock";

describe("installMockIpc", () => {
  beforeEach(() => {
    installMockIpc();
  });

  afterEach(() => {
    uninstallMockIpc();
  });

  it("creates a mock ipcRenderer on window", () => {
    expect(window.ipcRenderer).toBeDefined();
    expect(typeof window.ipcRenderer.invoke).toBe("function");
    expect(typeof window.ipcRenderer.send).toBe("function");
    expect(typeof window.ipcRenderer.on).toBe("function");
    expect(typeof window.ipcRenderer.off).toBe("function");
  });

  it("on() returns an unsubscribe function", () => {
    const unsub = window.ipcRenderer.on("test-channel", () => {});
    expect(typeof unsub).toBe("function");
  });

  it("uninstallMockIpc removes ipcRenderer from window", () => {
    uninstallMockIpc();
    expect("ipcRenderer" in window).toBe(false);
  });
});
