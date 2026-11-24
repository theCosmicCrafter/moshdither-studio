import SearchBar from "./SearchBar";
import CategoryAccordion from "./CategoryAccordion";

export default function EffectBrowser() {
  return (
    <div className="flex flex-col h-full bg-transparent">
      {/* Header */}
      <div className="flex items-center px-4 py-3 border-b border-outline-variant/30">
        <div className="flex items-center gap-3">
          <span className="material-symbols-outlined text-accent-pink" style={{ fontSize: 16 }}>
            auto_fix_high
          </span>
          <h2 className="panel-header cursor-default">
            Effect Library
          </h2>
          <span className="font-label-sm text-label-sm text-on-surface-variant">
            browse &amp; apply
          </span>
        </div>
      </div>

      <SearchBar />
      <CategoryAccordion />
    </div>
  );
}
