import { useState, useCallback } from 'react';
import type { EffectConfig, WorkspacePreset, EffectCategory } from '@/types';

const defaultEffects: EffectConfig[] = [
  {
    id: 'effect-1',
    name: 'RGB Glitch',
    category: 'glitch',
    enabled: true,
    parameters: [
      { name: 'Amount', key: 'amount', type: 'slider', min: 0, max: 0.1, step: 0.001, value: 0.02 },
      { name: 'Angle', key: 'angle', type: 'slider', min: 0, max: 360, step: 1, value: 0 },
    ],
  },
  {
    id: 'effect-2',
    name: 'Bayer Dither',
    category: 'dither',
    enabled: false,
    parameters: [
      { name: 'Scale', key: 'scale', type: 'slider', min: 0.1, max: 5, step: 0.1, value: 1 },
      { name: 'Threshold', key: 'threshold', type: 'slider', min: 0, max: 2, step: 0.05, value: 1 },
    ],
  },
  {
    id: 'effect-3',
    name: 'CRT Monitor',
    category: 'crt',
    enabled: false,
    parameters: [
      { name: 'Barrel Distortion', key: 'distortion', type: 'slider', min: 0, max: 0.5, step: 0.01, value: 0.15 },
      { name: 'Scanline Intensity', key: 'lineIntensity', type: 'slider', min: 0, max: 1, step: 0.05, value: 0.5 },
      { name: 'Vignette', key: 'vignette', type: 'slider', min: 0, max: 3, step: 0.1, value: 1.5 },
    ],
  },
  {
    id: 'effect-4',
    name: 'DataMosh Sort',
    category: 'datamosh',
    enabled: false,
    parameters: [
      { name: 'Intensity', key: 'intensity', type: 'slider', min: 0, max: 100, step: 1, value: 10 },
      { name: 'Threshold', key: 'threshold', type: 'slider', min: 0, max: 1, step: 0.05, value: 0.5 },
      { name: 'Seed', key: 'seed', type: 'int', min: 0, max: 9999, step: 1, value: 42 },
    ],
  },
];

export function useAppStore() {
  const [mediaLoaded, setMediaLoaded] = useState(true);
  const [mediaSrc, setMediaSrc] = useState<string | null>('/assets/demo-texture.jpg');
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(12);
  const [effects, setEffects] = useState<EffectConfig[]>(defaultEffects);
  const [selectedEffectId, setSelectedEffectId] = useState<string | null>('effect-1');
  const [workspace, setWorkspace] = useState<WorkspacePreset>('standard');
  const [isRendering, setIsRendering] = useState(false);
  const [renderProgress, setRenderProgress] = useState(0);
  const [status, setStatus] = useState('Ready');

  const addEffect = useCallback((category: EffectCategory) => {
    const templates: Record<EffectCategory, Omit<EffectConfig, 'id'>> = {
      glitch: {
        name: 'RGB Glitch',
        category: 'glitch',
        enabled: true,
        parameters: [
          { name: 'Amount', key: 'amount', type: 'slider', min: 0, max: 0.1, step: 0.001, value: 0.02 },
          { name: 'Angle', key: 'angle', type: 'slider', min: 0, max: 360, step: 1, value: 0 },
        ],
      },
      dither: {
        name: 'Bayer Dither',
        category: 'dither',
        enabled: true,
        parameters: [
          { name: 'Scale', key: 'scale', type: 'slider', min: 0.1, max: 5, step: 0.1, value: 1 },
          { name: 'Threshold', key: 'threshold', type: 'slider', min: 0, max: 2, step: 0.05, value: 1 },
        ],
      },
      crt: {
        name: 'CRT Monitor',
        category: 'crt',
        enabled: true,
        parameters: [
          { name: 'Barrel Distortion', key: 'distortion', type: 'slider', min: 0, max: 0.5, step: 0.01, value: 0.15 },
          { name: 'Scanline Intensity', key: 'lineIntensity', type: 'slider', min: 0, max: 1, step: 0.05, value: 0.5 },
          { name: 'Vignette', key: 'vignette', type: 'slider', min: 0, max: 3, step: 0.1, value: 1.5 },
        ],
      },
      datamosh: {
        name: 'DataMosh Sort',
        category: 'datamosh',
        enabled: true,
        parameters: [
          { name: 'Intensity', key: 'intensity', type: 'slider', min: 0, max: 100, step: 1, value: 10 },
          { name: 'Threshold', key: 'threshold', type: 'slider', min: 0, max: 1, step: 0.05, value: 0.5 },
          { name: 'Seed', key: 'seed', type: 'int', min: 0, max: 9999, step: 1, value: 42 },
        ],
      },
    };

    const template = templates[category];
    const newEffect: EffectConfig = {
      ...template,
      id: `effect-${Date.now()}`,
    };

    setEffects(prev => [...prev, newEffect]);
    setSelectedEffectId(newEffect.id);
  }, []);

  const removeEffect = useCallback((id: string) => {
    setEffects(prev => prev.filter(e => e.id !== id));
    setSelectedEffectId(prev => prev === id ? null : prev);
  }, []);

  const duplicateEffect = useCallback((id: string) => {
    setEffects(prev => {
      const effect = prev.find(e => e.id === id);
      if (!effect) return prev;
      const copy: EffectConfig = {
        ...effect,
        id: `effect-${Date.now()}`,
        name: `${effect.name} (Copy)`,
      };
      return [...prev, copy];
    });
  }, []);

  const toggleEffect = useCallback((id: string) => {
    setEffects(prev =>
      prev.map(e => e.id === id ? { ...e, enabled: !e.enabled } : e)
    );
  }, []);

  const updateParameter = useCallback((effectId: string, paramKey: string, value: number | boolean | string) => {
    setEffects(prev =>
      prev.map(e => {
        if (e.id !== effectId) return e;
        return {
          ...e,
          parameters: e.parameters.map(p =>
            p.key === paramKey ? { ...p, value } : p
          ),
        };
      })
    );
  }, []);

  const moveEffect = useCallback((fromIndex: number, toIndex: number) => {
    setEffects(prev => {
      const next = [...prev];
      const [removed] = next.splice(fromIndex, 1);
      next.splice(toIndex, 0, removed);
      return next;
    });
  }, []);

  const importMedia = useCallback(() => {
    setMediaLoaded(true);
    setMediaSrc('/assets/demo-texture.jpg');
    setStatus('Media loaded');
  }, []);

  const startRender = useCallback(() => {
    setIsRendering(true);
    setRenderProgress(0);
    setStatus('Rendering...');

    const interval = setInterval(() => {
      setRenderProgress(prev => {
        if (prev >= 100) {
          clearInterval(interval);
          setIsRendering(false);
          setStatus('Render complete');
          return 100;
        }
        return prev + 2;
      });
    }, 100);
  }, []);

  return {
    mediaLoaded,
    mediaSrc,
    isPlaying,
    currentTime,
    duration,
    effects,
    selectedEffectId,
    workspace,
    isRendering,
    renderProgress,
    status,
    setMediaLoaded,
    setMediaSrc,
    setIsPlaying,
    setCurrentTime,
    setDuration,
    setEffects,
    setSelectedEffectId,
    setWorkspace,
    setIsRendering,
    setRenderProgress,
    setStatus,
    addEffect,
    removeEffect,
    duplicateEffect,
    toggleEffect,
    updateParameter,
    moveEffect,
    importMedia,
    startRender,
  };
}
