// Module-level flag: set true when any dock drop handler processes a drop.
// Prevents tear-off from firing after a successful dock drop.
let tabDropHandled = false;
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
