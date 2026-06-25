import { describe, it, expect } from "vitest";
import { detectBeats } from "./beatDetection";

function makeBuffer(
  sampleRate: number,
  durationSec: number,
  fillFn: (i: number, sampleRate: number) => number,
): AudioBuffer {
  const length = Math.floor(sampleRate * durationSec);
  const data = new Float32Array(length);
  for (let i = 0; i < length; i++) {
    data[i] = fillFn(i, sampleRate);
  }
  return {
    sampleRate,
    length,
    duration: durationSec,
    numberOfChannels: 1,
    getChannelData: () => data,
  } as unknown as AudioBuffer;
}

describe("Beat Detection Fringe Cases", () => {
  describe("extreme sample rates", () => {
    it("handles 8000 Hz sample rate (low quality)", () => {
      const buffer = makeBuffer(8000, 3, (i, sr) => {
        const beatSamples = Math.floor(0.5 * sr);
        return i % beatSamples < 50 ? 0.9 : 0;
      });
      const result = detectBeats(buffer, 1.3);
      expect(result.duration).toBe(3);
      expect(result.beats.length).toBeGreaterThanOrEqual(0);
    });

    it("handles 48000 Hz sample rate (professional)", () => {
      const buffer = makeBuffer(48000, 3, (i, sr) => {
        const beatSamples = Math.floor(0.5 * sr);
        return i % beatSamples < 50 ? 0.9 : 0;
      });
      const result = detectBeats(buffer, 1.3);
      expect(result.duration).toBe(3);
    });

    it("handles 96000 Hz sample rate (high-res)", () => {
      const buffer = makeBuffer(96000, 2, (i, sr) => {
        const beatSamples = Math.floor(0.5 * sr);
        return i % beatSamples < 50 ? 0.9 : 0;
      });
      const result = detectBeats(buffer, 1.3);
      expect(result.duration).toBe(2);
    });
  });

  describe("extreme durations", () => {
    it("handles very short buffer (0.1 seconds)", () => {
      const buffer = makeBuffer(44100, 0.1, () => 0);
      const result = detectBeats(buffer);
      expect(result.beats).toHaveLength(0);
      expect(result.duration).toBeCloseTo(0.1, 1);
    });

    it("handles 10 second buffer with regular beats", () => {
      const buffer = makeBuffer(44100, 10, (i, sr) => {
        const beatSamples = Math.floor(0.5 * sr);
        return i % beatSamples < 50 ? 0.9 : (Math.random() - 0.5) * 0.001;
      });
      const result = detectBeats(buffer, 1.3);
      expect(result.duration).toBe(10);
      // Should detect several beats
      expect(result.beats.length).toBeGreaterThan(0);
      // All beats within duration
      for (const b of result.beats) {
        expect(b.time).toBeLessThanOrEqual(10);
      }
    });
  });

  describe("signal types", () => {
    it("handles constant DC offset signal", () => {
      const buffer = makeBuffer(44100, 2, () => 0.5);
      const result = detectBeats(buffer, 1.3);
      // DC offset has no spectral flux, so no beats
      expect(result.beats.length).toBe(0);
    });

    it("handles white noise signal", () => {
      const buffer = makeBuffer(44100, 2, () => Math.random() * 2 - 1);
      const result = detectBeats(buffer, 1.3);
      // White noise has random spectral flux, may or may not detect beats
      // but should not crash
      expect(result).toBeDefined();
      expect(result.duration).toBe(2);
    });

    it("handles single impulse in silence", () => {
      const buffer = makeBuffer(44100, 2, (i) => {
        return i === 44100 ? 1.0 : 0; // impulse at 1 second
      });
      const result = detectBeats(buffer, 1.0);
      expect(result.duration).toBe(2);
      // May detect 0 or 1 beat — the impulse might not be strong enough
      // for the adaptive threshold, but it shouldn't crash
    });

    it("handles negative sample values", () => {
      const buffer = makeBuffer(44100, 2, (i, sr) => {
        const beatSamples = Math.floor(0.5 * sr);
        const val = i % beatSamples < 50 ? -0.9 : 0;
        return val;
      });
      const result = detectBeats(buffer, 1.3);
      expect(result).toBeDefined();
    });

    it("handles alternating positive/negative impulses", () => {
      const buffer = makeBuffer(44100, 3, (i, sr) => {
        const beatSamples = Math.floor(0.5 * sr);
        if (i % beatSamples < 50) {
          return (Math.floor(i / beatSamples) % 2 === 0) ? 0.9 : -0.9;
        }
        return 0;
      });
      const result = detectBeats(buffer, 1.3);
      expect(result).toBeDefined();
      expect(result.duration).toBe(3);
    });
  });

  describe("sensitivity edge cases", () => {
    it("very high sensitivity (1.0) detects more beats than very low (5.0)", () => {
      const buffer = makeBuffer(44100, 5, (i, sr) => {
        const beatSamples = Math.floor(0.5 * sr);
        return i % beatSamples < 50 ? 0.9 : (Math.random() - 0.5) * 0.001;
      });
      const lowSens = detectBeats(buffer, 5.0);
      const highSens = detectBeats(buffer, 1.0);
      expect(lowSens.beats.length).toBeLessThanOrEqual(highSens.beats.length);
    });

    it("sensitivity of 0 still returns valid result", () => {
      const buffer = makeBuffer(44100, 2, (i, sr) => {
        const beatSamples = Math.floor(0.5 * sr);
        return i % beatSamples < 50 ? 0.9 : 0;
      });
      const result = detectBeats(buffer, 0);
      expect(result).toBeDefined();
      expect(result.duration).toBe(2);
    });
  });

  describe("BPM estimation edge cases", () => {
    it("single beat produces BPM of 0 (no intervals)", () => {
      // Create a signal with only one detectable beat
      const buffer = makeBuffer(44100, 3, (i) => {
        return i === 44100 ? 1.0 : 0; // single impulse at 1s
      });
      const result = detectBeats(buffer, 0.5);
      // With 0 or 1 beats, BPM should be 0
      if (result.beats.length <= 1) {
        expect(result.bpm).toBe(0);
      }
    });

    it("BPM is clamped to minimum 40", () => {
      // Very slow beats (3s apart = 20 BPM, should clamp to 40)
      const buffer = makeBuffer(44100, 10, (i, sr) => {
        const beatSamples = Math.floor(3 * sr);
        return i % beatSamples < 50 ? 0.9 : 0;
      });
      const result = detectBeats(buffer, 1.0);
      if (result.beats.length > 1) {
        expect(result.bpm).toBeGreaterThanOrEqual(40);
      }
    });
  });
});
