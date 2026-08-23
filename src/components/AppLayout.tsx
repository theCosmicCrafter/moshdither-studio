import { useEffect, useState, useRef, useCallback } from "react";
import { useAppStore } from "../store";
import {
  listEffects,
  getFrameData,
  getMediaInfo,
  loadMediaFromPath,
  convertFileSrc,
  generateProxy,
} from "../lib/tauri";
import { isTauriAvailable } from "../lib/browserFallback";
import { getCurrentWebview } from "@tauri-apps/api/webview";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { confirm } from "@tauri-apps/plugin-dialog";
import { useKeyboardShortcuts } from "../hooks/useKeyboardShortcuts";
import { useKeyframePlayback } from "../hooks/useKeyframePlayback";
import { usePlaybackEngine } from "../hooks/usePlaybackEngine";
import { useProjectSession } from "../hooks/useProjectSession";
import { useSoundManager } from "../hooks/useSoundManager";
import { useSam3IdleShutdown } from "../hooks/useSam3IdleShutdown";
import { useAutoAudioExtract } from "../hooks/useAutoAudioExtract";
import { useWindowEdgeSnap } from "../hooks/useWindowEdgeSnap";
import { logger } from "../utils/logger";
import DockLayout from "./DockSystem/DockLayout";
import Toolbar from "./Toolbar";
import StatusBar from "./StatusBar";
import CommandPalette from "./CommandPalette";
import OnboardingModal from "./OnboardingModal";
import CustomUiModal from "./CustomUiModal";

