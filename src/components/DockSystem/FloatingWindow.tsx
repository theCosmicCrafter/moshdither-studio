import { Suspense, useRef, useCallback, useState } from "react";
import { useAppStore, type FloatingWindow as FloatWin } from "../../store";
import { getPanelMeta } from "./panelRegistry";

interface FloatingWindowProps {
  win: FloatWin;
}

type ResizeDir = "n" | "s" | "e" | "w" | "ne" | "nw" | "se" | "sw";

export default function FloatingWindowComponent({ win }: FloatingWindowProps) {
  const updateFloatingWindow = useAppStore((s) => s.updateFloatingWindow);
  const focusFloatingWindow = useAppStore((s) => s.focusFloatingWindow);
  const closeFloatingWindow = useAppStore((s) => s.closeFloatingWindow);
  const dockFloatingWindow = useAppStore((s) => s.dockFloatingWindow);
  const dragState = useRef<{ startX: number; startY: number; origX: number; origY: number; origW: number; origH: number; dir: ResizeDir | "move" } | null>(null);
  const [dropZoneHint, setDropZoneHint] = useState<string | null>(null);

  const meta = getPanelMeta(win.panelId);
  const PanelComponent = meta?.component;

  // Find which dock zone the cursor is over
  const findZoneAtPoint = useCallback((x: number, y: number): "left" | "right" | "bottom" | null => {
    const el = document.elementFromPoint(x, y);
    if (!el) return null;
    // Walk up the DOM to find a dock-zone element
    let node: HTMLElement | null = el as HTMLElement;
    while (node) {
      if (node.dataset?.testid?.startsWith("dock-zone-")) {
        const zone = node.dataset.testid.replace("dock-zone-", "");
        if (zone === "left" || zone === "right" || zone === "bottom") return zone;
      }
      node = node.parentElement;
    }
    return null;
  }, []);

  const handleMouseDown = useCallback((e: React.MouseEvent, dir: ResizeDir | "move") => {
    e.preventDefault();
    e.stopPropagation();
    focusFloatingWindow(win.id);
    dragState.current = {
      startX: e.clientX,
      startY: e.clientY,
      origX: win.x,
      origY: win.y,
      origW: win.width,
      origH: win.height,
      dir,
    };

    const handleMove = (ev: MouseEvent) => {
      if (!dragState.current) return;
      const dx = ev.clientX - dragState.current.startX;
      const dy = ev.clientY - dragState.current.startY;
      const { origX, origY, origW, origH, dir: d } = dragState.current;
      const minW = meta?.minWidth ?? 200;
      const minH = meta?.minHeight ?? 150;

      if (d === "move") {
        const newX = origX + dx;
        const newY = origY + dy;
        updateFloatingWindow(win.id, { x: newX, y: newY });
        // Check if over a dock zone for re-docking hint
        const zone = findZoneAtPoint(ev.clientX, ev.clientY);
        setDropZoneHint(zone);
        return;
      }

      let nx = origX, ny = origY, nw = origW, nh = origH;
      if (d.includes("e")) nw = Math.max(minW, origW + dx);
      if (d.includes("s")) nh = Math.max(minH, origH + dy);
      if (d.includes("w")) { nw = Math.max(minW, origW - dx); nx = origX + (origW - nw); }
      if (d.includes("n")) { nh = Math.max(minH, origH - dy); ny = origY + (origH - nh); }
      updateFloatingWindow(win.id, { x: nx, y: ny, width: nw, height: nh });
    };

    const handleUp = (ev: MouseEvent) => {
      const wasMoving = dragState.current?.dir === "move";
      dragState.current = null;
      window.removeEventListener("mousemove", handleMove);
      window.removeEventListener("mouseup", handleUp);
      document.body.classList.remove("floating-resizing");

      // If we were moving (not resizing), check if we should re-dock
      if (wasMoving) {
        const zone = findZoneAtPoint(ev.clientX, ev.clientY);
        if (zone) {
          // Only dock if the zone has groups (or even if empty — addPanelToDock handles it)
          dockFloatingWindow(win.id, zone);
        }
      }
      setDropZoneHint(null);
    };

    document.body.classList.add("floating-resizing");
    window.addEventListener("mousemove", handleMove);
    window.addEventListener("mouseup", handleUp);
  }, [win.id, win.x, win.y, win.width, win.height, meta, updateFloatingWindow, focusFloatingWindow, dockFloatingWindow, findZoneAtPoint]);

  if (!PanelComponent) return null;

  return (
    <div
      className="floating-window absolute flex flex-col rounded-lg overflow-hidden border border-outline/30 bg-surface/80 backdrop-blur-xl shadow-2xl"
      style={{
        left: win.x,
        top: win.y,
        width: win.width,
        height: win.height,
        zIndex: win.zIndex,
      }}
      onMouseDown={() => focusFloatingWindow(win.id)}
    >
      {/* Title bar — draggable to move or re-dock */}
      <div
        className="floating-window-titlebar flex items-center gap-1 h-7 px-2 border-b border-outline/20 bg-surface/60 select-none cursor-move"
        onMouseDown={(e) => handleMouseDown(e, "move")}
      >
        <span className="material-symbols-outlined text-on-surface-variant" style={{ fontSize: 12 }}>
          {meta?.icon}
        </span>
        <span className="text-[10px] font-semibold uppercase tracking-wider text-on-surface flex-1">
          {meta?.label}
        </span>

        {/* Quick dock buttons */}
        <button
          onClick={(e) => {
            e.stopPropagation();
            dockFloatingWindow(win.id, "left");
          }}
          className="opacity-60 hover:opacity-100 transition-opacity text-on-surface-variant hover:text-accent-teal"
          title="Dock to left"
        >
          <span className="material-symbols-outlined" style={{ fontSize: 12 }}>dock_to_right</span>
        </button>
        <button
          onClick={(e) => {
            e.stopPropagation();
            dockFloatingWindow(win.id, "right");
          }}
          className="opacity-60 hover:opacity-100 transition-opacity text-on-surface-variant hover:text-accent-teal"
          title="Dock to right"
        >
          <span className="material-symbols-outlined" style={{ fontSize: 12, transform: "scaleX(-1)" }}>dock_to_right</span>
        </button>

        <button
          onClick={(e) => {
            e.stopPropagation();
            closeFloatingWindow(win.id);
          }}
          className="opacity-60 hover:opacity-100 transition-opacity text-on-surface-variant hover:text-accent-pink"
          title="Close"
        >
          <span className="material-symbols-outlined" style={{ fontSize: 12 }}>close</span>
        </button>
      </div>

      {/* Content */}
      <div className="flex-1 min-h-0 overflow-hidden">
        <Suspense
          fallback={
            <div className="flex items-center justify-center h-full text-on-surface-variant text-[11px]">
              Loading...
            </div>
          }
        >
          <div className="h-full overflow-y-auto custom-scrollbar">
            <PanelComponent />
          </div>
        </Suspense>
      </div>

      {/* Drop zone hint overlay — shows when dragging over a dock zone */}
      {dropZoneHint && (
        <div className="absolute inset-0 pointer-events-none z-50 border-2 border-accent-teal/60 bg-accent-teal/10 rounded-lg flex items-center justify-center">
          <span className="text-[10px] font-semibold uppercase tracking-wider text-accent-teal bg-surface/80 px-2 py-1 rounded">
            Dock to {dropZoneHint}
          </span>
        </div>
      )}

      {/* Resize handles */}
      <div className="absolute top-0 left-0 right-0 h-1 cursor-ns-resize" onMouseDown={(e) => handleMouseDown(e, "n")} />
      <div className="absolute bottom-0 left-0 right-0 h-1 cursor-ns-resize" onMouseDown={(e) => handleMouseDown(e, "s")} />
      <div className="absolute top-0 left-0 bottom-0 w-1 cursor-ew-resize" onMouseDown={(e) => handleMouseDown(e, "w")} />
      <div className="absolute top-0 right-0 bottom-0 w-1 cursor-ew-resize" onMouseDown={(e) => handleMouseDown(e, "e")} />
      <div className="absolute top-0 left-0 w-2 h-2 cursor-nwse-resize" onMouseDown={(e) => handleMouseDown(e, "nw")} />
      <div className="absolute top-0 right-0 w-2 h-2 cursor-nesw-resize" onMouseDown={(e) => handleMouseDown(e, "ne")} />
      <div className="absolute bottom-0 left-0 w-2 h-2 cursor-nesw-resize" onMouseDown={(e) => handleMouseDown(e, "sw")} />
      <div className="absolute bottom-0 right-0 w-2 h-2 cursor-nwse-resize" onMouseDown={(e) => handleMouseDown(e, "se")} />
    </div>
  );
}
