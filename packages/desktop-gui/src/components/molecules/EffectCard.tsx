import * as React from 'react';
import { Switch } from '../atoms/Switch';
import { Icon } from '../atoms/Icon';
import type { Effect } from '../../types/effectTypes';
import { EFFECT_REGISTRY } from '../../types/effectTypes';
import { CaretUp, CaretDown, X, CopySimple, ArrowLineDown } from '@phosphor-icons/react';

export type { Effect, EffectType } from '../../types/effectTypes';

interface EffectCardProps {
  effect: Effect;
  index: number;
  isFirst: boolean;
  isLast: boolean;
  isSelected: boolean;
  onSelect: () => void;
  onToggle: () => void;
  onMoveUp: () => void;
  onMoveDown: () => void;
  onDelete: () => void;
  onDuplicate?: () => void;
  onMergeDown?: () => void;
  onDragStart: (e: React.DragEvent, index: number) => void;
  onDragOver: (e: React.DragEvent, index: number) => void;
  onDragEnd: () => void;
  onDrop: (e: React.DragEvent, index: number) => void;
  isDragging: boolean;
  isDragOver: boolean;
  draggedIndex: number | null;
}

export const EffectCard: React.FC<EffectCardProps> = ({
  effect,
  index,
  isFirst,
  isLast,
  isSelected,
  onSelect,
  onToggle,
  onMoveUp,
  onMoveDown,
  onDelete,
  onDuplicate,
  onMergeDown,
  onDragStart,
  onDragOver,
  onDragEnd,
  onDrop,
  isDragging,
  isDragOver,
  draggedIndex,
}) => {
  const showTopIndicator = isDragOver && draggedIndex !== null && draggedIndex > index;
  const showBottomIndicator = isDragOver && draggedIndex !== null && draggedIndex < index;

  return (
    <div
      draggable
      onDragStart={(e) => onDragStart(e, index)}
      onDragOver={(e) => onDragOver(e, index)}
      onDragEnd={onDragEnd}
      onDrop={(e) => onDrop(e, index)}
      style={{
        position: 'relative',
        paddingTop: showTopIndicator ? '8px' : '0px',
        paddingBottom: showBottomIndicator ? '8px' : '0px',
        opacity: isDragging ? 0.4 : 1,
        transition: 'all 0.2s cubic-bezier(0.16, 1, 0.3, 1)',
        cursor: 'grab',
      }}
      className={`effect-card-wrapper ${isDragging ? 'dragging' : ''}`}
    >
      {showTopIndicator && (
        <div
          style={{
            height: '3px',
            background: 'var(--accent-primary)',
            borderRadius: '2px',
            boxShadow: '0 0 8px var(--accent-glow)',
            marginBottom: '4px',
            pointerEvents: 'none',
          }}
        />
      )}

      <div
        onClick={onSelect}
        className={`effect-card animate-fade-in`}
        data-category={EFFECT_REGISTRY[effect.type].category}
        data-selected={isSelected ? 'true' : undefined}
        data-enabled={effect.enabled ? 'true' : 'false'}
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 10,
          cursor: 'pointer',
          opacity: isDragging ? 0.4 : 1,
          transition: 'opacity 0.2s ease',
        }}
      >
        {/* Drag Handle */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            color: 'var(--text-muted)',
            cursor: 'grab',
          }}
          title="Drag to Reorder"
        >
          <span
            style={{
              fontFamily: 'var(--font-mono)',
              fontSize: 10,
              color: 'var(--text-muted)',
              minWidth: 18,
              textAlign: 'center',
            }}
          >
            {(index + 1).toString().padStart(2, '0')}
          </span>
        </div>

        {/* Switch */}
        <div onClick={(e) => e.stopPropagation()}>
          <Switch checked={effect.enabled} onChange={onToggle} />
        </div>

        {/* Icon */}
        <div
          style={{
            color: effect.enabled ? 'var(--accent-primary)' : 'var(--text-muted)',
            display: 'flex',
            alignItems: 'center',
            transition: 'color 0.2s',
          }}
        >
          <Icon name={EFFECT_REGISTRY[effect.type].icon} size={16} />
        </div>

        {/* Name */}
        <div
          style={{
            flex: 1,
            fontSize: 13,
            fontWeight: 500,
            color: effect.enabled ? 'var(--text-primary)' : 'var(--text-secondary)',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
            transition: 'color 0.2s',
          }}
        >
          {effect.name}
        </div>

        {/* Param Preview */}
        <div
          style={{
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'flex-end',
            gap: 2,
            minWidth: 60,
          }}
        >
          <span className="param-label">{EFFECT_REGISTRY[effect.type].category}</span>
        </div>

        {/* Actions */}
        <div
          style={{ display: 'flex', gap: 2, alignItems: 'center' }}
          onClick={(e) => e.stopPropagation()}
        >
          <button
            onClick={onMoveUp}
            disabled={isFirst}
            title="Move Up"
            style={{
              padding: 4,
              opacity: isFirst ? 0.2 : 0.6,
              color: 'var(--text-secondary)',
              background: 'none',
              border: 'none',
              cursor: isFirst ? 'not-allowed' : 'pointer',
            }}
          >
            <CaretUp size={12} />
          </button>
          <button
            onClick={onMoveDown}
            disabled={isLast}
            title="Move Down"
            style={{
              padding: 4,
              opacity: isLast ? 0.2 : 0.6,
              color: 'var(--text-secondary)',
              background: 'none',
              border: 'none',
              cursor: isLast ? 'not-allowed' : 'pointer',
            }}
          >
            <CaretDown size={12} />
          </button>
          {onDuplicate && (
            <button
              onClick={onDuplicate}
              title="Duplicate Layer"
              style={{
                padding: 4,
                opacity: 0.6,
                color: 'var(--text-secondary)',
                background: 'none',
                border: 'none',
                cursor: 'pointer',
              }}
            >
              <CopySimple size={12} />
            </button>
          )}
          {onMergeDown && (
            <button
              onClick={onMergeDown}
              disabled={isLast}
              title="Merge Down"
              style={{
                padding: 4,
                opacity: isLast ? 0.2 : 0.6,
                color: 'var(--text-secondary)',
                background: 'none',
                border: 'none',
                cursor: isLast ? 'not-allowed' : 'pointer',
              }}
            >
              <ArrowLineDown size={12} />
            </button>
          )}
          <button
            onClick={onDelete}
            title="Delete"
            style={{
              padding: 4,
              color: 'var(--accent-secondary)',
              opacity: 0.7,
              background: 'none',
              border: 'none',
              cursor: 'pointer',
            }}
          >
            <X size={12} />
          </button>
        </div>
      </div>

      {showBottomIndicator && (
        <div
          style={{
            height: '3px',
            background: 'var(--accent-primary)',
            borderRadius: '2px',
            boxShadow: '0 0 8px var(--accent-glow)',
            marginTop: '4px',
            pointerEvents: 'none',
          }}
        />
      )}
    </div>
  );
};
