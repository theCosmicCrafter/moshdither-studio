import { Suspense, useRef, useState, type DragEvent } from "react";
import { useAppStore, type DockTabGroup, type DropPosition } from "../../store";
import { getPanelMeta, type DockZone } from "./panelRegistry";

import { markTabDropHandled, consumeTabDropHandled, resetTabDropHandled } from "./tabDropState";

interface TabGroupProps {
  group: DockTabGroup;
  zone: DockZone;
}

function computeDropPosition(e: DragEvent, rect: DOMRect): DropPosition {
  const x = (e.clientX - rect.left) / rect.width;
  const y = (e.clientY - rect.top) / rect.height;
  const distLeft = x;
  const distRight = 1 - x;
  const distTop = y;
  const distBottom = 1 - y;
  const min = Math.min(distLeft, distRight, distTop, distBottom);
  // Center threshold: if in the middle 40% x 40%, treat as center
  if (x > 0.3 && x < 0.7 && y > 0.3 && y < 0.7) return "center";
  if (min === distTop) return "top";
  if (min === distBottom) return "bottom";
  if (min === distLeft) return "left";
  return "right";
}

const DROP_INDICATORS: Record<DropPosition, { className: string; label: string }> = {
  top: { className: "top-0 left-0 right-0 h-1/2", label: "Split Top" },
  bottom: { className: "bottom-0 left-0 right-0 h-1/2", label: "Split Bottom" },
  left: { className: "top-0 left-0 bottom-0 w-1/2", label: "Split Left" },
  right: { className: "top-0 right-0 bottom-0 w-1/2", label: "Split Right" },
  center: { className: "inset-0", label: "Add to Group" },
};

