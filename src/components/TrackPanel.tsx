import { useAppStore, type BlendMode } from "../store";

const BLEND_MODES: BlendMode[] = [
  "normal",
  "multiply",
  "screen",
  "overlay",
  "darken",
  "lighten",
  "color-dodge",
  "color-burn",
  "hard-light",
  "soft-light",
  "difference",
  "exclusion",
];

export default function TrackPanel() {
  const tracks = useAppStore((s) => s.tracks);
  const activeTrackId = useAppStore((s) => s.activeTrackId);
  const addTrack = useAppStore((s) => s.addTrack);
  const removeTrack = useAppStore((s) => s.removeTrack);
  const renameTrack = useAppStore((s) => s.renameTrack);
  const setActiveTrack = useAppStore((s) => s.setActiveTrack);
  const setTrackVisible = useAppStore((s) => s.setTrackVisible);
  const setTrackOpacity = useAppStore((s) => s.setTrackOpacity);
  const setTrackBlendMode = useAppStore((s) => s.setTrackBlendMode);
  const moveTrack = useAppStore((s) => s.moveTrack);

  return (
    <div className="flex flex-col gap-1 p-2">
      <div className="flex items-center justify-between mb-1">
        <span className="font-label-sm text-label-sm text-on-surface-variant">
          Tracks ({tracks.length})
        </span>
        <button
          onClick={() => addTrack()}
          className="neo-btn rounded-md px-2 py-0.5 font-label-sm text-label-sm text-accent-cyan hover:text-accent-pink transition-colors"
        >
          + Add
        </button>
      </div>

      {tracks.length === 0 && (
        <div className="font-body-sm text-body-sm text-on-surface-variant opacity-60 py-2 text-center">
          No tracks. Click &quot;Add&quot; to create one.
        </div>
      )}

      {tracks.map((track, index) => (
        <div
          key={track.id}
          className={`flex flex-col gap-1 p-2 rounded border transition-colors ${
            activeTrackId === track.id
              ? "border-accent-cyan bg-accent-cyan/10"
              : "border-surface-variant/30"
          }`}
          onClick={() => setActiveTrack(track.id)}
        >
          <div className="flex items-center gap-1">
            <input
              type="checkbox"
              checked={track.visible}
              onChange={(e) => setTrackVisible(track.id, e.target.checked)}
              onClick={(e) => e.stopPropagation()}
            />
            <input
              type="text"
              value={track.name}
              onChange={(e) => renameTrack(track.id, e.target.value)}
              onClick={(e) => e.stopPropagation()}
              className="flex-1 bg-transparent font-label-sm text-label-sm text-on-surface outline-none border-b border-transparent focus:border-accent-cyan"
            />
            <button
              onClick={(e) => {
                e.stopPropagation();
                moveTrack(index, Math.max(0, index - 1));
              }}
              disabled={index === 0}
              className="neo-btn rounded-md px-1 py-0.5 text-xs disabled:opacity-30"
            >
              ↑
            </button>
            <button
              onClick={(e) => {
                e.stopPropagation();
                moveTrack(index, Math.min(tracks.length - 1, index + 1));
              }}
              disabled={index === tracks.length - 1}
              className="neo-btn rounded-md px-1 py-0.5 text-xs disabled:opacity-30"
            >
              ↓
            </button>
            <button
              onClick={(e) => {
                e.stopPropagation();
                removeTrack(track.id);
              }}
              className="neo-btn rounded-md px-1 py-0.5 text-xs text-accent-pink"
            >
              ✕
            </button>
          </div>

          <div className="flex items-center gap-2">
            <label className="font-label-sm text-label-sm text-on-surface-variant whitespace-nowrap">
              Opacity: {Math.round(track.opacity * 100)}%
            </label>
            <input
              type="range"
              min={0}
              max={1}
              step={0.05}
              value={track.opacity}
              onChange={(e) => setTrackOpacity(track.id, Number(e.target.value))}
              onClick={(e) => e.stopPropagation()}
              className="flex-1"
            />
          </div>

          <div className="flex items-center gap-2">
            <label className="font-label-sm text-label-sm text-on-surface-variant whitespace-nowrap">
              Blend:
            </label>
            <select
              value={track.blendMode}
              onChange={(e) => setTrackBlendMode(track.id, e.target.value as BlendMode)}
              onClick={(e) => e.stopPropagation()}
              className="flex-1 bg-surface font-label-sm text-label-sm text-on-surface rounded border border-surface-variant/30 px-1 py-0.5"
            >
              {BLEND_MODES.map((mode) => (
                <option key={mode} value={mode}>
                  {mode}
                </option>
              ))}
            </select>
          </div>
        </div>
      ))}
    </div>
  );
}
