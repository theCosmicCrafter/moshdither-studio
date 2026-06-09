/**
 * Audio-reactive effect parameter driver.
 *
 * Maps audio frequency bands (bass/mid/treble/average) to effect parameters,
 * updating them in real-time via StudioContext.
 */

import { useEffect, useRef } from "react";
import type { Effect } from "../types/effectTypes";
import type { AudioBands } from "./useAudioReactive";

export interface AudioReactiveMapping {
  effectId: string;
  paramName: string;
  band: "bass" | "mid" | "treble" | "average";
  minValue: number;
  maxValue: number;
  smoothing: number; // 0-1, higher = more smoothing
}

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

function clamp(v: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, v));
}

/**
 * Apply audio-reactive mappings to active effects.
 *
 * @param bands - Current audio band levels from useAudioReactive
 * @param activeEffects - Current effect stack
 * @param mappings - User-defined audio-to-parameter mappings
 * @param setActiveEffects - StudioContext setter
 * @param enabled - Whether audio reactivity is active
 */
export function useAudioReactiveEffects(
  bands: AudioBands,
  _activeEffects: Effect[],
  mappings: AudioReactiveMapping[],
  setActiveEffects: (
    effects: Effect[] | ((prev: Effect[]) => Effect[]),
  ) => void,
  enabled: boolean,
): void {
  const smoothedRef = useRef<Record<string, number>>({});

  useEffect(() => {
    if (!enabled || mappings.length === 0) return;

    // Apply mappings each frame
    const frame = () => {
      setActiveEffects((prev) => {
        let changed = false;
        const next = prev.map((fx) => {
          const relevant = mappings.filter((m) => m.effectId === fx.id);
          if (relevant.length === 0) return fx;

          const newParams = { ...fx.params };
          for (const m of relevant) {
            const rawValue = bands[m.band];
            const target = lerp(m.minValue, m.maxValue, rawValue);
            const key = `${fx.id}.${m.paramName}`;
            const prevSmoothed = smoothedRef.current[key] ?? target;
            const smoothed = lerp(prevSmoothed, target, m.smoothing);
            smoothedRef.current[key] = smoothed;

            if (m.paramName in newParams) {
              // eslint-disable-next-line @typescript-eslint/no-explicit-any
              (newParams as any)[m.paramName] = clamp(
                smoothed,
                m.minValue,
                m.maxValue,
              );
              changed = true;
            }
          }
          return changed ? { ...fx, params: newParams } : fx;
        });
        return changed ? next : prev;
      });

      rafId = requestAnimationFrame(frame);
    };

    let rafId = requestAnimationFrame(frame);
    return () => cancelAnimationFrame(rafId);
  }, [enabled, mappings, bands, setActiveEffects]);
}

/**
 * Serialize mappings to localStorage.
 */
export function saveAudioReactiveMappings(
  mappings: AudioReactiveMapping[],
): void {
  try {
    localStorage.setItem("moshdither:audioMappings", JSON.stringify(mappings));
  } catch {
    /* ignore */
  }
}

/**
 * Load mappings from localStorage.
 */
export function loadAudioReactiveMappings(): AudioReactiveMapping[] {
  try {
    const saved = localStorage.getItem("moshdither:audioMappings");
    return saved ? JSON.parse(saved) : [];
  } catch {
    return [];
  }
}
