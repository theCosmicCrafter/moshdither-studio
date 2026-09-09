/**
 * The output box for an export: the chosen resolution, reshaped to a locked
 * aspect ratio when one is set.
 *
 * "Lock Aspect Ratio" and its six ratio chips wrote `aspectRatio` into the
 * store and NOTHING read it -- the control had no effect on any export. It
 * works now because the encoder letterboxes into the box it is given
 * (ffmpeg/mod.rs) rather than stretching to it, so forcing a ratio reframes
 * the output instead of distorting the picture.
 *
 * With "Source" resolution and a lock, the box is derived from the media's own
 * dimensions so the ratio still means something.
 */
export function exportDimensions(
  resolution: { w: number; h: number },
  lockedRatio: number | null,
  mediaInfo: { width: number; height: number } | null
): { width: number | undefined; height: number | undefined } {
  const even = (n: number) => Math.max(2, Math.round(n / 2) * 2);

  if (!lockedRatio || !Number.isFinite(lockedRatio) || lockedRatio <= 0) {
    return {
      width: resolution.w === 0 ? undefined : resolution.w,
      height: resolution.h === 0 ? undefined : resolution.h,
    };
  }

  // Base the box on the chosen preset, or on the source when it is "Source".
  const baseW = resolution.w || mediaInfo?.width || 0;
  const baseH = resolution.h || mediaInfo?.height || 0;
  if (baseW <= 0 || baseH <= 0) return { width: undefined, height: undefined };

  // Keep the larger dimension and derive the other, so a lock never upscales
  // beyond the resolution the user picked.
  if (baseW / baseH > lockedRatio) {
    return { width: even(baseH * lockedRatio), height: even(baseH) };
  }
  return { width: even(baseW), height: even(baseW / lockedRatio) };
}
