import { useEffect, useRef } from "react";
import { useAppStore } from "../store";

const DEFAULT_FPS = 30;

/**
 * RAF-based playback engine.
 * When isPlaying is true, advances currentTime at the target FPS,
 * respecting playbackSpeed, in/out points, and loop mode.
 *
 * This drives the entire animation pipeline:
 *   currentTime updates → useKeyframePlayback interpolates params
 *   → audio features update → PreviewViewport WebGL re-renders
 *
 * For a still image, the source texture stays the same but effect
 * parameters change each frame, producing an animated video preview.
 */
export function usePlaybackEngine() {
  const isPlaying = useAppStore((s) => s.isPlaying);
  const rafRef = useRef<number>(0);
  const lastTimeRef = useRef<number>(0);
  const accumulatedRef = useRef<number>(0);

  useEffect(() => {
    if (!isPlaying) {
      cancelAnimationFrame(rafRef.current);
      rafRef.current = 0;
      lastTimeRef.current = 0;
      accumulatedRef.current = 0;
      return;
    }

    const frameDuration = 1000 / DEFAULT_FPS;

    const tick = (now: number) => {
      if (lastTimeRef.current === 0) {
        lastTimeRef.current = now;
        rafRef.current = requestAnimationFrame(tick);
        return;
      }

      const deltaMs = now - lastTimeRef.current;
      lastTimeRef.current = now;
      accumulatedRef.current += deltaMs;

      // Advance in whole-frame increments to avoid jitter
      while (accumulatedRef.current >= frameDuration) {
        accumulatedRef.current -= frameDuration;

        const state = useAppStore.getState();
        const speed = state.playbackSpeed;
        const frameTime = 1 / DEFAULT_FPS;
        let nextTime = state.currentTime + frameTime * speed;

        const start = state.inPoint ?? 0;
        const end = state.outPoint ?? state.duration;

        if (state.loopMode === "pingpong") {
          if (nextTime >= end) {
            // Reverse direction: play backwards from end
            nextTime = end - (nextTime - end);
            // Clamp to start
            if (nextTime < start) nextTime = start;
          } else if (nextTime <= start && speed < 0) {
            nextTime = start + (start - nextTime);
          }
        } else if (state.loopMode === "loop") {
          if (nextTime >= end) {
            nextTime = start;
          }
        } else {
          // No loop — stop at end
          if (nextTime >= end) {
            nextTime = end;
            state.stopPlayback();
          }
        }

        state.setCurrentTime(nextTime);
      }

      rafRef.current = requestAnimationFrame(tick);
    };

    rafRef.current = requestAnimationFrame(tick);

    return () => {
      cancelAnimationFrame(rafRef.current);
      rafRef.current = 0;
    };
  }, [isPlaying]);
}
