/**
 * Audio-reactive hook for MoshDither Studio.
 *
 * Extracts frequency data from a video/audio element and provides
 * normalized band levels that can drive effect parameters.
 */

import * as React from "react";

export interface AudioBands {
  bass: number;    // ~60-250Hz
  mid: number;     // ~250-2000Hz
  treble: number;  // ~2000-16000Hz
  average: number;
}

interface UseAudioReactiveOptions {
  mediaElement: HTMLVideoElement | HTMLAudioElement | null;
  enabled: boolean;
}

export function useAudioReactive({ mediaElement, enabled }: UseAudioReactiveOptions): AudioBands {
  const [bands, setBands] = React.useState<AudioBands>({ bass: 0, mid: 0, treble: 0, average: 0 });
  const audioCtxRef = React.useRef<AudioContext | null>(null);
  const analyserRef = React.useRef<AnalyserNode | null>(null);
  const sourceRef = React.useRef<MediaElementAudioSourceNode | null>(null);
  const rafRef = React.useRef<number>(0);

  React.useEffect(() => {
    if (!enabled || !mediaElement) {
      setBands({ bass: 0, mid: 0, treble: 0, average: 0 });
      return;
    }

    // Create audio context and analyser
    const audioCtx = new AudioContext();
    audioCtxRef.current = audioCtx;

    const analyser = audioCtx.createAnalyser();
    analyser.fftSize = 256;
    analyserRef.current = analyser;

    const source = audioCtx.createMediaElementSource(mediaElement);
    sourceRef.current = source;
    source.connect(analyser);
    analyser.connect(audioCtx.destination);

    const dataArray = new Uint8Array(analyser.frequencyBinCount);
    const binCount = analyser.frequencyBinCount;
    const sampleRate = audioCtx.sampleRate;
    const nyquist = sampleRate / 2;

    const freqPerBin = nyquist / binCount;

    const update = () => {
      analyser.getByteFrequencyData(dataArray);

      // Define bin ranges
      const bassEnd = Math.floor(250 / freqPerBin);
      const midEnd = Math.floor(2000 / freqPerBin);

      let bassSum = 0;
      let midSum = 0;
      let trebleSum = 0;
      let totalSum = 0;

      for (let i = 0; i < binCount; i++) {
        const val = dataArray[i] / 255; // normalize 0-1
        totalSum += val;
        if (i <= bassEnd) bassSum += val;
        else if (i <= midEnd) midSum += val;
        else trebleSum += val;
      }

      const bassCount = Math.max(1, bassEnd + 1);
      const midCount = Math.max(1, midEnd - bassEnd);
      const trebleCount = Math.max(1, binCount - midEnd);

      setBands({
        bass: bassSum / bassCount,
        mid: midSum / midCount,
        treble: trebleSum / trebleCount,
        average: totalSum / binCount,
      });

      rafRef.current = requestAnimationFrame(update);
    };

    rafRef.current = requestAnimationFrame(update);

    return () => {
      cancelAnimationFrame(rafRef.current);
      source.disconnect();
      analyser.disconnect();
      audioCtx.close();
      audioCtxRef.current = null;
      analyserRef.current = null;
      sourceRef.current = null;
    };
  }, [enabled, mediaElement]);

  return bands;
}
