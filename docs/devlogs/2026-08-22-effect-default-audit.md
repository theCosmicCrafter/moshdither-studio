# 2026-08-22 — Auditing the default strength of all 99 effects

## The brief

Every effect's defaults should read unmistakably as that effect — visible and
predominant without touching a slider — but a tasteful effect must not wreck the
frame, and a destructive one should. Agreed bar for the destructive families
(glitch, datamosh, pixel sort): **wrecked but recognisable**, leaving headroom on
the slider.

## Method

`mosh-verify render-all` renders every registered effect at its defaults, so the
whole library can be measured rather than eyeballed. Four reference images, to
avoid tuning against one frame: a studio portrait (dark, high dynamic range), a
landscape, a mountain scene, and the repository test frame.

Per effect, averaged across all four:

| metric | meaning |
|---|---|
| `delta` | mean per-channel change vs source — how far the frame moved |
| `corr` | luminance correlation vs source — 1.0 structure intact, 0 destroyed, **negative means tones came out backwards** |
| `changed` | share of pixels visibly altered (any channel > 8) |

Bands: `delta` < 2 none · < 6 faint · < 20 in band · < 55 strong · else extreme.

The dark portrait earned its place immediately: it is the image that exposed the
line screen inversion, because it is the only reference whose subject is
*brighter* than its background.

## What it found

**One outright defect: `dithering.line_screen`.** The only effect in the library
whose output correlated *negatively* with its input (−0.60). Line width was
driven by brightness, so it laid ink on the highlights: the lit face filled with
solid black hatching while the black background printed as bare white paper.
Mean output brightness was 242/255 — an almost blank sheet. Fixed by driving ink
from darkness; correlation is now +0.56 and mean brightness 61.9 against a
source of 42.5.

Three of its unit tests had been written to describe the implementation rather
than a line screen — one asserted that a fully black frame renders solid white,
i.e. the bug stated as a requirement. They now assert that darker input takes
more ink than lighter input, which guards the inversion directly.

**20 effects measure as identity, and 19 of those are correct.** Audio-reactive
effects need audio; the frame-based datamoshing effects need video; `mask_isolate`
needs a mask, `composite_overlay` an overlay, `color_lut_grading` a LUT. On a
single still they are legitimately no-ops. `color_brightness_contrast` and
`color_lift_gamma_gain` are neutral by design, as grading controls should be.

**Open proposals, deliberately not applied.** Retuning defaults is taste, so
these were left for the owner:

- `datamoshing.shuffle` at `chunk_size 5` gives correlation 0.06 — the subject is
  gone, and the output is indistinguishable from any other image put through it.
  Past the agreed bar; ~18–22 keeps the displaced-block signature legible.
- `glitch.crc_mismatch` (delta 3.5, 8% of pixels), `glitch.macroblock_glitch` and
  `analog.ghosting` (both 0.3 intensity) read as mild artifacts rather than
  effects.
- All 14 dithering effects drive ~96% of pixels to pure black or white. Authentic
  for 1-bit dithering, but it makes their default frames resemble each other.

## Worth knowing next time

- Measure before retuning. The obvious reading of "the defaults are too strong"
  was that `amount: 1.0` needed lowering; the data said no single LUT or effect
  blacks out on its own, and the real causes were elsewhere — stacking, and one
  inverted mapping.
- A negative luminance correlation is a very cheap detector for an inverted
  tonal mapping, and worth keeping in any future sweep.
- Reference images must include one whose subject is brighter than its
  background, or tonal inversions hide.
