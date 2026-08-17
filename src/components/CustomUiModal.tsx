import { useState } from "react";
import { useAppStore } from "../store";
import LabeledSlider from "./LabeledSlider";

export default function CustomUiModal() {
  const customUiModalOpen = useAppStore((s) => s.customUiModalOpen);
  const setCustomUiModalOpen = useAppStore((s) => s.setCustomUiModalOpen);
  const customPrimary = useAppStore((s) => s.customPrimary);
  const customSecondary = useAppStore((s) => s.customSecondary);
  const customBg = useAppStore((s) => s.customBg);
  const panelOpacity = useAppStore((s) => s.panelOpacity);
  const setPanelOpacity = useAppStore((s) => s.setPanelOpacity);
  const setCustomThemeColors = useAppStore((s) => s.setCustomThemeColors);
  const setTheme = useAppStore((s) => s.setTheme);

  const [primary, setPrimary] = useState(customPrimary);
  const [secondary, setSecondary] = useState(customSecondary);
  const [bg, setBg] = useState(customBg);

  if (!customUiModalOpen) return null;

  const handleApply = () => {
    setCustomThemeColors(primary, secondary, bg);
    // Apply variables directly to document element
    document.documentElement.style.setProperty("--custom-primary", primary);
    document.documentElement.style.setProperty("--custom-secondary", secondary);
    document.documentElement.style.setProperty("--custom-bg", bg);
    setTheme("custom");
    setCustomUiModalOpen(false);
  };

  return (
    <div className="fixed inset-0 z-[500] flex items-center justify-center bg-black/60 backdrop-blur-md">
      <div
        className="w-full max-w-md neo-panel rounded-xl bg-surface/95 border border-outline/30 shadow-2xl p-6 space-y-6"
        role="dialog"
        aria-modal="true"
        aria-labelledby="custom-ui-title"
      >
        <div className="flex items-center justify-between border-b border-outline/20 pb-3">
          <div className="flex items-center gap-2">
            <span className="material-symbols-outlined text-accent-teal">palette</span>
            <h2 id="custom-ui-title" className="font-headline-md text-headline-md text-on-surface">
              Custom UI Configurator
            </h2>
          </div>
          <button
            onClick={() => setCustomUiModalOpen(false)}
            className="material-symbols-outlined neo-btn p-1 rounded-full text-on-surface-variant hover:text-accent-pink transition-colors"
          >
            close
          </button>
        </div>

        <div className="space-y-4">
          {/* Primary Accent */}
          <div className="flex items-center justify-between">
            <div>
              <label htmlFor="primary-color" className="font-label-md text-label-md text-on-surface block">
                Primary Accent Color
              </label>
              <span className="font-label-sm text-label-sm text-on-surface-variant">Active elements, highlights</span>
            </div>
            <div className="flex items-center gap-2">
              <input
                id="primary-color"
                type="color"
                value={primary}
                onChange={(e) => setPrimary(e.target.value)}
                className="w-8 h-8 rounded cursor-pointer border border-outline/30 bg-transparent"
              />
              <span className="font-code-sm text-code-sm text-on-surface-variant">{primary}</span>
            </div>
          </div>

          {/* Secondary Accent */}
          <div className="flex items-center justify-between">
            <div>
              <label htmlFor="secondary-color" className="font-label-md text-label-md text-on-surface block">
                Secondary Accent Color
              </label>
              <span className="font-label-sm text-label-sm text-on-surface-variant">Hover states, badges</span>
            </div>
            <div className="flex items-center gap-2">
              <input
                id="secondary-color"
                type="color"
                value={secondary}
                onChange={(e) => setSecondary(e.target.value)}
                className="w-8 h-8 rounded cursor-pointer border border-outline/30 bg-transparent"
              />
              <span className="font-code-sm text-code-sm text-on-surface-variant">{secondary}</span>
            </div>
          </div>

          {/* Surface Background */}
          <div className="flex items-center justify-between">
            <div>
              <label htmlFor="bg-color" className="font-label-md text-label-md text-on-surface block">
                Workspace Surface Color
              </label>
              <span className="font-label-sm text-label-sm text-on-surface-variant">Panel background tint</span>
            </div>
            <div className="flex items-center gap-2">
              <input
                id="bg-color"
                type="color"
                value={bg}
                onChange={(e) => setBg(e.target.value)}
                className="w-8 h-8 rounded cursor-pointer border border-outline/30 bg-transparent"
              />
              <span className="font-code-sm text-code-sm text-on-surface-variant">{bg}</span>
            </div>
          </div>

          {/* Panel Opacity */}
          <div className="pt-2 border-t border-outline/20">
            <LabeledSlider
              layout="stacked"
              id="panel-opacity"
              label="Panel Opacity"
              value={panelOpacity}
              displayValue={Math.round(panelOpacity * 100)}
              min={0.2}
              max={1}
              step={0.05}
              onChange={setPanelOpacity}
              unit="%"
            />
          </div>
        </div>

        {/* Actions */}
        <div className="flex justify-end gap-3 pt-3 border-t border-outline/20">
          <button
            onClick={() => setCustomUiModalOpen(false)}
            className="px-4 py-1.5 font-label-md text-label-md text-on-surface-variant hover:text-on-surface transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={handleApply}
            className="px-4 py-1.5 font-label-md text-label-md font-semibold rounded bg-accent-teal text-surface hover:brightness-110 transition shadow-md"
          >
            Apply Theme
          </button>
        </div>
      </div>
    </div>
  );
}
