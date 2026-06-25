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
      <input
        type="text"
        value={query}
        onChange={(e) => setSearchQuery(e.target.value)}
        placeholder="Search effects..."
        className="w-full text-label-sm font-label-sm rounded-lg pl-8 pr-7 py-1.5 outline-none transition-all neo-flat text-on-surface"
        onFocus={(e) => {
          e.currentTarget.style.boxShadow = "0 0 10px rgba(255,173,224,0.3), 0 0 20px rgba(184,211,0,0.15)";
        }}
        onBlur={(e) => {
          e.currentTarget.style.boxShadow = "";
        }}
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
