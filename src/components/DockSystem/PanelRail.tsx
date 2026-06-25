import { useAppStore } from "../../store";
import { PANEL_REGISTRY, type DockZone } from "./panelRegistry";

export default function PanelRail() {
  const dockLayout = useAppStore((s) => s.dockLayout);
  const addPanelToDock = useAppStore((s) => s.addPanelToDock);
  const panelVisibility = useAppStore((s) => s.panelVisibility);
  const floatingWindows = useAppStore((s) => s.floatingWindows);

  const dockedIds = new Set<string>();
  for (const z of ["left", "right", "bottom"] as DockZone[]) {
    for (const g of dockLayout[z]) {
      for (const p of g.panels) dockedIds.add(p);
    }
  }
  for (const w of floatingWindows) dockedIds.add(w.panelId);

  const availablePanels = PANEL_REGISTRY.filter(
    (p) => !dockedIds.has(p.id) && panelVisibility[p.id] !== false
  );

  if (availablePanels.length === 0) return null;

  return (
    <div
      className="dock-rail flex flex-col items-center gap-1 py-2 px-1 border-r border-outline/20 bg-surface/40 backdrop-blur-sm"
      data-testid="panel-rail"
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
            }}
            onClick={() => {
              addPanelToDock(panel.id, panel.defaultZone);
            }}
            className="dock-rail-btn group relative flex flex-col items-center justify-center w-12 h-12 rounded-lg hover:bg-accent-teal/10 transition-colors cursor-grab active:cursor-grabbing"
            title={`Add ${panel.label} to ${panel.defaultZone}`}
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
            <span className="absolute left-full ml-2 px-2 py-0.5 rounded bg-surface/90 text-[10px] text-on-surface whitespace-nowrap opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none z-[200] border border-outline/20">
              {panel.label}
            </span>
          </button>
        );
      })}
    </div>
  );
}
