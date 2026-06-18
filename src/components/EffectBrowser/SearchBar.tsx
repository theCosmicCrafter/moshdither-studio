import { Search, X } from "lucide-react";
import { useAppStore } from "../../store";

export default function SearchBar() {
  const query = useAppStore((s) => s.searchQuery);
  const setSearchQuery = useAppStore((s) => s.setSearchQuery);

  return (
    <div className="relative px-3 py-2">
      <Search
        size={13}
        className="absolute left-5 top-1/2 -translate-y-1/2"
        style={{ color: "var(--text-dim)" }}
      />
      <input
        type="text"
        value={query}
        onChange={(e) => setSearchQuery(e.target.value)}
        placeholder="Search effects..."
        className="w-full text-xs rounded-md pl-8 pr-7 py-1.5 outline-none transition-all"
        style={{
          background: "var(--bg-input)",
          border: "1px solid var(--border-secondary)",
          color: "var(--text-primary)",
          fontFamily: "var(--font-display)",
        }}
        onFocus={(e) => {
          e.currentTarget.style.borderColor = "var(--border-active)";
          e.currentTarget.style.boxShadow = "0 0 8px var(--border-glow)";
        }}
        onBlur={(e) => {
          e.currentTarget.style.borderColor = "var(--border-secondary)";
          e.currentTarget.style.boxShadow = "none";
        }}
      />
      {query && (
        <button
          onClick={() => setSearchQuery("")}
          className="absolute right-5 top-1/2 -translate-y-1/2"
          style={{ color: "var(--text-muted)" }}
        >
          <X size={13} />
        </button>
      )}
    </div>
  );
}
