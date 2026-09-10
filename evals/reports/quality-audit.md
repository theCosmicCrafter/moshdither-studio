# Quality audit

Generated 2026-09-09T07:34:08+00:00 from `photo-test.png`.
Produced by `evals/quality-audit.py`. Regenerate before any release.

| Check | Result |
|---|---|
| Effects rendered (still) | 99 |
| Effects rendered (video) | 69 |
| Still calibration flags | **0** |
| Video calibration flags | **0** |
| Category-claim violations | **0** |
| Audio-reactive effects not reacting | **0** |

## Category claims upheld

| Category | Claim | Upheld |
|---|---|---|
| Color | must alter colour | 4/4 |
| Dithering | must quantise the palette | 19/19 |
| Noise | must add high-frequency detail | 4/4 |
| PixelGeometry | must rearrange pixels | 8/8 |

## Still frames flagged

None.

## Video outputs flagged

None.

## Category-claim violations

None.

## Audio reactivity

| Effect | delta on beats | delta elsewhere |
|---|---|---|
| `audio_reactive_pixelate` | 14.25 | 5.40 |
| `audio_reactive_bass_pulse` | 12.87 | 3.39 |
| `audio_reactive_chromatic` | 6.45 | 2.65 |
| `audio_reactive_beat_glitch` | 5.08 | 2.40 |
| `audio_reactive_spectrum` | 4.97 | 2.53 |
| `audio_reactive_audio_dither` | 2.64 | 2.40 |
| `audio_reactive_waveform` | 2.26 | 2.25 |
| `audio_reactive_spectral_shift` | 2.12 | 2.16 |
