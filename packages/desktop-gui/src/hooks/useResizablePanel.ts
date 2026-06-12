import { useState, useCallback, useEffect, useRef } from "react";

interface ResizablePanelState {
  width: number;
  collapsed: boolean;
}

const STORAGE_KEY_LEFT = "moshdither_panel_left";
const STORAGE_KEY_RIGHT = "moshdither_panel_right";
const DEFAULT_LEFT_WIDTH = 280;
const DEFAULT_RIGHT_WIDTH = 320;
const MIN_WIDTH = 240;
const MAX_WIDTH = 520;
const COLLAPSE_THRESHOLD = 160;

function loadState(key: string, defaultWidth: number): ResizablePanelState {
  try {
    const raw = localStorage.getItem(key);
    if (raw) {
      const parsed = JSON.parse(raw) as ResizablePanelState;
      if (
        typeof parsed.width === "number" &&
        typeof parsed.collapsed === "boolean"
      ) {
        return {
          width: Math.max(MIN_WIDTH, Math.min(MAX_WIDTH, parsed.width)),
          collapsed: parsed.collapsed,
        };
      }
    }
  } catch {
    /* ignore corrupt storage */
  }
  return { width: defaultWidth, collapsed: false };
}

function saveState(key: string, state: ResizablePanelState) {
  try {
    localStorage.setItem(key, JSON.stringify(state));
  } catch {
    /* ignore quota exceeded */
  }
}

export function useResizablePanel(side: "left" | "right") {
  const storageKey = side === "left" ? STORAGE_KEY_LEFT : STORAGE_KEY_RIGHT;
  const defaultWidth =
    side === "left" ? DEFAULT_LEFT_WIDTH : DEFAULT_RIGHT_WIDTH;
  const [state, setState] = useState<ResizablePanelState>(() =>
    loadState(storageKey, defaultWidth),
  );
  const [isDragging, setIsDragging] = useState(false);
  const startX = useRef(0);
  const startWidth = useRef(0);

  const setWidth = useCallback(
    (width: number) => {
      const clamped = Math.max(MIN_WIDTH, Math.min(MAX_WIDTH, width));
      setState((prev) => {
        const next = { ...prev, width: clamped, collapsed: false };
        saveState(storageKey, next);
        return next;
      });
    },
    [storageKey],
  );

  const toggleCollapse = useCallback(() => {
    setState((prev) => {
      const next = { ...prev, collapsed: !prev.collapsed };
      saveState(storageKey, next);
      return next;
    });
  }, [storageKey]);

  const onMouseDown = useCallback(
    (e: React.MouseEvent) => {
      e.preventDefault();
      setIsDragging(true);
      startX.current = e.clientX;
      startWidth.current = state.width;
      document.body.style.cursor = side === "left" ? "e-resize" : "w-resize";
      document.body.style.userSelect = "none";
    },
    [side, state.width],
  );

  useEffect(() => {
    if (!isDragging) return;

    const onMouseMove = (e: MouseEvent) => {
      const delta =
        side === "left"
          ? e.clientX - startX.current
          : startX.current - e.clientX;
      const newWidth = startWidth.current + delta;
      if (newWidth < COLLAPSE_THRESHOLD) {
        setState((prev) => {
          const next = { ...prev, collapsed: true };
          saveState(storageKey, next);
          return next;
        });
        setIsDragging(false);
        document.body.style.cursor = "";
        document.body.style.userSelect = "";
      } else {
        const clamped = Math.max(MIN_WIDTH, Math.min(MAX_WIDTH, newWidth));
        setState((prev) => ({ ...prev, width: clamped, collapsed: false }));
      }
    };

    const onMouseUp = () => {
      setIsDragging(false);
      document.body.style.cursor = "";
      document.body.style.userSelect = "";
      setState((prev) => {
        saveState(storageKey, prev);
        return prev;
      });
    };

    window.addEventListener("mousemove", onMouseMove);
    window.addEventListener("mouseup", onMouseUp);
    return () => {
      window.removeEventListener("mousemove", onMouseMove);
      window.removeEventListener("mouseup", onMouseUp);
    };
  }, [isDragging, side, storageKey]);

  return {
    width: state.collapsed ? 48 : state.width,
    collapsed: state.collapsed,
    isDragging,
    setWidth,
    toggleCollapse,
    onMouseDown,
  };
}
