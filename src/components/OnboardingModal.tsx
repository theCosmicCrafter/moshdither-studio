import { useEffect, useRef, useState } from "react";

const STORAGE_KEY = "onboardingDismissed";

export default function OnboardingModal() {
  const [dismissed, setDismissed] = useState(() => {
    try {
      return localStorage.getItem(STORAGE_KEY) === "true";
    } catch {
      return false;
    }
  });
  const dialogRef = useRef<HTMLDivElement>(null);
  const primaryButtonRef = useRef<HTMLButtonElement>(null);

  // Focus the primary action when the modal opens so keyboard users can
  // dismiss immediately without tabbing through the feature list.
  useEffect(() => {
    if (!dismissed && primaryButtonRef.current) {
      primaryButtonRef.current.focus();
    }
  }, [dismissed]);

  // Escape closes the modal — standard dialog behaviour.
  useEffect(() => {
    if (dismissed) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") dismiss();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [dismissed]);

  if (dismissed) return null;

  const dismiss = () => {
    try {
      localStorage.setItem(STORAGE_KEY, "true");
    } catch {
      // localStorage may be unavailable in some privacy contexts; the modal
      // will simply reappear next session, which is acceptable.
    }
    setDismissed(true);
  };

  return (
    <div
      className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/70 backdrop-blur-sm animate-fade-in"
      role="dialog"
      aria-modal="true"
      aria-labelledby="onboarding-title"
      aria-describedby="onboarding-description"
      onClick={dismiss}
    >
      <div
        ref={dialogRef}
        className="w-[90%] max-w-md bg-surface-container-low border border-outline-variant rounded-lg p-8 flex flex-col gap-4 shadow-xl animate-slide-up"
        onClick={(e) => e.stopPropagation()}
      >
        <h2
          id="onboarding-title"
          className="m-0 font-headline-md text-headline-md text-primary filigree-header"
        >
          Welcome to MoshDither Studio
        </h2>
        <p
          id="onboarding-description"
          className="m-0 font-body-md text-on-surface-variant leading-relaxed"
        >
          A professional datamoshing and dithering studio built for artists and creators.
        </p>
        <ul className="m-0 pl-5 font-body-sm text-on-surface-variant leading-loose list-disc">
          <li>Import images or videos to start</li>
          <li>Add and stack effects in the Layers panel</li>
          <li>Use blend modes and opacity for fine control</li>
          <li>Paint masks with the professional brush engine</li>
          <li>Export to PNG, JPG, GIF, or MP4</li>
        </ul>
        <div className="p-3 rounded bg-amber-500/10 border border-amber-500/30 text-amber-300 text-xs flex items-start gap-2">
          <span className="font-semibold uppercase tracking-wider text-dense-xs bg-amber-500/20 px-1.5 py-0.5 rounded text-amber-200 shrink-0">
            Advisory
          </span>
          <span>
            This application generates high-contrast glitch art, strobing colors, and rapid frame transitions. User discretion is advised for photosensitive individuals.
          </span>
        </div>
        <div className="flex gap-3 mt-2">
          <button
            ref={primaryButtonRef}
            onClick={dismiss}
            className="flex-1 px-4 py-2 rounded-md bg-primary text-on-primary font-label-md hover:bg-primary/80 transition-colors"
            aria-label="Get started and dismiss the welcome dialog"
            autoFocus
          >
            Get Started
          </button>
          <button
            onClick={dismiss}
            className="flex-1 px-4 py-2 rounded-md bg-surface-container text-primary border border-outline-variant font-label-md hover:bg-surface-container-high transition-colors"
            aria-label="Skip the welcome tour"
          >
            Skip
          </button>
        </div>
      </div>
    </div>
  );
}
