/**
 * usePlaybackEngine is the app's one clock. These pin its rate, because the
 * bug it replaced was invisible to every other test: three loops advanced
 * currentTime at once and a still image played at 2x.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { renderHook } from "@testing-library/react";
import { useAppStore } from "../store";
import { usePlaybackEngine, playbackFps } from "./usePlaybackEngine";

// Hand-driven rAF so the test owns the wall clock.
let now = 0;
let queue = new Map<number, FrameRequestCallback>();
let nextId = 1;

function advance(ms: number, step = 1000 / 60) {
  const end = now + ms;
  while (now < end) {
    now = Math.min(end, now + step);
    const due = [...queue.values()];
    queue = new Map();
    for (const cb of due) cb(now);
  }
}

beforeEach(() => {
  now = 0;
  queue = new Map();
  nextId = 1;
  vi.stubGlobal("requestAnimationFrame", (cb: FrameRequestCallback) => {
    const id = nextId++;
    queue.set(id, cb);
    return id;
  });
  vi.stubGlobal("cancelAnimationFrame", (id: number) => {
    queue.delete(id);
  });
  useAppStore.setState({
    currentTime: 0,
    isPlaying: false,
    duration: 10,
    inPoint: null,
    outPoint: null,
    loopMode: "off",
    playbackSpeed: 1,
    isVideo: false,
    mediaFps: 30,
    animateFps: 30,
  });
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("playbackFps", () => {
  it("uses the animation fps for a still and the clip fps for video", () => {
    expect(playbackFps({ isVideo: false, mediaFps: 24, animateFps: 12 })).toBe(12);
    expect(playbackFps({ isVideo: true, mediaFps: 24, animateFps: 12 })).toBe(24);
  });

  it("falls back to 30 when the rate is unusable", () => {
    expect(playbackFps({ isVideo: true, mediaFps: 0, animateFps: 30 })).toBe(30);
    expect(playbackFps({ isVideo: true, mediaFps: Number.NaN, animateFps: 30 })).toBe(30);
  });
});

describe("usePlaybackEngine", () => {
  it("advances one second of clip per second of wall clock -- real time, not 2x", () => {
    useAppStore.setState({ isPlaying: true });
    renderHook(() => usePlaybackEngine());
    advance(1000);
    const t = useAppStore.getState().currentTime;
    expect(t).toBeGreaterThan(0.9);
    expect(t).toBeLessThan(1.05);
  });

  it("honours playback speed", () => {
    useAppStore.setState({ isPlaying: true, playbackSpeed: 0.5 });
    renderHook(() => usePlaybackEngine());
    advance(1000);
    const t = useAppStore.getState().currentTime;
    expect(t).toBeGreaterThan(0.45);
    expect(t).toBeLessThan(0.55);
  });

  it("steps on the clip's own frame grid for video", () => {
    useAppStore.setState({ isPlaying: true, isVideo: true, mediaFps: 24 });
    renderHook(() => usePlaybackEngine());
    advance(500);
    const t = useAppStore.getState().currentTime;
    // Every step is exactly 1/24 s, so t * 24 lands on a whole frame.
    expect(Math.abs(t * 24 - Math.round(t * 24))).toBeLessThan(1e-6);
    expect(t).toBeGreaterThan(0.4);
  });

  it("loops inside the in/out range", () => {
    useAppStore.setState({ isPlaying: true, inPoint: 1, outPoint: 2, currentTime: 1, loopMode: "loop" });
    renderHook(() => usePlaybackEngine());
    advance(1500);
    const t = useAppStore.getState().currentTime;
    expect(t).toBeGreaterThanOrEqual(1);
    expect(t).toBeLessThan(2);
    expect(useAppStore.getState().isPlaying).toBe(true);
  });

  it("reverses direction at outPoint and bounces back at inPoint in pingpong mode", () => {
    useAppStore.setState({
      isPlaying: true,
      inPoint: 0,
      outPoint: 1,
      currentTime: 0,
      loopMode: "pingpong",
      animateFps: 10,
    });
    renderHook(() => usePlaybackEngine());

    // Advance ~1.4s on a [0, 1] range: 1s forward to 1.0, then ~0.4s backward toward 0.6
    advance(1450, 50);
    const tBackward = useAppStore.getState().currentTime;
    expect(tBackward).toBeGreaterThan(0.4);
    expect(tBackward).toBeLessThan(0.8);

    // Advance another 100ms — should continue moving backward (decreasing time)
    advance(100, 50);
    const tFurtherBackward = useAppStore.getState().currentTime;
    expect(tFurtherBackward).toBeLessThan(tBackward);

    // Advance past the start boundary — should bounce forward again
    advance(1000, 50);
    const tForwardAgain = useAppStore.getState().currentTime;
    expect(tForwardAgain).toBeGreaterThan(0.2);
    expect(tForwardAgain).toBeLessThan(0.9);
  });

  it("stops at the out point when not looping", () => {
    useAppStore.setState({ isPlaying: true, inPoint: 1, outPoint: 2, currentTime: 1, loopMode: "off" });
    renderHook(() => usePlaybackEngine());
    advance(3000);
    expect(useAppStore.getState().currentTime).toBe(2);
    expect(useAppStore.getState().isPlaying).toBe(false);
  });

  it("does nothing while paused", () => {
    renderHook(() => usePlaybackEngine());
    advance(1000);
    expect(useAppStore.getState().currentTime).toBe(0);
  });
});
