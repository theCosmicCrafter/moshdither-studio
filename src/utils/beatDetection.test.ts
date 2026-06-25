import { describe, it, expect } from "vitest";
import { detectBeats } from "./beatDetection";

/**
 * Mock AudioBuffer with synthetic data.
 * Creates a buffer with periodic impulses (sharp onsets) at regular intervals
 * so the beat detector should find beats at those positions.
 */
function makeMockAudioBuffer(
  sampleRate: number,
  durationSec: number,
  beatIntervalSec: number
): AudioBuffer {
  const length = Math.floor(sampleRate * durationSec);
  const data = new Float32Array(length);

  // Fill with silence, add sharp impulses at each beat interval
  const beatSamples = Math.floor(beatIntervalSec * sampleRate);
  for (let i = 0; i < length; i++) {
    if (i % beatSamples < 50) {
      // Short impulse (50 samples) with high amplitude
      data[i] = 0.9 * Math.sin((2 * Math.PI * 440 * (i % beatSamples)) / sampleRate);
    } else {
      // Low-level noise floor
      data[i] = (Math.random() - 0.5) * 0.001;
    }
  }

  return {
    sampleRate,
    length,
    duration: durationSec,
    numberOfChannels: 1,
    getChannelData: () => data,
    copyFromChannel: () => {},
    copyToChannel: () => {},
  } as unknown as AudioBuffer;
}

describe("Beat Detection", () => {
  describe("detectBeats", () => {
    it("detects beats in a signal with periodic impulses", () => {
      const sampleRate = 44100;
      const buffer = makeMockAudioBuffer(sampleRate, 5.0, 0.5); // beat every 0.5s = 120 BPM
      const result = detectBeats(buffer, 1.3);
      expect(result.beats.length).toBeGreaterThan(0);
      expect(result.bpm).toBeGreaterThan(0);
      expect(result.duration).toBe(5.0);
    });

    it("returns empty beats for silence", () => {
      const sampleRate = 44100;
      const length = sampleRate * 2;
      const data = new Float32Array(length); // all zeros = silence
      const buffer = {
        sampleRate,
        length,
        duration: 2.0,
        numberOfChannels: 1,
        getChannelData: () => data,
      } as unknown as AudioBuffer;

      const result = detectBeats(buffer, 1.3);
      expect(result.beats).toHaveLength(0);
      expect(result.bpm).toBe(0);
    });

    it("returns duration from AudioBuffer", () => {
      const buffer = makeMockAudioBuffer(44100, 3.0, 0.5);
      const result = detectBeats(buffer);
      expect(result.duration).toBe(3.0);
    });

    it("clamps BPM to reasonable range (40-200)", () => {
      // Very fast beats (0.2s = 300 BPM, should clamp to 200)
      const buffer = makeMockAudioBuffer(44100, 3.0, 0.2);
      const result = detectBeats(buffer, 1.0); // low sensitivity to catch more
      if (result.beats.length > 1) {
        expect(result.bpm).toBeLessThanOrEqual(200);
      }
    });

    it("higher sensitivity detects fewer or equal beats", () => {
      const buffer = makeMockAudioBuffer(44100, 5.0, 0.5);
      const lowSensitivity = detectBeats(buffer, 2.0);
      const highSensitivity = detectBeats(buffer, 1.0);
      expect(lowSensitivity.beats.length).toBeLessThanOrEqual(highSensitivity.beats.length);
    });

    it("all beat times are within duration", () => {
      const buffer = makeMockAudioBuffer(44100, 4.0, 0.5);
      const result = detectBeats(buffer);
      for (const beat of result.beats) {
        expect(beat.time).toBeGreaterThanOrEqual(0);
        expect(beat.time).toBeLessThanOrEqual(4.0);
      }
    });

    it("all beat intensities are between 0 and 1", () => {
      const buffer = makeMockAudioBuffer(44100, 4.0, 0.5);
      const result = detectBeats(buffer);
      for (const beat of result.beats) {
        expect(beat.intensity).toBeGreaterThanOrEqual(0);
        expect(beat.intensity).toBeLessThanOrEqual(1);
      }
    });

    it("beats are sorted by time", () => {
      const buffer = makeMockAudioBuffer(44100, 5.0, 0.5);
      const result = detectBeats(buffer);
      for (let i = 1; i < result.beats.length; i++) {
        expect(result.beats[i].time).toBeGreaterThanOrEqual(result.beats[i - 1].time);
      }
    });

    it("handles very short buffer", () => {
      const sampleRate = 44100;
      const length = 100; // much shorter than fftSize (1024)
      const data = new Float32Array(length);
      const buffer = {
        sampleRate,
        length,
        duration: length / sampleRate,
        numberOfChannels: 1,
        getChannelData: () => data,
      } as unknown as AudioBuffer;

      const result = detectBeats(buffer);
      expect(result.beats).toHaveLength(0);
      expect(result.bpm).toBe(0);
    });

    it("handles stereo buffer (uses channel 0)", () => {
      const sampleRate = 44100;
      const length = sampleRate * 2;
      const data = new Float32Array(length);
      // Add one impulse
      data[1000] = 0.9;
      const buffer = {
        sampleRate,
        length,
        duration: 2.0,
        numberOfChannels: 2,
        getChannelData: (ch: number) => (ch === 0 ? data : new Float32Array(length)),
      } as unknown as AudioBuffer;

      // Should not throw
      const result = detectBeats(buffer);
      expect(result).toBeDefined();
      expect(result.duration).toBe(2.0);
    });
  });
});
