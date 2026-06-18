# Audio-Reactive Backend Checklist

## Research Summary

### TouchDesigner Audio Analysis Approach

- **Audio Spectrum CHOP**: FFT-based frequency analysis with configurable size (64-16384)
- **Visualization mode**: Boosts high frequencies and lower freq ranges for visual clarity
- **Raw mode**: Direct magnitude/phase spectrum for audio filtering
- **Audio Device In CHOP**: System audio capture (microphone, line-in)
- **Audio Dynamics CHOP**: Envelope follower, gate, compressor for dynamics
- **Essentia CHOP Suite**: Advanced music analysis (onset detection, beat tracking, pitch, timbre)
- **Key insight**: TD separates "analysis" from "visualization" — the CHOP outputs clean data that other nodes consume

### Web Audio API Approach (Browser)

- **AnalyserNode**: Real-time FFT with `getByteFrequencyData()` / `getFloatFrequencyData()`
- **FFT Size**: Power of 2 (256, 512, 1024, 2048, 4096, 8192)
- **frequencyBinCount**: FFT size / 2
- **Smoothing**: `smoothingTimeConstant` (0.0-1.0) for temporal averaging
- **Time-domain**: `getByteTimeDomainData()` for waveform/oscilloscope
- **Sources**: File (`<audio>` element + MediaElementSourceNode), Microphone (`getUserMedia` + MediaStreamSourceNode), Tab capture

### Audio Features for Visual Effects

1. **Frequency Bands** (energy per band):
   - Sub-bass: 20-60 Hz
   - Bass: 60-250 Hz (kick drum)
   - Low-mids: 250-500 Hz
   - Mids: 500-2000 Hz (vocals, snare body)
   - High-mids: 2000-4000 Hz (snare crack, vocal presence)
   - Presence: 4000-6000 Hz
   - Brilliance/Air: 6000-20000 Hz (hi-hats, cymbals)
2. **Volume / RMS**: Overall loudness
3. **Spectral Centroid**: "Brightness" of sound (weighted avg frequency)
4. **Spectral Flux**: Rate of change in spectrum (onset detection)
5. **Spectral Flatness**: Noise-like vs tone-like
6. **Zero Crossing Rate**: Percussiveness indicator
7. **Beat Detection**: Energy threshold-based with adaptive threshold
8. **BPM Estimation**: Auto-correlation of beat times
9. **Peak Detection**: Instant peaks for trigger effects

---

## Implementation Checklist

### Phase 1: Core Audio Engine (Frontend)

- [x] **AudioEngine class** (`src/engine/audio/AudioEngine.ts`)
  - [x] Create `AudioContext` singleton
  - [x] Create `AnalyserNode` with configurable FFT size
  - [x] Support file input (`<audio>` element -> `MediaElementAudioSourceNode`)
  - [x] Support microphone input (`getUserMedia` -> `MediaStreamAudioSourceNode`)
  - [x] Play/pause/stop controls
  - [x] Volume control
  - [x] Buffer size selector (256, 512, 1024, 2048, 4096)
  - [x] Meyda analyzer integration for real-time features

### Phase 2: Beat Detection & Rhythm

- [x] **Beat detection** (integrated into AudioEngine)
  - [x] Energy-based beat detection (focus on bass frequencies)
  - [x] Adaptive threshold (decay + sensitivity)
  - [x] Multi-band beat detection (bass beat, mid beat, treble beat)
  - [x] Beat hold time / cooldown to avoid double triggers
  - [x] Beat confidence scoring
  - [x] `onEvent` callback / event emitter
- [x] **BPM detection** via `web-audio-beat-detector`

### Phase 3: Audio-Reactive Parameter System

- [x] **AudioParameterMapper** (`src/engine/audio/AudioParameterMapper.ts`)
  - [x] Map audio features to named output channels
  - [x] Per-channel scaling (inputMin/inputMax -> outputMin/outputMax)
  - [x] Per-channel attack/decay smoothing
  - [x] Per-channel gate mode (threshold-based activation)
  - [x] Invert output
  - [x] Per-channel state tracking with `MappedAudioValue`

### Phase 4: Audio-Reactive Shaders (WebGL)

- [x] **audio_bass_pulse** shader (`src/engine/shaders/audioBassPulse.ts`)
  - [x] Pulsing brightness/glow driven by bass energy
  - [x] Configurable intensity parameter
  - [x] Chromatic aberration on strong bass hits
