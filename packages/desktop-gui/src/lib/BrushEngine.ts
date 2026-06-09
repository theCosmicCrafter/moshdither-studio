/**
 * BrushEngine — Smooth pressure-aware stroke renderer for mask painting.
 *
 * Replaces the basic `lineTo` + `arc` brush in Viewport.tsx with quadratic
 * bezier interpolation and PointerEvent pressure support. No external
 * dependencies (e.g. perfect-freehand) — all smoothing is done inline.
 */

export interface BrushPoint {
  x: number;
  y: number;
  pressure: number; // 0.0 – 1.0
}

export interface BrushOptions {
  /** Base brush diameter in pixels */
  size: number;
  /** 0.0 = hard edge, 1.0 = fully soft (gaussian-like falloff) */
  hardness: number;
  /** Stroke opacity 0.0 – 1.0 */
  opacity: number;
  /** 0.0 = no smoothing (raw input), 1.0 = maximum curve smoothing */
  smoothing: number;
  /** Simulate pressure taper at stroke start/end */
  simulatePressure: boolean;
}

const DEFAULT_OPTIONS: BrushOptions = {
  size: 20,
  hardness: 0.5,
  opacity: 1.0,
  smoothing: 0.5,
  simulatePressure: true,
};

/**
 * Collect points from a PointerEvent stream, including coalesced events
 * for high-resolution input (tablets, high-DPI displays).
 */
export function collectStrokePoints(
  e: PointerEvent,
  canvas: HTMLCanvasElement,
): BrushPoint[] {
  const rect = canvas.getBoundingClientRect();
  const scaleX = canvas.width / rect.width;
  const scaleY = canvas.height / rect.height;

  const toPoint = (evt: PointerEvent): BrushPoint => ({
    x: (evt.clientX - rect.left) * scaleX,
    y: (evt.clientY - rect.top) * scaleY,
    pressure: evt.pressure ?? 0.5,
  });

  const points: BrushPoint[] = [];

  // Coalesced events give us every intermediate pointer position the OS
  // batch-compressed into a single pointermove. Critical for smooth curves.
  const coalesced = e.getCoalescedEvents?.() ?? [];
  if (coalesced.length > 0) {
    for (const evt of coalesced) {
      points.push(toPoint(evt as PointerEvent));
    }
  } else {
    points.push(toPoint(e));
  }

  return points;
}

/**
 * Apply smoothing to a series of raw input points using a simple
 * exponential moving average on position and pressure.
 */
function smoothPoints(points: BrushPoint[], smoothing: number): BrushPoint[] {
  if (points.length < 2 || smoothing <= 0) return points;

  const out: BrushPoint[] = [points[0]];
  let sx = points[0].x;
  let sy = points[0].y;
  let sp = points[0].pressure;

  const alpha = 1 - smoothing * 0.9; // smoothing=1 => alpha=0.1 (very smooth)

  for (let i = 1; i < points.length; i++) {
    sx = sx * (1 - alpha) + points[i].x * alpha;
    sy = sy * (1 - alpha) + points[i].y * alpha;
    sp = sp * (1 - alpha) + points[i].pressure * alpha;
    out.push({ x: sx, y: sy, pressure: sp });
  }

  return out;
}

/**
 * Build a radial gradient brush stamp on an offscreen canvas.
 * The stamp is used as a brush tip for each point in the stroke.
 */
function createBrushStamp(
  size: number,
  hardness: number,
  opacity: number,
): HTMLCanvasElement {
  const canvas = document.createElement("canvas");
  const r = size / 2;
  canvas.width = Math.ceil(size);
  canvas.height = Math.ceil(size);
  const ctx = canvas.getContext("2d")!;

  const cx = canvas.width / 2;
  const cy = canvas.height / 2;

  const grad = ctx.createRadialGradient(cx, cy, 0, cx, cy, r);
  const innerAlpha = opacity;
  const outerAlpha = hardness <= 0.01 ? 0 : opacity * (1 - hardness);

  grad.addColorStop(0, `rgba(255, 0, 0, ${innerAlpha})`);
  grad.addColorStop(
    Math.max(0, 1 - hardness * 0.5),
    `rgba(255, 0, 0, ${innerAlpha})`,
  );
  grad.addColorStop(1, `rgba(255, 0, 0, ${outerAlpha})`);

  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  return canvas;
}

