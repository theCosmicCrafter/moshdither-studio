import { useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import { useAppStore } from "../store";
import {
  registerCommand,
  subscribeCommands,
  getCommandsSnapshot,
  fuzzyMatch,
  type Command,
} from "../utils/commands";
import { dockWindowAppbar, undockWindowAppbar } from "../lib/tauri";

export default function CommandPalette() {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [selectedIndex, setSelectedIndex] = useState(0);

  const inputRef = useRef<HTMLInputElement>(null);
  const setStatusMessage = useAppStore((s) => s.setStatusMessage);
  const setCurrentTime = useAppStore((s) => s.setCurrentTime);
  const undo = useAppStore((s) => s.undo);
  const redo = useAppStore((s) => s.redo);
  const canUndo = useAppStore((s) => s.canUndo);
  const canRedo = useAppStore((s) => s.canRedo);
  const clearStack = useAppStore((s) => s.clearStack);
  const setFilePath = useAppStore((s) => s.setFilePath);
  const setMediaLoaded = useAppStore((s) => s.setMediaLoaded);
  const setMediaInfo = useAppStore((s) => s.setMediaInfo);
  const setPreviewDataUrl = useAppStore((s) => s.setPreviewDataUrl);
  const setOriginalDataUrl = useAppStore((s) => s.setOriginalDataUrl);
  const clearSam3FrameMasks = useAppStore((s) => s.clearSam3FrameMasks);
  const setInPoint = useAppStore((s) => s.setInPoint);
  const setOutPoint = useAppStore((s) => s.setOutPoint);
  const clearInOut = useAppStore((s) => s.clearInOut);
  const setScopesVisible = useAppStore((s) => s.setScopesVisible);

  // Subscribed rather than read once: the commands below are registered in an
  // effect that runs after this component's first render, so a plain
  // getCommands() here captured an empty registry and the palette opened
  // showing "No commands found" until the user typed.
  const registered = useSyncExternalStore(subscribeCommands, getCommandsSnapshot);

  const commands = useMemo(() => {
    const all = registered;
    if (!query.trim()) return all;
    return all
      .map((cmd) => ({
        cmd,
        score: fuzzyMatch(query, `${cmd.label} ${cmd.category}`),
      }))
      .filter((r) => r.score > 0)
      .sort((a, b) => b.score - a.score)
      .map((r) => r.cmd);
  }, [query, registered]);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.shiftKey && e.key.toLowerCase() === "p") {
        e.preventDefault();
        setOpen((prev) => !prev);
        setQuery("");
      }
      if (e.key === "Escape") {
        setOpen(false);
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, []);

  useEffect(() => {
    if (open && inputRef.current) {
      inputRef.current.focus();
    }
  }, [open]);

  useEffect(() => {
    setSelectedIndex(0);
  }, [query]);

  useEffect(() => {
    registerCommand({ id: "go-to-start", label: "Go to start", category: "Timeline", shortcut: "Home", action: () => setCurrentTime(0) });
    // Reads duration at invocation rather than closing over it, so the command
    // stays correct as media changes. It was previously a hard-coded 300, which
    // is not the end of anything -- on a 5s clip "Go to end" jumped a minute
    // past it, and since setCurrentTime did not clamp, the playhead stuck there.
    registerCommand({ id: "go-to-end", label: "Go to end", category: "Timeline", shortcut: "End", action: () => setCurrentTime(useAppStore.getState().duration) });
    // Space toggles the transport (useKeyboardShortcuts); this entry claims
    // that shortcut, so it must do the same. It toggled AUDIO playback.
    registerCommand({ id: "play-pause", label: "Play / pause", category: "Timeline", shortcut: "Space", action: () => useAppStore.getState().togglePlay() });
    registerCommand({ id: "undo", label: "Undo", category: "Edit", shortcut: "Ctrl+Z", action: () => { if (canUndo()) undo(); } });
    registerCommand({ id: "redo", label: "Redo", category: "Edit", shortcut: "Ctrl+Shift+Z", action: () => { if (canRedo()) redo(); } });
    registerCommand({ id: "clear-stack", label: "Clear effect stack", category: "Edit", action: () => { clearStack(); setStatusMessage("Effect stack cleared"); } });
    registerCommand({ id: "close-media", label: "Close media", category: "File", action: () => { setFilePath(null); setMediaLoaded(false); setMediaInfo(null); setPreviewDataUrl(null); setOriginalDataUrl(null); clearSam3FrameMasks(); setStatusMessage("Media closed"); } });
    // At the playhead, like the I / O keys. These set 0 and 300 regardless.
    registerCommand({ id: "set-in-point", label: "Set in point", category: "Timeline", shortcut: "I", action: () => setInPoint(useAppStore.getState().currentTime) });
    registerCommand({ id: "set-out-point", label: "Set out point", category: "Timeline", shortcut: "O", action: () => setOutPoint(useAppStore.getState().currentTime) });
    registerCommand({ id: "clear-in-out", label: "Clear in/out points", category: "Timeline", shortcut: "X", action: () => clearInOut() });
    registerCommand({ id: "toggle-scopes", label: "Toggle scopes", category: "View", action: () => setScopesVisible(!useAppStore.getState().scopesVisible) });
    
    // Layout and Docking
    registerCommand({ id: "reset-workspace", label: "Reset workspace layout", category: "View", action: () => useAppStore.getState().triggerLayoutAction("reset") });
    registerCommand({ id: "toggle-edge-snap", label: "Toggle edge snapping", category: "Window", action: () => { const s = useAppStore.getState(); s.setEdgeSnapEnabled(!s.edgeSnapEnabled); } });
    registerCommand({ id: "dock-left", label: "Dock window left", category: "Window", action: async () => {
      const s = useAppStore.getState();
      if (s.appBarDocked) await undockWindowAppbar();
      await dockWindowAppbar("left", 300);
      s.setAppBarDocked(true, "left", 300);
    } });
    registerCommand({ id: "dock-right", label: "Dock window right", category: "Window", action: async () => {
      const s = useAppStore.getState();
      if (s.appBarDocked) await undockWindowAppbar();
      await dockWindowAppbar("right", 300);
      s.setAppBarDocked(true, "right", 300);
    } });
  }, [
    setCurrentTime, undo, redo, canUndo, canRedo,
    clearStack, setFilePath, setMediaLoaded, setMediaInfo, setPreviewDataUrl,
    setOriginalDataUrl, clearSam3FrameMasks, setInPoint, setOutPoint, clearInOut,
    setScopesVisible, setStatusMessage,
  ]);

  const execute = (cmd: Command) => {
    setOpen(false);
    setQuery("");
    cmd.action();
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setSelectedIndex((i) => Math.min(i + 1, commands.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setSelectedIndex((i) => Math.max(i - 1, 0));
    } else if (e.key === "Enter") {
      e.preventDefault();
      if (commands[selectedIndex]) {
        execute(commands[selectedIndex]);
      }
    } else if (e.key === "Escape") {
      setOpen(false);
    }
  };

  if (!open) return null;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Command palette"
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 9998,
        display: "flex",
        alignItems: "flex-start",
        justifyContent: "center",
        paddingTop: "15vh",
        background: "rgba(0,0,0,0.5)",
      }}
      onClick={() => setOpen(false)}
    >
      <div
        style={{
          width: 560,
          maxWidth: "90vw",
          background: "var(--surface-elevated, #14141a)",
          border: "1px solid var(--border-subtle, rgba(255,255,255,0.08))",
          borderRadius: 12,
          boxShadow: "0 24px 64px rgba(0,0,0,0.5)",
          overflow: "hidden",
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <input
          ref={inputRef}
          value={query}
          onChange={(e) => {
            setQuery(e.target.value);
            setSelectedIndex(0);
          }}
          onKeyDown={handleKeyDown}
          placeholder="Type a command..."
          aria-label="Command search input"
          aria-autocomplete="list"
          aria-controls="command-palette-listbox"
          aria-activedescendant={commands.length > 0 ? `command-option-${selectedIndex}` : undefined}
          style={{
            width: "100%",
            padding: "16px 20px",
            background: "transparent",
            border: "none",
            outline: "none",
            color: "var(--text-primary, #e8e8ed)",
            fontSize: 16,
            caretColor: "var(--accent-primary, #0a84ff)",
          }}
        />
        <div
          id="command-palette-listbox"
          role="listbox"
          aria-label="Available commands"
          style={{ maxHeight: 320, overflowY: "auto" }}
        >
          {commands.length === 0 && (
            <div
              role="status"
              style={{
                padding: 24,
                textAlign: "center",
                color: "var(--text-secondary, #a0a0b0)",
                fontSize: 14,
              }}
            >
              No commands found
            </div>
          )}
          {commands.map((cmd, i) => (
            <button
              key={cmd.id}
              id={`command-option-${i}`}
              role="option"
              aria-selected={i === selectedIndex}
              onClick={() => execute(cmd)}
              style={{
                width: "100%",
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                padding: "10px 20px",
                background: i === selectedIndex ? "rgba(255,255,255,0.06)" : "transparent",
                border: "none",
                color: "var(--text-primary, #e8e8ed)",
                cursor: "pointer",
                textAlign: "left",
                fontSize: 14,
              }}
              onMouseEnter={() => setSelectedIndex(i)}
            >
              <span>
                <span style={{ opacity: 0.5, marginRight: 8, fontSize: 12 }}>
                  {cmd.category}
                </span>
                {cmd.label}
              </span>
              {cmd.shortcut && (
                <kbd
                  style={{
                    padding: "2px 6px",
                    background: "rgba(255,255,255,0.08)",
                    borderRadius: 4,
                    fontSize: 11,
                    fontFamily: "monospace",
                    color: "var(--text-secondary, #a0a0b0)",
                  }}
                >
                  {cmd.shortcut}
                </kbd>
              )}
            </button>
          ))}
        </div>
        <div
          style={{
            padding: "8px 16px",
            borderTop: "1px solid var(--border-subtle, rgba(255,255,255,0.05))",
            fontSize: 11,
            color: "var(--text-secondary, #a0a0b0)",
            display: "flex",
            gap: 12,
          }}
        >
          <span>↑↓ to navigate</span>
          <span>↵ to execute</span>
          <span>esc to close</span>
        </div>
      </div>
    </div>
  );
}
