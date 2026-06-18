import { useState } from "react";
import { usePresets } from "../../hooks/usePresets";
import { Save, FolderOpen, Trash2, Bookmark } from "lucide-react";

export default function PresetPanel() {
  const { presets, savePreset, loadPreset, deletePreset } = usePresets();
  const [name, setName] = useState("");

  const handleSave = () => {
    savePreset(name);
    setName("");
  };

  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        gap: 8,
        padding: 12,
        background: "#1a1a1a",
        borderRadius: 6,
        minWidth: 220,
        maxWidth: 280,
        color: "#e0e0e0",
        fontSize: 12,
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
        <Bookmark size={14} />
        <span style={{ fontWeight: 600, fontSize: 13 }}>Presets</span>
      </div>

      {/* Save new */}
      <div style={{ display: "flex", gap: 4 }}>
        <input
          aria-label="Preset name"
          type="text"
          placeholder="Preset name..."
          value={name}
          onChange={(e) => setName(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && handleSave()}
          style={{
            flex: 1,
            padding: "4px 6px",
            fontSize: 11,
            borderRadius: 3,
            border: "1px solid #444",
            background: "#222",
            color: "#ddd",
            outline: "none",
          }}
        />
        <button
          onClick={handleSave}
          title="Save preset"
          style={{
            padding: "4px 8px",
            fontSize: 11,
            borderRadius: 3,
            border: "none",
            background: "#2a6f3c",
            color: "#fff",
            cursor: "pointer",
            display: "flex",
            alignItems: "center",
            gap: 2,
          }}
        >
          <Save size={12} />
          Save
        </button>
      </div>

      {/* Preset list */}
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          gap: 3,
          maxHeight: 160,
          overflowY: "auto",
        }}
      >
        {presets.length === 0 ? (
          <div style={{ color: "#666", textAlign: "center", padding: "8px 0", fontSize: 11 }}>
            No saved presets
          </div>
        ) : (
          presets.map((preset) => (
            <div
              key={preset.id}
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                padding: "4px 6px",
                borderRadius: 3,
                background: "#222",
              }}
            >
              <span
                style={{
                  overflow: "hidden",
                  textOverflow: "ellipsis",
                  whiteSpace: "nowrap",
                  flex: 1,
                  fontSize: 11,
                }}
                title={preset.name}
              >
                {preset.name}
              </span>
              <div style={{ display: "flex", gap: 2 }}>
                <button
                  onClick={() => loadPreset(preset)}
                  title="Load preset"
                  style={{
                    padding: "2px 4px",
                    fontSize: 10,
                    borderRadius: 2,
                    border: "none",
                    background: "transparent",
                    color: "#6cf",
                    cursor: "pointer",
                  }}
                >
                  <FolderOpen size={12} />
                </button>
                <button
                  onClick={() => deletePreset(preset.id)}
                  title="Delete preset"
                  style={{
                    padding: "2px 4px",
                    fontSize: 10,
                    borderRadius: 2,
                    border: "none",
                    background: "transparent",
                    color: "#f44",
                    cursor: "pointer",
                  }}
                >
                  <Trash2 size={12} />
                </button>
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