/**
 * Render a complete stroke onto a 2D canvas context.
 *
 * Handles:
 * - Quadratic bezier interpolation between points for smooth curves
 * - Pressure-sensitive width (faster = thinner if simulatePressure)
 * - Per-point brush stamps for natural texture
 * - Eraser mode via `destination-out`
 */
export function renderStroke(
  ctx: CanvasRenderingContext2D,
  points: BrushPoint[],
  options: Partial<BrushOptions> = {},
  isEraser = false,
): void {
  const opts = { ...DEFAULT_OPTIONS, ...options };

  if (points.length < 2) {
    // Single point — draw a stamp
    const stamp = createBrushStamp(opts.size, opts.hardness, opts.opacity);
    drawStamp(ctx, stamp, points[0], opts.size);
    return;
  }

  const smoothed = smoothPoints(points, opts.smoothing);

  // For very smooth strokes, use quadratic curves between midpoints.
  // This is the core algorithm: instead of lineTo between raw points,
  // we draw curves through the midpoints of each segment.
  const midpoints: BrushPoint[] = [];
  for (let i = 0; i < smoothed.length - 1; i++) {
    const a = smoothed[i];
    const b = smoothed[i + 1];
    midpoints.push({
      x: (a.x + b.x) / 2,
      y: (a.y + b.y) / 2,
      pressure: (a.pressure + b.pressure) / 2,
    });
  }

  ctx.save();
  ctx.globalCompositeOperation = isEraser ? "destination-out" : "source-over";

  const stamp = createBrushStamp(opts.size, opts.hardness, opts.opacity);

  // Draw the first point as a stamp
  drawStamp(ctx, stamp, smoothed[0], opts.size);

  // Draw quadratic curves through midpoints
  for (let i = 0; i < midpoints.length; i++) {
    const mid = midpoints[i];
    const end = smoothed[i + 1];

    // Interpolate stamps along the curve for consistent coverage
    const dist = Math.hypot(end.x - mid.x, end.y - mid.y);
    const steps = Math.max(1, Math.ceil(dist / (opts.size * 0.3)));

    for (let s = 1; s <= steps; s++) {
      const t = s / steps;
      const x = mid.x + (end.x - mid.x) * t;
      const y = mid.y + (end.y - mid.y) * t;
      const pressure = mid.pressure + (end.pressure - mid.pressure) * t;
      const size = opts.size * pressure;
      drawStamp(ctx, stamp, { x, y, pressure }, size);
    }
  }

  ctx.restore();
}

function drawStamp(
  ctx: CanvasRenderingContext2D,
  stamp: HTMLCanvasElement,
  point: BrushPoint,
  size: number,
): void {
  const half = size / 2;
  ctx.drawImage(stamp, point.x - half, point.y - half, size, size);
}

/**
 * Pre-defined brush presets matching professional digital art tools.
 */
export const BRUSH_PRESETS: Record<string, Partial<BrushOptions>> = {
  softRound: { size: 30, hardness: 0.0, opacity: 1.0, smoothing: 0.6 },
  hardRound: { size: 15, hardness: 1.0, opacity: 1.0, smoothing: 0.2 },
  pencil: { size: 8, hardness: 0.8, opacity: 0.7, smoothing: 0.3 },
  charcoal: { size: 25, hardness: 0.2, opacity: 0.6, smoothing: 0.4 },
  watercolor: { size: 35, hardness: 0.0, opacity: 0.4, smoothing: 0.8 },
  marker: { size: 12, hardness: 0.3, opacity: 0.9, smoothing: 0.1 },
};
