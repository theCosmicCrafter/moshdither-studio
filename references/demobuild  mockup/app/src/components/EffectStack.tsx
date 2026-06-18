import { useState } from 'react';
import { Plus, Copy, Trash, DotsSixVertical } from '@phosphor-icons/react';
import { Switch } from '@/components/ui/switch';
import type { EffectConfig, EffectCategory } from '@/types';

const categoryColors: Record<string, string> = {
  glitch: 'var(--accent-primary)',
  dither: 'var(--accent-warning)',
  crt: 'oklch(55% 0.15 280)',
  datamosh: 'oklch(55% 0.15 280)',
};

interface EffectStackProps {
  effects: EffectConfig[];
  selectedEffectId: string | null;
  onSelect: (id: string) => void;
  onToggle: (id: string) => void;
  onRemove: (id: string) => void;
  onDuplicate: (id: string) => void;
  onAdd: (category: EffectCategory) => void;
  onMove: (from: number, to: number) => void;
}

export default function EffectStack({
  effects,
  selectedEffectId,
  onSelect,
  onToggle,
  onRemove,
  onDuplicate,
  onAdd,
  onMove,
}: EffectStackProps) {
  const [showAddMenu, setShowAddMenu] = useState(false);
  const [hoveredId, setHoveredId] = useState<string | null>(null);

  return (
    <div
      className="flex flex-col h-full"
      style={{
        width: 260,
        minWidth: 200,
        maxWidth: 400,
        background: 'var(--bg-panel)',
        borderRight: '1px solid var(--border-subtle)',
      }}
    >
      {/* Header */}
      <div
        className="flex items-center justify-between px-3 shrink-0"
        style={{
          height: 36,
          borderBottom: '1px solid var(--border-subtle)',
        }}
      >
        <span
          className="font-mono-data uppercase tracking-wider"
          style={{ fontSize: 11, color: 'var(--text-muted)', letterSpacing: '0.05em' }}
        >
          Effect Stack
        </span>
        <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>
          {effects.length}
        </span>
      </div>

      {/* Effect list */}
      <div className="flex-1 overflow-y-auto py-1">
        {effects.map((effect, index) => {
          const isSelected = effect.id === selectedEffectId;
          const isHovered = effect.id === hoveredId;
          const catColor = categoryColors[effect.category] || 'var(--accent-primary)';

          return (
            <div
              key={effect.id}
              draggable
              onDragStart={(e) => {
                e.dataTransfer.setData('effect-index', String(index));
              }}
              onDragOver={(e) => e.preventDefault()}
              onDrop={(e) => {
                const fromIndex = Number(e.dataTransfer.getData('effect-index'));
                if (fromIndex !== index) {
                  onMove(fromIndex, index);
                }
              }}
              onClick={() => onSelect(effect.id)}
              onMouseEnter={() => setHoveredId(effect.id)}
              onMouseLeave={() => setHoveredId(null)}
              className="flex items-center gap-2 px-2 py-2 mx-1 rounded cursor-pointer transition-all duration-150"
              style={{
                background: isSelected ? 'var(--bg-active)' : 'transparent',
                borderLeft: `3px solid ${effect.enabled ? catColor : 'transparent'}`,
                opacity: effect.enabled ? 1 : 0.5,
              }}
              onMouseOver={(e) => {
                if (!isSelected) {
                  e.currentTarget.style.background = 'var(--bg-hover)';
                }
              }}
              onMouseOut={(e) => {
                if (!isSelected) {
                  e.currentTarget.style.background = 'transparent';
                }
              }}
            >
              {/* Drag handle */}
              <div
                className="cursor-grab"
                style={{ color: 'var(--text-muted)' }}
              >
                <DotsSixVertical size={14} />
              </div>

              {/* Effect name */}
              <div className="flex-1 min-w-0">
                <div
                  className="truncate"
                  style={{
                    fontSize: 13,
                    fontWeight: isSelected ? 500 : 400,
                    color: 'var(--text-primary)',
                  }}
                >
                  {effect.name}
                </div>
                <div
                  className="flex gap-2 mt-0.5"
                >
                  {effect.parameters.slice(0, 2).map((p) => (
                    <span
                      key={p.key}
                      className="font-mono-data"
                      style={{ fontSize: 10, color: 'var(--text-muted)' }}
                    >
                      {p.key}: {typeof p.value === 'number' ? p.value.toFixed(2) : String(p.value)}
                    </span>
                  ))}
                </div>
              </div>

              {/* Actions */}
              <div className="flex items-center gap-1">
                {isHovered && (
                  <>
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        onDuplicate(effect.id);
                      }}
                      className="p-1 rounded transition-all duration-150"
                      style={{ color: 'var(--text-muted)' }}
                      onMouseEnter={(e) => {
                        e.currentTarget.style.color = 'var(--text-primary)';
                        e.currentTarget.style.background = 'var(--bg-surface)';
                      }}
                      onMouseLeave={(e) => {
                        e.currentTarget.style.color = 'var(--text-muted)';
                        e.currentTarget.style.background = 'transparent';
                      }}
                      aria-label="Duplicate"
                    >
                      <Copy size={12} />
                    </button>
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        onRemove(effect.id);
                      }}
                      className="p-1 rounded transition-all duration-150"
                      style={{ color: 'var(--text-muted)' }}
                      onMouseEnter={(e) => {
                        e.currentTarget.style.color = 'var(--accent-secondary)';
                        e.currentTarget.style.background = 'var(--bg-surface)';
                      }}
                      onMouseLeave={(e) => {
                        e.currentTarget.style.color = 'var(--text-muted)';
                        e.currentTarget.style.background = 'transparent';
                      }}
                      aria-label="Remove"
                    >
                      <Trash size={12} />
                    </button>
                  </>
                )}
                <Switch
                  checked={effect.enabled}
                  onCheckedChange={() => onToggle(effect.id)}
                  onClick={(e) => e.stopPropagation()}
                  className="scale-75"
                />
              </div>
            </div>
          );
        })}
      </div>

      {/* Add effect button */}
      <div
        className="relative shrink-0 p-2"
        style={{ borderTop: '1px solid var(--border-subtle)' }}
      >
        <button
          onClick={() => setShowAddMenu(!showAddMenu)}
          className="shimmer-btn w-full flex items-center justify-center gap-2 py-2 rounded transition-all duration-150"
          style={{
            background: 'var(--accent-primary)',
            color: 'var(--text-inverse)',
            fontSize: 13,
            fontWeight: 500,
          }}
        >
          <Plus size={14} weight="bold" />
          <span>Add Effect</span>
        </button>

        {showAddMenu && (
          <div
            className="absolute bottom-full left-2 right-2 mb-1 rounded overflow-hidden"
            style={{
              background: 'var(--bg-surface)',
              border: '1px solid var(--border-default)',
              zIndex: 100,
            }}
          >
            {(['glitch', 'dither', 'crt', 'datamosh'] as EffectCategory[]).map((cat) => (
              <button
                key={cat}
                onClick={() => {
                  onAdd(cat);
                  setShowAddMenu(false);
                }}
                className="w-full flex items-center gap-2 px-3 py-2 text-left transition-all duration-150"
                style={{ color: 'var(--text-secondary)', fontSize: 13 }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.background = 'var(--bg-hover)';
                  e.currentTarget.style.color = 'var(--text-primary)';
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.background = 'transparent';
                  e.currentTarget.style.color = 'var(--text-secondary)';
                }}
              >
                <div
                  className="w-2 h-2 rounded-full shrink-0"
                  style={{ background: categoryColors[cat] }}
                />
                <span className="capitalize">{cat}</span>
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
