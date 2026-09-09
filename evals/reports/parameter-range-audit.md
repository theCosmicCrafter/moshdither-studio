# Parameter range audit

**Question asked:** are the adjustment ranges industry-standard? If someone moves
off a default, do they get useful, finite control — or does the value skew to a
useless end of the range?

**Scope:** all **186 parameters** across 68 effect files, of which **164 are
sliders**. Every finding below was checked against real footage
(`/d/output/19_00001.mp4`, 640×1146, mean luma 107.8, no clipping) rather than a
synthetic chart.

---

## Verdict

The ranges themselves are sound. **Two defects were in the control UI**, not in
the numbers, and both are fixed. Two range definitions were genuinely wrong and
are fixed. Everything else that looked wrong turned out to be deliberate, and is
now recorded so it stays visible.

| | |
|---|---|
| Parameters audited | 186 (164 sliders) |
| Fixed — UI control defects | 2 |
| Fixed — range definitions | 2 |
| Reviewed and correct as-is | 26 defaults at a range end |
| New regression tests | 2 (`effects::params::slider_range_tests`) |

---

## Fixed: the control could show a value it wasn't using

`ParameterPanel.tsx` renders every numeric parameter as a rotary wheel plus an
editable number box. The box carried **no `min`, `max` or `step`**, so a user
could type `999999` into any parameter.

That was never destructive — `effects::params::clamp_params` clamps to the
declared range before the effect runs — but it produced something worse than a
rejected input: **the box displayed a number the render was not using.** The
field now clamps on entry, and carries `min`/`max`/`step` so the arrows respect
the range.

## Fixed: the wheel face was blank of information

The wheel's readout was `value.toFixed(0)` — always an integer. **67 of the 164
sliders have a total range of 2.0 or less**, so their face read `0` for every
value below 0.5 and `1` above it, while the user dragged. Precision now follows
the range: 2 decimals under a span of 2, 1 decimal under 20, integers above.

## Fixed: two maxima were unreachable

A step that does not divide the span means the top of the slider cannot be
reached from the input's arrows.

| Parameter | Was | Stopped at | Now |
|---|---|---|---|
| `datamoshing.optical_flow.alpha` | `[0.01…2.0]` step `0.05` | 1.96 | step `0.01` |
| `dithering.palette.angle` | `[−π…π]` step `0.1` | 3.0584 | step `π/32` (64 positions per turn) |

---

## Reviewed and left alone

**26 sliders default to an end of their range.** Every one was checked
individually; all are deliberate, and the reasoning now lives in the test that
counts them.

| Group | Count | Why the end is right |
|---|---|---|
| `dithering.*.levels = 2` | 10 | 1-bit dithering — the classic look |
| Wet/dry `amount` / `mix` / `intensity` = 1.0 | 5 | Apply fully, then dial back: how a grade or LUT is normally presented |
| `analog.vhs` extras = 0 | 3 | Optional artefacts. VHS at defaults already changes **87%** of pixels without them |
| `every_nth_beat = 1` | 2 | "Every beat" *is* the minimum |
| iframe frame indices = 0 | 2 | Frame zero |
| `sorting_glitch.u_intensity = 10` | 1 | **Saturating**: 10 is "fully sorted", so there is nothing above it. Measured 0→0%, 2→7%, 5→21%, 10→50% of pixels changed, correlation 0.956 — usable across the whole range |
| `spectrum.bar_count = 7` | 1 | There are exactly 7 frequency bands |
| `pixelate.min_block = 1`, `slice_shift.repeat = 0` | 2 | Minimum / off |

### Things that looked wrong and were not

- **`dithering.palette.angle` reported as an empty `64…64` range.** My extraction
  script read the `64` out of `-std::f64::consts::PI`. The range is −π…π with
  default 0 — correct. Fixed in the tooling.
- **`iframe_removal_advanced` frame indices span 0…10000.** That is a poor
  *slider*, but the panel pairs every slider with a typeable number box, so a
  frame number can be entered directly. Left as-is rather than truncating the
  range and breaking long clips.
- **`glitch.sorting_glitch.u_intensity` defaults to its maximum.** The source
  documents why: 10 is the look users have always seen, and lower values only
  became genuinely reachable after a partial-sort fix. Extending the ceiling does
  nothing — values above 10 render identically, because 10 means "fully sorted".

---

## Regression tests

`cargo test slider_range` now enforces, across the live registry:

1. **`every_slider_has_a_usable_range`** — every slider declares min/max, the
   default sits inside them, the step is positive, the step divides the span so
   the maximum is reachable, and there are at least 2 positions. This is what
   caught both unreachable maxima.
2. **`defaults_at_range_ends_are_accounted_for`** — records the 26 reviewed
   end-defaults. It does not fail them; it fails a *new* one, so the next
   addition gets a moment's thought instead of passing unseen.

---

## Verification on real footage

The whole effect suite was re-audited against a frame from
`/d/output/19_00001.mp4` rather than a synthetic image
(`evals/reports/quality-audit-real-footage.md`):

| Check | Result |
|---|---|
| Effects rendered (still / video) | 99 / 69 |
| Still calibration flags | **0** |
| Video calibration flags | **0** |
| Category-claim violations | **0** |
| Audio-reactive effects not reacting | **0** |
| LUTs rendered on the same frame | **35/35**, mean-luma spread 69.9–137.6 from a 107.8 source |

The single LUT that changes nothing is `lookup.png` — the shader's neutral
512×512 identity LUT, correctly a no-op.
