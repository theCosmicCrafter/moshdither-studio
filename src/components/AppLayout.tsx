import { useEffect, useState, useCallback } from "react";
import { useAppStore } from "../store";
import { listEffects, getFrameData, getMediaInfo, loadMediaFromPath } from "../lib/tauri";
import { getCurrentWebview } from "@tauri-apps/api/webview";
import { useKeyboardShortcuts } from "../hooks/useKeyboardShortcuts";
import { useKeyframePlayback } from "../hooks/useKeyframePlayback";
import EffectBrowser from "./EffectBrowser";
import PreviewViewport from "./PreviewViewport";
import EffectStack from "./EffectStack";
import MaskPanel from "./MaskPanel";
import AudioPanel from "./AudioPanel";
import ExportPanel from "./ExportPanel";
import PresetPanel from "./PresetPanel";
import Timeline from "./Timeline";
import Toolbar from "./Toolbar";
import StatusBar from "./StatusBar";

export default function AppLayout() {
  useKeyboardShortcuts();
  useKeyframePlayback();
  const setAllEffects = useAppStore((s) => s.setAllEffects);
  const setPreviewDataUrl = useAppStore((s) => s.setPreviewDataUrl);
  const setOriginalDataUrl = useAppStore((s) => s.setOriginalDataUrl);
  const setMediaLoaded = useAppStore((s) => s.setMediaLoaded);
  const setMediaInfo = useAppStore((s) => s.setMediaInfo);
  const setStatusMessage = useAppStore((s) => s.setStatusMessage);
  const setFilePath = useAppStore((s) => s.setFilePath);
  const [isDropTarget, setIsDropTarget] = useState(false);

  useEffect(() => {
    listEffects()
      .then((effects) => {
        setAllEffects(effects);
        setStatusMessage(`${effects.length} effects loaded`);
      })
      .catch((err) => setStatusMessage(`Error: ${err}`));
  }, [setAllEffects, setStatusMessage]);

  // Refresh preview on demand (called after file load / effect apply).
  // NOT polled — polling every 500 ms held the Rust frame mutex continuously
  // and starved SAM3 commands, causing freezes.
  const refreshPreview = useCallback(async (): Promise<boolean> => {
    try {
      const info = await getMediaInfo();
      if (info.loaded) {
        setMediaLoaded(true);
        setMediaInfo({ width: info.width, height: info.height });

        // Always use backend-generated PNG data URL for reliability in dev/prod.
        const frame = await getFrameData();
        setPreviewDataUrl(frame);
        setOriginalDataUrl(frame);
        return true;
      }
      return false;
    } catch (err) {
      console.error("[AppLayout] refreshPreview failed:", err);
      const msg = err instanceof Error ? err.message : String(err);
      setStatusMessage(`Preview refresh failed: ${msg}`);
      return false;
    }
  }, [setMediaLoaded, setMediaInfo, setPreviewDataUrl, setOriginalDataUrl, setStatusMessage]);

  // Drag-and-drop file support via Tauri webview API
  useEffect(() => {
    let unlisten: (() => void) | undefined;

    const setupDragDrop = async () => {
      try {
        const webview = getCurrentWebview();
        console.log("[drag-drop] Webview obtained:", webview);

        unlisten = await webview.onDragDropEvent((event) => {
          console.log("[drag-drop] Event:", event);
          const payload = event.payload;
          if (payload.type === "enter" || payload.type === "over") {
            setIsDropTarget(true);
          } else if (payload.type === "leave") {
            setIsDropTarget(false);
          } else if (payload.type === "drop") {
            setIsDropTarget(false);
            const path = payload.paths[0];
            console.log("[drag-drop] Dropped file:", path);
            if (path) {
              setStatusMessage(`Loading ${path}...`);
              setFilePath(path);
              void (async () => {
                try {
                  await loadMediaFromPath(path);
                  const synced = await refreshPreview();
                  setStatusMessage(synced ? `Loaded: ${path}` : `Loaded: ${path} (preview sync pending)`);
                } catch (err: unknown) {
                  const msg = err instanceof Error ? err.message : String(err);
                  setStatusMessage(`Load error: ${msg}`);
                }
              })();
            }
          }
        });
        console.log("[drag-drop] Listener registered successfully");
      } catch (err) {
        console.error("[drag-drop] Failed to register listener:", err);
      }
    };

    setupDragDrop();

    return () => {
      if (unlisten) {
        console.log("[drag-drop] Cleaning up listener");
        unlisten();
      }
    };
  }, [setStatusMessage, refreshPreview, setFilePath]);

  return (
    <div
      className="flex flex-col h-full w-full select-none"
      style={{
        background: "var(--bg-primary)",
        color: "var(--text-primary)",
      }}
    >
      {/* Top Toolbar */}
      <Toolbar onFileLoaded={refreshPreview} />

      {/* Main Workspace */}
      <div className="flex-1 flex min-h-0 overflow-hidden">
        {/* Left: Effect Browser */}
        <aside
          className="flex flex-col flex-shrink-0 border-r"
          style={{
            width: 260,
            borderColor: "var(--border-primary)",
          }}
        >
          <EffectBrowser />
        </aside>

        {/* Center: Preview + Timeline */}
        <main className="flex-1 flex flex-col min-w-0">
          <PreviewViewport isDropTarget={isDropTarget} />
          <Timeline />
        </main>

        {/* Right: Effect Stack + Mask Panel */}
        <aside
          className="flex flex-col flex-shrink-0 border-l overflow-hidden"
          style={{
            width: 320,
            borderColor: "var(--border-primary)",
          }}
        >
          <div className="flex-1 overflow-y-auto min-h-0">
            <EffectStack />
          </div>
          <AudioPanel />
          <ExportPanel />
          <PresetPanel />
          <MaskPanel />
        </aside>
      </div>

      {/* Bottom Status */}
      <StatusBar />
    </div>
  );
}