export default function TabGroupComponent({ group, zone }: TabGroupProps) {
  const setDockActiveTab = useAppStore((s) => s.setDockActiveTab);
  const removePanelFromDock = useAppStore((s) => s.removePanelFromDock);
  const movePanelInDock = useAppStore((s) => s.movePanelInDock);
  const splitDockGroup = useAppStore((s) => s.splitDockGroup);
  const tearOffToFloat = useAppStore((s) => s.tearOffToFloat);
  const tearOffGroupToFloat = useAppStore((s) => s.tearOffGroupToFloat);
  const dockFloatingWindow = useAppStore((s) => s.dockFloatingWindow);
  const dragOverTabId = useRef<string | null>(null);
  const [dropPos, setDropPos] = useState<DropPosition | null>(null);
  const [tabBarActive, setTabBarActive] = useState(false);
  const [insertIndex, setInsertIndex] = useState<number | null>(null);
  const contentRef = useRef<HTMLDivElement>(null);
  const tabBarRef = useRef<HTMLDivElement>(null);

  const activePanel = group.activeTab ?? group.panels[0] ?? null;
  const activeMeta = activePanel ? getPanelMeta(activePanel) : null;

  const handleTabDragStart = (e: DragEvent, panelId: string) => {
    e.dataTransfer.setData("text/panel-id", panelId);
    e.dataTransfer.effectAllowed = "move";
    resetTabDropHandled();
  };

  // Drag the entire group out to floating windows
  const handleGroupDragStart = (e: DragEvent) => {
    e.dataTransfer.setData("text/group-id", group.id);
    e.dataTransfer.effectAllowed = "move";
    resetTabDropHandled();
  };

  const handleGroupDragEnd = (e: DragEvent) => {
    if (consumeTabDropHandled()) return;
    // Dropped outside — tear off the whole group
    tearOffGroupToFloat(group.id, e.clientX - 160, e.clientY - 14, 360, 440);
  };

  // ── Tab bar drop handling (combine tabs into this group) ──

  const handleTabBarDragOver = (e: DragEvent) => {
    // Only handle if dragging a panel (not a floating window — that goes to content)
    const types = e.dataTransfer.types;
    if (!types || !Array.from(types).includes("text/panel-id")) return;
    e.preventDefault();
    e.stopPropagation();
    e.dataTransfer.dropEffect = "move";
    setTabBarActive(true);
    setDropPos(null); // clear content drop indicator

    // Compute which tab we're hovering over for insert indicator
    if (tabBarRef.current) {
      const tabs = Array.from(tabBarRef.current.querySelectorAll<HTMLElement>("[data-tab-id]"));
      let hoverIdx = group.panels.length; // default: end
      for (let i = 0; i < tabs.length; i++) {
        const rect = tabs[i].getBoundingClientRect();
        if (e.clientX < rect.left + rect.width / 2) {
          hoverIdx = i;
          break;
        }
      }
      setInsertIndex(hoverIdx);
    }
  };

  const handleTabBarDragLeave = (e: DragEvent) => {
    const related = e.relatedTarget as Node | null;
    if (tabBarRef.current && related && !tabBarRef.current.contains(related)) {
      setTabBarActive(false);
      setInsertIndex(null);
    }
  };

  const handleTabBarDrop = (e: DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    markTabDropHandled();
    setTabBarActive(false);
    setInsertIndex(null);

    const floatId = e.dataTransfer.getData("text/floating-window-id");
    if (floatId) {
      dockFloatingWindow(floatId, zone, group.id);
      return;
    }

    const draggedId = e.dataTransfer.getData("text/panel-id");
    if (!draggedId) return;

    // Compute insert index from drop position
    let targetIdx = group.panels.length;
    if (tabBarRef.current) {
      const tabs = Array.from(tabBarRef.current.querySelectorAll<HTMLElement>("[data-tab-id]"));
      for (let i = 0; i < tabs.length; i++) {
        const rect = tabs[i].getBoundingClientRect();
        if (e.clientX < rect.left + rect.width / 2) {
          targetIdx = i;
          break;
        }
      }
    }
    // If the dragged tab is already in this group and before the target, adjust index
    const currentIdx = group.panels.indexOf(draggedId);
    if (currentIdx !== -1 && currentIdx < targetIdx) targetIdx--;
    movePanelInDock(draggedId, zone, group.id, targetIdx);
  };

  // ── Individual tab drop (reorder within tab bar) ──

  const handleTabDragOver = (e: DragEvent, panelId: string) => {
    e.preventDefault();
    e.stopPropagation();
    e.dataTransfer.dropEffect = "move";
    dragOverTabId.current = panelId;
    setTabBarActive(true);
    // Compute insert index based on which half of the tab we're over
    const idx = group.panels.indexOf(panelId);
    if (idx !== -1) {
      const tabEl = e.currentTarget as HTMLElement;
      const rect = tabEl.getBoundingClientRect();
      const isLeftHalf = e.clientX < rect.left + rect.width / 2;
      setInsertIndex(isLeftHalf ? idx : idx + 1);
    }
  };

  const handleTabDrop = (e: DragEvent, targetPanelId: string) => {
    e.preventDefault();
    e.stopPropagation();
    markTabDropHandled();
    setTabBarActive(false);
    setInsertIndex(null);
    const draggedId = e.dataTransfer.getData("text/panel-id");
    if (!draggedId || draggedId === targetPanelId) return;
    const targetIdx = group.panels.indexOf(targetPanelId);
    // Adjust if moving from earlier position
    const currentIdx = group.panels.indexOf(draggedId);
    const adjustedIdx = currentIdx !== -1 && currentIdx < targetIdx ? targetIdx - 1 : targetIdx;
    movePanelInDock(draggedId, zone, group.id, adjustedIdx);
    dragOverTabId.current = null;
  };

  // ── Content area drop (split or combine) ──

  const handleContentDragOver = (e: DragEvent) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = "move";
    setTabBarActive(false); // not hovering tab bar
    if (contentRef.current) {
      const rect = contentRef.current.getBoundingClientRect();
      setDropPos(computeDropPosition(e, rect));
    }
  };

  const handleContentDragLeave = (e: DragEvent) => {
    const related = e.relatedTarget as Node | null;
    if (contentRef.current && related && !contentRef.current.contains(related)) {
      setDropPos(null);
    }
  };

  const handleContentDrop = (e: DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDropPos(null);
    markTabDropHandled();
    const floatId = e.dataTransfer.getData("text/floating-window-id");
    if (floatId) {
      if (contentRef.current) {
        const rect = contentRef.current.getBoundingClientRect();
        const pos = computeDropPosition(e, rect);
        dockFloatingWindow(floatId, zone, group.id, pos);
      } else {
        dockFloatingWindow(floatId, zone, group.id);
      }
      return;
    }
    // Group drag onto content — just mark handled, let group drag-end tear off
    if (e.dataTransfer.getData("text/group-id")) return;
    const draggedId = e.dataTransfer.getData("text/panel-id");
    if (!draggedId) return;
    if (contentRef.current) {
      const rect = contentRef.current.getBoundingClientRect();
      const pos = computeDropPosition(e, rect);
      if (pos === "center") {
        movePanelInDock(draggedId, zone, group.id);
      } else {
        splitDockGroup(draggedId, group.id, zone, pos);
      }
      return;
    }
    movePanelInDock(draggedId, zone, group.id);
  };

  // Tear-off: when a tab drag ends, check if it was dropped outside any dock zone
  const handleTabDragEnd = (e: DragEvent, panelId: string) => {
    setTabBarActive(false);
    setInsertIndex(null);
    if (consumeTabDropHandled()) return;
    tearOffToFloat(panelId, e.clientX - 160, e.clientY - 14, 320, 400);
  };

  const PanelComponent = activeMeta?.component;

  return (
    <div
      className="dock-tab-group flex flex-col min-h-0 flex-1 overflow-hidden"
      data-group-id={group.id}
      style={{ flexGrow: group.size, flexShrink: 1, flexBasis: 0 }}
    >
      {/* Tab bar — entire bar is a drop target for combining tabs */}
      <div
        ref={tabBarRef}
        className={`dock-tab-bar flex items-center gap-0 h-7 px-1 border-b border-outline/20 bg-surface/30 select-none overflow-x-auto transition-colors ${
          tabBarActive ? "bg-accent-teal/10 border-b-2 border-b-accent-teal" : ""
        }`}
        onDragOver={handleTabBarDragOver}
        onDragLeave={handleTabBarDragLeave}
        onDrop={handleTabBarDrop}
        data-testid={`dock-tab-bar-${group.id}`}
      >
        {/* Group drag handle — drag this to move the whole group out */}
        <div
          draggable
          onDragStart={handleGroupDragStart}
          onDragEnd={handleGroupDragEnd}
          className="dock-group-grip flex items-center justify-center w-4 h-5 flex-shrink-0 cursor-grab active:cursor-grabbing text-on-surface-variant opacity-30 hover:opacity-70 transition-opacity"
          title="Drag to move this entire group"
        >
          <span className="material-symbols-outlined" style={{ fontSize: 14 }}>drag_indicator</span>
        </div>
        {group.panels.map((panelId, idx) => {
          const meta = getPanelMeta(panelId);
          if (!meta) return null;
          const isActive = panelId === activePanel;
          return (
            <div key={panelId} className="contents">
              {/* Insert indicator before this tab */}
              {insertIndex === idx && tabBarActive && (
                <div className="w-0.5 h-5 bg-accent-teal rounded-full flex-shrink-0 self-center" />
              )}
              <div
                draggable
                onDragStart={(e) => handleTabDragStart(e, panelId)}
                onDragOver={(e) => handleTabDragOver(e, panelId)}
                onDrop={(e) => handleTabDrop(e, panelId)}
                onDragEnd={(e) => handleTabDragEnd(e, panelId)}
                onClick={() => setDockActiveTab(group.id, panelId)}
                className={`dock-tab flex items-center gap-1 px-2 h-6 rounded-t cursor-pointer transition-colors whitespace-nowrap ${
                  isActive
                    ? "bg-surface/60 text-on-surface border-t-2 border-accent-teal"
                    : "text-on-surface-variant hover:text-on-surface hover:bg-surface/30"
                } ${tabBarActive ? "ring-1 ring-accent-teal/30" : ""}`}
                data-testid={`dock-tab-${panelId}`}
                data-tab-id={panelId}
              >
                <span
                  className="material-symbols-outlined"
                  style={{ fontSize: 12 }}
                >
                  {meta.icon}
                </span>
                <span className="text-[10px] font-semibold uppercase tracking-wider">
                  {meta.label}
                </span>
                {group.panels.length > 1 && (
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      removePanelFromDock(panelId);
                    }}
                    className="ml-1 opacity-0 hover:opacity-100 transition-opacity text-on-surface-variant hover:text-accent-pink"
                    title="Remove from dock"
                  >
                    <span
                      className="material-symbols-outlined"
                      style={{ fontSize: 10 }}
                    >
                      close
                    </span>
                  </button>
                )}
              </div>
            </div>
          );
        })}
        {/* Insert indicator at end */}
        {insertIndex === group.panels.length && tabBarActive && (
          <div className="w-0.5 h-5 bg-accent-teal rounded-full flex-shrink-0 self-center" />
        )}
        <div className="flex-1 min-w-[20px]" />
      </div>

      {/* Panel content with drop indicator overlay */}
      <div
        ref={contentRef}
        className="dock-tab-content flex-1 min-h-0 overflow-hidden relative"
        onDragOver={handleContentDragOver}
        onDragLeave={handleContentDragLeave}
        onDrop={handleContentDrop}
      >
        {PanelComponent && (
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
        )}

        {/* Drop indicator overlay */}
        {dropPos && (
          <div className="absolute inset-0 pointer-events-none z-50">
            <div
              className={`absolute ${DROP_INDICATORS[dropPos].className} bg-accent-teal/20 border-2 border-accent-teal/60 rounded transition-all duration-100 flex items-center justify-center`}
            >
              <span className="text-[10px] font-semibold uppercase tracking-wider text-accent-teal bg-surface/80 px-2 py-0.5 rounded">
                {DROP_INDICATORS[dropPos].label}
              </span>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
