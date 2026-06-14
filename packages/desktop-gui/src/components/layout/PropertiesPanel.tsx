import React, { useState, useEffect } from 'react';
import { useStudio } from '../../context/StudioContext';
import { Tooltip } from '../atoms/Tooltip';
import { Switch } from '../atoms/Switch';
import { Button } from '../atoms/Button';
import { ControlGroup } from '../molecules/ControlGroup';
import { DebouncedControlGroup } from '../molecules/DebouncedControlGroup';
import { AccordionSection } from '../molecules/AccordionSection';
import { PaletteBuilder } from '../organisms/PaletteBuilder';
import { KeyframeRail } from '../molecules/KeyframeRail';
import type { EffectMask, BlendMode } from '../../types/effectTypes';
import { BLEND_MODES } from '../../types/effectTypes';
import { recommendExportSettings, getMediaTypeFromExt } from '../../utils/smartExport';
import type { WatermarkSettings } from '../../utils/watermark';
import { generateBeatKeyframes } from '../../utils/beatKeyframeGenerator';
import { detectBeats, decodeAudioFile } from '../../utils/beatDetection';
import type { BeatKeyframeMode } from '../../utils/beatKeyframeGenerator';
import { useSAM3 } from '../../hooks/useSAM3';

export const PropertiesPanel: React.FC = () => {
  const { 
    activeEffects, 
    setActiveEffects, 
    selectedEffectId, 
    setSelectedEffectId, 
    mediaUrl, 
    isPaintingMask,
    setIsPaintingMask,
    maskBrushSize,
    setMaskBrushSize,
    maskBrushEraser,
    setMaskBrushEraser,
    outputDirectory,
    setOutputDirectory,
    exportFormat,
    setExportFormat,
    exportFps,
    setExportFps,
    currentTime,
    duration,
    addRenderJob,
    addToast,
    isRendering,
    watermarkSettings,
    setWatermarkSettings,
  } = useStudio();
  const {
    status: samStatus,
    progress: samProgress,
    loadingStep: samLoadingStep,
    error: samError,
    threshold: samThreshold,
    setThreshold: setSamThreshold,
    predictText: predictSamText,
    predictTextPro: predictSamTextPro,
    predictGroundingDINO: predictSamGroundingDINO,
    setProMode: setSamProMode,
    proMode: samProMode,
  } = useSAM3();

  const [samGroundingDino, setSamGroundingDino] = useState(false);
  const {
    postProcessParams,
    setPostProcessParams,
    maskLayers,
    setMaskLayers,
    backgroundRemovalEnabled,
    setBackgroundRemovalEnabled,
  } = useStudio();
  const [systemFonts, setSystemFonts] = useState<string[]>([]);
  const [envMode, setEnvMode] = useState<'local' | 'system' | 'unconfigured'>('unconfigured');
  const [envStatus, setEnvStatus] = useState<{ pythonOk: boolean; ffmpegOk: boolean; ffglitchOk: boolean } | null>(null);
  const [envStatusOpen, setEnvStatusOpen] = useState(false);
  const [beatGenOpen, setBeatGenOpen] = useState(false);

  // Fetch environment status on mount
  useEffect(() => {
    if (!window.ipcRenderer) return;
    window.ipcRenderer.invoke('env:status').then((result) => {
      const status = result as { mode: 'local' | 'system' | 'unconfigured'; pythonOk: boolean; ffmpegOk: boolean; ffglitchOk: boolean } | null;
      if (!status) return;
      setEnvMode(status.mode);
      setEnvStatus({ pythonOk: status.pythonOk, ffmpegOk: status.ffmpegOk, ffglitchOk: status.ffglitchOk });
    }).catch(() => {
      // ignore
    });
  }, []);
  const [beatGenParam, setBeatGenParam] = useState('');
  const [beatGenMode, setBeatGenMode] = useState<BeatKeyframeMode>('pulse');
  const [beatGenMin, setBeatGenMin] = useState(0);
  const [beatGenMax, setBeatGenMax] = useState(1);
  const [beatGenLoading, setBeatGenLoading] = useState(false);

  // Load system fonts for watermark text rendering
  React.useEffect(() => {
    if (!window.ipcRenderer) return;
    window.ipcRenderer.invoke<string[]>('fonts:list').then((fonts) => {
      setSystemFonts(fonts);
    }).catch(() => {
      setSystemFonts([]);
    });
  }, []);

  // Find the selected effect, or fall back to the first active/enabled one, or just the first in the list
  const activeFx = activeEffects.find(fx => fx.id === selectedEffectId) || activeEffects.find(fx => fx.enabled) || activeEffects[0];

  const updateParam = (key: string, value: unknown) => {
    if (!activeFx) return;
    setActiveEffects(activeEffects.map(fx =>
      fx.id === activeFx.id
        ? { ...fx, params: { ...fx.params, [key]: value } }
        : fx
    ));
  };

  const updateLayerProp = (key: 'opacity' | 'blendMode', value: unknown) => {
    if (!activeFx) return;
    setActiveEffects(activeEffects.map(fx =>
      fx.id === activeFx.id
        ? { ...fx, [key]: value }
        : fx
    ));
  };

  const handleMTImport = async () => {
    if (!window.ipcRenderer) return;
    try {
      const url = await window.ipcRenderer.invoke('dialog:openMedia');
      if (url) {
        updateParam('motionUrl', url);
      }
    } catch {
      // User cancelled or IPC error — ignore
    }
  };

  // Keyframe management helpers
  const addKeyframe = (paramKey: string) => {
    if (!activeFx) return;
    const value = activeFx.params[paramKey] ?? 0;
    const existing = activeFx.keyframes?.[paramKey] ?? [];
    const newKeyframe = { time: currentTime, value: Number(value), easing: "linear" as const };
    const updated = existing.filter((k) => Math.abs(k.time - currentTime) > 0.01).concat(newKeyframe);
    setActiveEffects(activeEffects.map((fx) =>
      fx.id === activeFx.id
        ? { ...fx, keyframes: { ...fx.keyframes, [paramKey]: updated.sort((a, b) => a.time - b.time) } }
        : fx
    ));
  };

  const removeKeyframe = (paramKey: string, index: number) => {
    if (!activeFx) return;
    const existing = activeFx.keyframes?.[paramKey] ?? [];
    const updated = existing.filter((_, i) => i !== index);
    setActiveEffects(activeEffects.map((fx) =>
      fx.id === activeFx.id
        ? { ...fx, keyframes: { ...fx.keyframes, [paramKey]: updated } }
        : fx
    ));
  };

  // Helper to render slider parameters cleanly using DebouncedControlGroup and Tooltip
  const renderSlider = (label: string, key: string, min: number, max: number, step: number, defaultValue: number, tooltipContent?: string) => {
    if (!activeFx) return null;
    return (
      <div style={{ display: 'flex', flexDirection: 'column', width: '100%' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', width: '100%' }}>
          <DebouncedControlGroup
            label={label}
            value={activeFx.params[key] ?? defaultValue}
            onChange={(val) => updateParam(key, val)}
            defaultValue={defaultValue}
            min={min}
            max={max}
            step={step}
            style={{ flex: 1, marginBottom: '4px' }}
          />
          {tooltipContent && <Tooltip content={tooltipContent} />}
        </div>
        <KeyframeRail
          keyframes={activeFx.keyframes?.[key] ?? []}
          currentTime={currentTime}
          duration={duration || 10}
          onAdd={() => addKeyframe(key)}
          onRemove={(idx) => removeKeyframe(key, idx)}
        />
      </div>
    );
  };

  return (
    <aside className="app-properties" style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      <div style={{ borderBottom: '1px solid var(--border-color)', paddingBottom: '16px', marginBottom: '16px' }}>
        <h2 style={{ fontSize: '14px', textTransform: 'uppercase', color: 'var(--text-secondary)' }}>Properties</h2>
      </div>

      {activeEffects.length > 0 && activeFx ? (
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflowY: 'auto' }}>
          
          {/* Layer Selector Dropdown */}
          <div className="control-group" style={{ marginBottom: '16px' }}>
            <label className="control-label" style={{ display: 'block', fontSize: '11px', textTransform: 'uppercase', color: 'var(--text-secondary)', marginBottom: '6px' }}>Editing Layer</label>
            <select
              aria-label="Editing Layer"
              value={activeFx.id}
              onChange={(e) => setSelectedEffectId(e.target.value)}
              style={{ width: '100%', padding: '6px', background: '#1c1c1e', color: '#fff', border: '1px solid var(--border-color)', borderRadius: '4px' }}
            >
              {activeEffects.map(fx => (
                <option key={fx.id} value={fx.id}>
                  {fx.name} ({fx.enabled ? 'Enabled' : 'Disabled'})
                </option>
              ))}
            </select>
          </div>

          {/* Layer Blend Mode & Opacity */}
          <div className="control-group" style={{ marginBottom: '12px' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '6px' }}>
              <label className="control-label" style={{ fontSize: '11px', textTransform: 'uppercase', color: 'var(--text-secondary)' }}>Blend Mode</label>
              <Tooltip content="How this layer composites with layers below it" />
            </div>
            <select
              aria-label="Blend Mode"
              value={activeFx.blendMode || 'normal'}
              onChange={(e) => {
                const bm = e.target.value as BlendMode;
                setActiveEffects(activeEffects.map(fx => fx.id === activeFx.id ? { ...fx, blendMode: bm } : fx));
              }}
              style={{ width: '100%', padding: '6px', background: '#1c1c1e', color: '#fff', border: '1px solid var(--border-color)', borderRadius: '4px' }}
            >
              {BLEND_MODES.map(mode => (
                <option key={mode} value={mode}>
                  {mode.replace(/-/g, ' ').replace(/\b\w/g, c => c.toUpperCase())}
                </option>
              ))}
            </select>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', width: '100%' }}>
            <DebouncedControlGroup
              label="Opacity"
              value={activeFx.opacity ?? 1.0}
              onChange={(val) => updateLayerProp('opacity', val)}
              defaultValue={1.0}
              min={0}
              max={1}
              step={0.05}
              style={{ flex: 1, marginBottom: '12px' }}
            />
            <Tooltip content="Layer opacity / transparency" />
          </div>

          <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflowY: 'auto', gap: '16px', paddingRight: '4px' }}>
            
            {/* 1. LAYER PARAMETERS SECTION */}
            <div className="glass-panel" style={{ padding: '16px', border: 'none', background: 'transparent', boxShadow: 'none' }}>
              <h3 style={{ fontSize: '16px', marginBottom: '16px', color: 'var(--text-primary)' }}>{activeFx.name}</h3>

              {/* DITHER ALGORITHMS */}
              {activeFx.type === 'dither' && (
                <>
                  <div className="control-group" style={{ marginBottom: '12px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '6px' }}>
                      <label className="control-label" style={{ fontSize: '11px', textTransform: 'uppercase', color: 'var(--text-secondary)' }}>Dither Algorithm</label>
                      <Tooltip content="Select the pixel arrangement pattern algorithm" />
                    </div>
                    <select
                      aria-label="Dither Algorithm"
                      value={activeFx.params.ditherMode || 'atkinson'}
                      onChange={(e) => updateParam('ditherMode', e.target.value)}
                      style={{ width: '100%', padding: '6px', background: '#1c1c1e', color: '#fff', border: '1px solid var(--border-color)', borderRadius: '4px' }}
                    >
                      <option value="none">No Dither (Quantize Only)</option>
                      <option value="bayer">Bayer Matrix</option>
                      <option value="error_diffusion">Error Diffusion</option>
                      <option value="riemersma">Riemersma (Hilbert)</option>
                      <option value="blue_noise">Blue Noise</option>
                      <option value="IGN">Interleaved Gradient Noise</option>
                      <option value="polka_dot">Polka Dot</option>
                      <option value="wavelet">Wavelet</option>
                      <option value="adaptive_variance">Adaptive Variance</option>
                      <option value="perceptual">Perceptual</option>
                      <option value="hybrid">Hybrid</option>
                      <option value="halftone">Halftone</option>
                      <option value="ostromoukhov">Ostromoukhov</option>
                    </select>
                  </div>

                  <div className="control-group" style={{ marginBottom: '12px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '6px' }}>
                      <label className="control-label" style={{ fontSize: '11px', textTransform: 'uppercase', color: 'var(--text-secondary)' }}>Color Palette</label>
                      <Tooltip content="Choose how color levels are quantized" />
                    </div>
                    <select
                      aria-label="Color Palette"
                      value={activeFx.params.paletteSource || 'kmeans'}
                      onChange={(e) => updateParam('paletteSource', e.target.value)}
                      style={{ width: '100%', padding: '6px', background: '#1c1c1e', color: '#fff', border: '1px solid var(--border-color)', borderRadius: '4px' }}
                    >
                      <option value="kmeans">K-Means Clustering</option>
                      <option value="median_cut">Median Cut</option>
                      <option value="uniform">Uniform Distribution</option>
                      <option value="bw">Predefined: Black & White</option>
                      <option value="gameboy">Predefined: Game Boy DMG</option>
                      <option value="cga">Predefined: CGA Palette</option>
                    </select>
                  </div>

                  {['kmeans', 'median_cut', 'uniform'].includes(activeFx.params.paletteSource) && 
                    renderSlider('Colors Count', 'numColors', 2, 256, 1, 16, 'Number of color clusters in the generated palette')
                  }

                  <div className="control-group" style={{ marginBottom: '16px', display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <Switch 
                      checked={activeFx.params.useGamma || false} 
                      onChange={(val) => updateParam('useGamma', val)} 
                    />
                    <span style={{ fontSize: '13px', color: 'var(--text-secondary)' }}>Gamma Correction (Linear Space)</span>
                    <Tooltip content="Apply dither calculations in linear luminance space to prevent banding" />
                  </div>

                  {activeFx.params.ditherMode === 'bayer' && (
                    <div className="control-group" style={{ marginBottom: '12px' }}>
                      <label className="control-label">Bayer Matrix Size</label>
                      <select
                        aria-label="Bayer Matrix Size"
                        value={activeFx.params.matrixSize || '4x4'}
                        onChange={(e) => updateParam('matrixSize', e.target.value)}
                        style={{ width: '100%', padding: '6px', background: '#1c1c1e', color: '#fff', border: '1px solid var(--border-color)', borderRadius: '4px' }}
                      >
                        <option value="2x2">2x2</option>
                        <option value="4x4">4x4</option>
                        <option value="8x8">8x8</option>
                        <option value="16x16">16x16</option>
                        <option value="psx4x4">PSX 4x4 Variant</option>
                      </select>
                    </div>
                  )}

                  {activeFx.params.ditherMode === 'error_diffusion' && (
                    <>
                      <div className="control-group" style={{ marginBottom: '12px' }}>
                        <label className="control-label">Error Diffusion Kernel</label>
                        <select
                          aria-label="Error Diffusion Kernel"
                          value={activeFx.params.errorDiffusionVariant || 'atkinson'}
                          onChange={(e) => updateParam('errorDiffusionVariant', e.target.value)}
                          style={{ width: '100%', padding: '6px', background: '#1c1c1e', color: '#fff', border: '1px solid var(--border-color)', borderRadius: '4px' }}
                        >
                          <option value="floyd_steinberg">Floyd-Steinberg (Classic)</option>
                          <option value="atkinson">Atkinson (Macintosh)</option>
                          <option value="stucki">Stucki (High Quality)</option>
                          <option value="jjn">Jarvis-Judice-Ninke</option>
                          <option value="burkes">Burkes</option>
                          <option value="sierra">Sierra Full</option>
                          <option value="sierra_two_row">Sierra Two-Row</option>
                          <option value="sierra_lite">Sierra Lite</option>
                        </select>
                      </div>
                      <div className="control-group" style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '12px' }}>
                        <Switch 
                          checked={activeFx.params.serpentine === true || activeFx.params.serpentine === 'true'} 
                          onChange={(val) => updateParam('serpentine', val)} 
                        />
                        <span style={{ fontSize: '13px', color: 'var(--text-secondary)' }}>Serpentine Scanning</span>
                        <Tooltip content="Scan left-to-right then right-to-left to reduce directional streaks" />
                      </div>
                    </>
                  )}

                  {activeFx.params.ditherMode === 'IGN' && (
                    <>
                      {renderSlider('IGN Scale', 'scale', 0.1, 10.0, 0.1, 1.0, 'Scale multiplier of Interleaved Gradient Noise')}
                      {renderSlider('Seed', 'seed', 0, 100, 1, 0, 'Noise seed offset')}
                    </>
                  )}

                  {activeFx.params.ditherMode === 'blue_noise' && (
                    <>
                      {renderSlider('Matrix Size', 'matrixSize', 32, 128, 32, 64, 'Blue noise matrix lookup width')}
                      {renderSlider('Seed', 'seed', 0, 100, 1, 42, 'Blue noise seed value')}
                    </>
                  )}

                  {activeFx.params.ditherMode === 'polka_dot' && (
                    <>
                      {renderSlider('Tile Size', 'dotSize', 4, 32, 1, 8, 'Polka grid size')}
                      {renderSlider('Gamma curve', 'gamma', 0.5, 3.0, 0.1, 1.5, 'Gamma contrast curve')}
                    </>
                  )}

                  {activeFx.params.ditherMode === 'wavelet' && (
                    <>
                      <div className="control-group" style={{ marginBottom: '12px' }}>
                        <label className="control-label">Wavelet Type</label>
                        <select
                          aria-label="Wavelet Type"
                          value={activeFx.params.wavelet || 'haar'}
                          onChange={(e) => updateParam('wavelet', e.target.value)}
                          style={{ width: '100%', padding: '6px', background: '#1c1c1e', color: '#fff', border: '1px solid var(--border-color)', borderRadius: '4px' }}
                        >
                          <option value="haar">Haar</option>
                          <option value="db1">Daubechies 1</option>
                          <option value="db2">Daubechies 2</option>
                          <option value="db4">Daubechies 4</option>
                          <option value="sym2">Symlets 2</option>
                        </select>
                      </div>
                      {renderSlider('Subband Quant', 'subbandQuant', 2, 32, 1, 8, 'Frequency band quantization factor')}
                      {renderSlider('Seed', 'seed', 0, 100, 1, 42)}
                    </>
                  )}

                  {activeFx.params.ditherMode === 'adaptive_variance' && (
                    <>
                      {renderSlider('Variance Threshold', 'varThreshold', 0, 1000, 10, 300, 'Threshold for detecting local contrast changes')}
                      {renderSlider('Window Radius', 'windowRadius', 1, 5, 1, 1)}
                    </>
                  )}

                  {activeFx.params.ditherMode === 'hybrid' && (
                    <>
                      {renderSlider('Luminance Factor', 'lumFactor', 0.0, 2.0, 0.1, 1.0)}
                      {renderSlider('Color Factor', 'colFactor', 0.0, 2.0, 0.1, 0.2)}
                    </>
                  )}

                  {activeFx.params.ditherMode === 'halftone' && (
                    <>
                      <div className="control-group" style={{ marginBottom: '12px' }}>
                        <label className="control-label">Dot Shape</label>
                        <select
                          aria-label="Dot Shape"
                          value={activeFx.params.shape || 'circle'}
                          onChange={(e) => updateParam('shape', e.target.value)}
                          style={{ width: '100%', padding: '6px', background: '#1c1c1e', color: '#fff', border: '1px solid var(--border-color)', borderRadius: '4px' }}
                        >
                          <option value="circle">Circle</option>
                          <option value="square">Square</option>
                          <option value="diamond">Diamond</option>
                        </select>
                      </div>
                      {renderSlider('Cell Size', 'dotSize', 2, 32, 1, 8, 'Halftone cells grid width')}
                      {renderSlider('Screen Angle', 'angle', 0, 90, 1, 45, 'Halftone screen alignment angle')}
                      {renderSlider('Dot Gain', 'dotGain', 0.5, 3.0, 0.1, 1.0)}
                      {renderSlider('Sharpness', 'sharpness', 0.5, 4.0, 0.1, 1.5)}
                      {renderSlider('Min Dot Size', 'minDotSize', 0.0, 0.5, 0.05, 0.0)}
                      {renderSlider('Max Dot Size', 'maxDotSize', 0.5, 1.0, 0.05, 1.0)}
                    </>
                  )}

                  {activeFx.params.ditherMode === 'ostromoukhov' && (
                    <div className="control-group" style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                      <Switch 
                        checked={activeFx.params.serpentine === true || activeFx.params.serpentine === 'true'} 
                        onChange={(val) => updateParam('serpentine', val)} 
                      />
                      <span style={{ fontSize: '13px', color: 'var(--text-secondary)' }}>Serpentine Scanning</span>
                    </div>
                  )}

                  {/* Inline Palette Builder */}
                  {['kmeans', 'median_cut', 'uniform'].includes(activeFx.params.paletteSource) && (
                    <div style={{ marginTop: '16px', borderTop: '1px solid var(--border-color)', paddingTop: '16px' }}>
                      <PaletteBuilder />
                    </div>
                  )}
                </>
              )}

              {/* CMYK HALFTONE LAYER */}
              {activeFx.type === 'halftone' && (
                <>
                  {renderSlider('Dot Size', 'dotSize', 1, 24, 1, 4, 'Base size of halftone grid elements')}
                  {renderSlider('Cyan Angle', 'angleC', 0, 90, 1, 15)}
                  {renderSlider('Magenta Angle', 'angleM', 0, 90, 1, 75)}
                  {renderSlider('Yellow Angle', 'angleY', 0, 90, 1, 0)}
                  {renderSlider('Black Angle', 'angleK', 0, 90, 1, 45, 'Grid screen rotation angles to prevent Moiré patterns')}
                </>
              )}

              {/* ANALOG GLITCH LAYER */}
              {activeFx.type === 'analog-glitch' && 
                renderSlider('Horizontal Displace', 'intensity', 0.0, 1.0, 0.05, 0.5, 'Amount of horizontal sync dislocation')
              }

              {/* EPSILON GLOW LAYER */}
              {activeFx.type === 'epsilon-glow' && 
                renderSlider('Glow Intensity', 'intensity', 0.0, 1.0, 0.05, 0.5, 'Brightness and radius of neon glows')
              }

              {/* CRT MONITOR LAYER */}
              {activeFx.type === 'crt-phosphor' && 
                renderSlider('Scanline Bleed', 'intensity', 0.0, 1.0, 0.05, 0.5, 'CRT phosphor scanline intensity')
              }

              {/* TEMPORAL NOISE LAYER */}
              {activeFx.type === 'temporal-noise' && (
                <>
                  {renderSlider('Noise Amount', 'intensity', 0.0, 1.0, 0.01, 0.15, 'Intensity of the animated Gold Noise')}
                  {renderSlider('Grain Scale', 'noiseScale', 0.1, 4.0, 0.1, 1.0, 'Thickness of the noise grain elements')}
                  {renderSlider('Quantization', 'numColors', 0, 64, 1, 0, 'Color quantization levels (0 = bypass)')}
                </>
              )}

              {/* DATAMOSH LAYER */}
              {activeFx.type === 'datamosh' && (
                <>
                  <div className="control-group" style={{ marginBottom: '12px' }}>
                    <label className="control-label">Datamoshing Mode</label>
                    <select
                      aria-label="Datamoshing Mode"
                      value={activeFx.params.mode || 'classic'}
                      onChange={(e) => updateParam('mode', e.target.value)}
                      style={{ width: '100%', padding: '6px', background: '#1c1c1e', color: '#fff', border: '1px solid var(--border-color)', borderRadius: '4px', marginTop: '6px' }}
                    >
                      <optgroup label="Automosh Tomato (AVI Chunk Breaks)">
                        <option value="void">Void (drops keyframes)</option>
                        <option value="bloom">Bloom (keyframe loop)</option>
                        <option value="pulse">Pulse (p-frame chunk loop)</option>
                        <option value="overlap">Overlap (consecutive loop)</option>
                        <option value="jiggle">Jiggle (random frame jitter)</option>
                        <option value="reverse">Reverse (reverses frames)</option>
                        <option value="invert">Invert (swaps alternate frames)</option>
                        <option value="random">Random (randomizes frames)</option>
                      </optgroup>
                      <optgroup label="Classic AVI Glitching (Re-encoding)">
                        <option value="classic">Classic (range & delta p-frames)</option>
                        <option value="classic2">Classic 2 (precise frame range)</option>
                        <option value="repeat">Repeat (precise loop sequence)</option>
                        <option value="glide">Glide (repeats macroblocks)</option>
                        <option value="sort">Sort (size sorting)</option>
                        <option value="echo">Echo (double stream blend)</option>
                      </optgroup>
                      <optgroup label="FFglitch Built-in Python Engine">
                        <option value="fluid">Fluid (liquid motion average)</option>
                        <option value="stretch">Stretch (macroblock stretching)</option>
                        <option value="motion_transfer">Motion Transfer (copy vectors)</option>
                        <option value="shuffle_basic">Shuffle (frame chunk shuffle)</option>
                        <option value="rise">Rise (keyframe range drop)</option>
                        <option value="water_bloom">Water Bloom (precise clone)</option>
                        <option value="combine">Combine (multi-video merger)</option>
                      </optgroup>
                      <optgroup label="FFglitch Javascript Scripts">
                        <option value="zoom">Zoom (motion scale)</option>
                        <option value="delay">Delay (motion echo buffer)</option>
                        <option value="buffer">Buffer (motion feedback)</option>
                        <option value="noise">Noise (macroblock pixelate)</option>
                        <option value="shift">Shift (translate vectors)</option>
                        <option value="sink">Sink (drowns next frame)</option>
                        <option value="slice">Slice (horizontal slice jitter)</option>
                        <option value="stop">Stop (freezes frames randomly)</option>
                        <option value="vibrate">Vibrate (vector jitter)</option>
                        <option value="invert-reverse">Invert-Reverse (reverses/swaps)</option>
                        <option value="mirror">Mirror (vertical mirror)</option>
                        <option value="shear">Shear (tilt/rotate)</option>
                        <option value="slam zoom">Slam Zoom (impact zoom)</option>
                      </optgroup>
                    </select>
                  </div>

                  {/* General parameters for Tomato modes */}
                  {['bloom', 'pulse', 'overlap', 'jiggle', 'void', 'reverse', 'invert', 'random'].includes(activeFx.params.mode) && (
                    <>
                      {renderSlider('Kill Frame Size', 'kill', 0.0, 1.0, 0.05, 0.6, 'Drop threshold for keyframe sizes (smaller kills more)')}
                      <div style={{ display: 'flex', gap: '16px', marginBottom: '12px' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                          <Switch 
                            checked={activeFx.params.keepAudio !== false} 
                            onChange={(val) => updateParam('keepAudio', val)} 
                          />
                          <span style={{ fontSize: '12px', color: 'var(--text-secondary)' }}>Keep Audio</span>
                        </div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                          <Switch 
                            checked={activeFx.params.keepFrame !== false} 
                            onChange={(val) => updateParam('keepFrame', val)} 
                          />
                          <span style={{ fontSize: '12px', color: 'var(--text-secondary)' }}>Keep First Frame</span>
                        </div>
                      </div>
                    </>
                  )}

                  {/* Bloom / Pulse / Overlap specific params */}
                  {['bloom', 'pulse', 'overlap'].includes(activeFx.params.mode) && (
                    <>
                      {renderSlider('Frame Count', 'count', 1, 100, 1, 20, 'Number of frames to duplicate/loop')}
                      {renderSlider('Position Frame', 'frame', 1, 1000, 1, 1, 'Frame position to start the loop')}
                    </>
                  )}

                  {/* Jiggle specific params */}
                  {activeFx.params.mode === 'jiggle' && (
                    <>
                      {renderSlider('Jitter Amount', 'frame', 1, 100, 1, 5, 'Spread amount for jiggling frames')}
                    </>
                  )}

                  {/* Classic AVI modes */}
                  {activeFx.params.mode === 'classic' && (
                    <>
                      {renderSlider('Start Time (s)', 'start', 0, 100, 1, 0)}
                      {renderSlider('End Time (s)', 'end', 1, 100, 1, 10)}
                      {renderSlider('P-frames (Delta)', 'p', 1, 100, 1, 1, 'Inject every n-th delta P-frame')}
                    </>
                  )}

                  {activeFx.params.mode === 'classic2' && (
                    <>
                      {renderSlider('Start Frame', 'startFrame', 0, 2000, 1, 0)}
                      {renderSlider('End Frame', 'endFrame', 1, 2000, 1, 1000)}
                    </>
                  )}

                  {activeFx.params.mode === 'repeat' && (
                    <>
                      {renderSlider('Start Frame', 'startFrame', 0, 2000, 1, 0)}
                      {renderSlider('End Frame', 'endFrame', 1, 2000, 1, 1000)}
                      {renderSlider('Repeat Count (P-frames)', 'p', 1, 100, 1, 5)}
                    </>
                  )}

                  {activeFx.params.mode === 'glide' && (
                    <>
                      {renderSlider('Glide P-frames', 'p', 1, 100, 1, 5)}
                    </>
                  )}

                  {activeFx.params.mode === 'sort' && (
                    <div style={{ display: 'flex', gap: '16px', marginBottom: '12px' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                        <Switch 
                          checked={activeFx.params.keepFirst !== false} 
                          onChange={(val) => updateParam('keepFirst', val)} 
                        />
                        <span style={{ fontSize: '12px', color: 'var(--text-secondary)' }}>Keep First Frame</span>
                      </div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                        <Switch 
                          checked={activeFx.params.reverse || false} 
                          onChange={(val) => updateParam('reverse', val)} 
                        />
                        <span style={{ fontSize: '12px', color: 'var(--text-secondary)' }}>Reverse Order</span>
                      </div>
                    </div>
                  )}

                  {activeFx.params.mode === 'echo' && (
                    <>
                      {renderSlider('Midpoint Blend', 'mid', 0.0, 1.0, 0.1, 0.5, 'Blend balance between input and echo stream')}
                    </>
                  )}

                  {/* FFglitch Built-in Python modes */}
                  {activeFx.params.mode === 'fluid' && (
                    <>
                      {renderSlider('Fluidity Amount', 'fluidity', 1, 20, 1, 5, 'How smoothly vectors are averaged (liquid effect)')}
                    </>
                  )}

                  {activeFx.params.mode === 'stretch' && (
                    <div className="control-group" style={{ marginBottom: '12px' }}>
                      <label className="control-label">Stretch Direction</label>
                      <select
                        aria-label="Stretch Direction"
                        value={activeFx.params.direction || 'horizontal'}
                        onChange={(e) => updateParam('direction', e.target.value)}
                        style={{ width: '100%', padding: '6px', background: '#1c1c1e', color: '#fff', border: '1px solid var(--border-color)', borderRadius: '4px', marginTop: '6px' }}
                      >
                        <option value="horizontal">Horizontal</option>
                        <option value="vertical">Vertical</option>
                      </select>
                    </div>
                  )}

                  {activeFx.params.mode === 'shuffle_basic' && (
                    <>
                      {renderSlider('Chunk Size', 'chunkSize', 1, 100, 1, 1, 'Chunk size of frames to shuffle')}
                    </>
                  )}

                  {activeFx.params.mode === 'rise' && (
                    <>
                      {renderSlider('Start Frame', 'startFrame', 1, 2000, 1, 1)}
                      {renderSlider('End Frame', 'endFrame', 2, 2000, 1, 100)}
                    </>
                  )}

                  {activeFx.params.mode === 'water_bloom' && (
                    <>
                      {renderSlider('Position Frame', 'positionFrame', 1, 2000, 1, 1)}
                      {renderSlider('Repeat Count', 'repeatCount', 1, 100, 1, 20)}
                    </>
                  )}

                  {activeFx.params.mode === 'combine' && (
                    <div className="control-group" style={{ marginBottom: '16px' }}>
                      <label className="control-label" style={{ fontSize: '11px', textTransform: 'uppercase', color: 'var(--text-secondary)' }}>Combine Video Files</label>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', marginTop: '6px' }}>
                        {(activeFx.params.combineVideos || []).map((vidPath: string, idx: number) => (
                          <div key={idx} style={{ display: 'flex', gap: '6px', alignItems: 'center' }}>
                            <input 
                              type="text" 
                              value={vidPath.replace('media://', '')} 
                              disabled 
                              style={{ flex: 1, padding: '4px 6px', fontSize: '12px', background: '#1c1c1e', color: 'var(--text-secondary)', border: '1px solid var(--border-color)', borderRadius: '4px' }}
                            />
                            <Button 
                              variant="glass" 
                              size="sm" 
                              style={{ padding: '2px 6px', minWidth: 'auto' }}
                              onClick={() => {
                                const list = [...(activeFx.params.combineVideos || [])];
                                list.splice(idx, 1);
                                updateParam('combineVideos', list);
                              }}
                            >
                              X
                            </Button>
                          </div>
                        ))}
                        <Button 
                          variant="glass" 
                          size="sm" 
                          style={{ width: '100%', marginTop: '4px' }}
                          onClick={async () => {
                            if (!window.ipcRenderer) return;
                            const url = await window.ipcRenderer.invoke('dialog:openMedia');
                            if (url) {
                              const list = [...(activeFx.params.combineVideos || []), url];
                              updateParam('combineVideos', list);
                            }
                          }}
                        >
                          + Add Video File
                        </Button>
                      </div>
                    </div>
                  )}

                  {/* Motion Transfer Picker */}
                  {activeFx.params.mode === 'motion_transfer' && (
                    <div className="control-group" style={{ marginBottom: '16px' }}>
                      <label className="control-label" style={{ fontSize: '11px', textTransform: 'uppercase', color: 'var(--text-secondary)' }}>Motion Vector Video Source</label>
                      <div style={{ display: 'flex', gap: '8px', marginTop: '6px' }}>
                        <input 
                          type="text" 
                          value={activeFx.params.motionUrl ? activeFx.params.motionUrl.replace('media://', '') : ''} 
                          disabled 
                          style={{ flex: 1, padding: '6px', fontSize: '12px', background: '#1c1c1e', color: 'var(--text-secondary)', border: '1px solid var(--border-color)', borderRadius: '4px' }}
                          placeholder="Select reference video..."
                        />
                        <Button variant="glass" size="sm" onClick={handleMTImport}>Browse</Button>
                      </div>
                    </div>
                  )}

                  {/* JS Vector Scripts Specific Params */}
                  {activeFx.params.mode === 'zoom' && (
                    <>
                      {renderSlider('Zoom Strength', 'zoom', -100, 100, 5, 20, 'Adjust JS Vector Zoom level')}
                    </>
                  )}

                  {activeFx.params.mode === 'delay' && (
                    <>
                      {renderSlider('Delay Frame count', 'delay', 1, 100, 1, 20, 'Length of delay frame buffer')}
                    </>
                  )}

                  {activeFx.params.mode === 'buffer' && (
                    <>
                      {renderSlider('Buffer Delay', 'delay', 1, 100, 1, 10)}
                      {renderSlider('Feedback Level', 'feedback', 0.01, 2.0, 0.05, 0.5, 'Feedback multiplier')}
                    </>
                  )}

                  {activeFx.params.mode === 'shift' && (
                    <>
                      {renderSlider('Vertical Gravity Offset', 'origGravity', -50, 50, 1, 10, 'Amount of vertical shifting gravity')}
                    </>
                  )}

                  {/* Common / shared JS vector effect parameters */}
                  {['noise', 'sink', 'slice', 'stop', 'vibrate', 'invert-reverse', 'mirror', 'shear', 'slam zoom'].includes(activeFx.params.mode) && (
                    <>
                      {renderSlider('Percentage Ratio', 'somePercentage', 0.0, 1.0, 0.05, 0.5, 'Scale or ratio multiplier of the effect')}
                      {renderSlider('Randomness Offset', 'randomness', 0, 100, 5, 50)}
                      {renderSlider('Magnitude Strength', 'magnitude', 1, 100, 1, 10)}
                    </>
                  )}
                </>
              )}
            </div>

            {/* 2. SELECTIVE MASKING SECTION */}
            <div className="glass-panel" style={{ padding: '16px', background: 'rgba(255,255,255,0.02)', borderRadius: 'var(--radius-lg)' }}>
              <h4 style={{ fontSize: '12px', textTransform: 'uppercase', color: 'var(--text-secondary)', letterSpacing: '0.05em', marginBottom: '12px', fontWeight: 600 }}>
                Selective Masking
              </h4>
              
              <div className="control-group" style={{ marginBottom: '12px' }}>
                <label className="control-label" style={{ fontSize: '11px', color: 'var(--text-secondary)', display: 'block', marginBottom: '4px' }}>Mask Type</label>
                <select
                  aria-label="Mask Type"
                  value={activeFx.mask?.type || 'none'}
                  onChange={(e) => {
                    const newType = e.target.value as EffectMask['type'];
                    setActiveEffects(activeEffects.map(fx => 
                      fx.id === activeFx.id 
                        ? { ...fx, mask: { ...(fx.mask || { invert: false }), type: newType } }
                        : fx
                    ));
                    if (newType === 'brush') {
                      setIsPaintingMask(true);
                    } else {
                      setIsPaintingMask(false);
                    }
                  }}
                  style={{ width: '100%', padding: '6px', background: '#1c1c1e', color: '#fff', border: '1px solid var(--border-color)', borderRadius: '4px' }}
                >
                  <option value="none">None (Apply to Entire Frame)</option>
                  <option value="brush">Brush (Draw Mask on Canvas)</option>
                  <option value="radial">Radial Gradient (Circular area)</option>
                  <option value="linear">Linear Gradient (Split screen)</option>
                  <option value="sam">AI Masking (Click to Segment)</option>
                </select>
              </div>

              {activeFx.mask?.type === 'brush' && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', padding: '8px 0' }}>
                  <div className="control-group" style={{ marginBottom: '12px', width: '100%' }}>
                    <ControlGroup
                      label="Brush Size"
                      value={maskBrushSize}
                      onChange={(val) => setMaskBrushSize(Number(val))}
                      min={5}
                      max={100}
                      step={1}
                      defaultValue={30}
                    />
                  </div>
                  <div style={{ display: 'flex', gap: '8px', alignItems: 'center', marginBottom: '8px' }}>
                    <Switch 
                      checked={maskBrushEraser} 
                      onChange={setMaskBrushEraser} 
                    />
                    <span style={{ fontSize: '13px', color: 'var(--text-secondary)' }}>Use Eraser</span>
                  </div>
                  <div style={{ display: 'flex', gap: '8px' }}>
                    <Button 
                      variant="glass" 
                      size="sm" 
                      style={{ flex: 1 }}
                      onClick={() => {
                        // Clear canvas logic: replace brushData with blank state
                        setActiveEffects(activeEffects.map(fx => 
                          fx.id === activeFx.id 
                            ? { ...fx, mask: { ...(fx.mask || {}), type: 'brush', brushData: undefined } }
                            : fx
                        ));
                      }}
                    >
                      Clear Brush Mask
                    </Button>
                    <Button 
                      variant="glass" 
                      size="sm"
                      onClick={() => setIsPaintingMask(!isPaintingMask)}
                      style={{ borderColor: isPaintingMask ? 'var(--accent-primary)' : 'var(--border-color)' }}
                    >
                      {isPaintingMask ? 'Stop Painting' : 'Start Painting'}
                    </Button>
                  </div>
                  <span style={{ fontSize: '11px', color: 'var(--text-tertiary)', marginTop: '4px' }}>
                    * Paint directly on the video preview above to selectively draw the effect!
                  </span>
                </div>
              )}

              {activeFx.mask?.type === 'radial' && (
                <>
                  {renderSlider('Radius', 'radialRadius', 0.05, 1.0, 0.01, 0.3)}
                  {/* We map CX and CY coordinates under radialCenter inside the mask object */}
                  <div className="control-group" style={{ marginBottom: '12px' }}>
                    <ControlGroup
                      label="Center X"
                      value={activeFx.mask?.radialCenter?.x ?? 0.5}
                      onChange={(val) => {
                        setActiveEffects(activeEffects.map(fx => 
                          fx.id === activeFx.id 
                            ? { ...fx, mask: { ...(fx.mask || {}), type: 'radial', radialCenter: { ...(fx.mask?.radialCenter || { x: 0.5, y: 0.5 }), x: Number(val) } } }
                            : fx
                        ));
                      }}
                      min={0.0}
                      max={1.0}
                      step={0.01}
                      defaultValue={0.5}
                    />
                  </div>
                  <div className="control-group" style={{ marginBottom: '12px' }}>
                    <ControlGroup
                      label="Center Y"
                      value={activeFx.mask?.radialCenter?.y ?? 0.5}
                      onChange={(val) => {
                        setActiveEffects(activeEffects.map(fx => 
                          fx.id === activeFx.id 
                            ? { ...fx, mask: { ...(fx.mask || {}), type: 'radial', radialCenter: { ...(fx.mask?.radialCenter || { x: 0.5, y: 0.5 }), y: Number(val) } } }
                            : fx
                        ));
                      }}
                      min={0.0}
                      max={1.0}
                      step={0.01}
                      defaultValue={0.5}
                    />
                  </div>
                </>
              )}

              {activeFx.mask?.type === 'linear' && (
                <>
                  {renderSlider('Gradient Angle', 'linearAngle', 0, 360, 5, 0)}
                  {renderSlider('Gradient Offset', 'linearOffset', -1.0, 1.0, 0.05, 0.0)}
                </>
              )}

              {activeFx.mask?.type === 'sam' && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', padding: '8px 0' }}>

                  {/* STEP 1: Prepare Model */}
                  <div className={`sam-step ${samStatus !== 'ready' ? 'sam-step--active' : ''}`}>
                    <div className="sam-step__number">1</div>
                    <div className="sam-step__content">
                      <div className="sam-step__title">SAM 3</div>
                      <div className="sam-step__body">
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '4px' }}>
                          <div
                            style={{
                              width: '8px',
                              height: '8px',
                              borderRadius: '50%',
                              background: samStatus === 'ready' ? 'var(--accent-primary)' : samStatus === 'error' ? '#ff5050' : samStatus === 'loading' ? '#00aaff' : 'var(--text-tertiary)',
                              flexShrink: 0,
                            }}
                          />
                          <span style={{ fontSize: '12px', fontWeight: 500, color: 'var(--text-secondary)' }}>
                            {samStatus === 'ready' ? 'Ready' : samStatus === 'loading' ? `Downloading ${Math.round(samProgress)}%` : samStatus === 'error' ? `Error: ${samError}` : 'Click image to start'}
                          </span>
                        </div>
                        {samStatus === 'loading' && (
                          <div style={{ width: '100%', height: '3px', background: 'rgba(255,255,255,0.08)', borderRadius: '2px', overflow: 'hidden', marginTop: '4px' }}>
                            <div
                              style={{
                                width: `${samProgress}%`,
                                height: '100%',
                                background: 'var(--accent-primary)',
                                borderRadius: '2px',
                                transition: 'width 0.2s ease',
                              }}
                            />
                          </div>
                        )}
                        {samStatus === 'loading' && samLoadingStep && (
                          <div style={{ fontSize: '10px', color: '#00aaff', marginTop: '4px' }}>{samLoadingStep}</div>
                        )}
                      </div>
                    </div>
                  </div>

                  {/* STEP 2: Segment */}
                  <div className={`sam-step ${samStatus === 'ready' && !activeFx.mask?.samMaskData ? 'sam-step--active' : ''}`}>
                    <div className="sam-step__number">2</div>
                    <div className="sam-step__content">
                      <div className="sam-step__title">Segment</div>
                      <div className="sam-step__body" style={{ opacity: samStatus === 'ready' ? 1 : 0.4, pointerEvents: samStatus === 'ready' ? 'auto' : 'none' }}>
                        <ControlGroup
                          label="IoU Threshold"
                          value={samThreshold}
                          onChange={(val) => setSamThreshold(Number(val))}
                          min={0}
                          max={1}
                          step={0.05}
                          defaultValue={0.0}
                        />
                        {/* Text-prompt segmentation (SAM 3) */}
                        <div style={{ display: 'flex', gap: '6px', marginTop: '8px', marginBottom: '6px' }}>
                          <input
                            type="text"
                            placeholder="Type object name (e.g. person, car)..."
                            aria-label="Text prompt for segmentation"
                            id="sam-text-prompt"
                            style={{ flex: 1, padding: '6px 8px', background: '#1c1c1e', color: '#fff', border: '1px solid var(--border-color)', borderRadius: '4px', fontSize: '12px' }}
                            onKeyDown={(e) => {
                              if (e.key === 'Enter') {
                                const input = e.currentTarget;
                                const prompt = input.value.trim();
                                if (prompt && mediaUrl) {
                                  const fn = samGroundingDino
                                    ? predictSamGroundingDINO
                                    : samProMode
                                      ? predictSamTextPro
                                      : predictSamText;
                                  fn(mediaUrl, prompt)?.then((mask) => {
                                    if (mask && activeFx) {
                                      setActiveEffects((prev) =>
                                        prev.map((fx) =>
                                          fx.id === activeFx.id
                                            ? { ...fx, mask: { ...fx.mask, type: 'sam', samMaskData: mask.dataUrl } }
                                            : fx
                                        )
                                      );
                                    }
                                  });
                                }
                              }
                            }}
                          />
                          <Button
                            variant="glass"
                            size="sm"
                            onClick={() => {
                              const input = document.getElementById('sam-text-prompt') as HTMLInputElement | null;
                              const prompt = input?.value.trim() ?? '';
                              if (prompt && mediaUrl) {
                                const fn = samGroundingDino
                                  ? predictSamGroundingDINO
                                  : samProMode
                                    ? predictSamTextPro
                                    : predictSamText;
                                fn(mediaUrl, prompt)?.then((mask) => {
                                  if (mask && activeFx) {
                                    setActiveEffects((prev) =>
                                      prev.map((fx) =>
                                        fx.id === activeFx.id
                                          ? { ...fx, mask: { ...fx.mask, type: 'sam', samMaskData: mask.dataUrl } }
                                          : fx
                                      )
                                    );
                                  }
                                });
                              }
                            }}
                            disabled={samStatus !== 'ready'}
                          >
                            {samGroundingDino ? 'Detect (DINO)' : samProMode ? 'Detect (PRO)' : 'Detect'}
                          </Button>
                        </div>
                        {/* Mode toggles */}
                        <div style={{ display: 'flex', gap: '12px', alignItems: 'center', marginTop: '6px', marginBottom: '4px' }}>
                          <div style={{ display: 'flex', gap: '4px', alignItems: 'center' }}>
                            <Switch checked={samProMode} onChange={(v) => { setSamProMode(v); if (v) setSamGroundingDino(false); }} />
                            <span style={{ fontSize: '11px', color: 'var(--text-secondary)' }}>PRO</span>
                            <Tooltip content="Advanced post-processing for hair, fur, fine details (median blur + morphological ops + connected components)" />
                          </div>
                          <div style={{ display: 'flex', gap: '4px', alignItems: 'center' }}>
                            <Switch checked={samGroundingDino} onChange={(v) => { setSamGroundingDino(v); if (v) setSamProMode(false); }} />
                            <span style={{ fontSize: '11px', color: 'var(--text-secondary)' }}>DINO</span>
                            <Tooltip content="Use GroundingDINO text-to-box detection for more precise object localization (slower, more accurate)" />
                          </div>
                        </div>
                        <div style={{ fontSize: '11px', color: 'var(--text-tertiary)', marginTop: '4px' }}>
                          LMB = Add point, RMB = Exclude, Ctrl+Click = Flood fill, or type a prompt above.
                        </div>
                        {activeFx.mask?.samClickPoint && !activeFx.mask?.samMaskData && (
                          <div style={{ fontSize: '11px', color: 'var(--accent-primary)', marginTop: '4px' }}>
                            Click on the preview to segment...
                          </div>
                        )}
                      </div>
                    </div>
                  </div>

                  {/* STEP 3: Post-Process */}
                  <div className="sam-step">
                    <div className="sam-step__number">3</div>
                    <div className="sam-step__content">
                      <div className="sam-step__title">Post-Process</div>
                      <div className="sam-step__body" style={{ opacity: activeFx.mask?.samMaskData ? 1 : 0.4, pointerEvents: activeFx.mask?.samMaskData ? 'auto' : 'none' }}>
                        <div style={{ display: 'flex', gap: '8px', alignItems: 'center', marginBottom: '6px' }}>
                          <Switch checked={backgroundRemovalEnabled} onChange={setBackgroundRemovalEnabled} />
                          <span style={{ fontSize: '12px', color: 'var(--text-secondary)' }}>Background Removal</span>
                          <Tooltip content="Remove background instead of segmenting foreground" />
                        </div>
                        <ControlGroup
                          label={`Grow: ${postProcessParams.grow}px`}
                          value={postProcessParams.grow}
                          onChange={(val) => setPostProcessParams((p) => ({ ...p, grow: Number(val) }))}
                          min={-50}
                          max={50}
                          step={1}
                          defaultValue={0}
                        />
                        <ControlGroup
                          label={`Blur: ${postProcessParams.blur}px`}
                          value={postProcessParams.blur}
                          onChange={(val) => setPostProcessParams((p) => ({ ...p, blur: Number(val) }))}
                          min={0}
                          max={50}
                          step={1}
                          defaultValue={0}
                        />
                        <ControlGroup
                          label={`Fill Holes: ${postProcessParams.fillHoles}`}
                          value={postProcessParams.fillHoles}
                          onChange={(val) => setPostProcessParams((p) => ({ ...p, fillHoles: Number(val) }))}
                          min={0}
                          max={1000}
                          step={10}
                          defaultValue={0}
                        />
                        <ControlGroup
                          label={`Smooth: ${postProcessParams.smooth}px`}
                          value={postProcessParams.smooth}
                          onChange={(val) => setPostProcessParams((p) => ({ ...p, smooth: Number(val) }))}
                          min={0}
                          max={100}
                          step={1}
                          defaultValue={0}
                        />
                      </div>
                    </div>
                  </div>

                  {/* STEP 4: Manage */}
                  <div className={`sam-step ${activeFx.mask?.samMaskData ? 'sam-step--active' : ''}`}>
                    <div className="sam-step__number">4</div>
                    <div className="sam-step__content">
                      <div className="sam-step__title">Manage Result</div>
                      <div className="sam-step__body">
                        {maskLayers.length > 0 && (
                          <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', marginBottom: '8px' }}>
                            {maskLayers.map((layer) => (
                              <div key={layer.id} style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '4px 8px', background: 'rgba(255,255,255,0.03)', borderRadius: '4px' }}>
                                <Switch checked={layer.visible} onChange={(v) => setMaskLayers((prev) => prev.map((l) => l.id === layer.id ? { ...l, visible: v } : l))} />
                                <span style={{ fontSize: '12px', color: 'var(--text-secondary)', flex: 1 }}>{layer.name}</span>
                                <Button variant="ghost" size="sm" onClick={() => setMaskLayers((prev) => prev.filter((l) => l.id !== layer.id))}>Remove</Button>
                              </div>
                            ))}
                          </div>
                        )}
                        {activeFx.mask?.samMaskData && (
                          <div style={{ display: 'flex', gap: '8px' }}>
                            <Button variant="glass" size="sm" onClick={() => {
                              setActiveEffects(activeEffects.map(fx =>
                                fx.id === activeFx.id
                                  ? { ...fx, mask: { ...(fx.mask || {}), type: 'sam', samMaskData: undefined, samClickPoint: undefined } }
                                  : fx
                              ));
                            }}>
                              Clear AI Mask
                            </Button>
                            <Button variant="glass" size="sm" onClick={() => {
                              if (activeFx.mask?.samMaskData) {
                                const newLayer = {
                                  id: `layer-${Date.now()}`,
                                  name: `SAM Mask ${maskLayers.length + 1}`,
                                  visible: true,
                                  maskData: activeFx.mask.samMaskData,
                                  width: 0,
                                  height: 0,
                                  postProcessed: false,
                                };
                                setMaskLayers((prev) => [...prev, newLayer]);
                              }
                            }}>
                              Add to Layers
                            </Button>
                          </div>
                        )}
                      </div>
                    </div>
                  </div>

                </div>
              )}{activeFx.mask && activeFx.mask.type !== 'none' && (
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginTop: '8px' }}>
                  <Switch 
                    checked={activeFx.mask.invert || false} 
                    onChange={(val) => {
                      setActiveEffects(activeEffects.map(fx => 
                        fx.id === activeFx.id 
                          ? { ...fx, mask: { ...(fx.mask || { type: 'none' }), invert: val } }
                          : fx
                      ));
                    }} 
                  />
                  <span style={{ fontSize: '13px', color: 'var(--text-secondary)' }}>Invert Mask</span>
                </div>
              )}
            </div>

            {/* 2.4b ENVIRONMENT SETTINGS */}
            <div className="glass-panel" style={{ padding: '16px', background: 'rgba(255,255,255,0.02)', borderRadius: 'var(--radius-lg)', marginTop: '16px' }}>
              <h4 style={{ fontSize: '12px', textTransform: 'uppercase', color: 'var(--text-secondary)', letterSpacing: '0.05em', marginBottom: '12px', fontWeight: 600 }}>
                Backend Environment
              </h4>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                <div className="control-group">
                  <label style={{ fontSize: '11px', color: 'var(--text-secondary)', display: 'block', marginBottom: '4px' }}>Mode</label>
                  <select
                    value={envMode}
                    onChange={async (e) => {
                      const mode = e.target.value as 'local' | 'system';
                      setEnvMode(mode);
                      if (window.ipcRenderer) {
                        await window.ipcRenderer.invoke('env:set-mode', mode);
                        const status = await window.ipcRenderer.invoke('env:status') as { pythonOk: boolean; ffmpegOk: boolean; ffglitchOk: boolean };
                        setEnvStatus({ pythonOk: status.pythonOk, ffmpegOk: status.ffmpegOk, ffglitchOk: status.ffglitchOk });
                      }
                      addToast(`Switched to ${mode} mode � restart may be needed`, 'info');
                    }}
                    style={{ width: '100%', padding: '6px', background: '#1c1c1e', color: '#fff', border: '1px solid var(--border-color)', borderRadius: '4px' }}
                  >
                    <option value="local">Local Environment (Bundled)</option>
                    <option value="system">System PATH</option>
                  </select>
                </div>
                <Button variant="glass" size="sm" onClick={() => setEnvStatusOpen(!envStatusOpen)}>
                  {envStatusOpen ? 'Hide' : 'Show'} Component Status
                </Button>
                {envStatusOpen && envStatus && (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', fontSize: '12px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                      <span style={{ width: 8, height: 8, borderRadius: '50%', background: envStatus.pythonOk ? 'var(--accent-primary)' : '#ff5050' }} />
                      <span style={{ color: 'var(--text-secondary)' }}>Python</span>
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                      <span style={{ width: 8, height: 8, borderRadius: '50%', background: envStatus.ffmpegOk ? 'var(--accent-primary)' : '#ff5050' }} />
                      <span style={{ color: 'var(--text-secondary)' }}>FFmpeg</span>
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                      <span style={{ width: 8, height: 8, borderRadius: '50%', background: envStatus.ffglitchOk ? 'var(--accent-primary)' : '#ff5050' }} />
                      <span style={{ color: 'var(--text-secondary)' }}>FFglitch</span>
                    </div>
                  </div>
                )}
                {typeof process !== 'undefined' && process.platform !== 'win32' && (
                  <span style={{ fontSize: '11px', color: '#F59E0B' }}>
                    FFglitch is not officially available for your platform.
                    Datamoshing effects requiring FFglitch will be limited.
                  </span>
                )}
              </div>
            </div>

            {/* 2.5 AUTO-KEYFRAME FROM BEATS SECTION */}
            {mediaUrl && (
              <div className="glass-panel" style={{ padding: '16px', background: 'rgba(255,255,255,0.02)', borderRadius: 'var(--radius-lg)', marginTop: '16px' }}>
                <h4 style={{ fontSize: '12px', textTransform: 'uppercase', color: 'var(--text-secondary)', letterSpacing: '0.05em', marginBottom: '12px', fontWeight: 600 }}>
                  Auto-Keyframe from Beats
                </h4>

                <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                  <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                    <Button
                      variant="glass"
                      size="sm"
                      style={{ flex: 1 }}
                      onClick={() => setBeatGenOpen(!beatGenOpen)}
                    >
                      {beatGenOpen ? 'Close' : 'Generate from Audio'}
                    </Button>
                  </div>

                  {beatGenOpen && (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', paddingTop: '8px' }}>
                      <div className="control-group">
                        <label className="control-label" style={{ fontSize: '11px', color: 'var(--text-secondary)', display: 'block', marginBottom: '4px' }}>Parameter to Animate</label>
                        <select
                          aria-label="Parameter to animate"
                          value={beatGenParam}
                          onChange={(e) => setBeatGenParam(e.target.value)}
                          style={{ width: '100%', padding: '6px', background: '#1c1c1e', color: '#fff', border: '1px solid var(--border-color)', borderRadius: '4px' }}
                        >
                          <option value="">-- Select parameter --</option>
                          {activeFx && Object.keys(activeFx.params).map((k) => {
                            const v = activeFx.params[k];
                            if (typeof v === 'number') {
                              return <option key={k} value={k}>{k}</option>;
                            }
                            return null;
                          })}
                        </select>
                      </div>

                      <div className="control-group">
                        <label className="control-label" style={{ fontSize: '11px', color: 'var(--text-secondary)', display: 'block', marginBottom: '4px' }}>Mode</label>
                        <select
                          aria-label="Beat keyframe mode"
                          value={beatGenMode}
                          onChange={(e) => setBeatGenMode(e.target.value as BeatKeyframeMode)}
                          style={{ width: '100%', padding: '6px', background: '#1c1c1e', color: '#fff', border: '1px solid var(--border-color)', borderRadius: '4px' }}
                        >
                          <option value="pulse">Pulse (spike on beat, decay)</option>
                          <option value="toggle">Toggle (alternate min/max)</option>
                          <option value="ramp">Ramp (increase per beat)</option>
                          <option value="decay">Decay (peak then fade)</option>
                        </select>
                      </div>

                      <div style={{ display: 'flex', gap: '12px' }}>
                        <div style={{ flex: 1 }}>
                          <ControlGroup
                            label="Min Value"
                            value={beatGenMin}
                            onChange={(v) => setBeatGenMin(Number(v))}
                            min={-999}
                            max={999}
                            step={0.1}
                            defaultValue={0}
                          />
                        </div>
                        <div style={{ flex: 1 }}>
                          <ControlGroup
                            label="Max Value"
                            value={beatGenMax}
                            onChange={(v) => setBeatGenMax(Number(v))}
                            min={-999}
                            max={999}
                            step={0.1}
                            defaultValue={1}
                          />
                        </div>
                      </div>

                      <Button
                        variant="primary"
                        size="sm"
                        disabled={!beatGenParam || beatGenLoading}
                        onClick={async () => {
                          if (!activeFx || !mediaUrl || !beatGenParam) return;
                          setBeatGenLoading(true);
                          try {
                            // Fetch media file as blob via registered protocol
                            const res = await fetch(mediaUrl);
                            const blob = await res.blob();
                            const audioBuffer = await decodeAudioFile(blob);
                            const { beats } = detectBeats(audioBuffer, 1.3);

                            if (beats.length === 0) {
                              addToast('No beats detected in audio. Try a different track.', 'error');
                              return;
                            }

                            const keyframes = generateBeatKeyframes({
                              beats,
                              paramKey: beatGenParam,
                              mode: beatGenMode,
                              minValue: beatGenMin,
                              maxValue: beatGenMax,
                            });

                            setActiveEffects((prev) =>
                              prev.map((fx) =>
                                fx.id === activeFx.id
                                  ? { ...fx, keyframes: { ...fx.keyframes, [beatGenParam]: keyframes } }
                                  : fx,
                              ),
                            );

                            addToast(`Generated ${keyframes.length} keyframes from ${beats.length} beats`, 'success');
                            setBeatGenOpen(false);
                          } catch (err) {
                            const msg = err instanceof Error ? err.message : String(err);
                            addToast(`Beat detection failed: ${msg}`, 'error');
                          } finally {
                            setBeatGenLoading(false);
                          }
                        }}
                      >
                        {beatGenLoading ? 'Analyzing...' : 'Generate Keyframes'}
                      </Button>
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* 3. AUDIO REACTIVITY SECTION */}
            <AccordionSection title="Audio Reactivity & LFO" defaultOpen={false}>
              <p style={{ fontSize: '12px', color: 'var(--text-secondary)', lineHeight: 1.4, marginBottom: '16px' }}>
                Connect parameters of the active layer to LFO modulators or audio waveforms.
              </p>

              {/* Modulator 1: LFO */}
              <div style={{ background: 'rgba(0,0,0,0.2)', padding: '12px', borderRadius: 'var(--radius-md)', border: '1px solid var(--border-color)' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                  <span style={{ fontSize: '13px', fontWeight: 600 }}>LFO 1 (Low Frequency Oscillator)</span>
                  <Switch checked={activeFx.params.lfoEnabled || false} onChange={(val) => updateParam('lfoEnabled', val)} />
                </div>

                {activeFx.params.lfoEnabled && (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', marginTop: '12px' }}>
                    <div className="control-group" style={{ marginBottom: '8px' }}>
                      <label style={{ fontSize: '11px', color: 'var(--text-secondary)', display: 'block', marginBottom: '4px' }}>Waveform</label>
                      <select aria-label="Waveform" style={{ width: '100%', padding: '4px', background: '#1c1c1e', color: '#fff', border: '1px solid var(--border-color)', borderRadius: '4px' }}>
                        <option>Sine</option>
                        <option>Triangle</option>
                        <option>Sawtooth</option>
                        <option>Square</option>
                        <option>Noise (Random)</option>
                      </select>
                    </div>
                    {renderSlider('LFO Rate (Hz)', 'lfoRate', 0.1, 10.0, 0.1, 1.0)}
                    {renderSlider('LFO Depth (%)', 'lfoDepth', 0, 100, 1, 50)}
                  </div>
                )}
              </div>

              {/* Modulator 2: Audio Reactivity */}
              <div style={{ background: 'rgba(0,0,0,0.2)', padding: '12px', borderRadius: 'var(--radius-md)', border: '1px solid var(--border-color)' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                  <span style={{ fontSize: '13px', fontWeight: 600 }}>Audio Input Amplitude</span>
                  <Switch checked={activeFx.params.audioEnabled || false} onChange={(val) => updateParam('audioEnabled', val)} />
                </div>

                {activeFx.params.audioEnabled && (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', marginTop: '12px' }}>
                    <div className="control-group" style={{ marginBottom: '8px' }}>
                      <label style={{ fontSize: '11px', color: 'var(--text-secondary)', display: 'block', marginBottom: '4px' }}>Frequency Band</label>
                      <select aria-label="Frequency Band" style={{ width: '100%', padding: '4px', background: '#1c1c1e', color: '#fff', border: '1px solid var(--border-color)', borderRadius: '4px' }}>
                        <option>Bass (Low Frequency)</option>
                        <option>Mids (Speech range)</option>
                        <option>Highs (Crisp treble)</option>
                        <option>Full Spectrum</option>
                      </select>
                    </div>
                    {renderSlider('Gain multiplier', 'audioGain', 0.5, 4.0, 0.1, 1.0)}
                    {renderSlider('Smoothing factor', 'audioSmooth', 0.1, 0.9, 0.05, 0.5)}
                  </div>
                )}
              </div>
            </AccordionSection>

            {/* 4. OFFLINE EXPORT SECTION */}
            <AccordionSection title="Export & Offline Render" defaultOpen={false}>
                  <p style={{ fontSize: '12px', color: 'var(--text-secondary)', lineHeight: 1.4 }}>
                    Fine-tune export boundaries and compile the stack using the Python CLI wrapper.
                  </p>

                  {/* GOP setting */}
                  <div className="control-group">
                    <label className="control-label" style={{ fontSize: '11px', textTransform: 'uppercase', color: 'var(--text-secondary)' }}>GOP Keyframes Interval</label>
                    <select
                      aria-label="GOP Keyframes Interval"
                      value={activeFx.params.gop || 1000}
                      onChange={(e) => updateParam('gop', Number(e.target.value))}
                      style={{ width: '100%', padding: '6px', background: '#1c1c1e', color: '#fff', border: '1px solid var(--border-color)', borderRadius: '4px', marginTop: '6px' }}
                    >
                      <option value={1000}>Infinite GOP (1000 - smears bleed forever)</option>
                      <option value={100}>Frequent GOP (100 - occasional snaps)</option>
                      <option value={10}>Hyper-Active GOP (10 - glitch-on-beats)</option>
                      <option value={1}>Every Frame (1 - raw non-glitched compression)</option>
                    </select>
                  </div>

                  {/* Clip boundaries */}
                  <div className="control-group">
                    <label className="control-label" style={{ fontSize: '11px', textTransform: 'uppercase', color: 'var(--text-secondary)' }}>Export Timeline Range (s)</label>
                    <div style={{ display: 'flex', gap: '8px', marginTop: '6px' }}>
                      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '4px' }}>
                        <span style={{ fontSize: '10px', color: 'var(--text-tertiary)' }}>Start</span>
                        <input 
                          type="number" 
                          value={activeFx.startTime || 0} 
                          onChange={(e) => {
                            setActiveEffects(activeEffects.map(fx => 
                              fx.id === activeFx.id ? { ...fx, startTime: Number(e.target.value) } : fx
                            ));
                          }}
                          style={{ width: '100%', padding: '6px', background: '#1c1c1e', color: '#fff', border: '1px solid var(--border-color)', borderRadius: '4px' }}
                        />
                      </div>
                      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '4px' }}>
                        <span style={{ fontSize: '10px', color: 'var(--text-tertiary)' }}>End</span>
                        <input 
                          type="number" 
                          value={activeFx.endTime || 10} 
                          onChange={(e) => {
                            setActiveEffects(activeEffects.map(fx => 
                              fx.id === activeFx.id ? { ...fx, endTime: Number(e.target.value) } : fx
                            ));
                          }}
                          style={{ width: '100%', padding: '6px', background: '#1c1c1e', color: '#fff', border: '1px solid var(--border-color)', borderRadius: '4px' }}
                        />
                      </div>
                    </div>
                  </div>

                  {/* Export Format Section */}
                  <div className="control-group" style={{ marginBottom: '12px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                      <label className="control-label" style={{ fontSize: '11px', textTransform: 'uppercase', color: 'var(--text-secondary)' }}>Export Format</label>
                      <button
                        type="button"
                        onClick={() => {
                          if (!mediaUrl) return;
                          const rec = recommendExportSettings(
                            getMediaTypeFromExt(mediaUrl),
                            mediaUrl,
                            duration,
                            activeEffects.some((fx) => fx.enabled),
                          );
                          setExportFormat(rec.format);
                          setExportFps(rec.fps);
                          addToast(`Smart export: ${rec.format.toUpperCase()} @ ${rec.fps}fps — ${rec.reason}`, 'info');
                        }}
                        style={{
                          fontSize: '10px',
                          padding: '2px 8px',
                          background: 'rgba(10,132,255,0.15)',
                          border: '1px solid rgba(10,132,255,0.3)',
                          borderRadius: '4px',
                          color: 'var(--accent-primary)',
                          cursor: 'pointer',
                        }}
                      >
                        Smart Recommend
                      </button>
                    </div>
                    <select
                      value={exportFormat || 'same'}
                      onChange={(e) => setExportFormat(e.target.value as 'same' | 'png' | 'jpg' | 'gif' | 'mp4')}
                      style={{ width: '100%', padding: '6px', background: '#1c1c1e', color: '#fff', border: '1px solid var(--border-color)', borderRadius: '4px', marginTop: '6px' }}
                    >
                      <option value="same">Same as Source</option>
                      <option value="png">PNG Image (.png)</option>
                      <option value="jpg">JPEG Image (.jpg)</option>
                      <option value="gif">GIF Animation / Loop (.gif)</option>
                      <option value="mp4">MP4 Video Loop (.mp4)</option>
                    </select>
                  </div>

                  {/* Export Frame Rate Section */}
                  {(exportFormat === 'gif' || exportFormat === 'mp4' || (exportFormat === 'same' && mediaUrl && mediaUrl.toLowerCase().match(/\.(mp4|webm|avi|mov|mkv|flv|wmv)$/))) && (
                    <div className="control-group" style={{ marginBottom: '12px' }}>
                      <label className="control-label" style={{ fontSize: '11px', textTransform: 'uppercase', color: 'var(--text-secondary)' }}>Export Frame Rate (FPS)</label>
                      <input 
                        type="number" 
                        min={1} 
                        max={120} 
                        value={exportFps} 
                        onChange={(e) => setExportFps(Math.max(1, Math.min(120, Number(e.target.value))))}
                        style={{ width: '100%', padding: '6px', background: '#1c1c1e', color: '#fff', border: '1px solid var(--border-color)', borderRadius: '4px', marginTop: '6px' }}
                      />
                    </div>
                  )}

                  {/* Watermark Section */}
                  <div className="control-group" style={{ marginBottom: '12px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                      <label className="control-label" style={{ fontSize: '11px', textTransform: 'uppercase', color: 'var(--text-secondary)' }}>Watermark</label>
                      <Switch
                        checked={watermarkSettings.enabled}
                        onChange={(val) => setWatermarkSettings({ ...watermarkSettings, enabled: val })}
                      />
                    </div>
                    {watermarkSettings.enabled && (
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', marginTop: '8px' }}>
                        <div style={{ display: 'flex', gap: '8px' }}>
                          <button
                            type="button"
                            onClick={() => setWatermarkSettings({ ...watermarkSettings, type: 'text' })}
                            style={{
                              flex: 1,
                              padding: '6px',
                              fontSize: '11px',
                              background: watermarkSettings.type === 'text' ? 'var(--accent-primary)' : '#1c1c1e',
                              color: '#fff',
                              border: '1px solid var(--border-color)',
                              borderRadius: '4px',
                              cursor: 'pointer',
                            }}
                          >
                            Text
                          </button>
                          <button
                            type="button"
                            onClick={() => setWatermarkSettings({ ...watermarkSettings, type: 'image' })}
                            style={{
                              flex: 1,
                              padding: '6px',
                              fontSize: '11px',
                              background: watermarkSettings.type === 'image' ? 'var(--accent-primary)' : '#1c1c1e',
                              color: '#fff',
                              border: '1px solid var(--border-color)',
                              borderRadius: '4px',
                              cursor: 'pointer',
                            }}
                          >
                            Image
                          </button>
                        </div>

                        {watermarkSettings.type === 'text' && (
                          <>
                            <input
                              type="text"
                              value={watermarkSettings.text}
                              onChange={(e) => setWatermarkSettings({ ...watermarkSettings, text: e.target.value })}
                              placeholder="Watermark text..."
                              style={{ width: '100%', padding: '6px', background: '#1c1c1e', color: '#fff', border: '1px solid var(--border-color)', borderRadius: '4px', fontSize: '12px' }}
                            />
                            <div style={{ display: 'flex', gap: '8px' }}>
                              <select
                                aria-label="Watermark Position"
                                value={watermarkSettings.position}
                                onChange={(e) => setWatermarkSettings({ ...watermarkSettings, position: e.target.value as WatermarkSettings['position'] })}
                                style={{ flex: 1, padding: '6px', background: '#1c1c1e', color: '#fff', border: '1px solid var(--border-color)', borderRadius: '4px', fontSize: '12px' }}
                              >
                                <option value="top-left">Top Left</option>
                                <option value="top-right">Top Right</option>
                                <option value="bottom-left">Bottom Left</option>
                                <option value="bottom-right">Bottom Right</option>
                                <option value="center">Center</option>
                              </select>
                              <input
                                type="color"
                                value={watermarkSettings.color === 'white' ? '#ffffff' : watermarkSettings.color === 'black' ? '#000000' : watermarkSettings.color}
                                onChange={(e) => setWatermarkSettings({ ...watermarkSettings, color: e.target.value })}
                                style={{ width: 40, height: 32, padding: 2, background: 'transparent', border: '1px solid var(--border-color)', borderRadius: '4px', cursor: 'pointer' }}
                              />
                            </div>
                            <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                              <span style={{ fontSize: '11px', color: 'var(--text-secondary)', whiteSpace: 'nowrap' }}>Size</span>
                              <input
                                type="range"
                                min={8}
                                max={72}
                                value={watermarkSettings.fontSize}
                                onChange={(e) => setWatermarkSettings({ ...watermarkSettings, fontSize: Number(e.target.value) })}
                                style={{ flex: 1 }}
                              />
                              <span style={{ fontSize: '11px', color: 'var(--text-secondary)', width: 24, textAlign: 'right' }}>{watermarkSettings.fontSize}</span>
                            </div>
                            {systemFonts.length > 0 && (
                              <select
                                aria-label="Watermark Font"
                                value={watermarkSettings.fontPath || ''}
                                onChange={(e) => setWatermarkSettings({ ...watermarkSettings, fontPath: e.target.value || null })}
                                style={{ width: '100%', padding: '6px', background: '#1c1c1e', color: '#fff', border: '1px solid var(--border-color)', borderRadius: '4px', fontSize: '12px' }}
                              >
                                <option value="">Default System Font</option>
                                {systemFonts.map((fontPath) => {
                                  const name = fontPath.replace(/\\/g, '/').split('/').pop()?.replace(/\.(ttf|otf|ttc)$/i, '') || fontPath;
                                  return (
                                    <option key={fontPath} value={fontPath}>
                                      {name}
                                    </option>
                                  );
                                })}
                              </select>
                            )}
                          </>
                        )}

                        {watermarkSettings.type === 'image' && (
                          <>
                            <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                              <input
                                type="text"
                                value={watermarkSettings.imagePath || ''}
                                disabled
                                placeholder="No image selected"
                                style={{ flex: 1, padding: '6px', background: '#1c1c1e', color: 'var(--text-secondary)', border: '1px solid var(--border-color)', borderRadius: '4px', fontSize: '12px' }}
                              />
                              <Button
                                variant="glass"
                                size="sm"
                                style={{ padding: '6px 12px', fontSize: '11px' }}
                                onClick={async () => {
                                  if (!window.ipcRenderer) return;
                                  const result = await window.ipcRenderer.invoke<string | null>('dialog:openMedia');
                                  if (result) {
                                    setWatermarkSettings({ ...watermarkSettings, imagePath: result });
                                  }
                                }}
                              >
                                Browse
                              </Button>
                            </div>
                            <select
                              aria-label="Watermark Position"
                              value={watermarkSettings.position}
                              onChange={(e) => setWatermarkSettings({ ...watermarkSettings, position: e.target.value as WatermarkSettings['position'] })}
                              style={{ width: '100%', padding: '6px', background: '#1c1c1e', color: '#fff', border: '1px solid var(--border-color)', borderRadius: '4px', fontSize: '12px' }}
                            >
                              <option value="top-left">Top Left</option>
                              <option value="top-right">Top Right</option>
                              <option value="bottom-left">Bottom Left</option>
                              <option value="bottom-right">Bottom Right</option>
                              <option value="center">Center</option>
                            </select>
                            <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                              <span style={{ fontSize: '11px', color: 'var(--text-secondary)', whiteSpace: 'nowrap' }}>Scale</span>
                              <input
                                type="range"
                                min={5}
                                max={50}
                                value={watermarkSettings.scale}
                                onChange={(e) => setWatermarkSettings({ ...watermarkSettings, scale: Number(e.target.value) })}
                                style={{ flex: 1 }}
                              />
                              <span style={{ fontSize: '11px', color: 'var(--text-secondary)', width: 32, textAlign: 'right' }}>{watermarkSettings.scale}%</span>
                            </div>
                          </>
                        )}

                        <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                          <span style={{ fontSize: '11px', color: 'var(--text-secondary)', whiteSpace: 'nowrap' }}>Opacity</span>
                          <input
                            type="range"
                            min={0}
                            max={100}
                            value={Math.round(watermarkSettings.opacity * 100)}
                            onChange={(e) => setWatermarkSettings({ ...watermarkSettings, opacity: Number(e.target.value) / 100 })}
                            style={{ flex: 1 }}
                          />
                          <span style={{ fontSize: '11px', color: 'var(--text-secondary)', width: 32, textAlign: 'right' }}>{Math.round(watermarkSettings.opacity * 100)}%</span>
                        </div>
                      </div>
                    )}
                  </div>

                  {/* Custom Output Directory Section */}
                  <div className="control-group" style={{ marginBottom: '12px' }}>
                    <label className="control-label" style={{ fontSize: '11px', textTransform: 'uppercase', color: 'var(--text-secondary)' }}>Output Directory</label>
                    <div style={{ display: 'flex', gap: '8px', marginTop: '6px', alignItems: 'center' }}>
                      <input 
                        type="text" 
                        value={outputDirectory || 'Loading default...'} 
                        disabled 
                        style={{ flex: 1, padding: '6px', fontSize: '11px', background: '#1c1c1e', color: 'var(--text-secondary)', border: '1px solid var(--border-color)', borderRadius: '4px' }}
                        title={outputDirectory || ''}
                      />
                      <Button 
                        variant="glass" 
                        size="sm" 
                        style={{ padding: '6px 12px', fontSize: '11px' }}
                        onClick={async () => {
                          if (!window.ipcRenderer) return;
                          const selectedDir = await window.ipcRenderer.invoke<string | null>('dialog:selectOutputDir');
                          if (selectedDir) {
                            setOutputDirectory(selectedDir);
                          }
                        }}
                      >
                        Change
                      </Button>
                    </div>
                  </div>

                  {/* Offline Render trigger */}
                  <div style={{ marginTop: '8px' }}>
                    <Button 
                      variant="primary" 
                      glow={true}
                      style={{ width: '100%', height: '40px' }}
                      onClick={() => {
                        if (!mediaUrl) return;
                        addRenderJob({
                          name: `Render Full Stack (${exportFormat.toUpperCase()})`,
                          inputUrl: mediaUrl,
                          activeEffects,
                          outputDirectory,
                          exportFormat,
                          exportFps,
                          watermarkSettings,
                        });
                        addToast('Render job queued!', 'success');
                      }}
                      disabled={isRendering}
                    >
                      {isRendering ? 'Rendering Offline Pipeline...' : 'Render Full Stack (Python)'}
                    </Button>
                  </div>
            </AccordionSection>

          </div>
        </div>
      ) : (
        <div style={{ textAlign: 'center', color: 'var(--text-tertiary)', marginTop: '32px' }}>
          <p>No layers or effects loaded.</p>
        </div>
      )}
    </aside>
  );
};
