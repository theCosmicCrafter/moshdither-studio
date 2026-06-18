import { useEffect, useRef, useCallback } from "react";
import { AudioEngine } from "../engine/audio/AudioEngine";
import { AudioParameterMapper } from "../engine/audio/AudioParameterMapper";
import { useAppStore } from "../store";
import type { FrameAudioFeatures } from "../engine/audio/types";

/**
 * useAudioEngine — Bridges the AudioEngine + AudioParameterMapper to the Zustand store.
 *
 * Call this once at the app level. It:
 *   1. Creates and manages the AudioEngine singleton
 *   2. Feeds live features into AudioParameterMapper
 *   3. Syncs mapped values + raw audio state into the store
 *   4. Exposes controls for the UI to use
 */
export function useAudioEngine() {
  const engineRef = useRef<AudioEngine | null>(null);
  const mapperRef = useRef<AudioParameterMapper | null>(null);
  const rafRef = useRef<number>(0);

  const setAudioPlaying = useAppStore((s) => s.setAudioPlaying);
  const setAudioBpm = useAppStore((s) => s.setAudioBpm);
  const setAudioBandEnergies = useAppStore((s) => s.setAudioBandEnergies);
  const setAudioBeatFlags = useAppStore((s) => s.setAudioBeatFlags);
  const setAudioMappedValues = useAppStore((s) => s.setAudioMappedValues);
  const audioBindings = useAppStore((s) => s.audioBindings);
  const audioVolume = useAppStore((s) => s.audioVolume);

  // Lazy-init engine
  const getEngine = useCallback(() => {
    if (!engineRef.current) {
      engineRef.current = new AudioEngine();
    }
    return engineRef.current;
  }, []);

  // Lazy-init mapper
  const getMapper = useCallback(() => {
    if (!mapperRef.current) {
      mapperRef.current = new AudioParameterMapper();
    }
    return mapperRef.current;
  }, []);

  // Sync bindings from store into mapper
  useEffect(() => {
    const mapper = getMapper();
    // Clear old mappings and re-add current ones
    mapper.clear();
    for (const [stackId, params] of Object.entries(audioBindings)) {
      for (const [paramId, binding] of Object.entries(params)) {
        const channelName = `${stackId}.${paramId}`;
        mapper.addMapping(channelName, binding);
      }
    }
  }, [audioBindings, getMapper]);

  // Sync volume to engine
  useEffect(() => {
    const engine = engineRef.current;
    if (engine) {
      engine.volume = audioVolume;
    }
  }, [audioVolume]);

  // Main update loop: read audio features, run mapper, sync to store
  useEffect(() => {
    const engine = getEngine();
    const mapper = getMapper();

    const unsub = engine.onEvent((event) => {
      if (event.type === "features") {
        const features = event.data as Partial<FrameAudioFeatures>;

        // Update raw band energies in store
        const bands: Record<string, number> = {};
        for (const key of [
          "subBass",
          "bass",
          "lowMid",
          "mid",
          "highMid",
          "presence",
          "brilliance",
        ]) {
          const val = features[key as keyof FrameAudioFeatures];
          if (typeof val === "number") {
            bands[key] = val;
          }
        }
        setAudioBandEnergies(bands);

        // Update beat flags
        setAudioBeatFlags({
          bass: features.beatBass ?? false,
          mid: features.beatMid ?? false,
          treble: features.beatTreble ?? false,
        });

        // Run parameter mapper
        const state = mapper.process(features);
        const mapped: Record<string, number> = {};
        for (const [name, val] of Object.entries(state.channels)) {
          mapped[name] = val.smoothed;
        }
        setAudioMappedValues(mapped);
      }
      if (event.type === "play") setAudioPlaying(true);
      if (event.type === "pause" || event.type === "stop") setAudioPlaying(false);
    });

    // Animation frame loop to keep data flowing smoothly
    const tick = () => {
      // getFrequencyData triggers Meyda callback internally
      engine.getFrequencyData();
      rafRef.current = requestAnimationFrame(tick);
    };
    rafRef.current = requestAnimationFrame(tick);

    return () => {
      unsub();
      cancelAnimationFrame(rafRef.current);
    };
  }, [
    getEngine,
    getMapper,
    setAudioPlaying,
    setAudioBpm,
    setAudioBandEnergies,
    setAudioBeatFlags,
    setAudioMappedValues,
  ]);

  return {
    engine: getEngine(),
    loadAudioFile: useCallback(
      async (file: File | string) => {
        const engine = getEngine();
        await engine.loadFile(file);
      },
      [getEngine]
    ),
    startMicrophone: useCallback(async () => {
      const engine = getEngine();
      await engine.startMicrophone();
    }, [getEngine]),
    play: useCallback(() => {
      getEngine().play();
    }, [getEngine]),
    pause: useCallback(() => {
      getEngine().pause();
    }, [getEngine]),
    stop: useCallback(async () => {
      await getEngine().stop();
    }, [getEngine]),
    seek: useCallback(
      (time: number) => {
        getEngine().seek(time);
      },
      [getEngine]
    ),
  };
}
