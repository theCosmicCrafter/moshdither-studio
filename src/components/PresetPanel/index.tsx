import { useState, useRef, type CSSProperties } from "react";
import { presetMatchesCurrentStack, usePresets } from "../../hooks/usePresets";
import { useAppStore } from "../../store";

export default function PresetPanel() {
  const {
    presets,
    presetsPath,
    savePreset,
    loadPreset,
    deletePreset,
    exportPresets,
    importPresets,
  } = usePresets();
  const [name, setName] = useState("");
  const fileInputRef = useRef<HTMLInputElement>(null);

  // For the CURRENT marker: the live stack + animation state each preset is
  // compared against (see presetMatchesCurrentStack).
  const effectStack = useAppStore((s) => s.effectStack);
  const keyframes = useAppStore((s) => s.keyframes);
  const lfos = useAppStore((s) => s.lfos);
  const ffglitchMode = useAppStore((s) => s.ffglitchMode);

  const handleSave = () => {
    savePreset(name);
    setName("");
  };

  const handleImportClick = () => {
    fileInputRef.current?.click();
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      importPresets(file);
      e.target.value = "";
    }
  };

  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        gap: 8,
        color: "var(--text-primary)",
        fontSize: 12,
        fontFamily: "var(--font-body)",
      }}
    >
      {/* Where the library lives. Presets are a plain JSON file in Documents so
          they can be found, backed up and shared — showing the path is most of
          what makes that useful. */}
      {presetsPath && (
        <div
          title={presetsPath}
          style={{
            fontSize: 10,
            opacity: 0.6,
            overflow: "hidden",
            textOverflow: "ellipsis",
            whiteSpace: "nowrap",
            direction: "rtl",
            textAlign: "left",
          }}
        >
          {presetsPath}
        </div>
      )}

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
            border: "1px solid var(--outline-variant)",
            background: "var(--surface-container-low)",
            color: "var(--text-secondary)",
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
            background: "var(--accent-pink)",
            color: "var(--on-primary)",
            cursor: "pointer",
            display: "flex",
            alignItems: "center",
            gap: 2,
          }}
        >
          <span className="material-symbols-outlined" style={{ fontSize: 12 }}>save</span>
          Save
        </button>
      </div>

      {/* Import / Export */}
      <div style={{ display: "flex", gap: 4 }}>
        <button
          onClick={() => exportPresets()}
          title="Export all presets"
          style={{
            flex: 1,
            padding: "4px 8px",
            fontSize: 11,
            borderRadius: 3,
            border: "1px solid var(--outline-variant)",
            background: "var(--surface-container-low)",
            color: "var(--text-secondary)",
            cursor: "pointer",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            gap: 4,
          }}
        >
          <span className="material-symbols-outlined" style={{ fontSize: 12 }}>download</span>
          Export
        </button>
        <button
          onClick={handleImportClick}
          title="Import presets"
          style={{
            flex: 1,
            padding: "4px 8px",
            fontSize: 11,
            borderRadius: 3,
            border: "1px solid var(--outline-variant)",
            background: "var(--surface-container-low)",
            color: "var(--text-secondary)",
            cursor: "pointer",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            gap: 4,
          }}
        >
          <span className="material-symbols-outlined" style={{ fontSize: 12 }}>upload</span>
          Import
        </button>
        <input
          ref={fileInputRef}
          type="file"
          accept=".json"
          aria-label="Import presets file"
          style={{ display: "none" }}
          onChange={handleFileChange}
        />
      </div>

      {/* Preset list */}
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          gap: 4,
          maxHeight: 200,
          overflowY: "auto",
        }}
      >
        {presets.length === 0 ? (
          <div style={{ color: "var(--text-muted)", textAlign: "center", padding: "8px 0", fontSize: 11 }}>
            No saved presets
          </div>
        ) : (
          presets.map((preset) => {
            const isCurrent = presetMatchesCurrentStack(
              preset,
              effectStack,
              keyframes,
              ffglitchMode,
              lfos
            );
            const animated = preset.stack.some(
              (e) =>
                (e.keyframes && Object.keys(e.keyframes).length > 0) ||
                (e.lfos && Object.keys(e.lfos).length > 0)
            );
            const thumbBox: CSSProperties = {
              width: 56,
              height: 32,
              borderRadius: 2,
              flexShrink: 0,
              border: `1px solid ${isCurrent ? "var(--accent-pink)" : "var(--outline-variant)"}`,
              boxSizing: "border-box",
              overflow: "hidden",
            };
            return (
            <div
              key={preset.id}
              style={{
                display: "flex",
                alignItems: "center",
                gap: 8,
                padding: "4px 6px",
                borderRadius: 3,
                background: "var(--surface-container-low)",
                cursor: "pointer",
              }}
              onClick={() => loadPreset(preset)}
              title={preset.name}
            >
              {preset.thumbnail ? (
                <img
                  src={preset.thumbnail}
                  alt=""
                  style={{ ...thumbBox, objectFit: "cover", display: "block" }}
                />
              ) : (
                // No render captured (old save, import, no-media save) — the
                // flat icon stands in rather than collapsing the row height.
                <div
                  aria-hidden
                  style={{
                    ...thumbBox,
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    color: "var(--text-muted)",
                    background: "var(--surface-container-lowest)",
                  }}
                >
                  <span className="material-symbols-outlined" style={{ fontSize: 14 }}>
                    image
                  </span>
                </div>
              )}
              <div style={{ flex: 1, minWidth: 0 }}>
                <div
                  style={{
                    overflow: "hidden",
                    textOverflow: "ellipsis",
                    whiteSpace: "nowrap",
                    fontSize: 11,
                    color: isCurrent ? "var(--accent-pink)" : "var(--text-primary)",
                  }}
                >
                  {preset.name}
                </div>
                <div
                  style={{
                    display: "flex",
                    gap: 6,
                    fontFamily: "var(--font-mono)",
                    fontSize: 9,
                    color: "var(--text-muted)",
                    marginTop: 2,
                  }}
                >
                  <span>{preset.stack.filter((e) => e.enabled).length} layers</span>
                  {animated && <span style={{ color: "var(--accent-teal)" }}>ANIM</span>}
                  {isCurrent && <span style={{ color: "var(--accent-pink)" }}>CURRENT</span>}
                </div>
              </div>
              <div style={{ display: "flex", gap: 2 }}>
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    loadPreset(preset);
                  }}
                  title="Load preset"
                  style={{
                    padding: "2px 4px",
                    fontSize: 10,
                    borderRadius: 2,
                    border: "none",
                    background: "transparent",
                    color: "var(--accent-teal)",
                    cursor: "pointer",
                  }}
                >
                  <span className="material-symbols-outlined" style={{ fontSize: 12 }}>folder_open</span>
                </button>
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    deletePreset(preset.id);
                  }}
                  title="Delete preset"
                  style={{
                    padding: "2px 4px",
                    fontSize: 10,
                    borderRadius: 2,
                    border: "none",
                    background: "transparent",
                    color: "var(--danger)",
                    cursor: "pointer",
                  }}
                >
                  <span className="material-symbols-outlined" style={{ fontSize: 12 }}>delete</span>
                </button>
              </div>
            </div>
            );
          })
        )}
      </div>
    </div>
  );
}
