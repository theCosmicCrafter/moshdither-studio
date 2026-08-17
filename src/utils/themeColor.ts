/**
 * Resolve a CSS custom property's current value for use in Canvas 2D draw
 * calls. Unlike a DOM element's own `style`, `ctx.fillStyle`/`strokeStyle`
 * cannot parse `var(--token)` references -- the canvas has no styling
 * context to resolve them against -- so overlay/annotation chrome drawn on
 * a <canvas> has to read the resolved value explicitly to track theme
 * changes instead of hardcoding a color.
 *
 * Only for UI overlay chrome (selection markers, guide boxes). Never use
 * this for pixel data written into an actual mask canvas -- mask fills
 * (white = included, black = excluded) must stay fixed regardless of
 * theme, since they're image data sent to the backend, not UI.
 */
export function getThemeColor(varName: string, fallback: string): string {
  if (typeof document === "undefined") return fallback;
  const value = getComputedStyle(document.documentElement).getPropertyValue(varName).trim();
  return value || fallback;
}
