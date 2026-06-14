import * as React from 'react';
import { usePanels } from '../../hooks/usePanels';

const PRESETS = [
  { name: 'Default', left: 280, right: 320 },
  { name: 'Compact', left: 240, right: 260 },
  { name: 'Focus', left: 48, right: 48 },
  { name: 'Wide Left', left: 400, right: 260 },
  { name: 'Wide Right', left: 240, right: 420 },
];

export const WorkspacePresetBar: React.FC = () => {
  const { left, right } = usePanels();

  const apply = (p: typeof PRESETS[0]) => {
    left.setWidth(p.left);
    right.setWidth(p.right);
    if (p.left <= 48) left.toggleCollapse();
    if (p.right <= 48) right.toggleCollapse();
  };

  return (
    <div className="workspace-preset-bar">
      {PRESETS.map((p) => (
        <button
          key={p.name}
          className="workspace-preset-btn"
          onClick={() => apply(p)}
          title={`Set layout: Left ${p.left}px, Right ${p.right}px`}
        >
          {p.name}
        </button>
      ))}
    </div>
  );
};
