import { useDock } from "./DockContext";
import { PANEL_REGISTRY } from "./panelRegistry";
import { useAppStore } from "../../store";
import { setActiveDragPanelId } from "./tabDropState";

export default function PanelRail() {
  const { addPanel, removePanel } = useDock();
  const panelVisibility = useAppStore((s) => s.panelVisibility);

  // Read what is docked from the STORE, not by walking the model here.
  //
  // flexlayout mutates its model in place, so `model` keeps the same identity
  // when a panel is added and nothing tells this component to re-render. The
  // walk therefore produced a snapshot taken at the last render and never
  // refreshed. DockLayout's onModelChange keeps dockedPanels current, and
  // subscribing to it makes this reactive.
  const dockedPanels = useAppStore((s) => s.dockedPanels);
  const dockedIds = new Set<string>(dockedPanels);

  // The rail is a permanent panel-toggle bar: every registered panel gets a
  // slot, lit = docked. It no longer vanishes once the layout fills up --
  // panelVisibility (the View menu) still gates which panels appear at all.
  const panels = PANEL_REGISTRY.filter(
    (p) => panelVisibility[p.id] !== false
  );

  if (panels.length === 0) return null;

  return (
    <div
      className="dock-rail flex flex-col items-center gap-1 py-2 px-1 border-r border-outline/20 bg-surface/40"
      data-testid="panel-rail"
      role="toolbar"
      aria-label="Panels"
      aria-orientation="vertical"
    >
      {panels.map((panel) => {
        const docked = dockedIds.has(panel.id);
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
              if (docked) removePanel(panel.id);
              else addPanel(panel.id);
            }}
            className={`dock-rail-btn group relative flex flex-col items-center justify-center w-12 h-12 rounded-lg transition-colors cursor-grab active:cursor-grabbing ${
              docked ? "dock-rail-active" : "hover:bg-surface-container"
            }`}
            title={docked ? `Hide ${panel.label}` : `Show ${panel.label}`}
            aria-label={`${docked ? "Hide" : "Show"} ${panel.label} panel`}
            aria-pressed={docked}
          >
            <span
              className={`material-symbols-outlined transition-colors ${
                docked ? "text-accent-pink" : "text-on-surface-variant group-hover:text-on-surface"
              }`}
              style={{ fontSize: 20 }}
            >
              {panel.icon}
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
