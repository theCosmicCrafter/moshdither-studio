/**
 * Beat detection for MoshDither Studio.
 *
 * Uses the Web Audio API to perform onset detection on a media element.
 * Returns beat timestamps that can be used to auto-generate keyframes
 * or drive audio-reactive effects.
 */

export interface Beat {
  time: number; // seconds
  intensity: number; // 0..1
}

export interface BeatDetectionResult {
  beats: Beat[];
  bpm: number;
  duration: number;
}

/**
 * Detect beats in an audio buffer using a simple spectral-flux onset detector.
 *
 * @param audioBuffer - The decoded AudioBuffer from the Web Audio API.
 * @param sensitivity - Onset threshold multiplier (default 1.3). Higher = fewer beats.
 */
export function detectBeats(
  audioBuffer: AudioBuffer,
  sensitivity = 1.3,
): BeatDetectionResult {
  const sampleRate = audioBuffer.sampleRate;
  const channelData = audioBuffer.getChannelData(0);
  const duration = audioBuffer.duration;

  // Analysis window: 1024 samples (~23ms at 44.1kHz)
  const fftSize = 1024;
  const hopSize = 512;
  const numFrames = Math.floor((channelData.length - fftSize) / hopSize);

  // Compute magnitude spectrum for each frame
  const spectra: number[][] = [];
  for (let i = 0; i < numFrames; i++) {
    const frameStart = i * hopSize;
    const frame = new Float32Array(fftSize);
    for (let j = 0; j < fftSize; j++) {
      frame[j] = channelData[frameStart + j] || 0;
    }
    // Hamming window
    for (let j = 0; j < fftSize; j++) {
      frame[j] *= 0.54 - 0.46 * Math.cos((2 * Math.PI * j) / (fftSize - 1));
    }
    const magnitudes = computeMagnitudes(frame);
    spectra.push(magnitudes);
  }

  // Spectral flux (positive difference between consecutive frames)
  const flux: number[] = [0];
  for (let i = 1; i < spectra.length; i++) {
    let diff = 0;
    const prev = spectra[i - 1];
    const curr = spectra[i];
    const binCount = Math.min(prev.length, curr.length);
    for (let b = 0; b < binCount; b++) {
      const d = curr[b] - prev[b];
      if (d > 0) diff += d;
    }
    flux.push(diff);
  }

  // Adaptive threshold and peak picking
  const windowSize = Math.round(0.3 * sampleRate / hopSize); // ~300ms window
  const beats: Beat[] = [];

  for (let i = windowSize; i < flux.length - windowSize; i++) {
    const localWindow = flux.slice(i - windowSize, i + windowSize + 1);
    const localMean = localWindow.reduce((a, b) => a + b, 0) / localWindow.length;
    const localMax = Math.max(...localWindow);

    if (
      flux[i] === localMax &&
      flux[i] > localMean * sensitivity &&
      flux[i] > 0.001 // absolute minimum to avoid noise
    ) {
      const time = (i * hopSize) / sampleRate;
      const intensity = Math.min(flux[i] / (localMax || 1), 1);
      beats.push({ time, intensity });
    }
  }

  // Estimate BPM from beat intervals
  const intervals: number[] = [];
  for (let i = 1; i < beats.length; i++) {
    intervals.push(beats[i].time - beats[i - 1].time);
  }

  let bpm = 0;
  if (intervals.length > 0) {
    // Use median interval for robustness
    intervals.sort((a, b) => a - b);
    const medianInterval = intervals[Math.floor(intervals.length / 2)];
    if (medianInterval > 0) {
      bpm = Math.round(60 / medianInterval);
      // Clamp to reasonable range
      bpm = Math.max(40, Math.min(200, bpm));
    }
  }

  return { beats, bpm, duration };
}

/**
 * Compute DFT magnitudes for a real-valued frame using a basic FFT.
 * For production, consider replacing with a real FFT library.
 */
function computeMagnitudes(frame: Float32Array): number[] {
  const n = frame.length;
  const real = new Float32Array(n);
  const imag = new Float32Array(n);

  // Copy frame to real part
  for (let i = 0; i < n; i++) real[i] = frame[i];

  // Radix-2 Cooley-Tukey FFT (iterative, bit-reversal)
  const stages = Math.log2(n);
  for (let stage = 1; stage <= stages; stage++) {
    const step = 2 ** stage;
    const halfStep = step / 2;
    for (let group = 0; group < n; group += step) {
      for (let k = 0; k < halfStep; k++) {
        const angle = (-2 * Math.PI * k) / step;
        const cos = Math.cos(angle);
        const sin = Math.sin(angle);
        const evenR = real[group + k];
        const evenI = imag[group + k];
        const oddR = real[group + k + halfStep];
        const oddI = imag[group + k + halfStep];
        const twiddleR = oddR * cos - oddI * sin;
        const twiddleI = oddR * sin + oddI * cos;
        real[group + k] = evenR + twiddleR;
        imag[group + k] = evenI + twiddleI;
        real[group + k + halfStep] = evenR - twiddleR;
        imag[group + k + halfStep] = evenI - twiddleI;
      }
    }
  }

  // Magnitudes (only first half, since real input => Hermitian symmetry)
  const magnitudes: number[] = [];
  for (let i = 0; i < n / 2; i++) {
    magnitudes.push(Math.sqrt(real[i] ** 2 + imag[i] ** 2));
  }
  return magnitudes;
}

/**
 * Decode an audio file into an AudioBuffer suitable for beat detection.
 */
export async function decodeAudioFile(
  file: File | Blob,
): Promise<AudioBuffer> {
  const arrayBuffer = await file.arrayBuffer();
  const audioCtx = new AudioContext();
  try {
    return await audioCtx.decodeAudioData(arrayBuffer);
  } finally {
    // Keep context alive; caller may use it
  }
}
