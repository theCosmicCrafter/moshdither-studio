import SearchBar from "./SearchBar";
import CategoryAccordion from "./CategoryAccordion";

export default function EffectBrowser() {
  return (
    <div className="flex flex-col h-full bg-transparent">
      {/* Header */}
      <div className="flex items-center px-4 py-3 border-b border-outline-variant/30">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded bg-surface/40 flex items-center justify-center neo-flat">
            <span className="material-symbols-outlined text-accent-pink" style={{ fontSize: 18 }}>
              auto_fix_high
            </span>
          </div>
          <div>
            <h2 className="font-headline-md text-headline-md solar-text filigree-header ml-6 cursor-default">
              Effect Library
            </h2>
            <p className="font-label-sm text-label-sm text-on-surface-variant opacity-60 pl-6">
              Browse & apply effects
            </p>
          </div>
        </div>
      </div>

      <SearchBar />
      <CategoryAccordion />
    </div>
  );
}
