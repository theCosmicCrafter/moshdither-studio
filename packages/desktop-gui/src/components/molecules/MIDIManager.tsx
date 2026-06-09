import React, { useState, useCallback } from "react";
import { useMIDI } from "../../hooks/useMIDI";
import { useStudio } from "../../context/StudioContext";
import { Music, Plus, Trash2 } from "lucide-react";

export const MIDIManager: React.FC = () => {
  const { setActiveEffects } = useStudio();

  const handleParameterChange = useCallback(
    (effectId: string, paramName: string, value: number) => {
      setActiveEffects((prev) =>
        prev.map((fx) =>
          fx.id === effectId
            ? { ...fx, params: { ...fx.params, [paramName]: value } }
            : fx
        )
      );
    },
    [setActiveEffects]
  );

  const { ready, devices, mappings, addMapping, removeMapping } = useMIDI(handleParameterChange);
  const [showAdd, setShowAdd] = useState(false);
  const [newMapping, setNewMapping] = useState({
    effectId: "",
    paramName: "",
    channel: 0,
    controller: 0,
    minValue: 0,
    maxValue: 1,
  });

  if (!ready) {
    return (
      <div className="midi-manager">
        <div className="midi-manager__header">
          <Music size={16} />
          <span>MIDI</span>
        </div>
        <div className="midi-manager__body">
          Web MIDI API not available or no devices found.
        </div>
      </div>
    );
  }

  return (
    <div className="midi-manager">
      <div className="midi-manager__header">
        <Music size={16} />
        <span>MIDI</span>
        <button className="midi-manager__add-btn" onClick={() => setShowAdd(!showAdd)} title="Add MIDI mapping">
          <Plus size={14} />
        </button>
      </div>

      <div className="midi-manager__devices">
        {devices.map((d) => (
          <span key={d.id} className="midi-manager__device">
            {d.name}
          </span>
        ))}
      </div>

      {showAdd && (
        <div className="midi-manager__form">
          <input
            className="midi-manager__input"
            placeholder="Effect ID"
            value={newMapping.effectId}
            onChange={(e) => setNewMapping({ ...newMapping, effectId: e.target.value })}
          />
          <input
            className="midi-manager__input"
            placeholder="Param Name"
            value={newMapping.paramName}
            onChange={(e) => setNewMapping({ ...newMapping, paramName: e.target.value })}
          />
          <div className="midi-manager__row">
            <label htmlFor="midi-cc">CC</label>
            <input
              id="midi-cc"
              className="midi-manager__num"
              type="number"
              min={0}
              max={127}
              value={newMapping.controller}
              onChange={(e) => setNewMapping({ ...newMapping, controller: parseInt(e.target.value) || 0 })}
              title="MIDI controller number"
            />
          </div>
          <button
            className="midi-manager__confirm"
            onClick={() => {
              addMapping(newMapping);
              setShowAdd(false);
            }}
          >
            Add Mapping
          </button>
        </div>
      )}

      <div className="midi-manager__mappings">
        {mappings.length === 0 && (
          <div className="midi-manager__empty">No CC mappings</div>
        )}
        {mappings.map((m) => (
          <div key={`${m.channel}-${m.controller}`} className="midi-manager__mapping">
            <span>
              CC {m.controller} → {m.effectId}.{m.paramName}
            </span>
            <button
              className="midi-manager__remove"
              onClick={() => removeMapping(m.channel, m.controller)}
              title="Remove mapping"
            >
              <Trash2 size={12} />
            </button>
          </div>
        ))}
      </div>
    </div>
  );
};
