import * as React from "react";
import { getCommands, fuzzyMatch, type Command } from "../../utils/commands";

export const CommandPalette: React.FC = () => {
  const [open, setOpen] = React.useState(false);
  const [query, setQuery] = React.useState("");
  const [selectedIndex, setSelectedIndex] = React.useState(0);
  const inputRef = React.useRef<HTMLInputElement>(null);

  const commands = React.useMemo(() => {
    const all = getCommands();
    if (!query.trim()) return all;
    return all
      .map((cmd) => ({ cmd, score: fuzzyMatch(query, `${cmd.label} ${cmd.category}`) }))
      .filter((r) => r.score > 0)
      .sort((a, b) => b.score - a.score)
      .map((r) => r.cmd);
  }, [query]);

  React.useEffect(() => {
    setSelectedIndex(0);
  }, [query]);

  React.useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.shiftKey && e.key.toLowerCase() === "p") {
        e.preventDefault();
        setOpen((prev) => !prev);
        setQuery("");
      }
      if (e.key === "Escape") {
        setOpen(false);
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, []);

  React.useEffect(() => {
    if (open && inputRef.current) {
      inputRef.current.focus();
    }
  }, [open]);

  const execute = (cmd: Command) => {
    setOpen(false);
    setQuery("");
    cmd.action();
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setSelectedIndex((i) => Math.min(i + 1, commands.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setSelectedIndex((i) => Math.max(i - 1, 0));
    } else if (e.key === "Enter") {
      e.preventDefault();
      if (commands[selectedIndex]) {
        execute(commands[selectedIndex]);
      }
    } else if (e.key === "Escape") {
      setOpen(false);
    }
  };

  if (!open) return null;

  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 9998,
        display: "flex",
        alignItems: "flex-start",
        justifyContent: "center",
        paddingTop: "15vh",
        background: "rgba(0,0,0,0.5)",
      }}
      onClick={() => setOpen(false)}
    >
      <div
        style={{
          width: 560,
          maxWidth: "90vw",
          background: "var(--surface-elevated, #14141a)",
          border: "1px solid var(--border-subtle, rgba(255,255,255,0.08))",
          borderRadius: 12,
          boxShadow: "0 24px 64px rgba(0,0,0,0.5)",
          overflow: "hidden",
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <input
          ref={inputRef}
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="Type a command..."
          style={{
            width: "100%",
            padding: "16px 20px",
            background: "transparent",
            border: "none",
            outline: "none",
            color: "var(--text-primary, #e8e8ed)",
            fontSize: 16,
            caretColor: "var(--accent-primary, #0a84ff)",
          }}
        />
        <div style={{ maxHeight: 320, overflowY: "auto" }}>
          {commands.length === 0 && (
            <div
              style={{
                padding: 24,
                textAlign: "center",
                color: "var(--text-secondary, #a0a0b0)",
                fontSize: 14,
              }}
            >
              No commands found
            </div>
          )}
          {commands.map((cmd, i) => (
            <button
              key={cmd.id}
              onClick={() => execute(cmd)}
              style={{
                width: "100%",
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                padding: "10px 20px",
                background: i === selectedIndex ? "rgba(255,255,255,0.06)" : "transparent",
                border: "none",
                color: "var(--text-primary, #e8e8ed)",
                cursor: "pointer",
                textAlign: "left",
                fontSize: 14,
              }}
              onMouseEnter={() => setSelectedIndex(i)}
            >
              <span>
                <span style={{ opacity: 0.5, marginRight: 8, fontSize: 12 }}>
                  {cmd.category}
                </span>
                {cmd.label}
              </span>
              {cmd.shortcut && (
                <kbd
                  style={{
                    padding: "2px 6px",
                    background: "rgba(255,255,255,0.08)",
                    borderRadius: 4,
                    fontSize: 11,
                    fontFamily: "monospace",
                    color: "var(--text-secondary, #a0a0b0)",
                  }}
                >
                  {cmd.shortcut}
                </kbd>
              )}
            </button>
          ))}
        </div>
        <div
          style={{
            padding: "8px 16px",
            borderTop: "1px solid var(--border-subtle, rgba(255,255,255,0.05))",
            fontSize: 11,
            color: "var(--text-secondary, #a0a0b0)",
            display: "flex",
            gap: 12,
          }}
        >
          <span>↑↓ to navigate</span>
          <span>↵ to execute</span>
          <span>esc to close</span>
        </div>
      </div>
    </div>
  );
};
