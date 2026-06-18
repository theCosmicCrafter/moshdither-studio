import { useEffect, useState, useCallback } from "react";
import { useAppStore } from "../store";
import { listEffects, getFrameData, getMediaInfo, loadMediaFromPath } from "../lib/tauri";
import { getCurrentWebview } from "@tauri-apps/api/webview";
import { useKeyboardShortcuts } from "../hooks/useKeyboardShortcuts";
import { useKeyframePlayback } from "../hooks/useKeyframePlayback";
import { useProjectSession } from "../hooks/useProjectSession";
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
  const { autoSave, recentProjects, restoreSession, clearAutoSave } = useProjectSession();
  const [showRecovery, setShowRecovery] = useState(!!autoSave);
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

      {/* Auto-save Recovery Dialog */}
      {showRecovery && autoSave && (
        <div
          style={{
            position: "fixed",
            inset: 0,
            background: "rgba(0,0,0,0.6)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            zIndex: 100,
          }}
        >
          <div
            style={{
              background: "var(--bg-secondary, #1a1a1a)",
              border: "1px solid var(--border-primary, #333)",
              borderRadius: 8,
              padding: 20,
              minWidth: 320,
              maxWidth: 420,
              color: "var(--text-primary, #e0e0e0)",
            }}
          >
            <h3 style={{ margin: "0 0 8px", fontSize: 15, fontWeight: 600 }}>
              Recover Session?
            </h3>
            <p style={{ margin: "0 0 16px", fontSize: 12, color: "var(--text-muted, #999)" }}>
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
            <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
              <button
                onClick={() => {
                  clearAutoSave();
                  setShowRecovery(false);
                }}
                style={{
                  padding: "6px 12px",
                  fontSize: 12,
                  borderRadius: 4,
                  border: "1px solid #444",
                  background: "transparent",
                  color: "#ddd",
                  cursor: "pointer",
                }}
              >
                Discard
              </button>
              <button
                onClick={() => {
                  restoreSession(autoSave);
                  setShowRecovery(false);
                }}
                style={{
                  padding: "6px 12px",
                  fontSize: 12,
                  borderRadius: 4,
                  border: "none",
                  background: "var(--accent, #2a6f3c)",
                  color: "#fff",
                  cursor: "pointer",
                }}
              >
                Restore Session
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Recent Projects */}
      {recentProjects.length > 0 && (
        <div
          style={{
            position: "fixed",
            bottom: 28,
            left: 8,
            zIndex: 50,
          }}
        >
          <div
            style={{
              background: "rgba(20,20,20,0.85)",
              backdropFilter: "blur(6px)",
              border: "1px solid #333",
              borderRadius: 6,
              padding: "6px 8px",
              fontSize: 11,
              color: "#aaa",
              fontFamily: "var(--font-mono, monospace)",
            }}
          >
            <div style={{ fontWeight: 600, marginBottom: 4, color: "#ddd" }}>Recent</div>
            {recentProjects.slice(0, 5).map((p) => (
              <div
                key={p.path}
                style={{
                  cursor: "pointer",
                  padding: "2px 0",
                  overflow: "hidden",
                  textOverflow: "ellipsis",
                  whiteSpace: "nowrap",
                  maxWidth: 240,
                }}
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
    </div>
  );
}
