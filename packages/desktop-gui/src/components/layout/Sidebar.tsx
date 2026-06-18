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
      <div className="sidebar-preset-section">
        <PresetManager />
      </div>

      {/* Layer Addition & Render triggers */}
      <div className="sidebar-footer">
        <div className="add-effect-wrapper">
          <Button
            variant="glass"
            style={{ width: '100%', borderColor: 'var(--accent-glow)' }}
            onClick={() => setShowAddMenu(!showAddMenu)}
          >
            <Icon name="plus" size={14} style={{ color: 'var(--accent-primary)' }} />
            <span className="add-effect-trigger-label">Add Effect Layer</span>
          </Button>

          {showAddMenu && (
            <div className="add-effect-menu">
              {ALL_EFFECT_TYPES.map((type) => {
                const meta = EFFECT_REGISTRY[type];
                const suffix = meta.category === 'webgl' ? ' (WebGL)' : ' (Offline)';
                return (
                  <button
                    key={type}
                    onClick={() => addEffect(type)}
                    className="add-effect-btn"
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
