/**
 * BrushEngine — Smooth pressure-aware stroke renderer for mask painting.
 *
 * Uses perfect-freehand for natural, smooth strokes with pressure simulation.
 * Replaces the per-stamp canvas approach with vector outline generation.
 */

import { getStroke } from 'perfect-freehand';

export interface BrushPoint {
  x: number;
  y: number;
  pressure: number;
}

export interface BrushOptions {
  size: number;
  hardness: number;
  opacity: number;
  smoothing: number;
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
 * Render a complete stroke onto a 2D canvas context using perfect-freehand.
 */
export function renderStroke(
  ctx: CanvasRenderingContext2D,
  points: BrushPoint[],
  options: Partial<BrushOptions> = {},
  isEraser = false,
): void {
  const opts = { ...DEFAULT_OPTIONS, ...options };

  if (points.length === 0) return;

  // Convert points to perfect-freehand format: [x, y, pressure]
  const strokeInputs = points.map((p) => [p.x, p.y, p.pressure]);

  const stroke = getStroke(strokeInputs, {
    size: opts.size,
    thinning: 0.5,
    smoothing: opts.smoothing,
    streamline: 0.5,
    easing: (t: number) => t,
    start: { taper: true, cap: true },
    end: { taper: true, cap: true },
    simulatePressure: opts.simulatePressure,
  });

  if (stroke.length === 0) return;

  ctx.save();
  ctx.globalCompositeOperation = isEraser ? 'destination-out' : 'source-over';
  ctx.globalAlpha = opts.opacity;

  const path = new Path2D();
  const [first, ...rest] = stroke;
  path.moveTo(first[0], first[1]);
  rest.forEach(([x, y]) => path.lineTo(x, y));
  path.closePath();

  // Softness via shadowBlur for a glow effect (more performant than filter)
  if (opts.hardness < 1) {
    const blurAmount = (1 - opts.hardness) * (opts.size / 2);
    ctx.shadowBlur = blurAmount;
    ctx.shadowColor = isEraser ? 'rgba(0,0,0,1)' : 'rgba(255,0,0,1)';
    ctx.shadowOffsetX = 0;
    ctx.shadowOffsetY = 0;
  }

  ctx.fillStyle = isEraser ? 'rgba(0,0,0,1)' : 'rgba(255,0,0,1)';
  ctx.fill(path);
  ctx.restore();
}

export const BRUSH_PRESETS: Record<string, Partial<BrushOptions>> = {
  softRound: { size: 30, hardness: 0.0, opacity: 1.0, smoothing: 0.6 },
  hardRound: { size: 15, hardness: 1.0, opacity: 1.0, smoothing: 0.2 },
  pencil: { size: 8, hardness: 0.8, opacity: 0.7, smoothing: 0.3 },
  charcoal: { size: 25, hardness: 0.2, opacity: 0.6, smoothing: 0.4 },
  watercolor: { size: 35, hardness: 0.0, opacity: 0.4, smoothing: 0.8 },
  marker: { size: 12, hardness: 0.3, opacity: 0.9, smoothing: 0.1 },
};
