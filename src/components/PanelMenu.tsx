import { useState, useRef, useEffect } from "react";
import { useAppStore } from "../store";
import { PANEL_REGISTRY } from "./DockSystem/panelRegistry";

export default function PanelMenu() {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const dockLayout = useAppStore((s) => s.dockLayout);
  const addPanelToDock = useAppStore((s) => s.addPanelToDock);
  const removePanelFromDock = useAppStore((s) => s.removePanelFromDock);

  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    window.addEventListener("mousedown", handler);
    return () => window.removeEventListener("mousedown", handler);
  }, [open]);

  const dockedIds = new Set<string>();
  for (const z of ["left", "right", "bottom"] as const) {
    for (const g of dockLayout[z]) {
      for (const p of g.panels) dockedIds.add(p);
    }
  }

  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => setOpen((v) => !v)}
        className="font-label-md text-label-md text-primary hover:text-accent-teal transition-colors active:scale-95 duration-100 flex items-center gap-1"
        title="Toggle panels"
      >
        <span className="material-symbols-outlined" style={{ fontSize: 18 }}>
          view_sidebar
        </span>
        <span className="text-[10px] text-on-surface-variant">{dockedIds.size}/{PANEL_REGISTRY.length}</span>
      </button>
      {open && (
        <div className="absolute right-0 top-full mt-1 z-[200] min-w-[180px] neo-flat rounded-lg bg-surface/90 backdrop-blur-xl border border-outline/20 py-1 shadow-xl">
          <div className="px-3 py-1.5 text-[10px] font-semibold text-on-surface-variant uppercase tracking-wider border-b border-outline/10">
            Panels
          </div>
          {PANEL_REGISTRY.map((p) => {
            const isDocked = dockedIds.has(p.id);
            return (
              <button
                key={p.id}
                onClick={() => {
                  if (isDocked) {
                    removePanelFromDock(p.id);
                  } else {
                    addPanelToDock(p.id, p.defaultZone);
                  }
                }}
                className="w-full flex items-center justify-between px-3 py-1.5 text-[12px] text-on-surface hover:bg-accent-teal/10 transition-colors"
              >
                <span className="flex items-center gap-1.5">
                  <span className="material-symbols-outlined" style={{ fontSize: 12 }}>{p.icon}</span>
                  {p.label}
                </span>
                <span
                  className="material-symbols-outlined"
                  style={{ fontSize: 14, opacity: isDocked ? 1 : 0.3 }}
                >
                  {isDocked ? "check_box" : "check_box_outline_blank"}
                </span>
              </button>
            );
          })}
          <div className="border-t border-outline/10 mt-1 pt-1 flex gap-2 px-3">
            <button
              onClick={() => {
                PANEL_REGISTRY.forEach((p) => {
                  if (!dockedIds.has(p.id)) {
                    useAppStore.getState().addPanelToDock(p.id, p.defaultZone);
                  }
                });
              }}
              className="text-[10px] text-on-surface-variant hover:text-accent-teal transition-colors"
            >
              Show All
            </button>
            <button
              onClick={() => {
                PANEL_REGISTRY.forEach((p) => {
                  useAppStore.getState().removePanelFromDock(p.id);
                });
              }}
              className="text-[10px] text-on-surface-variant hover:text-accent-pink transition-colors"
            >
              Hide All
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
