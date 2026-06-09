import React, { useState } from "react";
import { usePlugins } from "../../hooks/usePlugins";
import { Puzzle, Trash2, Power, Plus } from "lucide-react";

export const PluginManager: React.FC = () => {
  const { plugins, loadPlugin, unloadPlugin, togglePlugin } = usePlugins();
  const [showAdd, setShowAdd] = useState(false);
  const [jsonInput, setJsonInput] = useState("");

  const handleAdd = async () => {
    try {
      const manifest = JSON.parse(jsonInput);
      await loadPlugin(manifest);
      setJsonInput("");
      setShowAdd(false);
    } catch (e) {
      alert("Invalid manifest JSON: " + (e as Error).message);
    }
  };

  return (
    <div className="plugin-manager">
      <div className="plugin-manager__header">
        <Puzzle size={16} />
        <span>Plugins</span>
        <button className="plugin-manager__add-btn" onClick={() => setShowAdd(!showAdd)} title="Add plugin">
          <Plus size={14} />
        </button>
      </div>

      {showAdd && (
        <div className="plugin-manager__add-panel">
          <textarea
            className="plugin-manager__textarea"
            placeholder="Paste plugin manifest JSON..."
            value={jsonInput}
            onChange={(e) => setJsonInput(e.target.value)}
            rows={6}
          />
          <button className="plugin-manager__confirm-btn" onClick={handleAdd}>
            Load Plugin
          </button>
        </div>
      )}

      <div className="plugin-manager__list">
        {plugins.length === 0 && (
          <div className="plugin-manager__empty">No plugins loaded</div>
        )}
        {plugins.map((p) => (
          <div key={p.id} className={`plugin-manager__item ${p.enabled ? "" : "disabled"}`}>
            <div className="plugin-manager__info">
              <span className="plugin-manager__name">{p.manifest.name}</span>
              <span className="plugin-manager__version">v{p.manifest.version}</span>
            </div>
            <div className="plugin-manager__actions">
              <button
                className="plugin-manager__toggle"
                onClick={() => togglePlugin(p.id, !p.enabled)}
                title={p.enabled ? "Disable" : "Enable"}
              >
                <Power size={14} />
              </button>
              <button
                className="plugin-manager__remove"
                onClick={() => unloadPlugin(p.id)}
                title="Unload"
              >
                <Trash2 size={14} />
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};
