import { getPanelMeta } from "./panelRegistry";

export interface ExternalDragTarget {
  json: { type: "tab"; id: string; component: string; name: string };
}

/**
 * Pure decision logic for flexlayout's `onExternalDrag`, split out of
 * DockLayout.tsx so it can be unit-tested without simulating flexlayout's
 * internal drag machinery (which needs a live `Model` and real DOM drag
 * events neither jsdom nor a component test can easily produce).
 *
 * Returns undefined to reject the drag -- for an id that isn't currently
 * being dragged from the rail, isn't a registered panel, or is already
 * docked (which would otherwise create a duplicate tab).
 */
export function resolveExternalDrag(
  draggedPanelId: string | null,
  dockedComponentIds: ReadonlySet<string>
): ExternalDragTarget | undefined {
  if (!draggedPanelId) return undefined;
  if (dockedComponentIds.has(draggedPanelId)) return undefined;

  const panelMeta = getPanelMeta(draggedPanelId);
  if (!panelMeta) return undefined;

  return {
    json: { type: "tab", id: draggedPanelId, component: draggedPanelId, name: panelMeta.label },
  };
}
