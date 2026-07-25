"""
Extract per-frame audio features from a WAV file and emit an AudioBakeData JSON
that the MoshDither Studio Rust backend can consume via the `audio_bake_json`
parameter of the `export_video` IPC command (or the `mosh-verify audio-render`
subcommand).

The output schema mirrors `FrameAudioFeatures` in
`src-tauri/src/audio/mod.rs` and `AudioBakeData` in the same file.

Usage:
    python extract_audio_features.py <input.wav> <fps> <total_frames> <output.json>
"""
import json
import sys

import numpy as np
from scipy.io import wavfile


def band_energy(spec: np.ndarray, freqs: np.ndarray, lo: float, hi: float) -> float:
    """Mean magnitude in a frequency band [lo, hi] Hz.

    Raw value — normalized to 0-1 in a second pass over all frames so the
    loudest frame in the clip = 1.0. This matches the scale the Rust
    audio-reactive effects expect (their thresholds and scale factors are
    tuned for 0-1 band energies from the live TS extractor).
    """
    mask = (freqs >= lo) & (freqs < hi)
    if not mask.any():
        return 0.0
    return float(np.mean(np.abs(spec[mask])))


def compute_features(samples: np.ndarray, sr: int, fps: float,
                     total_frames: int) -> list:
    """Compute FrameAudioFeatures for each video frame."""
    hop = int(sr / fps)  # samples per frame
    n_fft = 2048
    frames_out = []

    # Track previous spectrum for spectral flux
    prev_spec = None

    # Simple beat tracking: track running RMS history, flag a beat when
    # instantaneous RMS exceeds 1.4x the local mean.
    rms_history = []

    for i in range(total_frames):
        start = i * hop
        end = start + hop
        frame = samples[start:end]
        if len(frame) == 0:
            break

        # Time-domain features
        rms = float(np.sqrt(np.mean(frame.astype(np.float64) ** 2)))
        volume = float(np.mean(np.abs(frame.astype(np.float64))))
        zcr = float(np.mean(np.diff(np.signbit(frame).astype(int)) != 0))
        energy = float(np.sum(frame.astype(np.float64) ** 2) / max(len(frame), 1))

        # Frequency-domain: use a windowed FFT centered on this frame
        center = start + hop // 2
        win_start = max(0, center - n_fft // 2)
        win_end = min(len(samples), win_start + n_fft)
        win = samples[win_start:win_end].astype(np.float64)
        if len(win) < n_fft:
            win = np.pad(win, (0, n_fft - len(win)))
        win = win * np.hanning(n_fft)
        spec = np.fft.rfft(win)
        mag = np.abs(spec)
        freqs = np.fft.rfftfreq(n_fft, d=1.0 / sr)

        # Spectral features
        total_mag = mag.sum() + 1e-9
        spectral_centroid = float((freqs * mag).sum() / total_mag)
        spectral_flatness = float(np.exp(np.mean(np.log(mag + 1e-12))) /
                                  (np.mean(mag) + 1e-12))
        # Spectral rolloff: 85% of cumulative energy
        cumulative = np.cumsum(mag)
        rolloff_idx = np.searchsorted(cumulative, 0.85 * cumulative[-1])
        spectral_rolloff = float(freqs[min(rolloff_idx, len(freqs) - 1)])
        # Spectral flux vs previous frame
        if prev_spec is not None:
            diff = mag - prev_spec
            spectral_flux = float(np.sqrt(np.mean(np.maximum(diff, 0) ** 2)))
        else:
            spectral_flux = 0.0
        prev_spec = mag

        # Band energy (8-band split)
        sub_bass = band_energy(spec, freqs, 20, 60)
        bass = band_energy(spec, freqs, 60, 250)
        low_mid = band_energy(spec, freqs, 250, 500)
        mid = band_energy(spec, freqs, 500, 2000)
        high_mid = band_energy(spec, freqs, 2000, 4000)
        presence = band_energy(spec, freqs, 4000, 6000)
        brilliance = band_energy(spec, freqs, 6000, 20000)

        # Beat detection: compare current RMS to running window
        rms_history.append(rms)
        if len(rms_history) > 20:
            rms_history = rms_history[-20:]
        local_mean = np.mean(rms_history) + 1e-9
        beat_bass = rms > 1.4 * local_mean
        # Mid-frequency beat: compare mid band energy to its own history
        beat_mid = mid > 1.5 * (np.mean(rms_history) + 1e-9)
        # Treble beat: high_mid spike
        beat_treble = high_mid > 1.6 * (np.mean(rms_history) + 1e-9)
        # Beat energy: how much above average
        beat_energy = float(max(0.0, rms - local_mean) / local_mean)

        frames_out.append({
            "frame": i,
            "time": i / fps,
            "rms": rms,
            "energy": energy,
            "spectral_centroid": spectral_centroid,
            "spectral_flatness": spectral_flatness,
            "spectral_rolloff": spectral_rolloff,
            "spectral_flux": spectral_flux,
            "zcr": zcr,
            "volume": volume,
            "sub_bass": sub_bass,
            "bass": bass,
            "low_mid": low_mid,
            "mid": mid,
            "high_mid": high_mid,
            "presence": presence,
            "brilliance": brilliance,
            "beat_bass": bool(beat_bass),
            "beat_mid": bool(beat_mid),
            "beat_treble": bool(beat_treble),
            "beat_energy": beat_energy,
        })

    # ── Normalize per-clip ────────────────────────────────────────────────
    # The raw FFT magnitudes and RMS values are on an arbitrary scale that
    # depends on the FFT implementation, window size, and audio loudness.
    # The Rust audio-reactive effects (BassPulse, SpectralShift, etc.) are
    # tuned for 0-1 band energies and 0-1 RMS from the live TS extractor.
    # Normalize each feature to 0-1 by dividing by its max across the clip
    # so the loudest frame = 1.0. This guarantees effects see meaningful
    # values regardless of the source audio's absolute volume.
    band_keys = [
        "sub_bass", "bass", "low_mid", "mid",
        "high_mid", "presence", "brilliance",
    ]
    for key in band_keys + ["rms", "volume", "energy"]:
        values = [f[key] for f in frames_out]
        max_val = max(values) if values else 0.0
        if max_val > 0:
            for f in frames_out:
                f[key] = f[key] / max_val

    return frames_out


def main():
    if len(sys.argv) != 5:
        print("Usage: python extract_audio_features.py <input.wav> <fps> "
              "<total_frames> <output.json>", file=sys.stderr)
        sys.exit(2)

    input_wav = sys.argv[1]
    fps = float(sys.argv[2])
    total_frames = int(sys.argv[3])
    output_json = sys.argv[4]

    sr, data = wavfile.read(input_wav)
    # Convert stereo to mono
    if data.ndim > 1:
        data = data.mean(axis=1)
    # Normalize to float in [-1, 1]
    if data.dtype == np.int16:
        data = data.astype(np.float64) / 32768.0
    elif data.dtype == np.int32:
        data = data.astype(np.float64) / 2147483648.0
    elif data.dtype == np.uint8:
        data = (data.astype(np.float64) - 128.0) / 128.0

    print(f"Sample rate: {sr} Hz", file=sys.stderr)
    print(f"Samples: {len(data)} ({len(data) / sr:.2f}s)", file=sys.stderr)
    print(f"Target FPS: {fps}, frames: {total_frames}", file=sys.stderr)

    frames = compute_features(data, sr, fps, total_frames)

    bake = {
        "fps": fps,
        "total_frames": len(frames),
        "bpm": None,
        "frames": frames,
    }

    with open(output_json, "w") as f:
        json.dump(bake, f, indent=2)

    print(f"Wrote {len(frames)} frames to {output_json}", file=sys.stderr)
    # Print a quick summary
    if frames:
        avg_bass = np.mean([f["bass"] for f in frames])
        avg_rms = np.mean([f["rms"] for f in frames])
        n_beats = sum(1 for f in frames if f["beat_bass"])
        print(f"Avg bass: {avg_bass:.4f}, avg RMS: {avg_rms:.4f}, "
              f"bass beats: {n_beats}/{len(frames)}", file=sys.stderr)


if __name__ == "__main__":
    main()
