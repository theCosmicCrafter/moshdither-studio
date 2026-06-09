/**
 * Smart export settings recommendation engine.
 *
 * Analyzes source media properties and suggests optimal
 * export format, FPS, and quality settings.
 */

export interface ExportRecommendation {
  format: 'same' | 'png' | 'jpg' | 'gif' | 'mp4';
  fps: number;
  quality: 'high' | 'medium' | 'low';
  reason: string;
}

/**
 * Recommend export settings based on source media characteristics.
 */
export function recommendExportSettings(
  mediaType: 'image' | 'video' | null,
  sourceExt: string,
  sourceDuration?: number,
  hasEffects?: boolean,
): ExportRecommendation {
  // Image files
  if (mediaType === 'image' || sourceExt.match(/\.(jpg|jpeg|png|webp)$/i)) {
    if (hasEffects && sourceExt.match(/\.(jpg|jpeg)$/i)) {
      return {
        format: 'png',
        fps: 30,
        quality: 'high',
        reason: 'Effects may introduce transparency or artifacts; PNG preserves quality',
      };
    }
    return {
      format: 'same',
      fps: 30,
      quality: 'high',
      reason: 'Single image — preserve original format',
    };
  }

  // Short videos (under 3s) — GIF candidate
  if (sourceDuration && sourceDuration <= 3) {
    return {
      format: 'gif',
      fps: 15,
      quality: 'medium',
      reason: 'Short loopable content suits GIF for sharing',
    };
  }

  // Long videos with heavy effects
  if (hasEffects && sourceDuration && sourceDuration > 30) {
    return {
      format: 'mp4',
      fps: 30,
      quality: 'medium',
      reason: 'Long video with effects — H.264 MP4 balances size and quality',
    };
  }

  // Default video
  return {
    format: 'same',
    fps: 30,
    quality: 'high',
    reason: 'Preserve original format and frame rate',
  };
}

/**
 * Derive media type from file extension.
 */
export function getMediaTypeFromExt(path: string): 'image' | 'video' {
  if (/\.(jpg|jpeg|png|webp|gif|bmp)$/i.test(path)) return 'image';
  return 'video';
}
