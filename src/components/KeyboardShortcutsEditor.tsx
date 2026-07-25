import { useEffect, useState } from "react";
import {
  getPresets,
  applyPreset,
  getPreset,
  getAllBindings,
  setBinding,
  resetAllBindings,
  eventToKeyString,
  type ShortcutPreset,
} from "../utils/keyboardShortcuts";
import { getCommands } from "../utils/commands";
import { X, RotateCcw, Check, ChevronDown } from "lucide-react";

interface KeyboardShortcutsEditorProps {
  readonly onClose: () => void;
}

export default function KeyboardShortcutsEditor({ onClose }: KeyboardShortcutsEditorProps) {
  const [selectedPreset, setSelectedPreset] = useState(getPreset());
  const [bindings, setBindings] = useState<Record<string, string>>(getAllBindings());
  const [recordingFor, setRecordingFor] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [showPresets, setShowPresets] = useState(false);

  const commands = getCommands();
  const presets = getPresets();

  const filtered = commands.filter((cmd) => {
    const q = search.toLowerCase();
    return (
      cmd.label.toLowerCase().includes(q) ||
      cmd.category.toLowerCase().includes(q) ||
      cmd.id.toLowerCase().includes(q)
    );
  });

  useEffect(() => {
    if (!recordingFor) return;
    const handler = (e: KeyboardEvent) => {
      e.preventDefault();
      if (e.key === "Escape") {
        setRecordingFor(null);
        return;
      }
      const keyStr = eventToKeyString(e);
      if (keyStr === "") return;
      setBinding(recordingFor, keyStr);
      setBindings(getAllBindings());
      setRecordingFor(null);
    };
    window.addEventListener("keydown", handler, true);
    return () => window.removeEventListener("keydown", handler, true);
  }, [recordingFor]);

  const handlePresetSelect = (preset: ShortcutPreset) => {
    applyPreset(preset.name);
    setSelectedPreset(preset.name);
    setBindings(getAllBindings());
    setShowPresets(false);
  };

  const handleReset = () => {
    resetAllBindings();
    setSelectedPreset("default");
    setBindings(getAllBindings());
  };

  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 9997,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        background: "rgba(0,0,0,0.6)",
      }}
      onClick={onClose}
    >
      <div
        style={{
          width: 600,
          maxWidth: "90vw",
          maxHeight: "80vh",
          background: "var(--surface-elevated, #14141a)",
          border: "1px solid var(--border-subtle, rgba(255,255,255,0.08))",
          borderRadius: 12,
          display: "flex",
          flexDirection: "column",
          overflow: "hidden",
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div
          style={{
            padding: "16px 20px",
            borderBottom: "1px solid var(--border-subtle, rgba(255,255,255,0.08))",
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
          }}
        >
          <h2 style={{ margin: 0, fontSize: 16, fontWeight: 600 }}>Keyboard Shortcuts</h2>
          <button
            onClick={onClose}
            style={{
              background: "transparent",
              border: "none",
              color: "var(--text-secondary, #a0a0b0)",
              cursor: "pointer",
              padding: 4,
              display: "flex",
            }}
          >
            <X size={18} />
          </button>
        </div>

        {/* Toolbar */}
        <div
          style={{
            padding: "12px 20px",
            borderBottom: "1px solid var(--border-subtle, rgba(255,255,255,0.08))",
            display: "flex",
            gap: 12,
            alignItems: "center",
          }}
        >
          {/* Preset selector */}
          <div style={{ position: "relative" }}>
            <button
              onClick={() => setShowPresets(!showPresets)}
              style={{
                padding: "6px 12px",
                background: "rgba(255,255,255,0.06)",
                border: "1px solid var(--border-subtle, rgba(255,255,255,0.1))",
                borderRadius: 6,
                color: "var(--text-primary, #e8e8ed)",
                cursor: "pointer",
                fontSize: 13,
                display: "flex",
                alignItems: "center",
                gap: 6,
              }}
            >
              {presets.find((p) => p.name === selectedPreset)?.label || "Custom"}
              <ChevronDown size={14} />
            </button>
            {showPresets && (
              <div
                style={{
                  position: "absolute",
                  top: "100%",
                  left: 0,
                  marginTop: 4,
                  background: "var(--surface-elevated, #1c1c24)",
                  border: "1px solid var(--border-subtle, rgba(255,255,255,0.1))",
                  borderRadius: 6,
                  zIndex: 10,
                  minWidth: 180,
                }}
              >
                {presets.map((preset) => (
                  <button
                    key={preset.name}
                    onClick={() => handlePresetSelect(preset)}
                    style={{
                      width: "100%",
                      padding: "8px 12px",
                      background: "transparent",
                      border: "none",
                      color: "var(--text-primary, #e8e8ed)",
                      cursor: "pointer",
                      fontSize: 13,
                      textAlign: "left",
                      display: "flex",
                      alignItems: "center",
                      gap: 8,
                    }}
                  >
                    {selectedPreset === preset.name && <Check size={14} />}
                    {preset.label}
                  </button>
                ))}
              </div>
            )}
          </div>

          <button
            onClick={handleReset}
            style={{
              padding: "6px 12px",
              background: "transparent",
              border: "1px solid var(--border-subtle, rgba(255,255,255,0.1))",
              borderRadius: 6,
              color: "var(--text-secondary, #a0a0b0)",
              cursor: "pointer",
              fontSize: 13,
              display: "flex",
              alignItems: "center",
              gap: 6,
            }}
          >
            <RotateCcw size={14} />
            Reset Defaults
          </button>

          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search commands..."
            style={{
              marginLeft: "auto",
              padding: "6px 10px",
              background: "rgba(255,255,255,0.05)",
              border: "1px solid var(--border-subtle, rgba(255,255,255,0.1))",
              borderRadius: 6,
              color: "var(--text-primary, #e8e8ed)",
              fontSize: 13,
              outline: "none",
              width: 160,
            }}
          />
        </div>

        {/* List */}
        <div style={{ overflowY: "auto", flex: 1 }}>
          {filtered.map((cmd) => {
            const binding = bindings[cmd.id];
            const isRecording = recordingFor === cmd.id;
            return (
              <div
                key={cmd.id}
                style={{
                  padding: "10px 20px",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  borderBottom: "1px solid rgba(255,255,255,0.03)",
                }}
              >
                <div>
                  <div style={{ fontSize: 14 }}>{cmd.label}</div>
                  <div style={{ fontSize: 11, color: "var(--text-secondary, #a0a0b0)", marginTop: 2 }}>
                    {cmd.category}
                  </div>
                </div>
                <button
                  onClick={() => setRecordingFor(cmd.id)}
                  style={{
                    padding: "4px 10px",
                    background: isRecording
                      ? "rgba(10,132,255,0.2)"
                      : "rgba(255,255,255,0.06)",
                    border: `1px solid ${isRecording ? "rgba(10,132,255,0.4)" : "var(--border-subtle, rgba(255,255,255,0.1))"}`,
                    borderRadius: 6,
                    color: "var(--text-primary, #e8e8ed)",
                    cursor: "pointer",
                    fontSize: 12,
                    minWidth: 100,
                    textAlign: "center",
                    fontFamily: "monospace",
                  }}
                >
                  {isRecording ? "Press keys..." : binding || "—"}
                </button>
              </div>
            );
          })}
          {filtered.length === 0 && (
            <div style={{ padding: 32, textAlign: "center", color: "var(--text-secondary, #a0a0b0)", fontSize: 14 }}>
              No commands found
            </div>
          )}
        </div>

        {/* Footer hint */}
        <div
          style={{
            padding: "10px 20px",
            borderTop: "1px solid var(--border-subtle, rgba(255,255,255,0.08))",
            fontSize: 11,
            color: "var(--text-secondary, #a0a0b0)",
          }}
        >
          Click a shortcut to record a new binding. Press Escape to cancel.
        </div>
      </div>
    </div>
  );
}
