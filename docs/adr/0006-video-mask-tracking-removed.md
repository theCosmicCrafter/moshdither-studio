# ADR 0006: Video Mask Tracking Removed Until It Can Track

## Status

Accepted — 2026-09-09. Feature recycled; Rust command left in place with no caller.

## Context

The Mask panel offered **Run Video Predictor** on a video source. It extracted
frames from the 1280 px proxy at a fixed 10 fps, sent them to the SAM3 bridge,
stored one mask per frame in `sam3FrameMasks`, and a green overlay followed the
subject through the clip. The release audit (`evals/reports/audit-2026-09-09.md`)
reported that the export never saw those masks. The design review found it
understated the problem:

- **It never tracked.** `cmd_video_predictor` in `sam3_bridge.py` loops the
  frames and calls `cmd_auto_mask()` for each one; the only caller passed no
  prompt. Every frame therefore received that frame's highest-scoring 8×8-grid
  auto-segment, chosen independently. No identity was carried between frames.
- **It could not finish.** A 3-minute clip at 10 fps is 1 800 frames × 65 model
  passes each, against the 600 s budget in `sam3_engine.rs`.
- **Nothing rendered it.** The WebGL preview never read `sam3FrameMasks`. The
  CPU preview received it as the global mask, but `stackToRustPayload` prefers
  each entry's `maskB64`, which the store snapshots at assignment — so it was
  discarded. The overlay `<img>` was the only consumer. (Be precise: a project
  saved before `maskB64` was serialised loads with it null, and *would* have
  handed the flicker mask to the CPU preview.)

What the user saw was a mask flickering between unrelated blobs, drawn over a
render that ignored it. Exporting it faithfully would have exported the flicker.

## Decision

Recycle `FrameTimeline.tsx`, the `sam3FrameMasks` store slice and the
`sam3VideoPredictor` IPC wrapper. `sam3_video_predictor` (Rust) and
`Sam3Engine::video_predictor` stay, uncalled, so a real implementation has a
transport to build on. A test in `MaskPanel.test.tsx` fails if the button
returns without an export path.

## For the real implementation

1. **Prerequisite: propagation.** The bridge has no propagate path. Tracking
   means one prompt on one frame, propagated forward — not an auto-mask per
   frame.
2. **Index masks by time, not frame.** Masks are fixed at 10 fps; the export
   runs at the segment's fps and then trims. `mask_idx = round((trim_start +
   frame_idx / segment.fps) * 10)`, clamped. Note the keyframe path in
   `commands.rs` evaluates at `idx / fps` on the *post-trim* segment and does
   not add `trim_start`; that is a separate defect, and the mask formula must
   not be "fixed" to match it.
3. **Do not ship masks as base64 on `EffectCall`.** One PNG per effect per
   frame duplicates the payload per effect; `decode_mask_b64` yields ~0.9 MiB
   per proxy mask, ~1.6 GB for 1 800. Pass a directory token once at the top
   level and decode lazily inside the per-frame closure, and resample to the
   export frame size there.

## Recovery

Commit `34f6341` is the last with the feature intact:
`git show 34f6341:src/components/FrameTimeline.tsx`, and the same for
`src/store/index.ts` and `src/lib/tauri.ts`. The component is also at
`recycling/2026-09-09_video-mask-tracking/`.
