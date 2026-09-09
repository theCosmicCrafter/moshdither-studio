import { useAppStore } from "../store";
import { generateProxy } from "../lib/tauri";
import { convertFileSrc } from "@tauri-apps/api/core";
import LabeledSlider from "./LabeledSlider";

export default function ProxyPanel() {
  const proxyPath = useAppStore((s) => s.proxyPath);
  const proxyMaxWidth = useAppStore((s) => s.proxyMaxWidth);
  const proxyCrf = useAppStore((s) => s.proxyCrf);
  const proxyGenerating = useAppStore((s) => s.proxyGenerating);
  const filePath = useAppStore((s) => s.filePath);
  const setProxyUrl = useAppStore((s) => s.setProxyUrl);
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
      // Bookkeeping only -- no component subscribes to this any more. The
      // "Use Proxy" checkbox that did is recycled: it could not turn anything
      // off, because the video preview samples the proxy element and has
      // nothing else to sample.
      useAppStore.getState().setProxyEnabled(true);
      // Actually USE it. The panel spawned ffmpeg, waited, wrote a file and
      // stored the path in `proxyPath` -- which nothing reads. The preview
      // renders from `proxyUrl`, set by AppLayout when media loads, so this
      // panel's whole job (generate a lighter clip to scrub against, at the
      // width and quality the user chose) was thrown away every time.
      setProxyUrl(convertFileSrc(result));
      setStatusMessage("Proxy ready — the preview is now using it");
    } catch (e) {
      setStatusMessage(`Proxy failed: ${e}`);
    } finally {
      setProxyGenerating(false);
    }
  };

  return (
    <div className="flex flex-col gap-2 p-2">
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
