import { useEffect, useRef } from "react";
import { useAppStore } from "../store";

/**
 * RAF-based playback engine -- THE clock for the whole app.
 *
 * When isPlaying is true, advances currentTime one frame at a time at the
 * media's frame rate (the clip's own fps for video, the animation fps for a
 * still), respecting playbackSpeed, in/out points, and loop mode.
 *
 * It must be the ONLY thing that advances currentTime. PreviewViewport used
 * to advance it as well -- in both its WebGL loop and its CPU-preview loop --
 * so a still image played at exactly twice real speed: this engine stepped
 * 1/30 s every 33 ms and the preview added the same wall-clock delta on top.
 * A 5 s animation previewed in 2.5 s and never matched its own export.
 *
 * This drives the entire animation pipeline:
 *   currentTime updates → useKeyframePlayback interpolates params
 *   → audio features update → PreviewViewport WebGL re-renders
 *
 * For a still image, the source texture stays the same but effect
 * parameters change each frame, producing an animated video preview.
 */
/** Frame rate the transport steps at: the clip's own for video, the animation's for a still. */
export function playbackFps(state: { isVideo: boolean; mediaFps: number; animateFps: number }): number {
  const fps = state.isVideo ? state.mediaFps : state.animateFps;
  return Number.isFinite(fps) && fps > 0 ? fps : 30;
}

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

    const tick = (now: number) => {
      if (lastTimeRef.current === 0) {
        lastTimeRef.current = now;
        rafRef.current = requestAnimationFrame(tick);
        return;
      }

      const deltaMs = now - lastTimeRef.current;
      lastTimeRef.current = now;
      accumulatedRef.current += deltaMs;

      const fpsNow = playbackFps(useAppStore.getState());
      const frameDuration = 1000 / fpsNow;

      // Advance in whole-frame increments to avoid jitter
      while (accumulatedRef.current >= frameDuration) {
        accumulatedRef.current -= frameDuration;

        const state = useAppStore.getState();
        const speed = state.playbackSpeed;
        const frameTime = 1 / fpsNow;
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
