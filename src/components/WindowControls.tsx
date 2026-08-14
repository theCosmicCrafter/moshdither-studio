import { useCallback, useEffect, useState, useRef } from "react";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { useAppStore } from "../store";
import { dockWindowAppbar, undockWindowAppbar } from "../lib/tauri";
import { isTauriAvailable } from "../lib/browserFallback";

/**
 * WindowControls — Native-style minimize / maximize / close buttons for the Tauri window,
 * plus edge-snap toggle and AppBar dock controls.
 * Falls back gracefully when running outside the Tauri shell (e.g., Vite dev in browser).
 */
export default function WindowControls() {
  const [isMaximized, setIsMaximized] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [showDockMenu, setShowDockMenu] = useState(false);
  const dockMenuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!showDockMenu) return;
    const handleOutsideClick = (e: MouseEvent) => {
      if (dockMenuRef.current && !dockMenuRef.current.contains(e.target as Node)) {
        setShowDockMenu(false);
      }
    };
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === "Escape") setShowDockMenu(false);
    };
    document.addEventListener("mousedown", handleOutsideClick);
    document.addEventListener("keydown", handleEscape);
    return () => {
      document.removeEventListener("mousedown", handleOutsideClick);
      document.removeEventListener("keydown", handleEscape);
    };
  }, [showDockMenu]);

  const edgeSnapEnabled = useAppStore((s) => s.edgeSnapEnabled);
  const setEdgeSnapEnabled = useAppStore((s) => s.setEdgeSnapEnabled);
  const appBarDocked = useAppStore((s) => s.appBarDocked);
  const setAppBarDocked = useAppStore((s) => s.setAppBarDocked);

  const isWindows = navigator.userAgent.includes("Windows");

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

  const handleToggleSnap = () => {
    setEdgeSnapEnabled(!edgeSnapEnabled);
  };

  const handleDockToEdge = async (edge: "left" | "right") => {
    if (!isTauriAvailable()) return;
    try {
      if (appBarDocked) {
        await undockWindowAppbar();
        setAppBarDocked(false);
      } else {
        await dockWindowAppbar(edge, 300);
        setAppBarDocked(true, edge, 300);
      }
    } catch {
      // AppBar not supported on this platform
    }
    setShowDockMenu(false);
  };

  return (
    <div className="flex items-center gap-1" role="toolbar" aria-label="Window controls">
      {/* Edge snap toggle */}
      <button
        onClick={handleToggleSnap}
        className={`material-symbols-outlined transition-colors active:scale-95 duration-100 neo-btn p-1.5 rounded-full ${edgeSnapEnabled ? "text-accent-teal neo-pressed" : "text-on-surface-variant hover:text-accent-teal"}`}
        title={edgeSnapEnabled ? "Disable edge snapping" : "Enable edge snapping"}
        aria-label={edgeSnapEnabled ? "Disable edge snapping" : "Enable edge snapping"}
        aria-pressed={edgeSnapEnabled}
        style={{ fontSize: 18 }}
      >
        magnet
      </button>

      {/* AppBar dock button — Windows only */}
      {isWindows && (
        <div className="relative">
          <button
            onClick={() => appBarDocked ? void handleDockToEdge("right") : setShowDockMenu(!showDockMenu)}
            className={`material-symbols-outlined transition-colors active:scale-95 duration-100 neo-btn p-1.5 rounded-full ${appBarDocked ? "text-accent-pink neo-pressed" : "text-on-surface-variant hover:text-accent-teal"}`}
            title={appBarDocked ? "Undock from edge" : "Dock to screen edge"}
            aria-label={appBarDocked ? "Undock from edge" : "Dock to screen edge"}
            aria-pressed={appBarDocked}
            style={{ fontSize: 18 }}
          >
            {appBarDocked ? "dock_to_bottom" : "dock_to_right"}
          </button>

          {/* Dock direction dropdown */}
          {showDockMenu && !appBarDocked && (
            <div
              ref={dockMenuRef}
              role="menu"
              aria-label="Dock direction"
              className="absolute right-0 top-full mt-1 z-50 neo-flat rounded-md bg-surface/80 backdrop-blur-xl border border-outline/20 p-1 min-w-[120px]"
              onMouseLeave={() => setShowDockMenu(false)}
            >
              <button
                role="menuitem"
                tabIndex={0}
                onClick={() => void handleDockToEdge("left")}
                className="flex items-center gap-2 w-full px-2 py-1 rounded font-label-md text-label-md text-on-surface hover:bg-accent-teal/10 transition-colors"
              >
                <span className="material-symbols-outlined" style={{ fontSize: 14 }}>dock_to_right</span>
                Dock Left
              </button>
              <button
                role="menuitem"
                tabIndex={0}
                onClick={() => void handleDockToEdge("right")}
                className="flex items-center gap-2 w-full px-2 py-1 rounded font-label-md text-label-md text-on-surface hover:bg-accent-teal/10 transition-colors"
              >
                <span className="material-symbols-outlined" style={{ fontSize: 14, transform: "scaleX(-1)" }}>dock_to_right</span>
                Dock Right
              </button>
            </div>
          )}
        </div>
      )}

      {/* Separator */}
      <div className="w-px h-4 bg-outline/20 mx-0.5" />

      <button
        onClick={handleMinimize}
        className="material-symbols-outlined text-on-surface-variant hover:text-accent-teal transition-colors active:scale-95 duration-100 neo-btn p-1.5 rounded-full"
        title="Minimize"
        aria-label="Minimize window"
        style={{ fontSize: 18 }}
      >
        minimize
      </button>
      <button
        onClick={handleMaximize}
        className="material-symbols-outlined text-on-surface-variant hover:text-accent-teal transition-colors active:scale-95 duration-100 neo-btn p-1.5 rounded-full"
        title={isMaximized ? "Restore" : "Maximize"}
        aria-label={isMaximized ? "Restore window" : "Maximize window"}
        aria-pressed={isMaximized}
        style={{ fontSize: 18 }}
      >
        {isMaximized ? "filter_none" : "maximize"}
      </button>
      <button
        onClick={handleFullscreen}
        className={`material-symbols-outlined transition-colors active:scale-95 duration-100 neo-btn p-1.5 rounded-full ${isFullscreen ? "text-accent-pink neo-pressed" : "text-on-surface-variant hover:text-accent-teal"}`}
        title={isFullscreen ? "Exit Fullscreen" : "Fullscreen"}
        aria-label={isFullscreen ? "Exit fullscreen" : "Enter fullscreen"}
        aria-pressed={isFullscreen}
        style={{ fontSize: 18 }}
      >
        {isFullscreen ? "fullscreen_exit" : "fullscreen"}
      </button>
      <button
        onClick={handleClose}
        className="material-symbols-outlined text-on-surface-variant hover:text-accent-pink transition-colors active:scale-95 duration-100 neo-btn p-1.5 rounded-full"
        title="Close"
        aria-label="Close window"
        style={{ fontSize: 18 }}
      >
        close
      </button>
    </div>
  );
}
