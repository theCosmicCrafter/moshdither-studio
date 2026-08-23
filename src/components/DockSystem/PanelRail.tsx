import { useDock } from "./DockContext";
import { PANEL_REGISTRY, type DockZone } from "./panelRegistry";
import { useAppStore } from "../../store";
import { setActiveDragPanelId } from "./tabDropState";

export default function PanelRail() {
  const { addPanel } = useDock();
  const panelVisibility = useAppStore((s) => s.panelVisibility);

  // Read what is docked from the STORE, not by walking the model here.
  //
  // flexlayout mutates its model in place, so `model` keeps the same identity
  // when a panel is added and nothing tells this component to re-render. The
  // walk therefore produced a snapshot taken at the last render and never
  // refreshed: after docking a panel from the rail, the rail went on offering
  // it, and clicking again was a no-op because addPanel saw it already present.
  // DockLayout's onModelChange keeps dockedPanels current, and subscribing to
  // it makes this reactive.
  const dockedPanels = useAppStore((s) => s.dockedPanels);
  const dockedIds = new Set<string>(dockedPanels);

  const availablePanels = PANEL_REGISTRY.filter(
    (p) => !dockedIds.has(p.id) && panelVisibility[p.id] !== false
  );

  if (availablePanels.length === 0) return null;

  return (
    <div
      className="dock-rail flex flex-col items-center gap-1 py-2 px-1 border-r border-outline/20 bg-surface/40 backdrop-blur-sm"
      data-testid="panel-rail"
      role="toolbar"
      aria-label="Available panels"
      aria-orientation="vertical"
    >
      {availablePanels.map((panel) => {
        const zoneIndicators: Record<DockZone, string> = {
          right: "arrow_right_alt",
          left: "arrow_left_alt",
          bottom: "arrow_downward",
        };
        const zoneColors: Record<DockZone, string> = {
          right: "text-accent-teal",
          left: "text-accent-gold",
          bottom: "text-accent-pink",
        };
        const zoneIndicator = zoneIndicators[panel.defaultZone];
        const zoneColor = zoneColors[panel.defaultZone];
        return (
          <button
            key={panel.id}
            draggable
            onDragStart={(e) => {
              e.dataTransfer.setData("text/panel-id", panel.id);
              e.dataTransfer.effectAllowed = "move";
              setActiveDragPanelId(panel.id);
            }}
            onDragEnd={() => {
              // Fires whether or not a drop was accepted; clears the id so a
              // later, unrelated drag over the layout can't be mistaken for
              // this one.
              setActiveDragPanelId(null);
            }}
            onClick={() => {
              addPanel(panel.id);
            }}
            className="dock-rail-btn group relative flex flex-col items-center justify-center w-12 h-12 rounded-lg hover:bg-accent-teal/10 transition-colors cursor-grab active:cursor-grabbing"
            title={`Add ${panel.label} to ${panel.defaultZone}`}
            aria-label={`Add ${panel.label} panel to ${panel.defaultZone} dock`}
          >
            <span
              className="material-symbols-outlined text-on-surface-variant group-hover:text-accent-teal transition-colors"
              style={{ fontSize: 20 }}
            >
              {panel.icon}
            </span>
            {/* Directional dock indicator */}
            <span
              className={`material-symbols-outlined absolute ${zoneColor} opacity-50 group-hover:opacity-100 transition-opacity`}
              style={{ fontSize: 9, bottom: 1, right: 1 }}
            >
              {zoneIndicator}
            </span>
            <span className="absolute left-full ml-2 px-2 py-0.5 rounded bg-surface/90 font-label-sm text-label-sm text-on-surface whitespace-nowrap opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none z-[200] border border-outline/20">
              {panel.label}
            </span>
          </button>
        );
      })}
    </div>
  );
}
