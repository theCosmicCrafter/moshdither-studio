import * as React from 'react';
import { useState, useRef } from 'react';
import { useStudio } from '../../context/StudioContext';
import { EffectStack } from '../EffectStack';
import { PresetManager } from '../organisms/PresetManager';
import { RenderQueue } from '../organisms/RenderQueue';
import { BatchProcessor } from '../organisms/BatchProcessor';
import { ExportPresets } from '../organisms/ExportPresets';
import { RecentFiles } from '../organisms/RecentFiles';
import { Button } from '../atoms/Button';
import { Icon } from '../atoms/Icon';
import type { EffectType, Effect } from '../../types/effectTypes';
import { EFFECT_REGISTRY, ALL_EFFECT_TYPES } from '../../types/effectTypes';

export const Sidebar: React.FC = () => {
  const { activeEffects, setActiveEffects, mediaUrl, isRendering, addToast, outputDirectory, exportFormat, exportFps, addRenderJob, watermarkSettings } = useStudio();
  const [showAddMenu, setShowAddMenu] = useState(false);
  const idCounter = useRef(0);

  const handleExport = () => {
    if (!mediaUrl) return;
    if (!window.ipcRenderer) {
      addToast('IPC renderer is not available. Please run in Electron!', 'error');
      return;
    }
    addRenderJob({
      name: `Export ${exportFormat.toUpperCase()}`,
      inputUrl: mediaUrl,
      activeEffects,
      outputDirectory,
      exportFormat,
      exportFps,
      watermarkSettings,
    });
  };

  const addEffect = (type: EffectType) => {
    const meta = EFFECT_REGISTRY[type];
    idCounter.current += 1;
    const newEffect: Effect = {
      id: `fx-${idCounter.current}`,
      name: meta.name,
      type,
      enabled: true,
      params: { ...meta.defaultParams },
      startTime: 0,
      endTime: 10,
      mask: { type: 'none', invert: false },
    };
    setActiveEffects([...activeEffects, newEffect]);
    setShowAddMenu(false);
  };

  return (
    <div className="sidebar-container">
      {/* Layers Section */}
      <div className="sidebar-section">
        <h3 className="sidebar-section-title">
          Layers & Effects
        </h3>
        <div className="sidebar-scroll-area">
          <EffectStack />
        </div>
      </div>

      {/* Preset Section */}
      <div style={{ flexShrink: 0 }}>
        <PresetManager />
      </div>

      {/* Layer Addition & Render triggers */}
      <div className="sidebar-footer">
        <div style={{ position: 'relative' }}>
          <Button
            variant="glass"
            style={{ width: '100%', borderColor: 'var(--accent-glow)' }}
            onClick={() => setShowAddMenu(!showAddMenu)}
          >
            <Icon name="plus" size={14} style={{ color: 'var(--accent-primary)' }} />
            <span style={{ color: 'var(--accent-primary)', fontWeight: 600 }}>Add Effect Layer</span>
          </Button>

          {showAddMenu && (
            <div
              style={{
                position: 'absolute',
                bottom: '100%',
                left: 0,
                right: 0,
                background: 'rgba(28, 28, 30, 0.95)',
                border: '1px solid var(--border-color)',
                borderRadius: 'var(--radius-lg)',
                padding: '6px',
                display: 'flex',
                flexDirection: 'column',
                gap: '4px',
                zIndex: 100,
                marginBottom: '8px',
                boxShadow: 'var(--shadow-lg)',
                backdropFilter: 'var(--glass-blur)',
                WebkitBackdropFilter: 'var(--glass-blur)',
              }}
            >
              {ALL_EFFECT_TYPES.map((type) => {
                const meta = EFFECT_REGISTRY[type];
                const suffix = meta.category === 'webgl' ? ' (WebGL)' : ' (Offline)';
                return (
                  <button
                    key={type}
                    onClick={() => addEffect(type)}
                    className="add-effect-btn"
                    style={{
                      background: 'transparent',
                      border: 'none',
                      color: '#fff',
                      padding: '8px var(--spacing-sm)',
                      textAlign: 'left',
                      cursor: 'pointer',
                      borderRadius: 'var(--radius-sm)',
                      fontSize: '13px',
                    }}
                  >
                    {meta.name}{suffix}
                  </button>
                );
              })}
            </div>
          )}
        </div>

        <Button
          variant="primary"
          glow={true}
          style={{ width: '100%', height: '40px', fontWeight: 600 }}
          onClick={handleExport}
          disabled={!mediaUrl || isRendering}
        >
          {isRendering ? 'Rendering...' : 'Render & Export Video'}
        </Button>

        <ExportPresets />
        <RenderQueue />
        <BatchProcessor />
        <RecentFiles />
      </div>
    </div>
  );
};