- [ ] **audio_spectrum** shader
- [ ] **audio_waveform** shader
- [ ] **audio_spectral_shift** shader
- [ ] **audio_glitch_beat** shader
- [ ] **audio_reactive_dither** shader

### Phase 5: Bake-and-Pass Export Pipeline (Replaces Rust DSP)

- [x] **AudioFeatureExtractor** (`src/engine/audio/AudioFeatureExtractor.ts`)
  - [x] Decode audio file into AudioBuffer
  - [x] Offline analysis using `Meyda.extract()` at video FPS
  - [x] Per-frame feature extraction (centroid, flux, bands, beats)
  - [x] BPM detection via `web-audio-beat-detector`
  - [x] Serialize to `AudioBakeData` JSON
- [x] **AudioBakeData** JSON schema (`src/engine/audio/types.ts`)
  - [x] `fps`, `totalFrames`, `bpm`, `frames[]`
  - [x] Per-frame: `rms`, `energy`, `spectralCentroid`, `spectralFlatness`, `spectralRolloff`, `spectralFlux`, `zcr`
  - [x] Per-frame: 7 frequency band energies
  - [x] Per-frame: beat flags (`beatBass`, `beatMid`, `beatTreble`, `beatEnergy`)
- [ ] **Rust export integration**
  - [ ] Send `AudioBakeData` JSON to Rust `export_video` command
  - [ ] Rust reads current frame from JSON instead of analyzing audio
  - [ ] Rust `AudioReactive` trait for effects that consume baked data

### Phase 6: UI Integration

- [ ] Audio panel UI component
  - [ ] File drop/upload for audio track
  - [ ] Microphone toggle
  - [ ] Play/pause/stop buttons
  - [ ] Volume slider
  - [ ] Band energy visualization (mini spectrum)
  - [ ] Beat indicator LEDs
- [ ] Effect parameter binding UI
  - [ ] Dropdown to bind parameter to audio feature
  - [ ] Scale/min/max/offset controls
  - [ ] Smoothing/decay slider
  - [ ] Real-time preview of mapped value
- [ ] Audio-reactive category in effect browser

### Phase 7: Integration & Testing

- [x] Register audio-reactive effects in shader registry
- [ ] Register audio-reactive effects in Rust registry
- [ ] Update `effectConverter.ts` for audio-reactive mappings
- [ ] Test with various audio sources (mp3, wav, microphone)
- [ ] Test with various music genres (EDM, hip-hop, rock, ambient)
- [ ] Performance profiling
- [ ] Add audio visualization debug overlay

---

## Notes

### Performance Considerations

- AnalyserNode.getByteFrequencyData() is fast (C++ implementation)
- FFT size tradeoff: larger = more frequency resolution, smaller = better temporal resolution
- For visual effects, 256-1024 FFT is usually sufficient
- Consider running analysis on a separate thread via Web Worker if needed
- Cache frequency data per frame to avoid duplicate computations

### TouchDesigner-Inspired Design Decisions

1. **Separate Analysis from Effects**: Like TD's CHOPs, keep the audio analysis as a pure data source that feeds into effects. Don't couple analysis logic into shaders.
2. **Named Output Channels**: TD uses named CHOP channels. We'll use named audio feature outputs (`bass`, `mid`, `treble`, `beat`, etc.).
3. **Visualization vs Raw Mode**: Offer both "smoothed/visual" and "raw/direct" audio data modes.
4. **Cook-on-Demand**: Only compute expensive features (flux, centroid) if an effect actually needs them.

### Libraries to Consider

- **web-audio-beat-detector**: More sophisticated beat detection than simple energy threshold
- **meyda**: Comprehensive audio feature extraction library (centroid, flux, rolloff, etc.)
- **Essentia.js**: WebAssembly port of Essentia (professional audio analysis — heavy but powerful)
- **For Rust**: `rustfft`, `dasp` (digital audio signal processing)

### Simpler Alternative to Full Build-Your-Own

Instead of building everything from scratch, we could:

1. Use **meyda** for feature extraction (centroid, flux, rolloff, etc.)
2. Use **web-audio-beat-detector** for beat detection
3. Build our own parameter mapper and shader integration

This would save significant time while still giving professional-grade analysis.
