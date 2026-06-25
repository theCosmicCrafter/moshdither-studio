import { useCallback, useEffect, useState } from "react";
import { getCurrentWindow } from "@tauri-apps/api/window";

/**
 * WindowControls — Native-style minimize / maximize / close buttons for the Tauri window.
 * Falls back gracefully when running outside the Tauri shell (e.g., Vite dev in browser).
 */
export default function WindowControls() {
  const [isMaximized, setIsMaximized] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(false);

  const appWindow = (() => {
    if (typeof globalThis === "undefined") return null;
    const internals = (globalThis as unknown as { __TAURI_INTERNALS__?: unknown }).__TAURI_INTERNALS__;
    if (!internals) return null;
    try {
      return getCurrentWindow();
    } catch {
      return null;
    }
  })();

  const sync = useCallback(async () => {
    if (!appWindow) return;
    try {
      const fs = await appWindow.isFullscreen();
      const max = await appWindow.isMaximized();
      setIsFullscreen(fs);
      setIsMaximized(max);
    } catch {
      // ignore
    }
  }, [appWindow]);

  useEffect(() => {
    if (!appWindow) return;
    void sync();

    const unlistenMax = appWindow.onResized(() => {
      void sync();
    });

    return () => {
      void unlistenMax.then((fn) => fn());
    };
  }, [appWindow, sync]);

  const handleMinimize = () => {
    if (!appWindow) return;
    void appWindow.minimize();
  };

  const handleMaximize = async () => {
    if (!appWindow) return;
    try {
      if (await appWindow.isMaximized()) {
        await appWindow.unmaximize();
      } else {
        await appWindow.maximize();
      }
      // sync state so the tooltip/icon reflect the new window state immediately
      await sync();
    } catch {
      // ignore
    }
  };

  const handleFullscreen = async () => {
    if (!appWindow) return;
    try {
      await appWindow.setFullscreen(!isFullscreen);
      await sync();
    } catch {
      // ignore
    }
  };

  const handleClose = () => {
    if (!appWindow) return;
    void appWindow.close();
  };

  return (
    <div className="flex items-center gap-1">
      <button
        onClick={handleMinimize}
        className="material-symbols-outlined text-on-surface-variant hover:text-accent-teal transition-colors active:scale-95 duration-100 neo-btn p-1.5 rounded-full"
        title="Minimize"
        style={{ fontSize: 18 }}
      >
        minimize
      </button>
      <button
        onClick={handleMaximize}
        className="material-symbols-outlined text-on-surface-variant hover:text-accent-teal transition-colors active:scale-95 duration-100 neo-btn p-1.5 rounded-full"
        title={isMaximized ? "Restore" : "Maximize"}
        style={{ fontSize: 18 }}
      >
        {isMaximized ? "filter_none" : "maximize"}
      </button>
      <button
        onClick={handleFullscreen}
        className={`material-symbols-outlined transition-colors active:scale-95 duration-100 neo-btn p-1.5 rounded-full ${isFullscreen ? "text-accent-pink neo-pressed" : "text-on-surface-variant hover:text-accent-teal"}`}
        title={isFullscreen ? "Exit Fullscreen" : "Fullscreen"}
        style={{ fontSize: 18 }}
      >
        {isFullscreen ? "fullscreen_exit" : "fullscreen"}
      </button>
      <button
        onClick={handleClose}
        className="material-symbols-outlined text-on-surface-variant hover:text-accent-pink transition-colors active:scale-95 duration-100 neo-btn p-1.5 rounded-full"
        title="Close"
        style={{ fontSize: 18 }}
      >
        close
      </button>
    </div>
  );
}
