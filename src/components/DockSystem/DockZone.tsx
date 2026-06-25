import { useRef, useCallback, type DragEvent } from "react";
import { useAppStore } from "../../store";
import type { DockZone } from "./panelRegistry";
import TabGroupComponent from "./TabGroup";
import { markTabDropHandled } from "./tabDropState";

interface DockZoneProps {
  zone: DockZone;
  side: "horizontal" | "vertical";
}

export default function DockZoneComponent({ zone, side }: DockZoneProps) {
  const groups = useAppStore((s) => s.dockLayout[zone]);
  const setDockGroupSizes = useAppStore((s) => s.setDockGroupSizes);
  const addPanelToDock = useAppStore((s) => s.addPanelToDock);
  const dockFloatingWindow = useAppStore((s) => s.dockFloatingWindow);
  const draggingDivider = useRef<{
    groupIdAbove: string;
    groupIdBelow: string;
    startPos: number;
    startSizeAbove: number;
    startSizeBelow: number;
  } | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  const handleDividerDragStart = useCallback(
    (e: React.MouseEvent, groupAboveId: string, groupBelowId: string) => {
      e.preventDefault();
      e.stopPropagation();
      const groupAbove = groups.find((g) => g.id === groupAboveId);
      const groupBelow = groups.find((g) => g.id === groupBelowId);
      if (!groupAbove || !groupBelow) return;
      const container = containerRef.current;
      const containerSize = side === "vertical"
        ? container?.offsetHeight ?? 600
        : container?.offsetWidth ?? 400;
      draggingDivider.current = {
        groupIdAbove: groupAboveId,
        groupIdBelow: groupBelowId,
        startPos: side === "vertical" ? e.clientY : e.clientX,
        startSizeAbove: groupAbove.size,
        startSizeBelow: groupBelow.size,
      };

      const handleMove = (ev: MouseEvent) => {
        if (!draggingDivider.current) return;
        const delta = side === "vertical"
          ? ev.clientY - draggingDivider.current.startPos
          : ev.clientX - draggingDivider.current.startPos;
        const sizeDelta = delta / containerSize;
        const d = draggingDivider.current;
        // Dragging the divider DOWN (positive delta) should grow the group ABOVE
        // and shrink the group BELOW by the same amount — divider follows mouse.
        setDockGroupSizes(
          d.groupIdAbove, d.startSizeAbove + sizeDelta,
          d.groupIdBelow, d.startSizeBelow - sizeDelta,
        );
      };

      const handleUp = () => {
        draggingDivider.current = null;
        window.removeEventListener("mousemove", handleMove);
        window.removeEventListener("mouseup", handleUp);
        document.body.classList.remove("group-resizing");
      };

      document.body.classList.add("group-resizing");
      window.addEventListener("mousemove", handleMove);
      window.addEventListener("mouseup", handleUp);
    },
    [groups, side, setDockGroupSizes]
  );

  const handleZoneDragOver = (e: DragEvent) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = "move";
  };

  const handleZoneDrop = (e: DragEvent) => {
    e.preventDefault();
    markTabDropHandled();
    const floatId = e.dataTransfer.getData("text/floating-window-id");
    if (floatId) {
      dockFloatingWindow(floatId, zone);
      return;
    }
    // Group drag — mark handled so group drag-end knows it was dropped on a zone.
    // The group's drag-end will tear it off to floating windows at the drop position.
    if (e.dataTransfer.getData("text/group-id")) return;
    const panelId = e.dataTransfer.getData("text/panel-id");
    if (!panelId) return;
    addPanelToDock(panelId, zone);
  };

  if (groups.length === 0) {
    return (
      <div
        className="dock-zone dock-zone-empty flex items-center justify-center h-full min-h-0"
        onDragOver={handleZoneDragOver}
        onDrop={handleZoneDrop}
        data-testid={`dock-zone-${zone}`}
      >
        <span className="text-[10px] text-on-surface-variant opacity-40 uppercase tracking-wider">
          Drop panels here
        </span>
      </div>
    );
  }

  const containerClass =
    side === "vertical"
      ? "dock-zone dock-zone-vertical flex flex-col h-full min-h-0"
      : "dock-zone dock-zone-horizontal flex flex-row w-full min-w-0";

  return (
    <div
      ref={containerRef}
      className={containerClass}
      onDragOver={handleZoneDragOver}
      onDrop={handleZoneDrop}
      data-testid={`dock-zone-${zone}`}
    >
      {groups.map((group, idx) => (
        <div key={group.id} className="contents">
          {idx > 0 && (
            <div
              className={`dock-divider ${
                side === "vertical" ? "dock-divider-h cursor-ns-resize h-1" : "dock-divider-v cursor-ew-resize w-1"
              } bg-outline/10 hover:bg-accent-teal/40 transition-colors flex-shrink-0 relative group`}
              onMouseDown={(e) => handleDividerDragStart(e, groups[idx - 1].id, group.id)}
              data-testid={`dock-divider-${group.id}`}
            >
              {/* Wider invisible hit area */}
              <div className={`absolute ${side === "vertical" ? "-top-1 -bottom-1 left-0 right-0" : "-left-1 -right-1 top-0 bottom-0"}`} />
            </div>
          )}
          <TabGroupComponent group={group} zone={zone} />
        </div>
      ))}
    </div>
  );
}
