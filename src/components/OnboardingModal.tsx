import { useState } from "react";

export default function OnboardingModal() {
  const [dismissed, setDismissed] = useState(() => {
    return localStorage.getItem("onboardingDismissed") === "true";
  });

  if (dismissed) return null;

  const dismiss = () => {
    localStorage.setItem("onboardingDismissed", "true");
    setDismissed(true);
  };

  return (
    <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/70 backdrop-blur-sm">
      <div className="w-[90%] max-w-md bg-surface-container-low border border-outline-variant rounded-lg p-8 flex flex-col gap-4 shadow-xl">
        <h2 className="m-0 text-display-sm text-primary">Welcome to MoshDither Studio</h2>
        <p className="m-0 text-body-md text-secondary leading-relaxed">
          A professional datamoshing and dithering studio built for artists and creators.
        </p>
        <ul className="m-0 pl-5 text-body-sm text-secondary leading-loose list-disc">
          <li>Import images or videos to start</li>
          <li>Add and stack effects in the Layers panel</li>
          <li>Use blend modes and opacity for fine control</li>
          <li>Paint masks with the professional brush engine</li>
          <li>Export to PNG, JPG, GIF, or MP4</li>
        </ul>
        <div className="flex gap-3 mt-2">
          <button
            onClick={dismiss}
            className="flex-1 px-4 py-2 rounded-md bg-primary text-on-primary font-label-md hover:bg-primary/80 transition-colors"
          >
            Get Started
          </button>
          <button
            onClick={dismiss}
            className="flex-1 px-4 py-2 rounded-md bg-surface-container text-primary border border-outline-variant font-label-md hover:bg-surface-container-high transition-colors"
          >
            Skip
          </button>
        </div>
      </div>
    </div>
  );
}
