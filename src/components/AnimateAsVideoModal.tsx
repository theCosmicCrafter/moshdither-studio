import { useEffect, useRef, useState } from "react";
import { useAppStore } from "../store";

/**
 * Length/frame-rate prompt for turning a still into a clip.
 *
 * These were fixed at 5s/30fps in the toolbar. For datamoshing that is not a
 * detail: an I-frame's corruption smears across the frames that follow it, so
 * clip length and frame rate decide how far the effect travels. Fixing them
 * capped what the feature could produce.
 *
 * Deliberately a prompt rather than a persistent output mode. Converting up
 * front produces a real video file, so Timeline, playback, video-only effects
 * and FFglitch all work afterwards with no special-casing -- a mode flag would
 * have to be understood by every one of those consumers.
 */
export default function AnimateAsVideoModal({
  onConfirm,
}: {
  readonly onConfirm: (durationSecs: number, fps: number) => void;
}) {
  const open = useAppStore((s) => s.animateDialogOpen);
  const setOpen = useAppStore((s) => s.setAnimateDialogOpen);
  const storedDuration = useAppStore((s) => s.animateDurationSecs);
  const storedFps = useAppStore((s) => s.animateFps);
  const setStoredDuration = useAppStore((s) => s.setAnimateDurationSecs);
  const setStoredFps = useAppStore((s) => s.setAnimateFps);

  // Local text state so a half-typed value ("1.", "") doesn't get clamped to a
  // legal number mid-keystroke and fight the user's editing.
  const [duration, setDuration] = useState(String(storedDuration));
  const [fps, setFps] = useState(String(storedFps));
  const firstFieldRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!open) return;
    setDuration(String(storedDuration));
    setFps(String(storedFps));
    firstFieldRef.current?.focus();
    firstFieldRef.current?.select();
  }, [open, storedDuration, storedFps]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, setOpen]);

  if (!open) return null;

  const parsedDuration = Number.parseFloat(duration);
  const parsedFps = Number.parseInt(fps, 10);
  const durationValid = Number.isFinite(parsedDuration) && parsedDuration >= 0.1 && parsedDuration <= 120;
  const fpsValid = Number.isFinite(parsedFps) && parsedFps >= 1 && parsedFps <= 120;
  const valid = durationValid && fpsValid;
  const frameCount = valid ? Math.round(parsedDuration * parsedFps) : 0;

  const confirm = () => {
    if (!valid) return;
    setStoredDuration(parsedDuration);
    setStoredFps(parsedFps);
    setOpen(false);
    onConfirm(parsedDuration, parsedFps);
  };

  return (
    <div
      className="fixed inset-0 z-[500] flex items-center justify-center bg-black/60 backdrop-blur-md"
      onClick={() => setOpen(false)}
    >
      <div
        className="w-full max-w-sm neo-panel rounded-xl bg-surface/95 border border-outline/30 shadow-2xl p-6 space-y-5"
        role="dialog"
        aria-modal="true"
        aria-labelledby="animate-as-video-title"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center gap-2 border-b border-outline/20 pb-3">
          <span className="material-symbols-outlined text-accent-teal">animation</span>
          <h2 id="animate-as-video-title" className="text-base font-bold text-on-surface">
            Animate as Video
          </h2>
        </div>

        <p className="font-body-sm text-body-sm text-on-surface-variant">
          Repeats this still into a clip so the timeline, playback and video-only
          effects can work on it.
        </p>

        <div className="grid grid-cols-2 gap-3">
          <label className="block space-y-1">
            <span className="font-label-sm text-label-sm text-on-surface-variant">Duration (s)</span>
            <input
              ref={firstFieldRef}
              type="number"
              min={0.1}
              max={120}
              step={0.5}
              value={duration}
              onChange={(e) => setDuration(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && confirm()}
              aria-invalid={!durationValid}
              className={`w-full bg-surface-container-low border rounded px-2 py-1.5 font-label-md text-label-md text-on-surface focus:border-accent ${
                durationValid ? "border-outline/30" : "border-error"
              }`}
            />
          </label>
          <label className="block space-y-1">
            <span className="font-label-sm text-label-sm text-on-surface-variant">Frame rate</span>
            <input
              type="number"
              min={1}
              max={120}
              step={1}
              value={fps}
              onChange={(e) => setFps(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && confirm()}
              aria-invalid={!fpsValid}
              className={`w-full bg-surface-container-low border rounded px-2 py-1.5 font-label-md text-label-md text-on-surface focus:border-accent ${
                fpsValid ? "border-outline/30" : "border-error"
              }`}
            />
          </label>
        </div>

        <p className="font-label-sm text-label-sm text-on-surface-variant" aria-live="polite">
          {valid
            ? `${frameCount} frames — longer clips give datamosh effects more room to smear.`
            : "Duration must be 0.1–120s and frame rate 1–120."}
        </p>

        <div className="flex justify-end gap-2 pt-1">
          <button
            onClick={() => setOpen(false)}
            className="neo-btn px-3 py-1.5 rounded font-label-md text-label-md text-on-surface-variant hover:text-on-surface transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={confirm}
            disabled={!valid}
            className={`px-4 py-1.5 rounded font-label-md text-label-md font-bold transition-all ${
              valid
                ? "bg-accent-teal text-surface hover:brightness-110"
                : "bg-surface-container text-on-surface-variant cursor-not-allowed"
            }`}
          >
            Animate
          </button>
        </div>
      </div>
    </div>
  );
}
