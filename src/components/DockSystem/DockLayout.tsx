import { useRef, useCallback } from "react";
import { useAppStore } from "../../store";
import PanelRail from "./PanelRail";
import DockZoneComponent from "./DockZone";
import FloatingWindowComponent from "./FloatingWindow";
import PreviewViewport from "../PreviewViewport";
import Timeline from "../Timeline";

interface DockLayoutProps {
  isDropTarget?: boolean;
}

export default function DockLayout({ isDropTarget = false }: DockLayoutProps) {
  const dockLayout = useAppStore((s) => s.dockLayout);
  const panelOpacity = useAppStore((s) => s.panelOpacity);
  const floatingWindows = useAppStore((s) => s.floatingWindows);
  const leftZoneWidth = useAppStore((s) => s.leftZoneWidth);
  const rightZoneWidth = useAppStore((s) => s.rightZoneWidth);
  const setLeftZoneWidth = useAppStore((s) => s.setLeftZoneWidth);
  const setRightZoneWidth = useAppStore((s) => s.setRightZoneWidth);
  const layoutRef = useRef<HTMLDivElement>(null);

  const hasLeft = dockLayout.left.length > 0;
  const hasRight = dockLayout.right.length > 0;
  const hasBottom = dockLayout.bottom.length > 0 && dockLayout.bottomVisible;

  // Zone divider drag handlers
  const handleLeftDividerStart = useCallback(
    (e: React.MouseEvent) => {
      e.preventDefault();
      e.stopPropagation();
      const startX = e.clientX;
      const startWidth = leftZoneWidth;

      const handleMove = (ev: MouseEvent) => {
        const delta = ev.clientX - startX;
        setLeftZoneWidth(startWidth + delta);
      };

      const handleUp = () => {
        window.removeEventListener("mousemove", handleMove);
        window.removeEventListener("mouseup", handleUp);
        document.body.classList.remove("zone-resizing");
      };

      document.body.classList.add("zone-resizing");
      window.addEventListener("mousemove", handleMove);
      window.addEventListener("mouseup", handleUp);
    },
    [leftZoneWidth, setLeftZoneWidth]
  );

  const handleRightDividerStart = useCallback(
    (e: React.MouseEvent) => {
      e.preventDefault();
      e.stopPropagation();
      const startX = e.clientX;
      const startWidth = rightZoneWidth;

      const handleMove = (ev: MouseEvent) => {
        // Dragging left shrinks right zone, dragging right grows it
        const delta = startX - ev.clientX;
        setRightZoneWidth(startWidth + delta);
      };

      const handleUp = () => {
        window.removeEventListener("mousemove", handleMove);
        window.removeEventListener("mouseup", handleUp);
        document.body.classList.remove("zone-resizing");
      };

      document.body.classList.add("zone-resizing");
      window.addEventListener("mousemove", handleMove);
      window.addEventListener("mouseup", handleUp);
    },
    [rightZoneWidth, setRightZoneWidth]
  );

  return (
    <div
      ref={layoutRef}
      className="dock-layout flex flex-row h-full w-full min-h-0 overflow-hidden"
      style={{ ["--panel-opacity" as string]: panelOpacity }}
    >
      {/* Panel Rail — available panels */}
      <PanelRail />

      {/* Left dock zone */}
      {hasLeft && (
        <>
          <div
            className="dock-zone-wrapper dock-zone-left-wrapper h-full border-r border-outline/20 overflow-hidden flex-shrink-0"
            style={{ width: leftZoneWidth }}
          >
            <DockZoneComponent zone="left" side="vertical" />
          </div>
          {/* Zone divider between left and center */}
          <div
            className="zone-divider zone-divider-vertical w-1 flex-shrink-0 cursor-ew-resize bg-outline/10 hover:bg-accent-teal/40 transition-colors relative group"
            onMouseDown={handleLeftDividerStart}
            data-testid="zone-divider-left"
          >
            <div className="absolute inset-y-0 -left-1 -right-1 z-10" />
          </div>
        </>
      )}

      {/* Center — Preview + Timeline (always visible) */}
      <div className="dock-center flex flex-col flex-1 min-w-0 min-h-0 overflow-hidden">
        <div className="flex-1 min-h-0 overflow-hidden flex flex-col">
          <PreviewViewport isDropTarget={isDropTarget} />
        </div>
        <Timeline />
      </div>

      {/* Right dock zone */}
      {hasRight && (
        <>
          {/* Zone divider between center and right */}
          <div
            className="zone-divider zone-divider-vertical w-1 flex-shrink-0 cursor-ew-resize bg-outline/10 hover:bg-accent-teal/40 transition-colors relative group"
            onMouseDown={handleRightDividerStart}
            data-testid="zone-divider-right"
          >
            <div className="absolute inset-y-0 -left-1 -right-1 z-10" />
          </div>
          <div
            className="dock-zone-wrapper dock-zone-right-wrapper h-full border-l border-outline/20 overflow-hidden flex-shrink-0"
            style={{ width: rightZoneWidth }}
          >
            <DockZoneComponent zone="right" side="vertical" />
          </div>
        </>
      )}

      {/* Bottom dock zone (toggleable) */}
      {hasBottom && (
        <div className="dock-zone-wrapper dock-zone-bottom-wrapper absolute bottom-0 left-0 right-0 h-[200px] border-t border-outline/20 bg-surface/60 backdrop-blur-xl z-[100]">
          <DockZoneComponent zone="bottom" side="horizontal" />
        </div>
      )}

      {/* Floating windows */}
      {floatingWindows.map((win) => (
        <FloatingWindowComponent key={win.id} win={win} />
      ))}
    </div>
  );
}