export default function AppLayout() {
  useKeyboardShortcuts();
  useKeyframePlayback();
  usePlaybackEngine();
  useSam3IdleShutdown();
  useAutoAudioExtract();
  useWindowEdgeSnap();
  const { attachSounds } = useSoundManager();
  const { autoSave, recentProjects, restoreSession, clearAutoSave } = useProjectSession();
  const [showRecovery, setShowRecovery] = useState(!!autoSave);
  const setAllEffects = useAppStore((s) => s.setAllEffects);
  const setPreviewDataUrl = useAppStore((s) => s.setPreviewDataUrl);
  const setOriginalDataUrl = useAppStore((s) => s.setOriginalDataUrl);
  const setMediaLoaded = useAppStore((s) => s.setMediaLoaded);
  const setMediaInfo = useAppStore((s) => s.setMediaInfo);
  const setStatusMessage = useAppStore((s) => s.setStatusMessage);
  const setFilePath = useAppStore((s) => s.setFilePath);
  const setIsVideo = useAppStore((s) => s.setIsVideo);
  const setProxyUrl = useAppStore((s) => s.setProxyUrl);
  const workspaceRef = useRef<HTMLDivElement>(null);
  const [isDropTarget, setIsDropTarget] = useState(false);

  // Apply theme to document root
  const theme = useAppStore((s) => s.theme);
  const customPrimary = useAppStore((s) => s.customPrimary);
  const customSecondary = useAppStore((s) => s.customSecondary);
  const customBg = useAppStore((s) => s.customBg);
  useEffect(() => {
    document.documentElement.setAttribute("data-theme", theme);
    if (theme === "custom") {
      document.documentElement.style.setProperty("--custom-primary", customPrimary);
      document.documentElement.style.setProperty("--custom-secondary", customSecondary);
      document.documentElement.style.setProperty("--custom-bg", customBg);
    } else {
      document.documentElement.style.removeProperty("--custom-primary");
      document.documentElement.style.removeProperty("--custom-secondary");
      document.documentElement.style.removeProperty("--custom-bg");
    }
  }, [theme, customPrimary, customSecondary, customBg]);

  // Attach analog click sounds to interactive elements
  useEffect(() => {
    const cleanup = attachSounds();
    return cleanup;
  }, [attachSounds]);

  // Guard window close with an unsaved-changes prompt.
  //
  // `beforeunload` alone was INERT in the desktop app. The custom titlebar's
  // close button calls appWindow.close(), a native window close, and the
  // webview's beforeunload does not fire for that path -- so the guard worked
  // in a browser and never once appeared in the app it was written for.
  // Tauri's own onCloseRequested is the event that actually precedes a native
  // close. beforeunload is kept for browser mode, where it is the only hook.
  const effectStackLength = useAppStore((s) => s.effectStack.length);
  const mediaLoaded = useAppStore((s) => s.mediaLoaded);
  useEffect(() => {
    const hasWork = () =>
      useAppStore.getState().mediaLoaded && useAppStore.getState().effectStack.length > 0;

    const handleBeforeUnload = (e: BeforeUnloadEvent) => {
      if (hasWork()) {
        e.preventDefault();
        e.returnValue = "You have unsaved changes in your project session.";
        return e.returnValue;
      }
    };
    window.addEventListener("beforeunload", handleBeforeUnload);

    let unlisten: (() => void) | undefined;
    // try/catch, not just .catch(): getCurrentWindow() throws SYNCHRONOUSLY when
    // __TAURI_INTERNALS__ is present but incomplete (it reads
    // metadata.currentWindow). A synchronous throw inside useEffect is not
    // caught by a promise handler -- React surfaces it to the ErrorBoundary and
    // the whole UI goes down. That is exactly what happened under the E2E Tauri
    // mock, which provides invoke() and no metadata, so this guard took the app
    // out in every spec that used it.
    try {
      if (isTauriAvailable()) {
        void getCurrentWindow()
          .onCloseRequested(async (event) => {
            if (!hasWork()) return;
            // The session is autosaved every few seconds and offered back on
            // the next launch, so this asks rather than warns of loss.
            const leave = await confirm(
              "Close MoshDither Studio? Your session is autosaved and will be offered back next time you open it.",
              { title: "Close", kind: "warning" }
            );
            if (!leave) event.preventDefault();
          })
          .then((fn) => {
            unlisten = fn;
          })
          .catch(() => {
            /* no window handle: fall back to beforeunload alone */
          });
      }
    } catch {
      /* Tauri globals incomplete: beforeunload remains as the only guard */
    }

    return () => {
      window.removeEventListener("beforeunload", handleBeforeUnload);
      unlisten?.();
    };
  }, [mediaLoaded, effectStackLength]);

  // Load available effects on mount
  useEffect(() => {
    listEffects()
      .then((effects) => {
        setAllEffects(effects);
        setStatusMessage(`${effects.length} effects loaded`);
      })
      .catch((err) => setStatusMessage(`Error: ${err}`));
  }, [setAllEffects, setStatusMessage]);

  // Refresh preview on demand (called after file load / effect apply).
  // Mirrors PreviewViewport's refreshPreviewFromBackend so isVideo/proxyUrl
  // stay accurate no matter which "open a file" path the user takes (File
  // menu, native OS drag-drop here, or the dropzone/HTML5 drop in
  // PreviewViewport) -- callers like Toolbar's "Animate as Video" gate their
  // own enabled state on isVideo, so a stale value here silently breaks that.
  const refreshPreview = useCallback(async (): Promise<boolean> => {
    try {
      const info = await getMediaInfo();
      if (info.loaded) {
        const path = useAppStore.getState().filePath;
        const isVideoFile =
          !!path && /\.(mp4|avi|mov|mkv|webm|m4v|flv|wmv|mpeg|mpg)$/i.test(path);
        setMediaLoaded(true);
        setMediaInfo({ width: info.width, height: info.height });
        setIsVideo(isVideoFile);

        // Always use backend-generated PNG data URL for reliability in dev/prod.
        const frame = await getFrameData();
        setPreviewDataUrl(frame);
        setOriginalDataUrl(frame);

        if (isVideoFile && path) {
          try {
            const proxy = await generateProxy(path, 1280, 28);
            setProxyUrl(convertFileSrc(proxy));
          } catch (err) {
            logger.warn("proxy", "Proxy generation failed", { err: String(err) });
            setProxyUrl(null);
          }
        } else {
          setProxyUrl(null);
        }
        return true;
      }
      return false;
    } catch (err) {
      logger.error("preview", "refreshPreview failed", { err: String(err) });
      const msg = err instanceof Error ? err.message : String(err);
      setStatusMessage(`Preview refresh failed: ${msg}`);
      return false;
    }
  }, [
    setMediaLoaded,
    setMediaInfo,
    setPreviewDataUrl,
    setOriginalDataUrl,
    setStatusMessage,
    setIsVideo,
    setProxyUrl,
  ]);

  // Drag-and-drop file support via Tauri webview API.
  //
  // INERT while tauri.conf.json sets `dragDropEnabled: false`, which it does so
  // that flexlayout's panel dragging works: with the native handler enabled,
  // WebView2 swallows drag operations before the page sees them, so HTML5
  // drag-and-drop -- which is how flexlayout moves tabs between regions -- did
  // nothing inside the app while working perfectly in a browser.
  //
  // Dropping files still works: PreviewViewport's HTML5 dropzone reads them via
  // FileReader and loadMediaFromBase64. That route was previously dead code in
  // the desktop app for the same reason. It does mean a dropped file travels
  // through the webview as base64 rather than as a path, which is heavy for
  // large videos -- File > Open still passes a path directly and is the better
  // route for those.
  //
  // This listener is kept rather than deleted: re-enabling dragDropEnabled is a
  // one-line change if the trade-off ever needs revisiting, and the registration
  // is harmless when the events never arrive.
  useEffect(() => {
    let unlisten: (() => void) | undefined;

    const setupDragDrop = async () => {
      try {
        // Guard: Tauri APIs are only available inside the desktop app
        if (typeof globalThis !== "undefined" && !(globalThis as Record<string, unknown>).__TAURI_INTERNALS__) {
          logger.log("drag-drop", "Running outside Tauri, skipping webview drag-drop");
          return;
        }
        const webview = getCurrentWebview();
        logger.debug("drag-drop", "Webview obtained");

        unlisten = await webview.onDragDropEvent((event) => {
          const payload = event.payload;
          if (payload.type === "enter" || payload.type === "over") {
            setIsDropTarget(true);
          } else if (payload.type === "leave") {
            setIsDropTarget(false);
          } else if (payload.type === "drop") {
            setIsDropTarget(false);
            const path = payload.paths[0];
            logger.log("drag-drop", "Dropped file", { path });
            if (path) {
              setStatusMessage(`Loading ${path}...`);
              setFilePath(path);
              void (async () => {
                try {
                  await loadMediaFromPath(path);
                  const synced = await refreshPreview();
                  if (synced) {
                    setStatusMessage(`Loaded: ${path}`);
                  } else {
                    setStatusMessage(`Loaded ${path}, but the preview did not refresh`, "error");
                  }
                } catch (err: unknown) {
                  const msg = err instanceof Error ? err.message : String(err);
                  setStatusMessage(`Load error: ${msg}`);
                }
              })();
            }
          }
        });
        logger.log("drag-drop", "Listener registered successfully");
      } catch (err) {
        logger.error("drag-drop", "Failed to register listener", { err });
      }
    };

    setupDragDrop();

    return () => {
      if (unlisten) {
        logger.log("drag-drop", "Cleaning up listener");
        unlisten();
      }
    };
  }, [setStatusMessage, refreshPreview, setFilePath]);

  return (
    <div
      data-testid="app-layout"
      className="flex flex-col h-full w-full select-none pixel-grid text-on-surface relative"
      style={{ background: "transparent" }}
    >
      {/* Top Toolbar */}
      <Toolbar onFileLoaded={refreshPreview} />

      {/* Main Workspace — Dock Layout */}
      <div ref={workspaceRef} className="flex-1 relative min-h-0 overflow-hidden">
        <DockLayout isDropTarget={isDropTarget} />
      </div>

      {/* Bottom Status */}
      <StatusBar />

      {/* Auto-save Recovery Dialog */}
      {showRecovery && autoSave && (
        <div
          className="fixed inset-0 flex items-center justify-center z-[100] bg-black/60 backdrop-blur-sm"
          role="dialog"
          aria-modal="true"
          aria-labelledby="recovery-dialog-title"
        >
          <div className="neo-flat rounded-lg p-5 min-w-[320px] max-w-[420px] bg-surface/60 backdrop-blur-md text-on-surface">
            <h3
              id="recovery-dialog-title"
              className="font-headline-md text-headline-md solar-text filigree-header mb-2"
            >
              Recover Session?
            </h3>
            <p className="font-body-sm text-body-sm text-on-surface-variant mb-4">
              An unsaved session was found from{" "}
              {new Date(autoSave.savedAt).toLocaleString()}
              {autoSave.filePath && (
                <>
                  <br />
                  File: {autoSave.filePath}
                </>
              )}
              <br />
              Effects: {autoSave.effectStack.length} in stack
            </p>
            <div className="flex gap-2 justify-end">
              <button
                onClick={() => {
                  clearAutoSave();
                  setShowRecovery(false);
                }}
                className="neo-btn rounded-md px-3 py-1.5 font-label-md text-label-md text-on-surface-variant hover:text-accent-pink transition-colors"
                aria-label="Discard recovered session"
              >
                Discard
              </button>
              <button
                onClick={() => {
                  void (async () => {
                    await restoreSession(autoSave, refreshPreview);
                    setShowRecovery(false);
                  })();
                }}
                className="neo-btn rounded-md px-3 py-1.5 font-label-md text-label-md text-on-surface bg-accent-pink/20 hover:bg-accent-pink/30 transition-colors"
                aria-label="Restore recovered session"
                autoFocus
              >
                Restore Session
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Recent Projects */}
      {recentProjects.length > 0 && (
        <div className="fixed bottom-7 left-2 z-50">
          <div className="neo-flat rounded-md p-2 font-body-sm text-body-sm text-on-surface-variant bg-surface/40 backdrop-blur-md">
            <div className="font-label-sm text-label-sm text-on-surface mb-1">Recent</div>
            {recentProjects.slice(0, 5).map((p) => (
              <div
                key={p.path}
                className="cursor-pointer py-0.5 overflow-hidden text-ellipsis whitespace-nowrap max-w-[240px] hover:text-accent-teal transition-colors"
                title={p.path}
                onClick={() => {
                  setFilePath(p.path);
                  setStatusMessage(`Loading ${p.path}...`);
                  void (async () => {
                    try {
                      await loadMediaFromPath(p.path);
                      await refreshPreview();
                      setStatusMessage(`Loaded: ${p.path}`);
                    } catch (err: unknown) {
                      const msg = err instanceof Error ? err.message : String(err);
                      setStatusMessage(`Load error: ${msg}`);
                    }
                  })();
                }}
              >
                {p.name}
              </div>
            ))}
          </div>
        </div>
      )}
      <CommandPalette />
      <OnboardingModal />
      <CustomUiModal />
    </div>
  );
}
