import { vi } from "vitest";

/**
 * Typed IPC mock for renderer-process tests outside Electron.
 * Install before each test to prevent `window.ipcRenderer` undefined crashes.
 */
export function installMockIpc() {
  const mockIpc = {
    on: vi.fn(() => () => {}),
    off: vi.fn(),
    send: vi.fn(),
    invoke: vi.fn(),
  };

  (window as unknown as { ipcRenderer: typeof mockIpc }).ipcRenderer = mockIpc;
  return mockIpc;
}

/**
 * Remove the mock IPC from window after tests.
 */
export function uninstallMockIpc() {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  delete (window as any).ipcRenderer;
}
