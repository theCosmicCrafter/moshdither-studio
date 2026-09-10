import { useEffect, useLayoutEffect, useRef, useState } from "react";

export interface StackContextMenuItem {
  readonly label: string;
  /** Material Symbols glyph name. Must exist in the subsetted font. */
  readonly icon: string;
  readonly onSelect: () => void;
  readonly disabled?: boolean;
  /** Renders a divider above this item. */
  readonly separatorBefore?: boolean;
  readonly shortcut?: string;
}

/**
 * Right-click menu for an effect-stack entry.
 *
 * Rendered fixed at the pointer rather than inside the row: the stack list
 * scrolls and clips its overflow, so an absolutely-positioned menu on the last
 * visible row would be cut off.
 */
export default function StackContextMenu({
  x,
  y,
  items,
  onClose,
}: {
  readonly x: number;
  readonly y: number;
  readonly items: readonly StackContextMenuItem[];
  readonly onClose: () => void;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState({ x, y });

  // Flip back inside the viewport when opened near an edge, measured after
  // layout so the real size is known rather than assumed.
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const { width, height } = el.getBoundingClientRect();
    const margin = 8;
    setPos({
      x: Math.min(x, window.innerWidth - width - margin),
      y: Math.min(y, window.innerHeight - height - margin),
    });
  }, [x, y]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    // Capture phase: a row's own click handler would otherwise select an entry
    // on the same click that dismisses the menu.
    const onPointer = (e: PointerEvent) => {
      if (!ref.current?.contains(e.target as Node)) onClose();
    };
    window.addEventListener("keydown", onKey);
    window.addEventListener("pointerdown", onPointer, true);
    window.addEventListener("resize", onClose);
    return () => {
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("pointerdown", onPointer, true);
      window.removeEventListener("resize", onClose);
    };
  }, [onClose]);

  return (
    <div
      ref={ref}
      role="menu"
      aria-label="Effect actions"
      className="fixed z-[400] min-w-[190px] py-1 rounded-lg neo-panel bg-surface/95 border border-outline/30 shadow-2xl"
      style={{ left: pos.x, top: pos.y }}
    >
      {items.map((item) => (
        <div key={item.label}>
          {item.separatorBefore && <div className="my-1 border-t border-outline/10" />}
          <button
            role="menuitem"
            disabled={item.disabled}
            onClick={() => {
              if (item.disabled) return;
              item.onSelect();
              onClose();
            }}
            className={`w-full flex items-center gap-2 px-3 py-1.5 font-label-md text-label-md text-left transition-colors ${
              item.disabled
                ? "text-on-surface-variant/40 cursor-not-allowed"
                : "text-on-surface hover:bg-accent-teal/10"
            }`}
          >
            <span className="material-symbols-outlined" style={{ fontSize: 16 }} aria-hidden="true">
              {item.icon}
            </span>
            <span className="flex-1">{item.label}</span>
            {item.shortcut && (
              <span className="font-code-sm text-code-sm text-on-surface-variant/60">
                {item.shortcut}
              </span>
            )}
          </button>
        </div>
      ))}
    </div>
  );
}
