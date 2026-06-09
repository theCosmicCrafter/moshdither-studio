import * as React from "react";
import { useStudio } from "../../context/StudioContext";

export const RecentFiles: React.FC = () => {
  const { recentFiles, setMediaUrl, clearRecentFiles, addRecentFile } = useStudio();
  const [open, setOpen] = React.useState(false);

  if (recentFiles.length === 0) return null;

  const basename = (path: string) => {
    const parts = path.replace(/\\/g, "/").split("/");
    return parts[parts.length - 1] ?? path;
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "6px", marginTop: "8px" }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <span style={{ fontSize: "11px", textTransform: "uppercase", color: "var(--text-secondary)", fontWeight: 600, letterSpacing: "0.05em" }}>
          Recent Files
        </span>
        <button
          onClick={() => setOpen(!open)}
          style={{ fontSize: "10px", color: "var(--accent-primary)", background: "none", border: "none", cursor: "pointer" }}
        >
          {open ? "Hide" : "Show"}
        </button>
      </div>
      {open && (
        <div style={{ display: "flex", flexDirection: "column", gap: "4px" }}>
          {recentFiles.slice(0, 10).map((path) => (
            <button
              key={path}
              onClick={() => {
                setMediaUrl(path);
                addRecentFile(path);
              }}
              title={path}
              style={{
                background: "transparent",
                border: "none",
                color: "var(--text-primary)",
                padding: "6px 8px",
                textAlign: "left",
                cursor: "pointer",
                borderRadius: "var(--radius-sm)",
                fontSize: "12px",
                overflow: "hidden",
                textOverflow: "ellipsis",
                whiteSpace: "nowrap",
              }}
            >
              {basename(path)}
            </button>
          ))}
          <button
            onClick={clearRecentFiles}
            style={{
              background: "none",
              border: "none",
              color: "var(--text-secondary)",
              fontSize: "10px",
              cursor: "pointer",
              textAlign: "left",
              padding: "4px 8px",
            }}
          >
            Clear History
          </button>
        </div>
      )}
    </div>
  );
};
