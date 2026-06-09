import { autoUpdater } from "electron-updater";
import { BrowserWindow, ipcMain } from "electron";
import { writeRendererLog } from "./logger";

let updateWindow: BrowserWindow | null = null;

/**
 * Initialize auto-updater for MoshDither Studio.
 * Checks for updates on launch and notifies the renderer.
 */
export function initAutoUpdater(win: BrowserWindow): void {
  updateWindow = win;

  autoUpdater.on("checking-for-update", () => {
    sendToRenderer("update:checking");
  });

  autoUpdater.on("update-available", (info) => {
    writeRendererLog("info", "Update available", info);
    sendToRenderer("update:available", info);
  });

  autoUpdater.on("update-not-available", () => {
    sendToRenderer("update:not-available");
  });

  autoUpdater.on("download-progress", (progress) => {
    sendToRenderer("update:progress", progress);
  });

  autoUpdater.on("update-downloaded", (info) => {
    writeRendererLog("info", "Update downloaded — will install on quit", info);
    sendToRenderer("update:downloaded", info);
  });

  autoUpdater.on("error", (err) => {
    writeRendererLog("error", "Auto-updater error", { message: err.message });
    sendToRenderer("update:error", { message: err.message });
  });

  // Allow renderer to request an immediate check
  ipcMain.handle("update:check-now", async () => {
    try {
      const result = await autoUpdater.checkForUpdatesAndNotify();
      return result ?? null;
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      writeRendererLog("error", "Manual update check failed", { message });
      return null;
    }
  });

  // Allow renderer to install update immediately
  ipcMain.handle("update:install-now", () => {
    autoUpdater.quitAndInstall(false, true);
  });

  // Delay initial check so the window is fully loaded
  setTimeout(() => {
    autoUpdater
      .checkForUpdatesAndNotify()
      .catch((err) => {
        writeRendererLog("error", "Initial update check failed", {
          message: err instanceof Error ? err.message : String(err),
        });
      });
  }, 5000);
}

function sendToRenderer(channel: string, data?: unknown): void {
  if (updateWindow && !updateWindow.isDestroyed()) {
    updateWindow.webContents.send(channel, data);
  }
}
