/**
 * Enhanced audio-reactive hook for MoshDither Studio.
 *
 * Extracts frequency data, spectral features, onset detection, and stereo
 * analysis from a media element. Returns both React state (for UI) and
 * a ref (for shader uniform wiring without re-renders).
 */

import * as React from "react";

export interface AudioFeatures {
  // Classic 4-band energy (0-1)
  bass: number;
  mid: number;
  treble: number;
  average: number;

  // Timbre features (0-1)
  spectralCentroid: number;
  spectralFlatness: number;
  spectralRolloff: number;
  rms: number;
  zcr: number;

  // Stereo energy (0-1)
  left: number;
  right: number;

  // Onset triggers (decaying 0-1, spike to 1.0 on detection)
  onsetKick: number;
  onsetSnare: number;
  onsetHihat: number;
}

// Backward-compatible alias
export type AudioBands = AudioFeatures;

interface UseAudioReactiveOptions {
  mediaElement: HTMLVideoElement | HTMLAudioElement | null;
  enabled: boolean;
}

const DEFAULT_FEATURES: AudioFeatures = {
  bass: 0,
  mid: 0,
  treble: 0,
  average: 0,
  spectralCentroid: 0,
  spectralFlatness: 0,
  spectralRolloff: 0,
  rms: 0,
  zcr: 0,
  left: 0,
  right: 0,
  onsetKick: 0,
  onsetSnare: 0,
  onsetHihat: 0,
};

