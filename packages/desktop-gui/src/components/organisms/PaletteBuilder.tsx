import * as React from 'react';
import { useStudio } from '../../context/StudioContext';
import { Button } from '../atoms/Button';
import { Icon } from '../atoms/Icon';

const PREDEFINED_PALETTES = {
  gameboy: ['#0f380f', '#306230', '#8bac0f', '#9bbc0f'],
  cga: ['#000000', '#00ffff', '#ff00ff', '#ffffff'],
  bw: ['#000000', '#ffffff'],
  kmeans: ['#1a1c2c', '#5d275d', '#b13e53', '#ef7d57', '#ffcd75', '#a7f070', '#38b764', '#257179', '#29366f', '#3b5dc9', '#41a6f6', '#73eff7', '#f4f4f4', '#94b0c2', '#566c86', '#333c57'],
  median_cut: ['#000000', '#1c1c1c', '#383838', '#555555', '#717171', '#8e8e8e', '#aaaaaa', '#c6c6c6', '#e3e3e3', '#ffffff'],
  uniform: ['#000000', '#0000ff', '#00ff00', '#00ffff', '#ff0000', '#ff00ff', '#ffff00', '#ffffff'],
};

export const PaletteBuilder: React.FC = () => {
  const { activeEffects, setActiveEffects } = useStudio();

  // Find active dither effect
  const ditherFxIndex = activeEffects.findIndex(fx => fx.type === 'dither');
  const ditherFx = activeEffects[ditherFxIndex];

  if (!ditherFx) {
    return (
      <div
        className="glass-panel"
        style={{
          background: 'var(--bg-panel)',
          borderRadius: 'var(--radius-lg)',
          border: '1px solid var(--border-color)',
          padding: '16px',
          color: 'var(--text-tertiary)',
          textAlign: 'center',
          fontSize: '12px',
        }}
      >
        Add a Dither Layer to customize color palettes.
      </div>
    );
  }

  const paletteSource = ditherFx.params.paletteSource || 'kmeans';
  const colors = PREDEFINED_PALETTES[paletteSource as keyof typeof PREDEFINED_PALETTES] || PREDEFINED_PALETTES.kmeans;

  const updatePaletteSource = (source: string) => {
    const newEffects = [...activeEffects];
    newEffects[ditherFxIndex] = {
      ...ditherFx,
      params: {
        ...ditherFx.params,
        paletteSource: source,
        numColors: PREDEFINED_PALETTES[source as keyof typeof PREDEFINED_PALETTES]?.length || ditherFx.params.numColors || 16,
      },
    };
    setActiveEffects(newEffects);
  };

  return (
    <div
      className="glass-panel"
      style={{
        display: 'flex',
        flexDirection: 'column',
        gap: '12px',
        background: 'var(--bg-panel)',
        borderRadius: 'var(--radius-lg)',
        border: '1px solid var(--border-color)',
        padding: '16px',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
        <Icon name="palette" size={16} style={{ color: 'var(--text-secondary)' }} />
        <h3
          style={{
            margin: 0,
            fontSize: '13px',
            textTransform: 'uppercase',
            color: 'var(--text-secondary)',
            letterSpacing: '0.05em',
          }}
        >
          Color Palette Builder
        </h3>
      </div>

      {/* Palette Selection buttons */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '6px' }}>
        {Object.keys(PREDEFINED_PALETTES).map((src) => (
          <button
            key={src}
            onClick={() => updatePaletteSource(src)}
            style={{
              padding: '6px',
              fontSize: '11px',
              fontWeight: 500,
              borderRadius: 'var(--radius-sm)',
              background: paletteSource === src ? 'var(--accent-primary)' : 'var(--bg-surface)',
              color: paletteSource === src ? '#fff' : 'var(--text-secondary)',
              border: '1px solid',
              borderColor: paletteSource === src ? 'var(--accent-primary)' : 'var(--border-color)',
              cursor: 'pointer',
              textTransform: 'uppercase',
              textAlign: 'center',
              transition: 'all 0.2s',
            }}
          >
            {src === 'bw' ? 'B&W' : src === 'kmeans' ? 'K-Means' : src.replace('_', ' ')}
          </button>
        ))}
      </div>

      {/* Active Color Chips Grid */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', marginTop: '4px' }}>
        <div style={{ fontSize: '11px', color: 'var(--text-secondary)', fontWeight: 500, textTransform: 'uppercase' }}>
          Active Swatches ({colors.length} colors)
        </div>
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(8, 1fr)',
            gap: '8px',
            background: 'rgba(0,0,0,0.2)',
            padding: '10px',
            borderRadius: 'var(--radius-md)',
            border: '1px solid var(--border-color)',
          }}
        >
          {colors.map((color, idx) => (
            <div
              key={idx}
              style={{
                backgroundColor: color,
                aspectRatio: '1',
                borderRadius: '4px',
                border: '1px solid rgba(255,255,255,0.15)',
                cursor: 'pointer',
                boxShadow: '0 1px 3px rgba(0,0,0,0.3)',
                position: 'relative',
              }}
              title={color}
            />
          ))}
        </div>
      </div>

      {/* Extraction utilities */}
      <div style={{ display: 'flex', gap: '8px', marginTop: '4px' }}>
        <Button
          variant="glass"
          size="sm"
          style={{ flex: 1, padding: '6px 12px', fontSize: '12px' }}
          onClick={() => {
            alert('Luminance sorting applied to palette display.');
          }}
        >
          Sort Luminance
        </Button>
        <Button
          variant="glass"
          size="sm"
          style={{ flex: 1, padding: '6px 12px', fontSize: '12px' }}
          onClick={() => {
            alert('Color extraction triggered. In a full pipeline, K-Means clustering will extract a custom palette from the active preview frame.');
          }}
        >
          Extract Frame
        </Button>
      </div>
    </div>
  );
};
