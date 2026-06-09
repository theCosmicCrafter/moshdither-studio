/**
 * Watermark overlay utilities for the render pipeline.
 *
 * Generates FFmpeg drawtext filter arguments for text watermarks.
 * Supports position, font size, opacity, and color.
 */

export interface WatermarkSettings {
  enabled: boolean;
  text: string;
  position: 'top-left' | 'top-right' | 'bottom-left' | 'bottom-right' | 'center';
  fontSize: number;
  color: string;
  opacity: number;
}

export const DEFAULT_WATERMARK: WatermarkSettings = {
  enabled: false,
  text: 'MoshDither',
  position: 'bottom-right',
  fontSize: 24,
  color: 'white',
  opacity: 0.7,
};

/**
 * Convert hex/rgb color name to FFmpeg drawtext color format.
 */
function toDrawtextColor(color: string): string {
  const colorMap: Record<string, string> = {
    white: 'white',
    black: 'black',
    red: 'red',
    green: 'green',
    blue: 'blue',
    yellow: 'yellow',
  };
  return colorMap[color.toLowerCase()] || 'white';
}

/**
 * Get FFmpeg drawtext position coordinates.
 */
function getPositionCoords(position: WatermarkSettings['position']): { x: string; y: string } {
  switch (position) {
    case 'top-left':
      return { x: '10', y: '10' };
    case 'top-right':
      return { x: 'w-text_w-10', y: '10' };
    case 'bottom-left':
      return { x: '10', y: 'h-text_h-10' };
    case 'bottom-right':
      return { x: 'w-text_w-10', y: 'h-text_h-10' };
    case 'center':
      return { x: '(w-text_w)/2', y: '(h-text_h)/2' };
  }
}

/**
 * Build a drawtext filter string for FFmpeg.
 */
export function buildDrawtextFilter(settings: WatermarkSettings): string | null {
  if (!settings.enabled || !settings.text) return null;

  const { x, y } = getPositionCoords(settings.position);
  const color = toDrawtextColor(settings.color);
  const alpha = Math.round(settings.opacity * 255)
    .toString(16)
    .padStart(2, '0');

  return `drawtext=text='${settings.text}':x=${x}:y=${y}:fontsize=${settings.fontSize}:fontcolor=${color}@${alpha}:fontfile=/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf`;
}

/**
 * Append watermark to existing FFmpeg video filter string.
 */
export function appendWatermarkToVf(vf: string, settings: WatermarkSettings): string {
  const watermark = buildDrawtextFilter(settings);
  if (!watermark) return vf;
  if (!vf) return watermark;
  return `${vf},${watermark}`;
}
