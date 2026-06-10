import React, { createContext, useContext, useState, useEffect, useCallback, useRef } from 'react';
import type { ReactNode } from 'react';
import type { Effect } from '../types/effectTypes';
import { EFFECT_REGISTRY } from '../types/effectTypes';
import {
  startAutoSave,
  stopAutoSave,
} from '../utils/autoSave';
import { getAllBindings, eventToKeyString } from '../utils/keyboardShortcuts';
import { getCommands } from '../utils/commands';
import type { WatermarkSettings } from '../utils/watermark';
import { DEFAULT_WATERMARK } from '../utils/watermark';

export interface ToastItem {
  id: string;
  message: string;
  type: 'success' | 'error' | 'info';
}

function loadPersisted<T>(key: string, defaultValue: T): T {
  try {
    const saved = localStorage.getItem(key);
    if (saved !== null) return JSON.parse(saved) as T;
  } catch {
    /* ignore corrupt localStorage */
  }
  return defaultValue;
}

function savePersisted(key: string, value: unknown): void {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    /* ignore quota exceeded / private mode */
  }
}

export interface RenderJob {
  id: string;
  name: string;
  status: 'queued' | 'rendering' | 'completed' | 'failed';
  progress: number;
  inputUrl: string;
  outputPath?: string;
  error?: string;
  startedAt?: number;
  completedAt?: number;
  /** Snapshot of effects at the time the job was queued */
  activeEffects?: Effect[];
  outputDirectory?: string | null;
  exportFormat?: 'same' | 'png' | 'jpg' | 'gif' | 'mp4';
  exportFps?: number;
  watermarkSettings?: WatermarkSettings;
}

interface StudioState {
  activeEffects: Effect[];
  mediaUrl: string | null;
  mediaType: 'image' | 'video' | null;
  isPlaying: boolean;
  currentTime: number;
  duration: number;
  qualityMode: 'full' | 'live' | 'still';
  zoomLevel: number;
  pixelGrid: boolean;
  aspectRatio: string;
  selectedEffectId: string | null;
  toasts: ToastItem[];
  canUndo: boolean;
  canRedo: boolean;
  isRendering: boolean;
  isPaintingMask: boolean;
  maskBrushSize: number;
  maskBrushEraser: boolean;
  maskCanvas: HTMLCanvasElement | null;
  outputDirectory: string | null;
  exportFormat: 'same' | 'png' | 'jpg' | 'gif' | 'mp4';
  exportFps: number;
  renderProgress: { percent: number; logs: string[] };
  renderQueue: RenderJob[];
  recentFiles: string[];
  fontSizeScale: number;
  highContrastMode: boolean;
  reducedMotion: boolean;
  colorBlindMode: 'none' | 'protanopia' | 'deuteranopia' | 'tritanopia' | 'achromatopsia';
  proxyUrl: string | null;
  inTime: number;
  outTime: number;
  watermarkSettings: WatermarkSettings;
}

export interface StudioContextType extends StudioState {
  setActiveEffects: (effects: Effect[] | ((prev: Effect[]) => Effect[])) => void;
  setMediaUrl: (url: string | null) => void;
  setMediaType: (type: 'image' | 'video' | null) => void;
  setIsPlaying: (playing: boolean) => void;
  setCurrentTime: (time: number | ((prev: number) => number)) => void;
  setDuration: (duration: number) => void;
  setQualityMode: (mode: 'full' | 'live' | 'still') => void;
  setZoomLevel: (zoom: number) => void;
  setPixelGrid: (grid: boolean) => void;
  setAspectRatio: (ratio: string) => void;
  setSelectedEffectId: (id: string | null) => void;
  addToast: (message: string, type?: ToastItem['type']) => void;
  removeToast: (id: string) => void;
  undo: () => void;
  redo: () => void;
  setIsRendering: (rendering: boolean) => void;
  setIsPaintingMask: (val: boolean) => void;
  setMaskBrushSize: (val: number) => void;
  setMaskBrushEraser: (val: boolean) => void;
  setMaskCanvas: (val: HTMLCanvasElement | null) => void;
  outputDirectory: string | null;
  setOutputDirectory: (dir: string | null) => void;
  setExportFormat: (format: 'same' | 'png' | 'jpg' | 'gif' | 'mp4') => void;
  setExportFps: (fps: number) => void;
  setRenderProgress: React.Dispatch<React.SetStateAction<{ percent: number; logs: string[] }>>;
  addRenderJob: (job: Omit<RenderJob, 'id' | 'status' | 'progress'>) => string;
  updateRenderJob: (id: string, updates: Partial<RenderJob>) => void;
  clearCompletedJobs: () => void;
  recentFiles: string[];
  addRecentFile: (path: string) => void;
  clearRecentFiles: () => void;
  setFontSizeScale: (scale: number | ((prev: number) => number)) => void;
  setHighContrastMode: (enabled: boolean | ((prev: boolean) => boolean)) => void;
  setReducedMotion: (enabled: boolean | ((prev: boolean) => boolean)) => void;
  setColorBlindMode: (mode: 'none' | 'protanopia' | 'deuteranopia' | 'tritanopia' | 'achromatopsia') => void;
  setProxyUrl: (url: string | null) => void;
  setInTime: (time: number) => void;
  setOutTime: (time: number) => void;
  watermarkSettings: WatermarkSettings;
  setWatermarkSettings: (settings: WatermarkSettings) => void;
}

