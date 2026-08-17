import { useAppStore } from "../store";
import { generateProxy } from "../lib/tauri";
import LabeledSlider from "./LabeledSlider";

export default function ProxyPanel() {
  const proxyEnabled = useAppStore((s) => s.proxyEnabled);
  const proxyPath = useAppStore((s) => s.proxyPath);
  const proxyMaxWidth = useAppStore((s) => s.proxyMaxWidth);
  const proxyCrf = useAppStore((s) => s.proxyCrf);
  const proxyGenerating = useAppStore((s) => s.proxyGenerating);
  const filePath = useAppStore((s) => s.filePath);
  const setProxyEnabled = useAppStore((s) => s.setProxyEnabled);
  const setProxyPath = useAppStore((s) => s.setProxyPath);
  const setProxyMaxWidth = useAppStore((s) => s.setProxyMaxWidth);
  const setProxyCrf = useAppStore((s) => s.setProxyCrf);
  const setProxyGenerating = useAppStore((s) => s.setProxyGenerating);
  const setStatusMessage = useAppStore((s) => s.setStatusMessage);

  const handleGenerate = async () => {
    if (!filePath) {
      setStatusMessage("Load media first to generate proxy");
      return;
    }
    setProxyGenerating(true);
    setStatusMessage("Generating proxy...");
    try {
      const result = await generateProxy(filePath, proxyMaxWidth, proxyCrf);
      setProxyPath(result);
      setProxyEnabled(true);
      setStatusMessage("Proxy ready");
    } catch (e) {
      setStatusMessage(`Proxy failed: ${e}`);
    } finally {
      setProxyGenerating(false);
    }
  };

  return (
    <div className="flex flex-col gap-2 p-2">
      <label className="flex items-center gap-2 font-label-md text-label-md text-on-surface-variant">
        <input
          type="checkbox"
          checked={proxyEnabled}
          onChange={(e) => setProxyEnabled(e.target.checked)}
          disabled={!proxyPath}
        />
        Use Proxy
      </label>

      <LabeledSlider
        layout="stacked"
        label="Max Width"
        value={proxyMaxWidth}
        min={320}
        max={1920}
        step={160}
        onChange={setProxyMaxWidth}
        unit="px"
      />

      <LabeledSlider
        layout="stacked"
        label="Quality (CRF)"
        value={proxyCrf}
        min={18}
        max={40}
        step={1}
        onChange={setProxyCrf}
      />

      <button
        onClick={handleGenerate}
        disabled={proxyGenerating || !filePath}
        className="neo-btn rounded-md px-3 py-1.5 font-label-md text-label-md text-accent-cyan hover:text-accent-pink transition-colors disabled:opacity-50"
      >
        {proxyGenerating ? "Generating..." : "Generate Proxy"}
      </button>

      {proxyPath && (
        <div className="font-code-sm text-code-sm text-on-surface-variant truncate">
          Proxy: {proxyPath.split(/[\\/]/).pop()}
        </div>
      )}
    </div>
  );
}
