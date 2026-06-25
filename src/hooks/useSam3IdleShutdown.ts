import { useEffect, useRef } from "react";
import { useAppStore } from "../store";
import { sam3Shutdown } from "../lib/tauri";

const IDLE_TIMEOUT_MS = 5 * 60 * 1000; // 5 minutes
const CHECK_INTERVAL_MS = 30 * 1000; // 30 seconds

/**
 * useSam3IdleShutdown — Automatically shuts down the SAM3 Python process
 * after 5 minutes of inactivity to reclaim ~6GB of RAM.
 *
 * Activity is tracked by watching SAM3-related state changes (masks, hover
 * mask, frame masks, mode, clicking). Any change resets the idle timer.
 */
export function useSam3IdleShutdown() {
  const sam3Ready = useAppStore((s) => s.sam3Ready);
  const sam3Masks = useAppStore((s) => s.sam3Masks);
  const sam3HoverMask = useAppStore((s) => s.sam3HoverMask);
  const sam3FrameMasks = useAppStore((s) => s.sam3FrameMasks);
  const sam3Mode = useAppStore((s) => s.sam3Mode);
  const sam3Clicking = useAppStore((s) => s.sam3Clicking);
  const setSam3Ready = useAppStore((s) => s.setSam3Ready);
  const setStatusMessage = useAppStore((s) => s.setStatusMessage);

  const lastActivityRef = useRef<number>(Date.now());
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Reset idle timer on any SAM3 state change
  useEffect(() => {
    if (sam3Ready) {
      lastActivityRef.current = Date.now();
    }
  }, [sam3Ready, sam3Masks, sam3HoverMask, sam3FrameMasks, sam3Mode, sam3Clicking]);

  // Periodic check for idle timeout
  useEffect(() => {
    if (!sam3Ready) {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
      return;
    }

    intervalRef.current = setInterval(async () => {
      const elapsed = Date.now() - lastActivityRef.current;
      if (elapsed >= IDLE_TIMEOUT_MS) {
        try {
          await sam3Shutdown();
          setSam3Ready(false);
          setStatusMessage("SAM3 shut down after idle (RAM reclaimed)");
        } catch (e) {
          console.warn("SAM3 idle shutdown failed:", e);
        }
      }
    }, CHECK_INTERVAL_MS);

    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
    };
  }, [sam3Ready, setSam3Ready, setStatusMessage]);
}
