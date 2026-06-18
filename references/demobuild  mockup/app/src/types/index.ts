export type EffectCategory = 'glitch' | 'dither' | 'crt' | 'datamosh';

export interface EffectParameter {
  name: string;
  key: string;
  type: 'slider' | 'toggle' | 'select' | 'int';
  min?: number;
  max?: number;
  step?: number;
  value: number | boolean | string;
  options?: string[];
}

export interface EffectConfig {
  id: string;
  name: string;
  category: EffectCategory;
  enabled: boolean;
  parameters: EffectParameter[];
}

export type WorkspacePreset = 'standard' | 'focus' | 'export';

export interface AppState {
  mediaLoaded: boolean;
  mediaSrc: string | null;
  isPlaying: boolean;
  currentTime: number;
  duration: number;
  effects: EffectConfig[];
  selectedEffectId: string | null;
  workspace: WorkspacePreset;
  isRendering: boolean;
  renderProgress: number;
  status: string;
}
