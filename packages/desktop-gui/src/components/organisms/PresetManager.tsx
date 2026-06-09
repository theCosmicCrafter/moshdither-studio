import * as React from 'react';
import { useStudio } from '../../context/StudioContext';
import { Button } from '../atoms/Button';
import { Icon } from '../atoms/Icon';
import type { Effect } from '../../types/effectTypes';

interface Preset {
  name: string;
  description: string;
  effects: Effect[];
}

const PRESETS: Preset[] = [
  {
    name: 'Game Boy DMG',
    description: '4-color classic green-screen matrix dither',
    effects: [
      {
        id: 'gb-1',
        name: 'Game Boy Dither',
        type: 'dither',
        enabled: true,
        params: {
          ditherMode: 'bayer',
          matrixSize: '4x4',
          paletteSource: 'gameboy',
          numColors: 4,
          useGamma: false,
          pixelScale: 2.0,
        },
      },
    ],
  },
  {
    name: 'CGA Cyberpunk',
    description: 'Neon cyan, magenta, and black 4-color dither',
    effects: [
      {
        id: 'cga-1',
        name: 'CMYK Halftone',
        type: 'halftone',
        enabled: true,
        params: { dotSize: 6, angleC: 15, angleM: 75, angleY: 0, angleK: 45 },
      },
      {
        id: 'cga-2',
        name: 'CGA Dither',
        type: 'dither',
        enabled: true,
        params: {
          ditherMode: 'error_diffusion',
          errorDiffusionVariant: 'floyd_steinberg',
          paletteSource: 'cga',
          numColors: 4,
          useGamma: true,
        },
      },
    ],
  },
  {
    name: 'VHS Retro Glitch',
    description: 'Analog signal bleed, sync errors, and phosphorus scanlines',
    effects: [
      {
        id: 'vhs-1',
        name: 'Analog Glitch',
        type: 'analog-glitch',
        enabled: true,
        params: { intensity: 0.65 },
      },
      {
        id: 'vhs-2',
        name: 'CRT Monitor',
        type: 'crt-phosphor',
        enabled: true,
        params: { intensity: 0.45 },
      },
    ],
  },
  {
    name: 'Datamosh Smear',
    description: 'Infinite movement smear with vector feedback',
    effects: [
      {
        id: 'mosh-1',
        name: 'Classic Datamosh',
        type: 'datamosh',
        enabled: true,
        params: { intensity: 0.85, mode: 'classic' },
      },
    ],
  },
  {
    name: 'Cinematic Grain',
    description: 'Noise variations mapped to color quantization',
    effects: [
      {
        id: 'grain-1',
        name: 'Temporal Noise',
        type: 'temporal-noise',
        enabled: true,
        params: { intensity: 0.2, noiseScale: 1.2, numColors: 32 },
      },
      {
        id: 'grain-2',
        name: 'Epsilon Glow',
        type: 'epsilon-glow',
        enabled: true,
        params: { intensity: 0.35 },
      },
    ],
  },
];

export const PresetManager: React.FC = () => {
  const { activeEffects, setActiveEffects } = useStudio();

  const applyPreset = (preset: Preset) => {
    // Generate new unique IDs for the preset effects so they don't collision
    const stampedEffects = preset.effects.map((fx) => ({
      ...fx,
      id: `${fx.type}-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`,
    }));
    setActiveEffects(stampedEffects);
  };

  const randomizeParameters = () => {
    const randomized = activeEffects.map((fx) => {
      if (!fx.enabled) return fx;
      
      const newParams = { ...fx.params };
      if (fx.type === 'analog-glitch' || fx.type === 'crt-phosphor' || fx.type === 'epsilon-glow') {
        newParams.intensity = parseFloat((Math.random() * 0.9 + 0.1).toFixed(2));
      } else if (fx.type === 'temporal-noise') {
        newParams.intensity = parseFloat((Math.random() * 0.4 + 0.05).toFixed(2));
        newParams.noiseScale = parseFloat((Math.random() * 2.0 + 0.5).toFixed(2));
        newParams.numColors = Math.floor(Math.random() * 48) + 8;
      } else if (fx.type === 'halftone') {
        newParams.dotSize = Math.floor(Math.random() * 12) + 2;
      } else if (fx.type === 'dither') {
        if (newParams.ditherMode === 'bayer') {
          const sizes = ['2x2', '4x4', '8x8', '16x16'];
          newParams.matrixSize = sizes[Math.floor(Math.random() * sizes.length)];
        } else if (newParams.ditherMode === 'error_diffusion') {
          const kernels = ['floyd_steinberg', 'atkinson', 'stucki', 'jjn', 'burkes'];
          newParams.errorDiffusionVariant = kernels[Math.floor(Math.random() * kernels.length)];
        }
        newParams.numColors = Math.floor(Math.random() * 24) + 4;
      } else if (fx.type === 'datamosh') {
        newParams.intensity = parseFloat((Math.random() * 0.8 + 0.2).toFixed(2));
        const modes = ['classic', 'tomato_shock', 'tomato_bloom', 'js_zoom', 'js_vibrate'];
        newParams.mode = modes[Math.floor(Math.random() * modes.length)];
      }

      return { ...fx, params: newParams };
    });

    setActiveEffects(randomized);
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
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <h3
          style={{
            margin: 0,
            fontSize: '13px',
            textTransform: 'uppercase',
            color: 'var(--text-secondary)',
            letterSpacing: '0.05em',
          }}
        >
          Preset Library
        </h3>
        <Button
          variant="glass"
          size="sm"
          onClick={randomizeParameters}
          style={{ padding: '4px 8px', borderColor: 'var(--accent-glow)' }}
          title="Randomize active layer parameters"
        >
          <Icon name="refresh" size={12} style={{ color: 'var(--accent-primary)' }} />
          <span style={{ fontSize: '11px', fontWeight: 600, color: 'var(--accent-primary)' }}>Randomize</span>
        </Button>
      </div>

      <div
        style={{
          display: 'flex',
          flexDirection: 'column',
          gap: '8px',
          maxHeight: '220px',
          overflowY: 'auto',
          paddingRight: '4px',
        }}
      >
        {PRESETS.map((preset) => (
          <div
            key={preset.name}
            onClick={() => applyPreset(preset)}
            style={{
              padding: '10px var(--spacing-sm)',
              background: 'rgba(255,255,255,0.02)',
              border: '1px solid var(--border-color)',
              borderRadius: 'var(--radius-md)',
              cursor: 'pointer',
              transition: 'all 0.2s',
            }}
            className="preset-item-card"
          >
            <div
              style={{
                fontSize: '13px',
                fontWeight: 600,
                color: 'var(--text-primary)',
                marginBottom: '2px',
              }}
            >
              {preset.name}
            </div>
            <div style={{ fontSize: '11px', color: 'var(--text-secondary)' }}>
              {preset.description}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};
