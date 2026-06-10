import * as React from 'react';
import { useStudio } from '../context/StudioContext';
import { EffectCard } from './molecules/EffectCard';

export const EffectStack: React.FC = () => {
  const { activeEffects, setActiveEffects, selectedEffectId, setSelectedEffectId } = useStudio();
  const [draggedIndex, setDraggedIndex] = React.useState<number | null>(null);
  const [dragOverIndex, setDragOverIndex] = React.useState<number | null>(null);

  const toggleEffect = (id: string) => {
    setActiveEffects(
      activeEffects.map((fx) => (fx.id === id ? { ...fx, enabled: !fx.enabled } : fx))
    );
  };

  const moveEffect = (index: number, direction: 'up' | 'down') => {
    const newEffects = [...activeEffects];
    const targetIndex = direction === 'up' ? index - 1 : index + 1;
    if (targetIndex < 0 || targetIndex >= activeEffects.length) return;

    // Swap elements
    const temp = newEffects[index];
    newEffects[index] = newEffects[targetIndex];
    newEffects[targetIndex] = temp;

    setActiveEffects(newEffects);
  };

  const removeEffect = (id: string) => {
    setActiveEffects(activeEffects.filter((fx) => fx.id !== id));
    if (selectedEffectId === id) {
      const remaining = activeEffects.filter((fx) => fx.id !== id);
      setSelectedEffectId(remaining.length > 0 ? remaining[0].id : null);
    }
  };

  const idCounterRef = React.useRef(0);

  const duplicateEffect = (index: number) => {
    const fx = activeEffects[index];
    if (!fx) return;
    const newId = `fx-${++idCounterRef.current}`;
    const copy: typeof fx = {
      ...fx,
      id: newId,
      name: `${fx.name} Copy`,
    };
    const newEffects = [...activeEffects];
    newEffects.splice(index + 1, 0, copy);
    setActiveEffects(newEffects);
    setSelectedEffectId(newId);
  };

  const mergeDown = (index: number) => {
    if (index >= activeEffects.length - 1) return;
    const upper = activeEffects[index];
    const lower = activeEffects[index + 1];
    if (!upper || !lower) return;
    // Merge upper into lower: combine params, keep lower's blend mode, max opacity
    const merged: typeof lower = {
      ...lower,
      params: { ...lower.params, ...upper.params },
      opacity: Math.max(lower.opacity ?? 1, upper.opacity ?? 1),
      enabled: upper.enabled || lower.enabled,
    };
    const newEffects = [...activeEffects];
    newEffects.splice(index, 2, merged);
    setActiveEffects(newEffects);
    setSelectedEffectId(merged.id);
  };

  const handleDragStart = (e: React.DragEvent, index: number) => {
    setDraggedIndex(index);
    e.dataTransfer.effectAllowed = 'move';
    
    // Set a light visual cue (transparent drag image is default, but we can set dataTransfer text/data)
    e.dataTransfer.setData('text/plain', index.toString());
  };

  const handleDragOver = (e: React.DragEvent, index: number) => {
    e.preventDefault();
    if (draggedIndex === index) return;
    setDragOverIndex(index);
  };

  const handleDragEnd = () => {
    setDraggedIndex(null);
    setDragOverIndex(null);
  };

  const handleDrop = (e: React.DragEvent, index: number) => {
    e.preventDefault();
    if (draggedIndex === null || draggedIndex === index) return;

    const newEffects = [...activeEffects];
    const draggedItem = newEffects[draggedIndex];
    
    // Remove the item from its original position
    newEffects.splice(draggedIndex, 1);
    // Insert it at the new position
    newEffects.splice(index, 0, draggedItem);

    setActiveEffects(newEffects);
    
    setDraggedIndex(null);
    setDragOverIndex(null);
  };

  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        gap: '12px',
      }}
    >
      <div
        style={{
          display: 'flex',
          flexDirection: 'column',
          gap: '8px',
        }}
      >
        {activeEffects.length > 0 ? (
          activeEffects.map((fx, index) => (
            <EffectCard
              key={fx.id}
              effect={fx}
              index={index}
              isFirst={index === 0}
              isLast={index === activeEffects.length - 1}
              isSelected={selectedEffectId === fx.id}
              onSelect={() => setSelectedEffectId(fx.id)}
              onToggle={() => toggleEffect(fx.id)}
              onMoveUp={() => moveEffect(index, 'up')}
              onMoveDown={() => moveEffect(index, 'down')}
              onDelete={() => removeEffect(fx.id)}
              onDuplicate={() => duplicateEffect(index)}
              onMergeDown={() => mergeDown(index)}
              onDragStart={handleDragStart}
              onDragOver={handleDragOver}
              onDragEnd={handleDragEnd}
              onDrop={handleDrop}
              isDragging={draggedIndex === index}
              isDragOver={dragOverIndex === index}
              draggedIndex={draggedIndex}
            />
          ))
        ) : (
          <div
            style={{
              padding: '24px var(--spacing-sm)',
              textAlign: 'center',
              color: 'var(--text-tertiary)',
              fontSize: '12px',
              border: '1px dashed var(--border-color)',
              borderRadius: 'var(--radius-md)',
            }}
          >
            No active effects. Add one below!
          </div>
        )}
      </div>
    </div>
  );
};
