let tabDropHandled = false;
let activeDragPanelId: string | null = null;
let activeDragGroupId: string | null = null;
let activeDragFloatId: string | null = null;

export function markTabDropHandled() {
  tabDropHandled = true;
}

export function consumeTabDropHandled() {
  const v = tabDropHandled;
  tabDropHandled = false;
  return v;
}

export function resetTabDropHandled() {
  tabDropHandled = false;
}

export function setActiveDragPanelId(id: string | null) {
  activeDragPanelId = id;
}

export function getActiveDragPanelId(): string | null {
  return activeDragPanelId;
}

export function setActiveDragGroupId(id: string | null) {
  activeDragGroupId = id;
}

export function getActiveDragGroupId(): string | null {
  return activeDragGroupId;
}

export function setActiveDragFloatId(id: string | null) {
  activeDragFloatId = id;
}

export function getActiveDragFloatId(): string | null {
  return activeDragFloatId;
}
