import { useAppStore } from "../store";

/**
 * Composition guides drawn over the preview.
 *
 * These replace the four `overlay.*` registry effects. As effects they sat in
 * the same list as Datamosh and VHS and were rendered into the exported file,
 * which is almost never what a framing guide is for. Drawing them here means
 * they cannot reach an export at all — there is no code path from this
 * component to the render pipeline.
 *
 * SVG rather than a WebGL pass: guides are a handful of straight lines, they
 * must stay crisp at any zoom, and this costs no GPU time on a preview that is
 * often already CPU-bound. The `viewBox` is in source-pixel space so guide
 * geometry tracks the media rather than the on-screen element size.
 */

/** Matches the defaults the former `overlay.*` effects declared. */
const SAFE_AREA_MARGIN_PERCENT = 5;
const CROSSHAIR_SIZE_PERCENT = 10;
const PIXEL_GRID_SIZE = 32;

const STROKE = "rgba(0, 229, 214, 0.85)";

export interface ViewportGuidesProps {
  /** Source media width in pixels. */
  width: number;
  /** Source media height in pixels. */
  height: number;
}

export default function ViewportGuides({ width, height }: ViewportGuidesProps) {
  const guides = useAppStore((s) => s.viewportGuides);

  const anyVisible =
    guides.safeArea || guides.ruleOfThirds || guides.crosshairs || guides.pixelGrid;
  if (!anyVisible || width <= 0 || height <= 0) return null;

  // Scale stroke widths with the media so guides stay a consistent visual
  // weight on a 4K frame and a thumbnail alike.
  const unit = Math.max(1, Math.min(width, height) / 500);

  const safeInsetX = (width * SAFE_AREA_MARGIN_PERCENT) / 100;
  const safeInsetY = (height * SAFE_AREA_MARGIN_PERCENT) / 100;
  const crossX = (width * CROSSHAIR_SIZE_PERCENT) / 100;
  const crossY = (height * CROSSHAIR_SIZE_PERCENT) / 100;

  const pixelGridLines: React.ReactElement[] = [];
  if (guides.pixelGrid) {
    for (let x = PIXEL_GRID_SIZE; x < width; x += PIXEL_GRID_SIZE) {
      pixelGridLines.push(
        <line key={`gx-${x}`} x1={x} y1={0} x2={x} y2={height} strokeWidth={unit * 0.5} />
      );
    }
    for (let y = PIXEL_GRID_SIZE; y < height; y += PIXEL_GRID_SIZE) {
      pixelGridLines.push(
        <line key={`gy-${y}`} x1={0} y1={y} x2={width} y2={y} strokeWidth={unit * 0.5} />
      );
    }
  }

  return (
    <svg
      data-testid="viewport-guides"
      className="absolute inset-0 w-full h-full pointer-events-none"
      viewBox={`0 0 ${width} ${height}`}
      preserveAspectRatio="none"
      aria-hidden="true"
    >
      {guides.pixelGrid && (
        <g data-testid="guide-pixel-grid" stroke={STROKE} opacity={0.3}>
          {pixelGridLines}
        </g>
      )}

      {guides.ruleOfThirds && (
        <g
          data-testid="guide-rule-of-thirds"
          stroke={STROKE}
          strokeWidth={unit}
          opacity={0.4}
        >
          <line x1={width / 3} y1={0} x2={width / 3} y2={height} />
          <line x1={(width * 2) / 3} y1={0} x2={(width * 2) / 3} y2={height} />
          <line x1={0} y1={height / 3} x2={width} y2={height / 3} />
          <line x1={0} y1={(height * 2) / 3} x2={width} y2={(height * 2) / 3} />
        </g>
      )}

      {guides.safeArea && (
        <g data-testid="guide-safe-area" stroke={STROKE} strokeWidth={unit} opacity={0.5}>
          <rect
            x={safeInsetX}
            y={safeInsetY}
            width={width - safeInsetX * 2}
            height={height - safeInsetY * 2}
            fill="none"
          />
          {/* Title-safe: a second inset at double the margin, the broadcast convention. */}
          <rect
            x={safeInsetX * 2}
            y={safeInsetY * 2}
            width={width - safeInsetX * 4}
            height={height - safeInsetY * 4}
            fill="none"
            strokeDasharray={`${unit * 6} ${unit * 4}`}
          />
        </g>
      )}

      {guides.crosshairs && (
        <g data-testid="guide-crosshairs" stroke={STROKE} strokeWidth={unit} opacity={0.6}>
          {/* Centre cross */}
          <line x1={width / 2 - crossX} y1={height / 2} x2={width / 2 + crossX} y2={height / 2} />
          <line x1={width / 2} y1={height / 2 - crossY} x2={width / 2} y2={height / 2 + crossY} />
          {/* Corner marks */}
          {[
            [0, 0, 1, 1],
            [width, 0, -1, 1],
            [0, height, 1, -1],
            [width, height, -1, -1],
          ].map(([cx, cy, dx, dy], i) => (
            <g key={i}>
              <line x1={cx} y1={cy} x2={cx + crossX * dx} y2={cy} />
              <line x1={cx} y1={cy} x2={cx} y2={cy + crossY * dy} />
            </g>
          ))}
        </g>
      )}
    </svg>
  );
}
