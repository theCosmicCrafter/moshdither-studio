import * as React from "react";
import { useStudio } from "../../context/StudioContext";
import { Button } from "../atoms/Button";

interface Preset {
  label: string;
  format: "same" | "png" | "jpg" | "gif" | "mp4";
  fps: number;
}

const PRESETS: Preset[] = [
  { label: "YouTube 4K", format: "mp4", fps: 60 },
  { label: "Instagram Reel", format: "mp4", fps: 30 },
  { label: "GIF Meme", format: "gif", fps: 15 },
  { label: "ProRes Master", format: "mp4", fps: 60 },
  { label: "Web Optimized", format: "mp4", fps: 30 },
];

export const ExportPresets: React.FC = () => {
  const { setExportFormat, setExportFps, addToast } = useStudio();
  const [open, setOpen] = React.useState(false);

  const apply = (preset: Preset) => {
    setExportFormat(preset.format);
    setExportFps(preset.fps);
    addToast(`Preset applied: ${preset.label}`, "info");
    setOpen(false);
  };

  return (
    <div className="export-presets">
      <Button variant="glass" onClick={() => setOpen(!open)} style={{ width: "100%" }}>
        Export Presets
      </Button>
      {open && (
        <div className="export-presets__dropdown">
          {PRESETS.map((p) => (
            <button
              key={p.label}
              onClick={() => apply(p)}
              className="export-presets__item"
            >
              {p.label} — {p.format.toUpperCase()} @ {p.fps}fps
            </button>
          ))}
        </div>
      )}
    </div>
  );
};
