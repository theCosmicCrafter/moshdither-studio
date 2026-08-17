// src/components/MaskSelector.tsx
import { useState } from "react";

interface MaskSelectorProps {
  masks: string[];
  scores: number[];
  selectedIndex: number;
  onSelect: (index: number) => void;
}

export default function MaskSelector({ masks, scores, selectedIndex, onSelect }: MaskSelectorProps) {
  const [expanded, setExpanded] = useState(true);

  return (
    <div className="flex flex-col gap-1">
      {/* Header — clickable to collapse/expand */}
      <button
        onClick={() => setExpanded(!expanded)}
        className="flex items-center gap-2 w-full py-1 px-2 rounded bg-[var(--surface-1)] hover:bg-[var(--surface-2)] transition-colors"
      >
        <span className="material-symbols-outlined text-[var(--accent)]" style={{ fontSize: 12 }}>layers</span>
        <span className="text-dense-xs uppercase tracking-wider text-[var(--text-muted)] flex-1 text-left">
          Mask Candidates ({masks.length})
        </span>
        <span
          className="material-symbols-outlined text-[var(--text-muted)] transition-transform"
          style={{ fontSize: 14, transform: expanded ? "rotate(90deg)" : "none" }}
        >
          chevron_right
        </span>
      </button>

      {expanded && (
        <div className="max-h-[280px] overflow-y-auto custom-scrollbar flex flex-col gap-1 pr-1">
          {masks.map((m, i) => (
            <button
              key={i}
              onClick={() => onSelect(i)}
              className={`flex items-center gap-2 p-1.5 rounded border transition text-left ${
                i === selectedIndex
                  ? "border-[var(--accent)] bg-[var(--accent)]/10 ring-1 ring-[var(--accent)]/40"
                  : "border-[var(--panel-border)] hover:border-[var(--text-muted)] hover:bg-[var(--surface-1)]"
              }`}
              title={`Mask ${i + 1} — score: ${scores[i]?.toFixed(3) ?? "?"}`}
            >
              {/* Thumbnail — fixed 48x48 size */}
              <div className="w-12 h-12 rounded overflow-hidden border border-[var(--panel-border)] flex-shrink-0 bg-black/40">
                <img
                  src={m}
                  alt={`Mask ${i + 1}`}
                  className="w-full h-full object-contain"
                  style={{ filter: "invert(1)" }}
                />
              </div>

              {/* Info */}
              <div className="flex flex-col gap-0.5 flex-1 min-w-0">
                <span className="text-dense-sm font-semibold text-[var(--text-primary)]">
                  Mask #{i + 1}
                </span>
                <span className="text-dense-2xs font-mono text-[var(--text-muted)]">
                  Score: {scores[i]?.toFixed(3) ?? "?"}
                </span>
              </div>

              {/* Selected indicator */}
              {i === selectedIndex && (
                <span
                  className="material-symbols-outlined text-[var(--accent)] flex-shrink-0"
                  style={{ fontSize: 14 }}
                >
                  check_circle
                </span>
              )}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