function makeDefaultEffect(id: string, type: Effect['type'], enabled: boolean): Effect {
  const meta = EFFECT_REGISTRY[type];
  return {
    id,
    name: meta.name,
    type,
    enabled,
    params: { ...meta.defaultParams },
    startTime: 0,
    endTime: 10,
    mask: { type: 'none', invert: false },
  };
}

const defaultEffects: Effect[] = [
  makeDefaultEffect('1', 'dither', true),
  makeDefaultEffect('2', 'halftone', false),
  makeDefaultEffect('3', 'analog-glitch', false),
  makeDefaultEffect('4', 'datamosh', false),
];

const StudioContext = createContext<StudioContextType | undefined>(undefined);

export const StudioProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const [activeEffectsState, setActiveEffectsStateRaw] = useState<Effect[]>(
    () => loadPersisted<Effect[]>('moshdither:activeEffects', defaultEffects),
  );

  const setActiveEffectsState = useCallback((update: Effect[] | ((prev: Effect[]) => Effect[])) => {
    setActiveEffectsStateRaw(update);
  }, []);

  const [mediaUrl, setMediaUrl] = useState<string | null>(null);
  const [mediaType, setMediaType] = useState<'image' | 'video' | null>(null);
  const [isPlaying, setIsPlaying] = useState<boolean>(false);
  const [currentTime, _setCurrentTime] = useState<number>(0);
  const setCurrentTime = useCallback((time: number | ((prev: number) => number)) => {
    _setCurrentTime(time);
  }, []);
  const [duration, setDuration] = useState<number>(0);
  const [qualityMode, setQualityMode] = useState<'full' | 'live' | 'still'>(
    () => loadPersisted<'full' | 'live' | 'still'>('moshdither:qualityMode', 'full'),
  );
  const [zoomLevel, setZoomLevel] = useState<number>(
    () => loadPersisted<number>('moshdither:zoomLevel', 1),
  );
  const [pixelGrid, setPixelGrid] = useState<boolean>(
    () => loadPersisted<boolean>('moshdither:pixelGrid', false),
  );
  const [aspectRatio, setAspectRatio] = useState<string>(
    () => loadPersisted<string>('moshdither:aspectRatio', 'free'),
  );
  const [selectedEffectId, setSelectedEffectId] = useState<string | null>(
    () => loadPersisted<string | null>('moshdither:selectedEffectId', '1'),
  );

  // History State (capped at 50 entries)
  const [past, setPast] = useState<Effect[][]>([]);
  const [future, setFuture] = useState<Effect[][]>([]);

  // Toasts State
  const [toasts, setToasts] = useState<ToastItem[]>([]);
  const [isRendering, setIsRendering] = useState<boolean>(false);
  const [isPaintingMask, setIsPaintingMask] = useState<boolean>(false);
  const [maskBrushSize, setMaskBrushSize] = useState<number>(30);
  const [maskBrushEraser, setMaskBrushEraser] = useState<boolean>(false);
  const [maskCanvas, setMaskCanvas] = useState<HTMLCanvasElement | null>(null);
  const [outputDirectory, setOutputDirectoryState] = useState<string | null>(
    localStorage.getItem('outputDirectory')
  );
  const [exportFormat, setExportFormatState] = useState<'same' | 'png' | 'jpg' | 'gif' | 'mp4'>(() => {
    const saved = localStorage.getItem('exportFormat');
    if (saved === 'same' || saved === 'png' || saved === 'jpg' || saved === 'gif' || saved === 'mp4') {
      return saved;
    }
    return 'same';
  });
  const [exportFps, setExportFpsState] = useState<number>(() => {
    const saved = localStorage.getItem('exportFps');
    if (!saved) return 30;
    const parsed = Number(saved);
    return isNaN(parsed) ? 30 : parsed;
  });
  const [renderProgress, setRenderProgress] = useState<{ percent: number; logs: string[] }>({ percent: 0, logs: [] });
  const [renderQueue, setRenderQueue] = useState<RenderJob[]>([]);
  const [recentFiles, setRecentFiles] = useState<string[]>(() => {
    try {
      const saved = localStorage.getItem('recentFiles');
      return saved ? JSON.parse(saved) : [];
    } catch {
      return [];
    }
  });
  const [fontSizeScale, setFontSizeScale] = useState<number>(
    () => loadPersisted<number>('moshdither:fontSizeScale', 1),
  );
  const [highContrastMode, setHighContrastMode] = useState<boolean>(
    () => loadPersisted<boolean>('moshdither:highContrastMode', false),
  );
  const [reducedMotion, setReducedMotion] = useState<boolean>(
    () => loadPersisted<boolean>('moshdither:reducedMotion', false),
  );
  const [colorBlindMode, setColorBlindMode] = useState<'none' | 'protanopia' | 'deuteranopia' | 'tritanopia' | 'achromatopsia'>(
    () => loadPersisted<'none' | 'protanopia' | 'deuteranopia' | 'tritanopia' | 'achromatopsia'>('moshdither:colorBlindMode', 'none'),
  );
  const [proxyUrl, setProxyUrl] = useState<string | null>(null);
  const [inTime, setInTime] = useState<number>(0);
  const [outTime, setOutTime] = useState<number>(0);
  const [watermarkSettings, setWatermarkSettingsState] = useState<WatermarkSettings>(
    () => loadPersisted<WatermarkSettings>('moshdither:watermark', DEFAULT_WATERMARK),
  );
  const hasFetchedDefaultDir = useRef(false);

  const addRecentFile = useCallback((path: string) => {
    setRecentFiles((prev) => {
      const next = [path, ...prev.filter((p) => p !== path)].slice(0, 20);
      localStorage.setItem('recentFiles', JSON.stringify(next));
      return next;
    });
  }, []);

  const clearRecentFiles = useCallback(() => {
    setRecentFiles([]);
    localStorage.removeItem('recentFiles');
  }, []);

  const addRenderJob = useCallback((job: Omit<RenderJob, 'id' | 'status' | 'progress'>) => {
    const id = `job-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
    const newJob: RenderJob = { ...job, id, status: 'queued', progress: 0 };
    setRenderQueue((prev) => [...prev, newJob]);
    return id;
  }, []);

  const updateRenderJob = useCallback((id: string, updates: Partial<RenderJob>) => {
    setRenderQueue((prev) =>
      prev.map((j) => (j.id === id ? { ...j, ...updates } : j))
    );
  }, []);

  const clearCompletedJobs = useCallback(() => {
    setRenderQueue((prev) => prev.filter((j) => j.status !== 'completed' && j.status !== 'failed'));
  }, []);

  const removeToast = useCallback((id: string) => {
    setToasts(prev => prev.filter(t => t.id !== id));
  }, []);

  const addToast = useCallback((message: string, type: ToastItem['type'] = 'info') => {
    const id = `${Date.now()}-${Math.random().toString(36).substring(2, 7)}`;
    setToasts(prev => [...prev, { id, message, type }]);

    // Auto dismiss after 4 seconds
    setTimeout(() => {
      removeToast(id);
    }, 4000);
  }, [removeToast]);

  const setOutputDirectory = useCallback((dir: string | null) => {
    setOutputDirectoryState(dir);
    if (dir) {
      localStorage.setItem('outputDirectory', dir);
    } else {
      localStorage.removeItem('outputDirectory');
    }
  }, []);

  const setWatermarkSettings = useCallback((settings: WatermarkSettings) => {
    setWatermarkSettingsState(settings);
    savePersisted('moshdither:watermark', settings);
  }, []);

  const setExportFormat = useCallback((format: 'same' | 'png' | 'jpg' | 'gif' | 'mp4') => {
    setExportFormatState(format);
    localStorage.setItem('exportFormat', format);
  }, []);

  const setExportFps = useCallback((fps: number) => {
    setExportFpsState(fps);
    localStorage.setItem('exportFps', fps.toString());
  }, []);

  useEffect(() => {
    if (!outputDirectory && window.ipcRenderer && !hasFetchedDefaultDir.current) {
      hasFetchedDefaultDir.current = true;
      window.ipcRenderer.invoke<string>('get-default-output-dir').then((dir) => {
        setOutputDirectory(dir);
      });
    }
  }, [outputDirectory, setOutputDirectory]);

  // Intercept changes to activeEffects to record history
  const setActiveEffects = useCallback((newEffects: Effect[] | ((prev: Effect[]) => Effect[])) => {
    setActiveEffectsState(prev => {
      const resolved = typeof newEffects === 'function' ? newEffects(prev) : newEffects;
      setPast(p => [...p.slice(-49), prev]);
      setFuture([]); // Reset redo stack on new action
      return resolved;
    });
  }, []);

  const undo = useCallback(() => {
    setPast(p => {
      if (p.length === 0) return p;
      const previous = p[p.length - 1];
      setActiveEffectsState(current => {
        setFuture(f => [current, ...f]);
        return previous;
      });
      return p.slice(0, -1);
    });
  }, []);

  const redo = useCallback(() => {
    setFuture(f => {
      if (f.length === 0) return f;
      const next = f[0];
      setActiveEffectsState(current => {
        setPast(p => [...p, current]);
        return next;
      });
      return f.slice(1);
    });
  }, []);

  // Keyboard listeners: built-in + custom bindings from shortcuts registry
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const keyStr = eventToKeyString(e);
      const bindings = getAllBindings();
      const command = getCommands().find((cmd) => bindings[cmd.id] === keyStr);

      if (command) {
        e.preventDefault();
        command.action();
        return;
      }

      // Fallback hardcoded shortcuts for undo/redo and zoom
      if ((e.ctrlKey || e.metaKey) && !e.altKey) {
        if (e.key.toLowerCase() === 'z') {
          e.preventDefault();
          if (e.shiftKey) {
            redo();
          } else {
            undo();
          }
        } else if (e.key.toLowerCase() === 'y') {
          e.preventDefault();
          redo();
        } else if (e.key === '=' || e.key === '+') {
          e.preventDefault();
          setFontSizeScale((s) => Math.min(2, parseFloat((s + 0.1).toFixed(2))));
        } else if (e.key === '-') {
          e.preventDefault();
          setFontSizeScale((s) => Math.max(0.75, parseFloat((s - 0.1).toFixed(2))));
        }
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [undo, redo, setFontSizeScale]);

  // Auto-save: serialize project state every 30 seconds
  useEffect(() => {
    if (!window.ipcRenderer) return;

    startAutoSave(() => ({
      version: 1,
      savedAt: new Date().toISOString(),
      activeEffects: activeEffectsState,
      mediaUrl,
      mediaType,
      currentTime,
      duration,
      qualityMode,
      zoomLevel,
      pixelGrid,
      aspectRatio,
      exportFormat,
      exportFps,
      outputDirectory,
    }));

    return () => stopAutoSave();
  }, [
    activeEffectsState,
    mediaUrl,
    mediaType,
    currentTime,
    duration,
    qualityMode,
    zoomLevel,
    pixelGrid,
    aspectRatio,
    exportFormat,
    exportFps,
    outputDirectory,
  ]);

  // Persist UI state to localStorage so it survives reloads
  useEffect(() => savePersisted('moshdither:activeEffects', activeEffectsState), [activeEffectsState]);
  useEffect(() => savePersisted('moshdither:qualityMode', qualityMode), [qualityMode]);
  useEffect(() => savePersisted('moshdither:zoomLevel', zoomLevel), [zoomLevel]);
  useEffect(() => savePersisted('moshdither:pixelGrid', pixelGrid), [pixelGrid]);
  useEffect(() => savePersisted('moshdither:aspectRatio', aspectRatio), [aspectRatio]);
  useEffect(() => savePersisted('moshdither:selectedEffectId', selectedEffectId), [selectedEffectId]);
  useEffect(() => savePersisted('moshdither:fontSizeScale', fontSizeScale), [fontSizeScale]);
  useEffect(() => savePersisted('moshdither:highContrastMode', highContrastMode), [highContrastMode]);
  useEffect(() => savePersisted('moshdither:reducedMotion', reducedMotion), [reducedMotion]);
  useEffect(() => savePersisted('moshdither:colorBlindMode', colorBlindMode), [colorBlindMode]);

  // Apply accessibility settings to the document root
  useEffect(() => {
    document.documentElement.style.setProperty('--app-font-scale', String(fontSizeScale));
    document.documentElement.style.fontSize = `${fontSizeScale * 100}%`;
  }, [fontSizeScale]);

  useEffect(() => {
    document.documentElement.classList.toggle('high-contrast', highContrastMode);
  }, [highContrastMode]);

  useEffect(() => {
    document.documentElement.classList.toggle('reduced-motion', reducedMotion);
  }, [reducedMotion]);

  useEffect(() => {
    document.documentElement.classList.remove('colorblind-protanopia', 'colorblind-deuteranopia', 'colorblind-tritanopia', 'colorblind-achromatopsia');
    if (colorBlindMode !== 'none') {
      document.documentElement.classList.add(`colorblind-${colorBlindMode}`);
    }
  }, [colorBlindMode]);

  // Background render queue processor: picks up queued jobs and executes them via IPC
  useEffect(() => {
    if (!window.ipcRenderer) return;
    const active = renderQueue.filter((j) => j.status === 'rendering');
    const queued = renderQueue.filter((j) => j.status === 'queued');
    if (active.length > 0 || queued.length === 0) return;

    const nextJob = queued[0];

    // Prefer job snapshot fields; fail if required snapshot is missing
    const effects = nextJob.activeEffects;
    const outDir = nextJob.outputDirectory;
    const fmt = nextJob.exportFormat;
    const fps = nextJob.exportFps;
    if (!effects || !outDir || !fmt || !fps) {
      queueMicrotask(() => {
        updateRenderJob(nextJob.id, { status: 'failed', error: 'Job missing required snapshot fields' });
      });
      return;
    }

    queueMicrotask(() => {
      setIsRendering(true);
      updateRenderJob(nextJob.id, { status: 'rendering', startedAt: Date.now() });
    });

    (async () => {
      try {
        const resultUrl = await window.ipcRenderer.invoke<string | null>(
          'render:pipeline',
          nextJob.inputUrl,
          effects,
          outDir,
          fmt,
          fps,
          false,
          nextJob.watermarkSettings,
        );
        if (resultUrl) {
          updateRenderJob(nextJob.id, {
            status: 'completed',
            progress: 100,
            outputPath: resultUrl,
            completedAt: Date.now(),
          });
          setMediaUrl(resultUrl);
          addToast('Render and Export successful!', 'success');
        } else {
          updateRenderJob(nextJob.id, { status: 'failed', error: 'Pipeline returned null' });
          addToast('Render and Export failed.', 'error');
        }
      } catch (err) {
        console.error(err);
        updateRenderJob(nextJob.id, { status: 'failed', error: String(err) });
        addToast('Render and Export error occurred.', 'error');
      } finally {
        setIsRendering(false);
      }
    })();
  }, [renderQueue]);

  return (
    <StudioContext.Provider
      value={{
        activeEffects: activeEffectsState,
        setActiveEffects,
        mediaUrl,
        setMediaUrl,
        mediaType,
        setMediaType,
        isPlaying,
        setIsPlaying,
        currentTime,
        setCurrentTime,
        duration,
        setDuration,
        qualityMode,
        setQualityMode,
        zoomLevel,
        setZoomLevel,
        pixelGrid,
        setPixelGrid,
        aspectRatio,
        setAspectRatio,
        selectedEffectId,
        setSelectedEffectId,
        toasts,
        addToast,
        removeToast,
        undo,
        redo,
        canUndo: past.length > 0,
        canRedo: future.length > 0,
        isRendering,
        setIsRendering,
        isPaintingMask,
        setIsPaintingMask,
        maskBrushSize,
        setMaskBrushSize,
        maskBrushEraser,
        setMaskBrushEraser,
        maskCanvas,
        setMaskCanvas,
        outputDirectory,
        setOutputDirectory,
        exportFormat,
        setExportFormat,
        exportFps,
        setExportFps,
        renderProgress,
        setRenderProgress,
        renderQueue,
        addRenderJob,
        updateRenderJob,
        clearCompletedJobs,
        recentFiles,
        addRecentFile,
        clearRecentFiles,
        fontSizeScale,
        setFontSizeScale,
        highContrastMode,
        setHighContrastMode,
        reducedMotion,
        setReducedMotion,
        colorBlindMode,
        setColorBlindMode,
        proxyUrl,
        setProxyUrl,
        inTime,
        setInTime,
        outTime,
        setOutTime,
        watermarkSettings,
        setWatermarkSettings,
      }}
    >
      {children}
    </StudioContext.Provider>
  );
};

// eslint-disable-next-line react-refresh/only-export-components
export const useStudio = () => {
  const context = useContext(StudioContext);
  if (!context) {
    throw new Error('useStudio must be used within a StudioProvider');
  }
  return context;
};
