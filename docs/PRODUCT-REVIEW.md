# Product review — structure, redundancy, and the MoshPro comparison

Written 2026-09-09, in answer to: *why are there two preview methods, where is
the animate-still-image feature, what is the timeline for, is this
over-complicated, and is there a better way to organise it?*

The goal stated for the product is **a better MoshPro — the same features, the
same ease of use.** That framing is what the recommendations below are measured
against, because it settles a question the current design keeps open: this is a
*creative tool for making glitch art*, not a compositing suite.

---

## 1. Why there are two preview methods

There are two because **every effect is implemented twice.**

| | |
|---|---|
| Rust effects (CPU) | **99** |
| GLSL shader files | **72**, providing **101 effect→shader mappings** covering **98 of 99** effects |

- **WebGL GPU preview** — fast enough to scrub and drag sliders against.
- **Rust CPU preview** — what the exported file will actually look like.

They exist because a GPU approximation and a CPU renderer will not agree
pixel-for-pixel, so the app offers both and makes you choose.

**This is the single biggest structural problem in the app.** Not because two
renderers is a crazy idea — many tools have a fast preview and a final render —
but because of how it is *presented*: as a toggle the user has to understand and
manage. A user asking "which one is right?" is being handed the developer's
implementation detail as a decision.

Every new effect must also be written twice, in two languages, and kept
numerically in step. That is 100% duplicated surface area for a solo project,
and it is the most likely source of future "the preview lied to me" bugs.

**DONE (2026-09-09).** The choice is gone. WebGL runs while anything is
changing or playing; 450 ms after you stop, the exact CPU frame is rendered and
swapped in. The header now *reports* state ("REFINING…" → "EXACT") instead of
asking for a click. It only spends the CPU render on stacks whose shader is
actually an approximation — a stack that previews exactly on the GPU is left
alone. `previewAutoExact` in the store turns it off for anyone who wants the
old manual behaviour.

The heavier option — delete one renderer — is not worth it: the GPU path is what
makes scrubbing usable, and the CPU path is what makes export honest.

---

## 2. Where the "animate a still image" feature is

**CORRECTION.** It *is* labelled: **File → Animate as Video**, with its own
modal (`AnimateAsVideoModal.tsx`) taking duration and fps, backed by the
`animate_still_as_video` command. My earlier claim that it was unlabelled was
wrong — I had searched the Export panel and not the File menu.

What remains true is that it is one menu item away from the app's headline
capability, and the Export panel gives no hint it exists. 98 of 99 effects
animate a still (verified —
`evals/reports/quality-audit.md`; the one that does not is `frame_hold`, which
holds a frame by definition).

The problem is purely discoverability. Nothing in the UI says "animate this
photo". The duration lives on the Timeline as generic clip length, and the
Export panel does not distinguish "export the frame" from "export N seconds of
motion". The headline capability of the product is reachable only by inferring
it.

**Recommendation.** When the loaded media is a still, the Export panel should
offer **Save Image** and **Animate to Video** as two named actions, with the
duration and fps attached to the second. Same code path, named honestly.

---

## 3. What the Timeline is for

Three genuinely different jobs, currently sharing one strip:

1. **Clip length / in-out points** for video trimming *and* for still-image
   animation duration.
2. **Keyframes** — any slider can be animated over time (`KeyframeButton` on
   every numeric parameter).
3. **Audio binding** — parameters driven by baked audio features (verified:
   8/8 audio-reactive effects respond, 5 spiking on beats).

That is a real and valuable feature set. The issue is that it is unlabelled and
undifferentiated, so it reads as "a video scrubber" and its two more powerful
uses are invisible.

---

## 4. Redundancy and over-complication

### Panel count

**Eleven dockable panels**: Effects, Stack, Preview, Timeline, Mask, Audio
Reactive, LUTs, Export, Presets, Proxy Media, Tracks, plus a Verify panel.

MoshPro's usability comes from having *few* surfaces. Eleven movable panels is a
DAW's information architecture applied to a tool whose core loop is: **open
media → stack effects → tweak → export.**

Specific overlaps worth collapsing:

| Overlap | Observation |
|---|---|
| **LUTs** is its own panel | A LUT is one effect (`color.lut_grading`). It has a whole panel because it needs a file picker and thumbnails — but that makes one effect a first-class citizen above 98 others |
| **Audio Reactive** panel vs audio binding on the Timeline | Two entry points to the same idea |
| **Proxy Media** and **Tracks** | Infrastructure panels for a tool whose stated goal is ease of use |
| **Verify** panel | A developer diagnostic surfaced to end users |

### Two things that genuinely are not redundant

- **Effects browser vs Stack** — correct and standard: a library and an applied
  chain are different things.
- **Mask panel** — SAM3 segmentation needs its own space.

### Recommendation

Ship a **default layout of five**: Effects, Stack, Preview, Timeline, Export.
Move Mask and LUTs to where they are used (Mask into the Preview's tool
overlay; LUTs into the LUT effect's own parameter UI). Keep Proxy, Tracks,
Presets and Verify available but **not in the default layout** — the dock system
already supports adding a panel on demand, which is exactly what that mechanism
is for.

Nothing needs deleting. The complexity is in what greets a first-time user, not
in what exists.

---

## 5. Missed opportunities

1. **The dithering engine is the differentiator and it is buried.** 19 dithering
   algorithms, all verified to genuinely quantise (94,143 colours → 2–8). That
   is a stronger dithering suite than MoshPro has, and it is one collapsed
   category in a list of eleven.
2. **Still-photo animation is a headline feature presented as a side effect**
   (see §2).
3. **Presets exist but do not sell the product.** The fastest route to
   "better MoshPro" is a shelf of named looks a user can click and immediately
   see, rather than assembling a stack from 99 primitives.
4. **The audio-reactive work is genuinely good and hard to find** — measured
   beat response on 8 effects, and it is behind a panel most users will never
   open.

---

## 6. Status of the issues raised in this session

| Issue | Status |
|---|---|
| Command-prompt windows popping up | **Fixed.** 24 spawn sites now use `CREATE_NO_WINDOW`; there were 27 and none suppressed it |
| Is SAM self-contained? | **Confirmed.** `MOSHDITHER_SAM3_PYTHON` is unset on this machine, so it ran the bundled sidecar in `~/.moshdither/sam3`, not system Python |
| "Auto-mask failed: Model not loaded" | **Fixed.** Readiness returned before the image reached the bridge, so every prompt raced it |
| App would not start | **Fixed**, and it was mine — disabling the updater without unregistering the plugin. Gate 10 now launches the real binary |
| **Export crashes the app** | **Not explained.** See below |

### The export crash

Windows records **exception `0xc0000374` (STATUS_HEAP_CORRUPTION)** in `ntdll`.
That is a *fast-fail*: it bypasses structured exception handling, so the app's
own crash handler cannot log it — which is why the log simply stops with no
panic recorded.

Not reproduced yet. `encode_video` handles 48 frames of 1536×2752 (774 MB)
cleanly, and the still→video path renders at that resolution without incident.
One real hazard was found and fixed on the way past: FFmpeg is given a single
frame size and then fed raw bytes with no framing, so an effect that resizes
mid-stream silently corrupted the output rather than erroring.

**To pin it down I need the specific case**: which effects were in the stack,
which output format, and whether the source was the still or a video. Heap
corruption is deterministic far more often than it looks, so a reproducible
recipe would very likely settle it quickly.
