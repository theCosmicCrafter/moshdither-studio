// Module-level (not React state) because the value must be readable
// synchronously inside flexlayout's `onExternalDrag`, which fires on
// `dragenter` -- `DataTransfer.getData()` is unreliable at that point in most
// browsers/webviews (only `dragstart` and `drop` are guaranteed to expose it),
// so PanelRail records the dragged panel id here instead of relying on it.
let activeDragPanelId: string | null = null;

export function setActiveDragPanelId(id: string | null) {
  activeDragPanelId = id;
}

export function getActiveDragPanelId(): string | null {
  return activeDragPanelId;
}
