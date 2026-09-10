import { useCallback, useEffect, useState } from "react";
import { listen } from "@tauri-apps/api/event";
import { sam3AddonInstall, sam3AddonStatus, type Sam3AddonStatus } from "../lib/tauri";
import { useAppStore } from "../store";

interface AddonProgress {
  stage: string;
  detail: string;
  percent: number;
  received_bytes: number;
  total_bytes: number;
}

function gb(bytes: number): string {
  return `${(bytes / 1_000_000_000).toFixed(1)} GB`;
}

/**
 * First-run setup for SAM3.
 *
 * SAM3 needs ~6 GB across two files that cannot live in the installer — no
 * Windows installer format accepts a file over 2 GiB, and both of these exceed
 * it. So this panel exists to explain that, take the licence acceptance the SAM
 * License requires, and run the download.
 *
 * The licence step is not decoration. The SAM License is accepted by use
 * ("By using or distributing any portion or element of the SAM Materials, you
 * agree to be bound by this Agreement"), so the user has to be shown it before
 * the weights land on their disk, not after.
 */
export default function Sam3Setup({ onReady }: { onReady?: () => void }) {
  const [status, setStatus] = useState<Sam3AddonStatus | null>(null);
  const [accepted, setAccepted] = useState(false);
  const [installing, setInstalling] = useState(false);
  const [progress, setProgress] = useState<AddonProgress | null>(null);
  const [error, setError] = useState<string | null>(null);
  const setStatusMessage = useAppStore((s) => s.setStatusMessage);

  const refresh = useCallback(async () => {
    try {
      setStatus(await sam3AddonStatus());
    } catch {
      // A status probe that fails is not worth a banner; the install button
      // will report the real problem if the user tries.
      setStatus(null);
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  useEffect(() => {
    let unlisten: (() => void) | undefined;
    let cancelled = false;
    void listen<AddonProgress>("sam3-addon-progress", (e) => {
      setProgress(e.payload);
    }).then((fn) => {
      // The component can unmount before listen() resolves; without this the
      // listener leaks and keeps setting state on a dead component.
      if (cancelled) fn();
      else unlisten = fn;
    });
    return () => {
      cancelled = true;
      if (unlisten) unlisten();
    };
  }, []);

  const install = useCallback(async () => {
    setInstalling(true);
    setError(null);
    setProgress(null);
    try {
      const next = await sam3AddonInstall();
      setStatus(next);
      if (next.ready) {
        setStatusMessage("SAM3 is installed and ready.");
        onReady?.();
      }
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      setError(msg);
      setStatusMessage(`SAM3 setup failed: ${msg}`, "error");
    } finally {
      setInstalling(false);
    }
  }, [onReady, setStatusMessage]);

  if (status?.dev_override) {
    return (
      <div className="flex flex-col gap-1 py-2 font-body-sm text-body-sm text-[var(--text-muted)]">
        <span>Using the developer interpreter set by MOSHDITHER_SAM3_PYTHON.</span>
        <code className="break-all opacity-70">{status.dev_override}</code>
      </div>
    );
  }

  const needSidecar = !status?.sidecar_installed;
  const needCheckpoint = !status?.checkpoint_installed;

  return (
    <div className="flex flex-col gap-3 py-2">
      <div className="font-body-sm text-body-sm text-[var(--text-muted)]">
        <p className="mb-2">
          AI segmentation needs a one-time download of about 6 GB — the inference
          engine and Meta&apos;s SAM&nbsp;3 model. They are too large to include in
          the installer, so they are fetched only if you want them.
        </p>
        <ul className="list-disc pl-5 space-y-0.5">
          <li>
            Segmentation engine — {needSidecar ? "not installed" : "installed"}
            {status?.sidecar_bytes ? ` (${gb(status.sidecar_bytes)})` : ""}
          </li>
          <li>
            Model weights — {needCheckpoint ? "not installed" : "installed"}
            {status?.checkpoint_bytes ? ` (${gb(status.checkpoint_bytes)})` : ""}
          </li>
        </ul>

        <div className="mt-2 p-2 rounded border border-[var(--outline-variant)] bg-[var(--surface-container-low)] text-xs text-[var(--text-secondary)] flex flex-col gap-1">
          <div className="flex items-center gap-1.5 font-medium text-[var(--text-primary)]">
            <span className="material-symbols-outlined text-sm text-[var(--cat-analog,#d4a017)]">
              info
            </span>
            Hardware Requirement
          </div>
          <div>
            AI segmentation requires an <strong>NVIDIA GPU with CUDA support</strong> (6&nbsp;GB+ VRAM recommended) and ~15&nbsp;GB of free disk space for download and temporary model expansion. CPU-only systems and integrated graphics are not supported.
          </div>
        </div>
      </div>

      <label className="flex items-start gap-2 font-body-sm text-body-sm text-[var(--text-muted)]">
        <input
          type="checkbox"
          checked={accepted}
          onChange={(e) => setAccepted(e.target.checked)}
          disabled={installing}
          className="mt-0.5"
        />
        <span>
          I accept the{" "}
          <a
            href="https://huggingface.co/facebook/sam3.1"
            target="_blank"
            rel="noreferrer noopener"
            className="underline text-[var(--accent)]"
          >
            SAM License
          </a>
          , which governs the model. It prohibits military, weapons, nuclear and
          espionage use, and requires compliance with export-control and privacy
          law. The full text is installed with the app in the{" "}
          <code>licenses</code> folder.
        </span>
      </label>

      <button
        type="button"
        onClick={() => void install()}
        disabled={!accepted || installing}
        className="px-3 py-2 rounded font-label-md text-label-md bg-accent text-black font-semibold disabled:opacity-40 disabled:cursor-not-allowed"
      >
        {installing ? "Installing…" : "Download and install SAM3"}
      </button>

      {installing && progress ? (
        <div className="flex flex-col gap-1">
          <div className="h-1.5 w-full rounded bg-surface-container overflow-hidden">
            <div
              className="h-full bg-[var(--accent)] transition-[width] duration-300"
              style={{ width: `${progress.percent}%` }}
            />
          </div>
          <div className="flex justify-between font-body-sm text-body-sm text-[var(--text-muted)]">
            <span>{progress.detail}</span>
            <span>
              {progress.total_bytes > 0
                ? `${gb(progress.received_bytes)} / ${gb(progress.total_bytes)}`
                : ""}
            </span>
          </div>
        </div>
      ) : null}

      {error ? (
        <div className="font-body-sm text-body-sm text-[var(--error,#ff6b6b)] whitespace-pre-wrap">
          {error}
        </div>
      ) : null}
    </div>
  );
}
