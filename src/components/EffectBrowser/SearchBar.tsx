import { useAppStore } from "../../store";

export default function SearchBar() {
  const query = useAppStore((s) => s.searchQuery);
  const setSearchQuery = useAppStore((s) => s.setSearchQuery);

  return (
    <div className="relative px-3 py-2">
      <span
        className="material-symbols-outlined absolute left-5 top-1/2 -translate-y-1/2 text-on-surface-variant"
        style={{ fontSize: 16 }}
      >
        search
      </span>
      {/* This input carried `outline-none` plus an imperative onFocus/onBlur pair
          that wrote a hard-coded pink/lime box-shadow glow. Together those
          suppressed the app-wide `:focus-visible` ring (index.css) and replaced it
          with colors that ignore the active theme, on `:focus` so it also fired for
          mouse clicks. Both are gone, so this shows the same designed accent ring
          as every other control. */}
      <input
        type="text"
        value={query}
        onChange={(e) => setSearchQuery(e.target.value)}
        placeholder="Search effects..."
        className="w-full text-label-sm font-label-sm rounded-lg pl-8 pr-7 py-1.5 transition neo-flat text-on-surface"
      />
      {query && (
        <button
          onClick={() => setSearchQuery("")}
          className="absolute right-5 top-1/2 -translate-y-1/2 text-on-surface-variant hover:text-accent-pink transition-colors"
        >
          <span className="material-symbols-outlined" style={{ fontSize: 14 }}>close</span>
        </button>
      )}
    </div>
  );
}
