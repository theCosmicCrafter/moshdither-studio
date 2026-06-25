import { useEffect, useRef, useCallback } from "react";
import { AudioEngine, setGlobalAudioEngine } from "../engine/audio/AudioEngine";
import { ManifestAudioEngine } from "../engine/audio/ManifestAudioEngine";
import { AudioParameterMapper } from "../engine/audio/AudioParameterMapper";
import { AudioFeatureExtractor } from "../engine/audio/AudioFeatureExtractor";
import { useAppStore } from "../store";
import type { FrameAudioFeatures, ManifestFrame } from "../engine/audio/types";

/**
 * useAudioEngine — Bridges the audio engines + AudioParameterMapper to the Zustand store.
 *
 * Two modes:
 *   - File mode: Uses ManifestAudioEngine — bakes an AudioManifest, then plays
 *     audio synced to manifest frames. Perfect preview/export parity.
 *   - Live/Mic mode: Uses AudioEngine (Meyda + Web Audio) for real-time analysis.
 */
export function useAudioEngine() {
  const engineRef = useRef<AudioEngine | null>(null);
  const manifestEngineRef = useRef<ManifestAudioEngine | null>(null);
  const mapperRef = useRef<AudioParameterMapper | null>(null);
  const rafRef = useRef<number>(0);

  const setAudioPlaying = useAppStore((s) => s.setAudioPlaying);
  const setAudioBpm = useAppStore((s) => s.setAudioBpm);
  const setAudioBandEnergies = useAppStore((s) => s.setAudioBandEnergies);
  const setAudioBeatFlags = useAppStore((s) => s.setAudioBeatFlags);
  const setAudioMappedValues = useAppStore((s) => s.setAudioMappedValues);
  const setAudioBakeData = useAppStore((s) => s.setAudioBakeData);
  const setAudioManifest = useAppStore((s) => s.setAudioManifest);
  const setAudioManifestProgress = useAppStore((s) => s.setAudioManifestProgress);
  const audioBindings = useAppStore((s) => s.audioBindings);
  const audioVolume = useAppStore((s) => s.audioVolume);

  // Lazy-init live engine (for microphone)
  const getEngine = useCallback(() => {
    if (!engineRef.current) {
      engineRef.current = new AudioEngine();
      setGlobalAudioEngine(engineRef.current);
    }
    return engineRef.current;
  }, []);

  // Lazy-init manifest engine (for file playback)
  const getManifestEngine = useCallback(() => {
    if (!manifestEngineRef.current) {
      manifestEngineRef.current = new ManifestAudioEngine();
    }
    return manifestEngineRef.current;
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
    mapper.clear();
    for (const [stackId, params] of Object.entries(audioBindings)) {
      for (const [paramId, binding] of Object.entries(params)) {
        const channelName = `${stackId}.${paramId}`;
        mapper.addMapping(channelName, binding);
      }
    }
  }, [audioBindings, getMapper]);

  // Sync volume to both engines
  useEffect(() => {
    if (engineRef.current) {
      engineRef.current.volume = audioVolume;
    }
    if (manifestEngineRef.current) {
      manifestEngineRef.current.volume = audioVolume;
    }
  }, [audioVolume]);

  // Main update loop: read audio features from whichever engine is active
  useEffect(() => {
    const mapper = getMapper();

    // Manifest engine events
    const manifestEngine = getManifestEngine();
    const unsubManifest = manifestEngine.onEvent((event) => {
      if (event.type === "features") {
        const frame = event.data as ManifestFrame;

        // Update raw band energies in store
        const bands: Record<string, number> = {
          subBass: frame.subBass,
          bass: frame.bass,
          lowMid: frame.lowMid,
          mid: frame.mid,
          highMid: frame.highMid,
          presence: frame.presence,
          brilliance: frame.brilliance,
        };
        setAudioBandEnergies(bands);

        // Update beat flags
        setAudioBeatFlags({
          bass: frame.beatBass,
          mid: frame.beatMid,
          treble: frame.beatTreble,
        });

        // Run parameter mapper with manifest frame as features
        const features: Partial<FrameAudioFeatures> = {
          rms: frame.rms,
          energy: frame.energy,
          spectralCentroid: frame.spectralCentroid,
          spectralFlatness: frame.spectralFlatness,
          spectralRolloff: frame.spectralRolloff,
          spectralFlux: frame.spectralFlux,
          zcr: frame.zcr,
          volume: frame.volume,
          subBass: frame.subBass,
          bass: frame.bass,
          lowMid: frame.lowMid,
          mid: frame.mid,
          highMid: frame.highMid,
          presence: frame.presence,
          brilliance: frame.brilliance,
          beatBass: frame.beatBass,
          beatMid: frame.beatMid,
          beatTreble: frame.beatTreble,
          beatEnergy: frame.beatEnergy,
        };
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

    // Live engine events (for microphone mode)
    const engine = getEngine();
    const unsubLive = engine.onEvent((event) => {
      if (event.type === "features") {
        const features = event.data as Partial<FrameAudioFeatures>;

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

        setAudioBeatFlags({
          bass: features.beatBass ?? false,
          mid: features.beatMid ?? false,
          treble: features.beatTreble ?? false,
        });

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

    // RAF loop for live engine (manifest engine has its own internal RAF)
    const tick = () => {
      engine.getFrequencyData();
      rafRef.current = requestAnimationFrame(tick);
    };
    rafRef.current = requestAnimationFrame(tick);

    return () => {
      unsubManifest();
      unsubLive();
      cancelAnimationFrame(rafRef.current);
    };
  }, [
    getEngine,
    getManifestEngine,
    getMapper,
    setAudioPlaying,
    setAudioBandEnergies,
    setAudioBeatFlags,
    setAudioMappedValues,
  ]);

  return {
    engine: getEngine(),
    manifestEngine: getManifestEngine(),
    loadAudioFile: useCallback(
      async (file: File | string) => {
        if (file instanceof File) {
          // ─── Manifest mode: bake + play ───
          const manifestEngine = getManifestEngine();

          // Bake manifest with progress
          setAudioManifestProgress(0, "Starting analysis...");
          try {
            const manifest = await AudioFeatureExtractor.extractManifestFromFile(
              file,
              { fps: 30 },
              (progress, phase) => setAudioManifestProgress(progress, phase)
            );
            setAudioManifest(manifest);
            setAudioBpm(manifest.bpm);
            setAudioManifestProgress(1, "Manifest complete");

            // Also generate legacy bake data for Rust export
            const bakeData = AudioFeatureExtractor.manifestToBakeData(manifest);
            setAudioBakeData(bakeData);

            // Load into manifest engine for playback
            await manifestEngine.loadFile(file, manifest);
          } catch (e) {
            console.warn("Manifest analysis failed, falling back to live engine:", e);
            setAudioManifestProgress(0, "Analysis failed");
            // Fallback to live engine
            const engine = getEngine();
            await engine.loadFile(file);
          }
        } else {
          // String path — use live engine
          const engine = getEngine();
          await engine.loadFile(file);
        }
      },
      [
        getEngine,
        getManifestEngine,
        setAudioManifest,
        setAudioManifestProgress,
        setAudioBpm,
        setAudioBakeData,
      ]
    ),
    startMicrophone: useCallback(async () => {
      // Switch to live engine for microphone
      const engine = getEngine();
      await engine.startMicrophone();
    }, [getEngine]),
    play: useCallback(() => {
      const me = manifestEngineRef.current;
      if (me?.hasManifest) {
        me.play();
      } else {
        getEngine().play();
      }
    }, [getEngine]),
    pause: useCallback(() => {
      const me = manifestEngineRef.current;
      if (me?.hasManifest) {
        me.pause();
      } else {
        getEngine().pause();
      }
    }, [getEngine]),
    stop: useCallback(async () => {
      const me = manifestEngineRef.current;
      if (me?.hasManifest) {
        await me.stop();
      } else {
        await getEngine().stop();
      }
    }, [getEngine]),
    seek: useCallback(
      (time: number) => {
        const me = manifestEngineRef.current;
        if (me?.hasManifest) {
          me.seek(time);
        } else {
          getEngine().seek(time);
        }
      },
      [getEngine]
    ),
  };
}
