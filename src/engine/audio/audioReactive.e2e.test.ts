import { describe, it, expect, beforeEach, vi } from "vitest";
import { AudioParameterMapper } from "./AudioParameterMapper";
import { ManifestAudioEngine } from "./ManifestAudioEngine";
import { AudioFeatureExtractor } from "./AudioFeatureExtractor";
import { generateBeatKeyframes } from "../../utils/beatKeyframeGenerator";
import type { Beat } from "../../utils/beatDetection";
import type { FrameAudioFeatures, AudioManifest, ManifestFrame } from "./types";
import { STANDARD_BANDS, MANIFEST_SCHEMA_VERSION } from "./types";

describe("Audio Reactive Pipeline E2E", () => {
  describe("STANDARD_BANDS", () => {
    it("has 7 named bands covering 20Hz-20kHz", () => {
      expect(STANDARD_BANDS.length).toBe(7);
      expect(STANDARD_BANDS[0].minHz).toBe(20);
      expect(STANDARD_BANDS[6].maxHz).toBe(20000);
    });

    it("bands are contiguous and non-overlapping", () => {
      for (let i = 1; i < STANDARD_BANDS.length; i++) {
        expect(STANDARD_BANDS[i].minHz).toBe(STANDARD_BANDS[i - 1].maxHz);
      }
    });
  });

  describe("AudioParameterMapper", () => {
    let mapper: AudioParameterMapper;

    beforeEach(() => {
      mapper = new AudioParameterMapper();
    });

    it("addMapping registers a channel", () => {
      mapper.addMapping("intensity", {
        source: "bass",
        inputMin: 0,
        inputMax: 1,
        outputMin: 0,
        outputMax: 2,
        attack: 0.5,
        decay: 0.3,
        gateEnabled: false,
        gateThreshold: 0,
        invert: false,
      });
      const mappings = mapper.getMappings();
      expect(mappings.has("intensity")).toBe(true);
    });

    it("process maps bass energy to output range", () => {
      mapper.addMapping("intensity", {
        source: "bass",
        inputMin: 0,
        inputMax: 1,
        outputMin: 0,
        outputMax: 2,
        attack: 1,
        decay: 0.1,
        gateEnabled: false,
        gateThreshold: 0,
        invert: false,
      });

      const features: Partial<FrameAudioFeatures> = { bass: 0.5 };
      const result = mapper.process(features);
      expect(result.channels.intensity).toBeDefined();
      expect(result.channels.intensity.raw).toBe(0.5);
      // Smoothed should be moving toward target (0.5 * 2 = 1.0)
      expect(result.channels.intensity.smoothed).toBeGreaterThan(0);
      expect(result.channels.intensity.smoothed).toBeLessThanOrEqual(2);
    });

    it("gate blocks output below threshold", () => {
      mapper.addMapping("gated", {
        source: "bass",
        inputMin: 0,
        inputMax: 1,
        outputMin: 0,
        outputMax: 1,
        attack: 1,
        decay: 0.1,
        gateEnabled: true,
        gateThreshold: 0.5,
        invert: false,
      });

      const result = mapper.process({ bass: 0.3 });
      expect(result.channels.gated.raw).toBe(0.3);
      // Below gate threshold, smoothed should be 0 or near 0
      expect(result.channels.gated.triggered).toBe(false);
    });

    it("invert flips the output", () => {
      // Mock performance.now to give controlled dt so smoothing converges
      let mockTime = 1000;
      vi.spyOn(performance, "now").mockImplementation(() => {
        const t = mockTime;
        mockTime += 16; // 16ms per call ≈ 60fps
        return t;
      });

      mapper.addMapping("inverted", {
        source: "bass",
        inputMin: 0,
        inputMax: 1,
        outputMin: 0,
        outputMax: 1,
        attack: 1,
        decay: 1,
        gateEnabled: false,
        gateThreshold: 0,
        invert: true,
      });

      // Process high value multiple times to let smoothing converge
      for (let i = 0; i < 100; i++) {
        mapper.process({ bass: 1.0 });
      }
      const result = mapper.process({ bass: 1.0 });
      // Inverted: outputMax - (current - outputMin) = 1 - (1 - 0) = 0
      expect(result.channels.inverted.smoothed).toBeCloseTo(0, 1);

      vi.mocked(performance.now).mockRestore();
    });

    it("removeMapping removes channel", () => {
      mapper.addMapping("test", {
        source: "bass",
        inputMin: 0,
        inputMax: 1,
        outputMin: 0,
        outputMax: 1,
        attack: 0.5,
        decay: 0.5,
        gateEnabled: false,
        gateThreshold: 0,
        invert: false,
      });
      mapper.removeMapping("test");
      expect(mapper.getMappings().has("test")).toBe(false);
    });

    it("clear removes all mappings", () => {
      mapper.addMapping("a", {
        source: "bass",
        inputMin: 0,
        inputMax: 1,
        outputMin: 0,
        outputMax: 1,
        attack: 0.5,
        decay: 0.5,
        gateEnabled: false,
        gateThreshold: 0,
        invert: false,
      });
      mapper.addMapping("b", {
        source: "mid",
        inputMin: 0,
        inputMax: 1,
        outputMin: 0,
        outputMax: 1,
        attack: 0.5,
        decay: 0.5,
        gateEnabled: false,
        gateThreshold: 0,
        invert: false,
      });
      mapper.clear();
      expect(mapper.getMappings().size).toBe(0);
    });

    it("reset clears state but not mappings", () => {
      mapper.addMapping("test", {
        source: "bass",
        inputMin: 0,
        inputMax: 1,
        outputMin: 0,
        outputMax: 1,
        attack: 1,
        decay: 1,
        gateEnabled: false,
        gateThreshold: 0,
        invert: false,
      });
      mapper.process({ bass: 1.0 });
      mapper.reset();
      expect(mapper.getMappings().has("test")).toBe(true);
      // After reset, next process should start from 0
      const result = mapper.process({ bass: 1.0 });
      expect(result.channels.test.smoothed).toBeLessThan(1.0);
    });
  });

  describe("ManifestAudioEngine", () => {
    it("starts with no manifest", () => {
      const engine = new ManifestAudioEngine();
      expect(engine.hasManifest).toBe(false);
      expect(engine.isManifestMode).toBe(false);
      expect(engine.isPlaying).toBe(false);
      expect(engine.getManifest()).toBeNull();
    });

    it("setManifest sets manifest and emits event", () => {
      const engine = new ManifestAudioEngine();
      let receivedManifest: AudioManifest | null = null;
      engine.onEvent((event) => {
        if (event.type === "manifest_ready") {
          receivedManifest = event.data as AudioManifest;
        }
      });

      const manifest: AudioManifest = {
        schemaVersion: MANIFEST_SCHEMA_VERSION,
        contentHash: "test123",
        fps: 30,
        totalFrames: 10,
        duration: 0.33,
        sampleRate: 44100,
        bpm: 120,
        frames: [],
      };

      engine.setManifest(manifest);
      expect(engine.hasManifest).toBe(true);
      expect(engine.isManifestMode).toBe(true);
      expect(receivedManifest).toBe(manifest);
    });

    it("getFrameAtTime returns correct frame", () => {
      const engine = new ManifestAudioEngine();
      const frames: ManifestFrame[] = Array.from({ length: 10 }, (_, i) => ({
        frame: i,
        time: i / 30,
        rms: 0.5,
        energy: 0.5,
        volume: 0.5,
        subBass: 0.1,
        bass: 0.2,
        lowMid: 0.3,
        mid: 0.4,
        highMid: 0.5,
        presence: 0.6,
        brilliance: 0.7,
        spectralCentroid: 0.5,
        spectralFlatness: 0.3,
        spectralRolloff: 0.7,
        spectralFlux: 0.2,
        spectralBandwidth: 0.4,
        zcr: 0.1,
        beatBass: false,
        beatMid: false,
        beatTreble: false,
        beatEnergy: 0,
        isOnset: false,
        onsetType: null,
        impact: 0,
        fluidity: 0,
        brightness: 0,
        sharpness: 0,
        texture: 0,
      }));

      engine.setManifest({
        schemaVersion: MANIFEST_SCHEMA_VERSION,
        contentHash: "test",
        fps: 30,
        totalFrames: 10,
        duration: 0.33,
        sampleRate: 44100,
        bpm: null,
        frames,
      });

      // At time 0.1s with 30fps, frame index = 3
      const frame = engine.getFrameAtTime(0.1);
      expect(frame).not.toBeNull();
      expect(frame!.frame).toBe(3);
    });

    it("getFrameAtTime returns null without manifest", () => {
      const engine = new ManifestAudioEngine();
      expect(engine.getFrameAtTime(1.0)).toBeNull();
    });

    it("clearManifest exits manifest mode", () => {
      const engine = new ManifestAudioEngine();
      engine.setManifest({
        schemaVersion: MANIFEST_SCHEMA_VERSION,
        contentHash: "x",
        fps: 30,
        totalFrames: 1,
        duration: 0.03,
        sampleRate: 44100,
        bpm: null,
        frames: [],
      });
      expect(engine.isManifestMode).toBe(true);
      engine.clearManifest();
      expect(engine.isManifestMode).toBe(false);
      expect(engine.hasManifest).toBe(false);
    });

    it("volume getter/setter works", () => {
      const engine = new ManifestAudioEngine();
      engine.volume = 0.5;
      expect(engine.volume).toBe(0.5);
    });
  });

  describe("AudioFeatureExtractor", () => {
    it("manifestToBakeData converts manifest to legacy format", () => {
      const manifest: AudioManifest = {
        schemaVersion: MANIFEST_SCHEMA_VERSION,
        contentHash: "abc",
        fps: 30,
        totalFrames: 2,
        duration: 0.066,
        sampleRate: 44100,
        bpm: 120,
        frames: [
          {
            frame: 0,
            time: 0,
            rms: 0.1,
            energy: 0.2,
            volume: 0.1,
            subBass: 0.01,
            bass: 0.02,
            lowMid: 0.03,
            mid: 0.04,
            highMid: 0.05,
            presence: 0.06,
            brilliance: 0.07,
            spectralCentroid: 0.3,
            spectralFlatness: 0.4,
            spectralRolloff: 0.5,
            spectralFlux: 0.6,
            spectralBandwidth: 0.7,
            zcr: 0.1,
            beatBass: true,
            beatMid: false,
            beatTreble: false,
            beatEnergy: 0.8,
            isOnset: true,
            onsetType: "percussive",
            impact: 0.5,
            fluidity: 0.3,
            brightness: 0.7,
            sharpness: 0.2,
            texture: 0.1,
          },
          {
            frame: 1,
            time: 0.033,
            rms: 0.15,
            energy: 0.25,
            volume: 0.15,
            subBass: 0.02,
            bass: 0.03,
            lowMid: 0.04,
            mid: 0.05,
            highMid: 0.06,
            presence: 0.07,
            brilliance: 0.08,
            spectralCentroid: 0.35,
            spectralFlatness: 0.45,
            spectralRolloff: 0.55,
            spectralFlux: 0.65,
            spectralBandwidth: 0.75,
            zcr: 0.15,
            beatBass: false,
            beatMid: true,
            beatTreble: false,
            beatEnergy: 0.6,
            isOnset: false,
            onsetType: null,
            impact: 0.4,
            fluidity: 0.35,
            brightness: 0.65,
            sharpness: 0.25,
            texture: 0.15,
          },
        ],
      };

      const bakeData = AudioFeatureExtractor.manifestToBakeData(manifest);
      expect(bakeData.fps).toBe(30);
      expect(bakeData.totalFrames).toBe(2);
      expect(bakeData.bpm).toBe(120);
      expect(bakeData.frames.length).toBe(2);
      expect(bakeData.frames[0].bass).toBe(0.02);
      expect(bakeData.frames[0].beatBass).toBe(true);
      expect(bakeData.frames[1].beatMid).toBe(true);
    });

    it("serializeManifest / deserializeManifest round-trip", () => {
      const manifest: AudioManifest = {
        schemaVersion: MANIFEST_SCHEMA_VERSION,
        contentHash: "xyz",
        fps: 60,
        totalFrames: 5,
        duration: 0.083,
        sampleRate: 48000,
        bpm: 90,
        frames: [],
      };

      const json = AudioFeatureExtractor.serializeManifest(manifest);
      const restored = AudioFeatureExtractor.deserializeManifest(json);
      expect(restored.fps).toBe(60);
      expect(restored.bpm).toBe(90);
      expect(restored.contentHash).toBe("xyz");
    });
  });

  describe("Beat Keyframe Generator", () => {
    const mockBeats: Beat[] = [
      { time: 0.0, intensity: 1.0 },
      { time: 0.5, intensity: 0.8 },
      { time: 1.0, intensity: 0.6 },
      { time: 1.5, intensity: 0.9 },
    ];

    it("pulse mode generates peak + decay keyframes", () => {
      const kfs = generateBeatKeyframes({
        beats: mockBeats,
        paramKey: "intensity",
        mode: "pulse",
        minValue: 0,
        maxValue: 1,
        easing: "linear",
        pulseDecay: 0.2,
      });
      expect(kfs.length).toBeGreaterThan(mockBeats.length);
      // First keyframe should be at beat time with high value
      expect(kfs[0].time).toBe(0.0);
      expect(kfs[0].value).toBe(1.0);
      // Second should be a decay keyframe
      expect(kfs[1].value).toBe(0);
    });

    it("toggle mode alternates between min and max", () => {
      const kfs = generateBeatKeyframes({
        beats: mockBeats,
        paramKey: "intensity",
        mode: "toggle",
        minValue: 0,
        maxValue: 1,
      });
      expect(kfs.length).toBe(4);
      expect(kfs[0].value).toBe(1); // even index = max
      expect(kfs[1].value).toBe(0); // odd index = min
      expect(kfs[2].value).toBe(1);
      expect(kfs[3].value).toBe(0);
    });

    it("ramp mode steps up over cycle", () => {
      const kfs = generateBeatKeyframes({
        beats: mockBeats,
        paramKey: "intensity",
        mode: "ramp",
        minValue: 0,
        maxValue: 1,
        rampCycleBeats: 4,
      });
      expect(kfs.length).toBe(4);
      // Step = (1-0) / (4-1) = 0.333
      expect(kfs[0].value).toBeCloseTo(0, 1);
      expect(kfs[1].value).toBeCloseTo(1 / 3, 1);
      expect(kfs[2].value).toBeCloseTo(2 / 3, 1);
      expect(kfs[3].value).toBeCloseTo(1, 1);
    });

    it("decay mode generates high then mid-low keyframes", () => {
      const kfs = generateBeatKeyframes({
        beats: mockBeats,
        paramKey: "intensity",
        mode: "decay",
        minValue: 0,
        maxValue: 1,
      });
      // Each beat produces a max keyframe and a min keyframe between beats
      expect(kfs.length).toBeGreaterThanOrEqual(mockBeats.length);
      expect(kfs[0].value).toBe(1); // peak at beat
    });

    it("empty beats returns empty keyframes", () => {
      const kfs = generateBeatKeyframes({
        beats: [],
        paramKey: "intensity",
        mode: "pulse",
        minValue: 0,
        maxValue: 1,
      });
      expect(kfs).toEqual([]);
    });
  });
});
