import { useState, type ReactNode } from "react";

export interface AccordionItem {
  id: string;
  title: string;
  icon?: string;
  badge?: string | number;
  children: ReactNode;
  defaultExpanded?: boolean;
}

interface AccordionProps {
  items: AccordionItem[];
  /** Allow multiple sections to be open at once. Default false. */
  allowMultiple?: boolean;
  className?: string;
}

export default function Accordion({
  items,
  allowMultiple = false,
  className = "",
}: AccordionProps) {
  const [expanded, setExpanded] = useState<Set<string>>(() => {
    const set = new Set<string>();
    items.forEach((item) => {
      if (item.defaultExpanded) set.add(item.id);
    });
    return set;
  });

  const toggle = (id: string) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        if (!allowMultiple) next.clear();
        next.add(id);
      }
      return next;
    });
  };

  return (
    <div className={`flex flex-col ${className}`}>
      {items.map((item) => {
        const isExpanded = expanded.has(item.id);
        return (
          <div
            key={item.id}
            className="border-b border-outline-variant/20 last:border-b-0"
          >
            <button
              onClick={() => toggle(item.id)}
              className="w-full flex items-center justify-between px-3 py-2 hover:bg-surface/40 transition-colors"
              aria-expanded={isExpanded ? "true" : "false"}
            >
              <div className="flex items-center gap-2">
                {item.icon && (
                  <span
                    className="material-symbols-outlined text-on-surface-variant"
                    style={{ fontSize: 16 }}
                  >
                    {item.icon}
                  </span>
                )}
                <span className="text-label-sm font-label-sm text-on-surface uppercase tracking-wider">
                  {item.title}
                </span>
              </div>
              <div className="flex items-center gap-2">
                {item.badge !== undefined && (
                  <span className="text-data-micro font-data-micro text-on-surface-variant opacity-60">
                    {item.badge}
                  </span>
                )}
                <span
                  className="material-symbols-outlined text-on-surface-variant transition-transform duration-200"
                  style={{
                    fontSize: 16,
                    transform: isExpanded ? "rotate(180deg)" : "rotate(0deg)",
                  }}
                >
                  expand_more
                </span>
              </div>
            </button>
            {isExpanded && (
              <div className="px-1 pb-2">{item.children}</div>
            )}
          </div>
        );
      })}
    </div>
  );
}
