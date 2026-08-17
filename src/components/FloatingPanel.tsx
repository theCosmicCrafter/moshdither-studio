import { useRef, useState, useEffect, type ReactNode } from "react";

interface FloatingPanelProps {
  id: string;
  title: string;
  defaultX: number;
  defaultY: number;
  defaultWidth: number;
  defaultHeight: number;
  minWidth?: number;
  minHeight?: number;
  children: ReactNode;
  onActivate?: (id: string) => void;
  onClose?: (id: string) => void;
  zIndex?: number;
  className?: string;
  /** Height of the collapsed header when minimized (px). */
  headerHeight?: number;
}

export default function FloatingPanel({
  id,
  title,
  defaultX,
  defaultY,
  defaultWidth,
  defaultHeight,
  minWidth = 200,
  minHeight = 120,
  children,
  onActivate,
  onClose,
  zIndex = 1,
  className = "",
  headerHeight = 28,
}: FloatingPanelProps) {
  const [x, setX] = useState(defaultX);
  const [y, setY] = useState(defaultY);
  const [width, setWidth] = useState(defaultWidth);
  const [height, setHeight] = useState(defaultHeight);
  const [restoredHeight, setRestoredHeight] = useState(defaultHeight);
  const [minimized, setMinimized] = useState(false);
  const [dragging, setDragging] = useState(false);
  const [resizing, setResizing] = useState(false);
  const dragOffset = useRef({ x: 0, y: 0 });
  const resizeStart = useRef({ x: 0, y: 0, width: 0, height: 0 });
  const panelRef = useRef<HTMLDivElement>(null);

  const handleMinimize = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (!minimized) {
      setRestoredHeight(Math.max(height, minHeight));
    } else {
      setHeight(restoredHeight);
    }
    setMinimized((prev) => !prev);
    onActivate?.(id);
  };

  const handleDragStart = (e: React.MouseEvent) => {
    e.preventDefault();
    setDragging(true);
    dragOffset.current = { x: e.clientX - x, y: e.clientY - y };
    onActivate?.(id);
  };

  const handleResizeStart = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setResizing(true);
    resizeStart.current = { x: e.clientX, y: e.clientY, width, height };
    onActivate?.(id);
  };

  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      if (dragging) {
        const parent = panelRef.current?.parentElement?.getBoundingClientRect();
        const parentW = parent?.width ?? window.innerWidth;
        const parentH = parent?.height ?? window.innerHeight;
        let nextX = e.clientX - dragOffset.current.x;
        let nextY = e.clientY - dragOffset.current.y;
        nextX = Math.max(0, Math.min(nextX, parentW - width));
        nextY = Math.max(0, Math.min(nextY, parentH - 32));
        setX(nextX);
        setY(nextY);
      }
      if (resizing) {
        const dx = e.clientX - resizeStart.current.x;
        const dy = e.clientY - resizeStart.current.y;
        setWidth(Math.max(minWidth, resizeStart.current.width + dx));
        setHeight(Math.max(minHeight, resizeStart.current.height + dy));
      }
    };
    const handleMouseUp = () => {
      setDragging(false);
      setResizing(false);
    };
    if (dragging || resizing) {
      window.addEventListener("mousemove", handleMouseMove);
      window.addEventListener("mouseup", handleMouseUp);
    }
    return () => {
      window.removeEventListener("mousemove", handleMouseMove);
      window.removeEventListener("mouseup", handleMouseUp);
    };
  }, [dragging, resizing, width, minWidth, minHeight, height]);

  const displayHeight = minimized ? headerHeight : height;

  return (
    <div
      ref={panelRef}
      className={`absolute flex flex-col rounded-lg overflow-hidden border border-outline/20 neo-flat bg-surface/75 backdrop-blur-xl ${className}`}
      style={{
        left: x,
        top: y,
        width,
        height: displayHeight,
        zIndex,
      }}
      onMouseDown={() => onActivate?.(id)}
    >
      <div
        className="h-7 flex items-center justify-between px-3 select-none cursor-grab active:cursor-grabbing border-b border-outline-variant/20 bg-surface/50"
        onMouseDown={handleDragStart}
      >
        <span className="text-dense-sm font-semibold text-on-surface-variant uppercase tracking-wider">{title}</span>
        <div className="flex items-center gap-1">
          <button
            onClick={handleMinimize}
            className="material-symbols-outlined text-on-surface-variant hover:text-accent-teal transition-colors cursor-pointer"
            style={{ fontSize: 14 }}
            title={minimized ? "Restore" : "Minimize"}
            aria-label={minimized ? "Restore panel" : "Minimize panel"}
          >
            {minimized ? "expand" : "remove"}
          </button>
          {onClose && (
            <button
              onClick={(e) => {
                e.stopPropagation();
                onClose(id);
              }}
              className="material-symbols-outlined text-on-surface-variant hover:text-accent-pink transition-colors cursor-pointer"
              style={{ fontSize: 14 }}
              title="Close"
              aria-label="Close panel"
            >
              close
            </button>
          )}
          <div className="w-2 h-2 rounded-full bg-accent-pink/60" />
          <div className="w-2 h-2 rounded-full bg-accent-gold/60" />
          <div className="w-2 h-2 rounded-full bg-accent-teal/60" />
        </div>
      </div>
      {!minimized && <div className="flex-1 overflow-hidden relative">{children}</div>}
      {!minimized && (
        <div
          className="absolute bottom-0 right-0 w-4 h-4 cursor-nwse-resize z-50"
          onMouseDown={handleResizeStart}
          style={{
            background: "linear-gradient(135deg, transparent 50%, var(--outline-variant) 50%)",
            borderBottomRightRadius: 6,
            opacity: 0.6,
          }}
          title="Resize"
        />
      )}
    </div>
  );
}
