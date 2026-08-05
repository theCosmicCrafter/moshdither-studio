import { useEffect, useRef } from "react";
import { getCurrentWindow, currentMonitor } from "@tauri-apps/api/window";
import { useAppStore } from "../store";
import { snapToEdge } from "../lib/tauri";
import { isTauriAvailable } from "../lib/browserFallback";

/** Distance in physical pixels from a screen edge to trigger snapping. */
const SNAP_THRESHOLD = 30;

/**
 * useWindowEdgeSnap — Listens for window move events and snaps the window
 * to the nearest display edge when within SNAP_THRESHOLD pixels.
 *
 * Respects the `edgeSnapEnabled` store toggle and does nothing when the
 * AppBar is active (since the window is already docked).
 */
export function useWindowEdgeSnap(): void {
  const edgeSnapEnabled = useAppStore((s) => s.edgeSnapEnabled);
  const appBarDocked = useAppStore((s) => s.appBarDocked);
  const isSnapping = useRef(false);

  useEffect(() => {
    // Guard: only run inside Tauri, only when enabled, not when AppBar-docked
    if (!isTauriAvailable() || !edgeSnapEnabled || appBarDocked) return;

    let unlisten: (() => void) | undefined;

    const setup = async () => {
      try {
        const appWindow = getCurrentWindow();
        const unlistenFn = await appWindow.onMoved(async ({ payload: position }) => {
          // Prevent re-entrant snapping (the snap itself triggers another move)
          if (isSnapping.current) return;

          try {
            const monitor = await currentMonitor();
            if (!monitor) return;

            const windowSize = await appWindow.outerSize();
            const screenWidth = monitor.size.width;
            const screenHeight = monitor.size.height;
            const monitorX = monitor.position.x;
            const monitorY = monitor.position.y;

            // Compute distances from each edge
            const distLeft = position.x - monitorX;
            const distRight =
              monitorX + screenWidth - (position.x + windowSize.width);
            const distTop = position.y - monitorY;
            const distBottom =
              monitorY + screenHeight - (position.y + windowSize.height);

            let snapEdge: string | null = null;

            if (distLeft >= 0 && distLeft <= SNAP_THRESHOLD) {
              snapEdge = "left";
            } else if (distRight >= 0 && distRight <= SNAP_THRESHOLD) {
              snapEdge = "right";
            } else if (distTop >= 0 && distTop <= SNAP_THRESHOLD) {
              snapEdge = "top";
            } else if (distBottom >= 0 && distBottom <= SNAP_THRESHOLD) {
              snapEdge = "bottom";
            }

            if (snapEdge) {
              isSnapping.current = true;
              await snapToEdge(snapEdge);
              // Small delay to let the move event from our snap settle
              setTimeout(() => {
                isSnapping.current = false;
              }, 150);
            }
          } catch {
            // Silently ignore — non-critical UI feature
          }
        });

        unlisten = unlistenFn;
      } catch {
        // Running outside Tauri or API unavailable
      }
    };

    setup();

    return () => {
      if (unlisten) unlisten();
    };
  }, [edgeSnapEnabled, appBarDocked]);
}
