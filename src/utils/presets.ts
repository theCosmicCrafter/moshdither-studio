export interface PresetEffect {
  shaderId: string;
  uniforms: Record<string, number | number[] | boolean>;
}

export interface Preset {
  id: string;
  name: string;
  description: string;
  effects: PresetEffect[];
}

export const BUILT_IN_PRESETS: Preset[] = [
  {
    id: 'retro_vhs',
    name: 'Retro VHS',
    description: 'Scanlines, chromatic aberration, and xpro LUT',
    effects: [
      { shaderId: 'scanlines', uniforms: { amount: 0.6, lineCount: 240 } },
      { shaderId: 'chromatic_aberration', uniforms: { amount: 2.0, angle: 0 } },
      { shaderId: 'vhs_crt', uniforms: { time: 0, bars: 3, amount: 0.5 } },
      { shaderId: 'lut_color_grading', uniforms: { amount: 0.8 } },
    ],
  },
  {
    id: 'cyberpunk_glitch',
    name: 'Cyberpunk Glitch',
    description: 'RGB shift, noise grain, and pixelate',
    effects: [
      { shaderId: 'rgb_shift', uniforms: { amount: 3.0, angle: 45 } },
      { shaderId: 'noise_grain', uniforms: { amount: 0.15, seed: 42 } },
      { shaderId: 'pixelate', uniforms: { blockSize: 12 } },
      { shaderId: 'hue_saturation', uniforms: { hue: 0.05, saturation: 0.3 } },
    ],
  },
  {
    id: 'film_damage',
    name: 'Film Damage',
    description: 'Dust overlay, burn overlay, grain, and hefe LUT',
    effects: [
      { shaderId: 'noise_grain', uniforms: { amount: 0.2, seed: 1 } },
      { shaderId: 'lut_color_grading', uniforms: { amount: 0.7 } },
      { shaderId: 'dither_halftone', uniforms: { scale: 2, amount: 0.3, colLight: [0.9, 0.9, 0.85], colDark: [0.1, 0.1, 0.15], colWhite: [1, 1, 0.95] } },
    ],
  },
  {
    id: 'pixel_art_dither',
    name: 'Pixel Art Dither',
    description: 'Pixelate, bayer dither, and posterize',
    effects: [
      { shaderId: 'pixelate', uniforms: { blockSize: 16 } },
      { shaderId: 'dither_halftone', uniforms: { scale: 2, amount: 0.8, colLight: [0.85, 0.85, 0.9], colDark: [0.1, 0.1, 0.2], colWhite: [1, 1, 1] } },
      { shaderId: 'posterize', uniforms: { levels: 4 } },
    ],
  },
  {
    id: 'datamosh_extreme',
    name: 'Datamosh Extreme',
    description: 'I-frame removal + motion transfer (Rust backend only)',
    effects: [
      { shaderId: 'rgb_shift', uniforms: { amount: 5.0, angle: 90 } },
      { shaderId: 'pixelate', uniforms: { blockSize: 8 } },
      { shaderId: 'noise_grain', uniforms: { amount: 0.25, seed: 7 } },
    ],
  },
];

const STORAGE_KEY = 'moshdither_custom_presets';

export function loadCustomPresets(): Preset[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    return JSON.parse(raw) as Preset[];
  } catch {
    return [];
  }
}

export function saveCustomPreset(preset: Preset) {
  const existing = loadCustomPresets();
  const filtered = existing.filter(p => p.id !== preset.id);
  filtered.push(preset);
  localStorage.setItem(STORAGE_KEY, JSON.stringify(filtered));
}

export function deleteCustomPreset(id: string) {
  const existing = loadCustomPresets();
  const filtered = existing.filter(p => p.id !== id);
  localStorage.setItem(STORAGE_KEY, JSON.stringify(filtered));
}

export function getAllPresets(): Preset[] {
  return [...BUILT_IN_PRESETS, ...loadCustomPresets()];
}

export function exportPresets(): string {
  return JSON.stringify(getAllPresets(), null, 2);
}

export function importPresets(json: string): Preset[] {
  const parsed = JSON.parse(json) as Preset[];
  parsed.forEach(p => saveCustomPreset(p));
  return getAllPresets();
}
