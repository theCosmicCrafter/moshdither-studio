import SearchBar from "./SearchBar";
import CategoryTabs from "./CategoryTabs";
import EffectList from "./EffectList";
import { Sparkles } from "lucide-react";

export default function EffectBrowser() {
  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div
        className="flex items-center gap-2 px-3 py-2"
        style={{ borderBottom: "1px solid var(--border-primary)" }}
      >
        <Sparkles size={13} style={{ color: "var(--accent)" }} />
        <span
          className="text-[11px] font-bold tracking-widest uppercase"
          style={{ color: "var(--text-muted)" }}
        >
          Effect Library
        </span>
      </div>

      <SearchBar />
      <CategoryTabs />
      <EffectList />
    </div>
  );
}
