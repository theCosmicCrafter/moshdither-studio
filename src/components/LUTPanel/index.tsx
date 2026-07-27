import { useAppStore } from "../../store";
import { LUT_PRESETS, loadCustomLUT } from "../../engine/lut/loader";
import { open } from "@tauri-apps/plugin-dialog";
import { invoke } from "@tauri-apps/api/core";
import { isTauriAvailable } from "../../lib/browserFallback";

export default function LUTPanel() {
  const addLUTEffect = useAppStore((s) => s.addLUTEffect);
  const setStatusMessage = useAppStore((s) => s.setStatusMessage);

  const handleApply = (url: string, name: string) => {
    addLUTEffect(url);
    setStatusMessage(`LUT applied: ${name}`);
  };

  const handleCustom = async () => {
    if (!isTauriAvailable()) {
      setStatusMessage("Custom LUTs require the desktop app.");
      return;
    }
    const selected = await open({
      multiple: false,
      filters: [
        { name: "LUT", extensions: ["png", "cube"] },
        { name: "All Files", extensions: ["*"] },
      ],
    });
    if (!selected || Array.isArray(selected)) return;

    try {
      // Copy the user-selected LUT into the app's allowed temporary directory so
      // the webview can preview it through the asset protocol.
      const preparedPath = (await invoke("prepare_custom_lut", { path: selected })) as string;
      const { previewUrl, filePath } = await loadCustomLUT(preparedPath);
      addLUTEffect(previewUrl, filePath);
      setStatusMessage(`Custom LUT loaded: ${preparedPath.split(/[/\\]/).pop()}`);
    } catch (err) {
      setStatusMessage(
        `Custom LUT failed: ${err instanceof Error ? err.message : String(err)}`,
      );
    }
  };

  return (
    <div className="flex flex-col h-full bg-transparent">
      {/* Header */}
      <div className="flex items-center px-4 py-3 border-b border-outline-variant/30">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded bg-surface/40 flex items-center justify-center neo-flat">
            <span className="material-symbols-outlined text-accent-pink" style={{ fontSize: 18 }}>
              palette
            </span>
          </div>
          <div>
            <h2 className="font-headline-md text-headline-md solar-text filigree-header ml-6 cursor-default">
              LUT Library
            </h2>
            <p className="font-label-sm text-label-sm text-on-surface-variant opacity-60 pl-6">
              {LUT_PRESETS.length} looks available
            </p>
          </div>
        </div>
      </div>

      {/* Custom LUT */}
      <div className="px-2 pt-2">
        <button
          onClick={handleCustom}
          className="w-full text-left px-3 py-2 rounded-lg font-body-sm text-body-sm text-on-surface hover:bg-surface/60 hover:text-accent-teal transition-colors active:scale-[0.98] duration-100 border border-outline-variant/10 flex items-center gap-2"
          title="Load a custom .png or .cube LUT"
        >
          <span className="material-symbols-outlined" style={{ fontSize: 16 }}>
            folder_open
          </span>
          Load Custom LUT…
        </button>
        <p className="mt-2 px-1 text-label-sm text-on-surface-variant opacity-70 leading-relaxed">
          Click above to import a custom LUT. Supports 512×512 PNG LUTs and standard
          Adobe / Resolve .cube 3D LUTs. Bundled presets live in{" "}
          <code className="bg-surface/40 px-1 rounded">public/lut/</code> for dev builds
          and <code className="bg-surface/40 px-1 rounded">resources/lut/</code> for
          production installers.
        </p>
      </div>

      {/* LUT list */}
      <div className="flex-1 overflow-y-auto custom-scrollbar px-2 py-2 space-y-1">
        {LUT_PRESETS.map((preset) => (
          <button
            key={preset.url}
            onClick={() => handleApply(preset.url, preset.name)}
            className="w-full text-left px-3 py-2 rounded-lg font-body-sm text-body-sm text-on-surface hover:bg-surface/60 hover:text-accent-teal transition-colors active:scale-[0.98] duration-100 border border-outline-variant/10"
            title={preset.name}
          >
            {preset.name}
          </button>
        ))}
      </div>
    </div>
  );
}
