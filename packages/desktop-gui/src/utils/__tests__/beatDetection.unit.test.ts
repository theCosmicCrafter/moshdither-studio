import { describe, it, expect } from "vitest";
import { detectBeats } from "../beatDetection";

// Mock AudioContext for jsdom
class MockAudioContext {
  sampleRate: number;
  constructor(opts?: { sampleRate?: number }) {
    this.sampleRate = opts?.sampleRate ?? 44100;
  }
  createBuffer(channels: number, length: number, sampleRate: number) {
    const data = new Float32Array(length);
    return {
      numberOfChannels: channels,
      length,
      sampleRate,
      duration: length / sampleRate,
      getChannelData: () => data,
      copyFromChannel: () => {},
      copyToChannel: () => {},
    } as unknown as AudioBuffer;
  }
}
(
  globalThis as unknown as { AudioContext: typeof MockAudioContext }
).AudioContext = MockAudioContext;

describe("Beat Detection", () => {
  function createTestBuffer(
    sampleRate: number,
    duration: number,
    beatInterval: number,
  ): AudioBuffer {
    const length = sampleRate * duration;
    const ctx = new AudioContext({ sampleRate });
    const buffer = ctx.createBuffer(1, length, sampleRate);
    const data = buffer.getChannelData(0);

    // Inject impulses at beat intervals (simple clicks)
    let nextBeat = 0;
    for (let i = 0; i < length; i++) {
      const t = i / sampleRate;
      if (t >= nextBeat) {
        data[i] = 1.0; // impulse
        nextBeat += beatInterval;
      } else {
        data[i] = 0;
      }
    }

    return buffer;
  }

  it("detects regular beats in a synthetic signal", () => {
    const sampleRate = 44100;
    const beatInterval = 0.5; // 120 BPM
    const duration = 5;
    const buffer = createTestBuffer(sampleRate, duration, beatInterval);
    const result = detectBeats(buffer, 1.1);

    // Should find roughly 10 beats (5 seconds / 0.5s interval)
    expect(result.beats.length).toBeGreaterThanOrEqual(5);
    expect(result.bpm).toBeGreaterThanOrEqual(100);
    expect(result.bpm).toBeLessThanOrEqual(140);
    expect(result.duration).toBeCloseTo(duration, 0);
  });

  it("returns zero BPM for silence", () => {
    const sampleRate = 44100;
    const duration = 2;
    const ctx = new AudioContext({ sampleRate });
    const buffer = ctx.createBuffer(1, sampleRate * duration, sampleRate);
    // buffer is silence by default
    const result = detectBeats(buffer);
    expect(result.beats.length).toBe(0);
    expect(result.bpm).toBe(0);
  });
});
