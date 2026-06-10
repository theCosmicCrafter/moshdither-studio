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
    <div className="recent-files">
      <div className="recent-files__header">
        <span className="recent-files__title">
          Recent Files
        </span>
        <button
          onClick={() => setOpen(!open)}
          className="recent-files__toggle"
        >
          {open ? "Hide" : "Show"}
        </button>
      </div>
      {open && (
        <div className="recent-files__list">
          {recentFiles.slice(0, 10).map((path) => (
            <button
              key={path}
              onClick={() => {
                setMediaUrl(path);
                addRecentFile(path);
              }}
              title={path}
              className="recent-files__item"
            >
              {basename(path)}
            </button>
          ))}
          <button
            onClick={clearRecentFiles}
            className="recent-files__clear"
          >
            Clear History
          </button>
        </div>
      )}
    </div>
  );
};