export function useAudioReactive({
  mediaElement,
  enabled,
}: UseAudioReactiveOptions): {
  features: AudioFeatures;
  featuresRef: React.RefObject<AudioFeatures>;
} {
  const featuresRef = React.useRef<AudioFeatures>({ ...DEFAULT_FEATURES });
  const [features, setFeatures] = React.useState<AudioFeatures>({
    ...DEFAULT_FEATURES,
  });

  const audioCtxRef = React.useRef<AudioContext | null>(null);
  const analyserRef = React.useRef<AnalyserNode | null>(null);
  const splitterRef = React.useRef<ChannelSplitterNode | null>(null);
  const leftAnalyserRef = React.useRef<AnalyserNode | null>(null);
  const rightAnalyserRef = React.useRef<AnalyserNode | null>(null);
  const sourceRef = React.useRef<MediaElementAudioSourceNode | null>(null);
  const rafRef = React.useRef<number>(0);
  const mountedRef = React.useRef(true);

  // Onset detection state (stored in refs to avoid re-renders)
  const prevFreqDataRef = React.useRef<Uint8Array | null>(null);
  const fluxHistoryRef = React.useRef<{
    kick: number[];
    snare: number[];
    hihat: number[];
  }>({ kick: [], snare: [], hihat: [] });
  const onsetDecayRef = React.useRef({
    kick: 0,
    snare: 0,
    hihat: 0,
  });

  // Throttle React state updates
  const lastStateUpdateRef = React.useRef(0);
  const STATE_UPDATE_INTERVAL = 60; // ~16fps for UI

  React.useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  React.useEffect(() => {
    if (!enabled || !mediaElement) {
      return;
    }

    const audioCtx = new AudioContext();
    audioCtxRef.current = audioCtx;

    const analyser = audioCtx.createAnalyser();
    analyser.fftSize = 2048;
    analyser.smoothingTimeConstant = 0.8;
    analyserRef.current = analyser;

    const source = audioCtx.createMediaElementSource(mediaElement);
    sourceRef.current = source;

    // Stereo split for left/right analysis
    const splitter = audioCtx.createChannelSplitter(2);
    splitterRef.current = splitter;

    const leftAnalyser = audioCtx.createAnalyser();
    leftAnalyser.fftSize = 256;
    leftAnalyser.smoothingTimeConstant = 0.8;
    leftAnalyserRef.current = leftAnalyser;

    const rightAnalyser = audioCtx.createAnalyser();
    rightAnalyser.fftSize = 256;
    rightAnalyser.smoothingTimeConstant = 0.8;
    rightAnalyserRef.current = rightAnalyser;

    source.connect(analyser);
    source.connect(splitter);
    splitter.connect(leftAnalyser, 0);
    splitter.connect(rightAnalyser, 1);
    analyser.connect(audioCtx.destination);

    const freqData = new Uint8Array(analyser.frequencyBinCount);
    const timeData = new Uint8Array(analyser.frequencyBinCount);
    const binCount = analyser.frequencyBinCount;
    const sampleRate = audioCtx.sampleRate;
    const nyquist = sampleRate / 2;
    const freqPerBin = nyquist / binCount;

    // Frequency band boundaries
    const bassEndBin = Math.floor(250 / freqPerBin);
    const midEndBin = Math.floor(2000 / freqPerBin);
    const snareStartBin = Math.floor(200 / freqPerBin);
    const snareEndBin = Math.floor(1000 / freqPerBin);
    const hihatStartBin = Math.floor(4000 / freqPerBin);

    const leftData = new Uint8Array(leftAnalyser.frequencyBinCount);
    const rightData = new Uint8Array(rightAnalyser.frequencyBinCount);

    // Onset detection parameters
    const FLUX_HISTORY_SIZE = 20;
    const ONSET_SENSITIVITY = 1.3;
    const ONSET_DECAY = 0.92;

    const update = () => {
      if (!mountedRef.current) return;

      analyser.getByteFrequencyData(freqData);
      analyser.getByteTimeDomainData(timeData);
      leftAnalyser.getByteFrequencyData(leftData);
      rightAnalyser.getByteFrequencyData(rightData);

      // --- 4-Band Energy ---
      let bassSum = 0;
      let midSum = 0;
      let trebleSum = 0;
      let totalSum = 0;
      for (let i = 0; i < binCount; i++) {
        const val = freqData[i] / 255;
        totalSum += val;
        if (i <= bassEndBin) bassSum += val;
        else if (i <= midEndBin) midSum += val;
        else trebleSum += val;
      }

      const bassCount = Math.max(1, bassEndBin + 1);
      const midCount = Math.max(1, midEndBin - bassEndBin);
      const trebleCount = Math.max(1, binCount - midEndBin);

      const bass = bassSum / bassCount;
      const mid = midSum / midCount;
      const treble = trebleSum / trebleCount;
      const average = totalSum / binCount;

      // --- Spectral Centroid ---
      let weightedSum = 0;
      for (let i = 0; i < binCount; i++) {
        weightedSum += i * (freqData[i] / 255);
      }
      const spectralCentroid =
        totalSum > 0 ? weightedSum / totalSum / binCount : 0;

      // --- Spectral Flatness ---
      let logSum = 0;
      let logCount = 0;
      for (let i = 0; i < binCount; i++) {
        const val = freqData[i] / 255;
        if (val > 0.001) {
          logSum += Math.log(val);
          logCount++;
        }
      }
      const geometricMean = logCount > 0 ? Math.exp(logSum / logCount) : 0;
      const arithmeticMean = totalSum / binCount;
      const spectralFlatness =
        arithmeticMean > 0.001 ? geometricMean / arithmeticMean : 0;

      // --- Spectral Rolloff (85% energy) ---
      let cumulative = 0;
      let spectralRolloff = 0;
      const threshold = totalSum * 0.85;
      for (let i = 0; i < binCount; i++) {
        cumulative += freqData[i] / 255;
        if (cumulative >= threshold) {
          spectralRolloff = i / binCount;
          break;
        }
      }

      // --- RMS ---
      let rmsSum = 0;
      for (let i = 0; i < timeData.length; i++) {
        const normalized = (timeData[i] - 128) / 128;
        rmsSum += normalized * normalized;
      }
      const rms = Math.sqrt(rmsSum / timeData.length);

      // --- ZCR (Zero Crossing Rate) ---
      let zcr = 0;
      for (let i = 1; i < timeData.length; i++) {
        const prev = (timeData[i - 1] - 128) / 128;
        const curr = (timeData[i] - 128) / 128;
        if ((prev >= 0 && curr < 0) || (prev < 0 && curr >= 0)) {
          zcr++;
        }
      }
      zcr = zcr / timeData.length;

      // --- Stereo Energy ---
      let leftSum = 0;
      let rightSum = 0;
      for (let i = 0; i < leftData.length; i++) {
        leftSum += leftData[i] / 255;
        rightSum += rightData[i] / 255;
      }
      const left = leftSum / leftData.length;
      const right = rightSum / rightData.length;

      // --- Onset Detection (Spectral Flux) ---
      let kickFlux = 0;
      let snareFlux = 0;
      let hihatFlux = 0;
      if (prevFreqDataRef.current) {
        const prev = prevFreqDataRef.current;
        for (let i = 0; i <= bassEndBin; i++) {
          const diff = (freqData[i] - prev[i]) / 255;
          if (diff > 0) kickFlux += diff;
        }
        for (let i = snareStartBin; i <= snareEndBin; i++) {
          const diff = (freqData[i] - prev[i]) / 255;
          if (diff > 0) snareFlux += diff;
        }
        for (let i = hihatStartBin; i < binCount; i++) {
          const diff = (freqData[i] - prev[i]) / 255;
          if (diff > 0) hihatFlux += diff;
        }
      }

      // Store current frame for next comparison
      if (
        !prevFreqDataRef.current ||
        prevFreqDataRef.current.length !== freqData.length
      ) {
        prevFreqDataRef.current = new Uint8Array(freqData);
      } else {
        prevFreqDataRef.current.set(freqData);
      }

      // Update flux history
      const fh = fluxHistoryRef.current;
      fh.kick.push(kickFlux);
      fh.snare.push(snareFlux);
      fh.hihat.push(hihatFlux);
      if (fh.kick.length > FLUX_HISTORY_SIZE) fh.kick.shift();
      if (fh.snare.length > FLUX_HISTORY_SIZE) fh.snare.shift();
      if (fh.hihat.length > FLUX_HISTORY_SIZE) fh.hihat.shift();

      // Detect onsets using adaptive threshold
      const detectOnset = (flux: number, history: number[]): boolean => {
        if (history.length < 5) return false;
        const mean = history.reduce((a, b) => a + b, 0) / history.length;
        return flux > mean * ONSET_SENSITIVITY && flux > 0.02;
      };

      const od = onsetDecayRef.current;
      if (detectOnset(kickFlux, fh.kick)) od.kick = 1.0;
      if (detectOnset(snareFlux, fh.snare)) od.snare = 1.0;
      if (detectOnset(hihatFlux, fh.hihat)) od.hihat = 1.0;

      // Decay onsets
      od.kick *= ONSET_DECAY;
      od.snare *= ONSET_DECAY;
      od.hihat *= ONSET_DECAY;

      const newFeatures: AudioFeatures = {
        bass,
        mid,
        treble,
        average,
        spectralCentroid,
        spectralFlatness,
        spectralRolloff,
        rms,
        zcr,
        left,
        right,
        onsetKick: od.kick,
        onsetSnare: od.snare,
        onsetHihat: od.hihat,
      };

      featuresRef.current = newFeatures;

      // Throttled React state update
      const now = performance.now();
      if (now - lastStateUpdateRef.current > STATE_UPDATE_INTERVAL) {
        lastStateUpdateRef.current = now;
        setFeatures(newFeatures);
      }

      rafRef.current = requestAnimationFrame(update);
    };

    rafRef.current = requestAnimationFrame(update);

    return () => {
      cancelAnimationFrame(rafRef.current);
      source.disconnect();
      splitter.disconnect();
      analyser.disconnect();
      leftAnalyser.disconnect();
      rightAnalyser.disconnect();
      audioCtx.close();
      audioCtxRef.current = null;
      analyserRef.current = null;
      splitterRef.current = null;
      leftAnalyserRef.current = null;
      rightAnalyserRef.current = null;
      sourceRef.current = null;
      prevFreqDataRef.current = null;
    };
  }, [enabled, mediaElement]);

  return { features, featuresRef };
}
