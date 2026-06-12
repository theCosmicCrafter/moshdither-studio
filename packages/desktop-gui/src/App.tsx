import * as React from 'react';
import { StudioProvider, useStudio } from './context/StudioContext';
import { AudioReactiveProvider } from './context/AudioReactiveContext';
import { Toolbar } from './components/layout/Toolbar';
import { Sidebar } from './components/layout/Sidebar';
import { Viewport } from './components/organisms/Viewport';
import { PropertiesPanel } from './components/layout/PropertiesPanel';
import { Timeline } from './components/Timeline';
import { StudioLayout } from './components/templates/StudioLayout';
import { Toast } from './components/atoms/Toast';
import { RenderModal } from './components/organisms/RenderModal';
import { ErrorBoundary } from './components/templates/ErrorBoundary';
import { NoiseTexture } from './components/atmosphere/NoiseTexture';
import { installRendererCrashReporter } from './utils/rendererCrashReporter';
import { CrashRecoveryDialog } from './components/organisms/CrashRecoveryDialog';
import { CommandPalette } from './components/organisms/CommandPalette';
import { KeyboardShortcutsEditor } from './components/organisms/KeyboardShortcutsEditor';
// AI model preload is now handled via IPC to main process (see menu:preload-model listener)
import { StatusBar } from './components/layout/StatusBar';
import { OnboardingModal } from './components/organisms/OnboardingModal';
import { EnvironmentSetupModal } from './components/organisms/EnvironmentSetupModal';
import { DebugOverlay } from './components/organisms/DebugOverlay';
import { EmptyCanvas } from './components/organisms/EmptyCanvas';
import { loadAutoSave, checkCrashRecovery, dismissCrashRecovery, type SerializedProject } from './utils/autoSave';
import { registerCommand } from './utils/commands';

const AppContent: React.FC = () => {
  const {
    currentTime, duration, setCurrentTime, toasts, removeToast,
    setMediaUrl, mediaUrl, setRenderProgress,
    undo, redo, addToast,
    activeEffects, outputDirectory, exportFormat, exportFps, watermarkSettings,
    setIsRendering, addRenderJob, updateRenderJob,
    setFontSizeScale,
    setHighContrastMode,
    setReducedMotion,
    setColorBlindMode,
  } = useStudio();
  const isBrowser = !window.ipcRenderer;
  const [showRecovery, setShowRecovery] = React.useState(false);
  const [recoveryData, setRecoveryData] = React.useState<SerializedProject | null>(null);
  const [showShortcutsEditor, setShowShortcutsEditor] = React.useState(false);
  const [showEnvSetup, setShowEnvSetup] = React.useState(false);

  // Check environment configuration on mount
  React.useEffect(() => {
    if (isBrowser || !window.ipcRenderer) return;
    window.ipcRenderer.invoke('env:status').then((result) => {
      const status = result as { mode: string };
      if (status.mode === 'unconfigured') {
        setShowEnvSetup(true);
      }
    }).catch(() => {
      // If IPC fails, just let the app start
    });
  }, [isBrowser]);

  // Check for crash recovery on mount
  React.useEffect(() => {
    if (isBrowser || !window.ipcRenderer) return;

    checkCrashRecovery().then((hadCrash) => {
      if (hadCrash) {
        loadAutoSave().then((data) => {
          if (data) {
            setRecoveryData(data);
            setShowRecovery(true);
          } else {
            // No autosave data but crash marker exists — clear it
            dismissCrashRecovery();
          }
        });
      }
    });
  }, [isBrowser]);

  // Listen for native menu events from main process
  React.useEffect(() => {
    if (isBrowser || !window.ipcRenderer) return;

    const handleImport = () => {
      // Trigger the same logic as the Import button
      window.ipcRenderer.invoke('dialog:openMedia').then((filePath: unknown) => {
        if (filePath) {
          setMediaUrl(filePath as string);
        }
      });
    };

    const handleExport = () => {
      if (!mediaUrl) {
        addToast('No media loaded to export.', 'error');
        return;
      }
      // Trigger render pipeline
      addRenderJob({
        name: `Export ${new Date().toLocaleTimeString()}`,
        inputUrl: mediaUrl,
        outputDirectory: outputDirectory || '',
        exportFormat: exportFormat || 'same',
        exportFps: exportFps || 30,
        activeEffects,
        watermarkSettings,
      });
    };

    const removeImport = window.ipcRenderer.on('menu:import', handleImport);
    const removeExport = window.ipcRenderer.on('menu:export', handleExport);
    const removeShortcuts = window.ipcRenderer.on('menu:shortcuts', () => setShowShortcutsEditor(true));
    const removePreload = window.ipcRenderer.on('menu:preload-model', () => {
      addToast('Starting AI Masking model download...', 'info');
      window.ipcRenderer.invoke('sam3:load-model').then((result: unknown) => {
        const r = result as { ok: boolean; error?: string };
        if (r.ok) {
          addToast('AI Masking model ready!', 'success');
        } else {
          addToast('AI Masking model failed to load. Check console for details.', 'error');
        }
      }).catch((err) => {
        console.error('[App] Model preload failed:', err);
        addToast(`AI Masking model error: ${err instanceof Error ? err.message : String(err)}`, 'error');
      });
    });

    return () => {
      removeImport();
      removeExport();
      removeShortcuts();
      removePreload();
    };
  }, [isBrowser]);

  // Auto-preload AI Masking model in background after app startup
  React.useEffect(() => {
    if (isBrowser) return;
    // Delay to not block startup — preload after 3 seconds
    const timer = setTimeout(() => {
      console.log('[App] Auto-preloading AI Masking model in background...');
      window.ipcRenderer.invoke('sam3:load-model').then((result: unknown) => {
        const r = result as { ok: boolean; error?: string };
        console.log('[App] Auto-preload result:', r.ok ? 'ready' : 'failed');
      }).catch((err) => {
        console.warn('[App] Auto-preload error (will retry on first use):', err);
      });
    }, 3000);
    return () => clearTimeout(timer);
  }, [isBrowser]);

  // Listen for main-process WebGL export requests
  React.useEffect(() => {
    if (isBrowser || !window.ipcRenderer) return;

    const handler = async (_event: unknown, ...args: unknown[]) => {
      const payload = args[0] as { inputUrl: string; duration: number; fps: number };
      console.log("[Renderer] WebGL export request received:", payload);
      // Temporarily switch to the input URL so the canvas renders it
      const previousUrl = document.querySelector(".webgl-canvas")?.getAttribute("data-src");
      setMediaUrl(payload.inputUrl);

      // Wait a brief moment for the canvas to load the new media
      await new Promise((res) => setTimeout(res, 800));

      const canvas = document.querySelector(".webgl-canvas") as HTMLCanvasElement | null;
      if (!canvas) {
        console.error("[Renderer] No .webgl-canvas found for export");
        return;
      }

      try {
        const stream = canvas.captureStream(payload.fps);
        const mimeType = MediaRecorder.isTypeSupported("video/webm;codecs=vp9")
          ? "video/webm;codecs=vp9"
          : MediaRecorder.isTypeSupported("video/webm;codecs=vp8")
            ? "video/webm;codecs=vp8"
            : "video/webm";
        const recorder = new MediaRecorder(stream, { mimeType });
        const chunks: Blob[] = [];
        recorder.ondataavailable = (e) => {
          if (e.data && e.data.size > 0) chunks.push(e.data);
        };

        const blob = await new Promise<Blob>((resolve, reject) => {
          recorder.onstop = () => resolve(new Blob(chunks, { type: "video/webm" }));
          recorder.onerror = (e) => reject(e);
          recorder.start(100); // collect 100ms chunks
          setTimeout(() => {
            if (recorder.state !== "inactive") recorder.stop();
          }, payload.duration * 1000);
        });

        const arrayBuffer = await blob.arrayBuffer();
        await window.ipcRenderer.invoke("main:save-webgl-blob", {
          data: arrayBuffer,
          ext: ".webm",
        });
        console.log("[Renderer] WebGL blob sent to main");
      } catch (err) {
        console.error("[Renderer] WebGL export failed:", err);
      } finally {
        // Restore previous media if any
        if (previousUrl) setMediaUrl(previousUrl);
      }
    };

    const unsub = window.ipcRenderer.on("main:webgl-export-request", handler);
    return () => unsub();
  }, [isBrowser, setMediaUrl]);

  // Listen for render pipeline progress updates
  React.useEffect(() => {
    if (isBrowser || !window.ipcRenderer) return;

    const progressHandler = (_event: unknown, ...args: unknown[]) => {
      const payload = args[0] as { percent: number; log: string };
      const timestamp = new Date().toLocaleTimeString();
      setRenderProgress((prev) => ({
        percent: payload.percent,
        logs: [...prev.logs, `[${timestamp}] ${payload.log}`],
      }));
    };

    const unsub = window.ipcRenderer.on("render:progress", progressHandler);
    return () => unsub();
  }, [isBrowser, setRenderProgress]);

  // Install renderer crash reporter (catches window.onerror / unhandled rejections)
  React.useEffect(() => {
    installRendererCrashReporter();
  }, []);

  // Ref to latest studio values so command actions never capture stale closures
  const studioRef = React.useRef({
    mediaUrl, activeEffects, outputDirectory, exportFormat, exportFps, watermarkSettings,
    setMediaUrl, addToast, setIsRendering, addRenderJob, updateRenderJob,
  });
  React.useLayoutEffect(() => {
    studioRef.current = {
      mediaUrl, activeEffects, outputDirectory, exportFormat, exportFps, watermarkSettings,
      setMediaUrl, addToast, setIsRendering, addRenderJob, updateRenderJob,
    };
  });

  // Register commands for the Command Palette
  React.useEffect(() => {
    registerCommand({
      id: "app:open",
      label: "Open Media",
      category: "File",
      action: async () => {
        if (!window.ipcRenderer) {
          addToast("IPC not available. Run inside Electron.", "error");
          return;
        }
        try {
          const url = await window.ipcRenderer.invoke<string | null>("dialog:openMedia");
          if (url) setMediaUrl(url);
        } catch {
          addToast("Failed to open media file.", "error");
        }
      },
    });

    registerCommand({
      id: "app:export",
      label: "Export",
      category: "File",
      action: () => {
        const s = studioRef.current;
        if (!s.mediaUrl) {
          s.addToast("No media loaded to export.", "error");
          return;
        }
        if (!window.ipcRenderer) {
          s.addToast("IPC not available. Run inside Electron.", "error");
          return;
        }
        s.addRenderJob({
          name: `Export ${s.exportFormat.toUpperCase()}`,
          inputUrl: s.mediaUrl,
          activeEffects: s.activeEffects,
          outputDirectory: s.outputDirectory,
          exportFormat: s.exportFormat,
          exportFps: s.exportFps,
          watermarkSettings: s.watermarkSettings,
        });
      },
    });

    registerCommand({ id: "edit:undo", label: "Undo", category: "Edit", shortcut: "Ctrl+Z", action: undo });
    registerCommand({ id: "edit:redo", label: "Redo", category: "Edit", shortcut: "Ctrl+Shift+Z", action: redo });

    registerCommand({
      id: "view:fullscreen",
      label: "Toggle Fullscreen",
      category: "View",
      action: () => {
        if (document.fullscreenElement) {
          document.exitFullscreen();
        } else {
          document.documentElement.requestFullscreen();
        }
      },
    });

    registerCommand({
      id: "help:shortcuts",
      label: "Keyboard Shortcuts",
      category: "Help",
      shortcut: "Ctrl+K",
      action: () => setShowShortcutsEditor(true),
    });

    registerCommand({
      id: "accessibility:zoomIn",
      label: "Zoom UI In",
      category: "View",
      shortcut: "Ctrl++",
      action: () => setFontSizeScale((s) => Math.min(2, parseFloat((s + 0.1).toFixed(2)))),
    });

    registerCommand({
      id: "accessibility:zoomOut",
      label: "Zoom UI Out",
      category: "View",
      shortcut: "Ctrl+-",
      action: () => setFontSizeScale((s) => Math.max(0.75, parseFloat((s - 0.1).toFixed(2)))),
    });

    registerCommand({
      id: "accessibility:resetZoom",
      label: "Reset UI Zoom",
      category: "View",
      action: () => setFontSizeScale(1),
    });

    registerCommand({
      id: "accessibility:highContrast",
      label: "Toggle High Contrast",
      category: "View",
      action: () => setHighContrastMode((v) => !v),
    });

    registerCommand({
      id: "accessibility:reducedMotion",
      label: "Toggle Reduced Motion",
      category: "View",
      action: () => setReducedMotion((v) => !v),
    });

    registerCommand({
      id: "accessibility:colorBlindNone",
      label: "Color Blindness: Normal",
      category: "View",
      action: () => setColorBlindMode('none'),
    });
    registerCommand({
      id: "accessibility:colorBlindProtanopia",
      label: "Color Blindness: Protanopia (red-blind)",
      category: "View",
      action: () => setColorBlindMode('protanopia'),
    });
    registerCommand({
      id: "accessibility:colorBlindDeuteranopia",
      label: "Color Blindness: Deuteranopia (green-blind)",
      category: "View",
      action: () => setColorBlindMode('deuteranopia'),
    });
    registerCommand({
      id: "accessibility:colorBlindTritanopia",
      label: "Color Blindness: Tritanopia (blue-blind)",
      category: "View",
      action: () => setColorBlindMode('tritanopia'),
    });
    registerCommand({
      id: "accessibility:colorBlindAchromatopsia",
      label: "Color Blindness: Achromatopsia (monochrome)",
      category: "View",
      action: () => setColorBlindMode('achromatopsia'),
    });
  }, [undo, redo, setMediaUrl, addToast, setFontSizeScale, setHighContrastMode, setReducedMotion, setColorBlindMode]);

  return (
    <>
      {isBrowser && (
        <div
          style={{
            background: '#ff3b30',
            color: 'white',
            padding: '12px',
            textAlign: 'center',
            fontWeight: 'bold',
            position: 'absolute',
            top: 0,
            left: 0,
            right: 0,
            zIndex: 1000,
          }}
        >
          WARNING: You are viewing this in a standard web browser. The application will not respond. Please look for the separate Electron window that opened on your desktop!
        </div>
      )}
      <StudioLayout
        header={<Toolbar />}
        leftSidebar={<Sidebar />}
        centerWorkspace={
          <>
            {mediaUrl ? (
              <>
                <Viewport />
                <Timeline
                  currentTime={currentTime}
                  duration={duration || 10}
                  onTimeChange={setCurrentTime}
                />
              </>
            ) : (
              <EmptyCanvas
                onImport={async () => {
                  if (!window.ipcRenderer) {
                    addToast('IPC not available. Run inside Electron.', 'error');
                    return;
                  }
                  try {
                    const url = await window.ipcRenderer.invoke<string | null>('dialog:openMedia');
                    if (url) setMediaUrl(url);
                  } catch {
                    addToast('Failed to open media file.', 'error');
                  }
                }}
              />
            )}
          </>
        }
        rightProperties={
          <div
            style={{
              display: 'flex',
              flexDirection: 'column',
              gap: '16px',
              padding: '16px',
              height: '100%',
              overflow: 'hidden',
            }}
          >
            <PropertiesPanel />
          </div>
        }
      />

      {/* Floating Toast Notification Stack */}
      <div
        style={{
          position: 'fixed',
          bottom: '24px',
          right: '24px',
          display: 'flex',
          flexDirection: 'column',
          gap: '8px',
          zIndex: 10000,
          pointerEvents: 'none',
        }}
      >
        {toasts.map((toast) => (
          <Toast key={toast.id} toast={toast} onClose={() => removeToast(toast.id)} />
        ))}
      </div>

      <RenderModal />
      <NoiseTexture />
      <CommandPalette />
      <StatusBar />
      {showEnvSetup && (
        <EnvironmentSetupModal
          onComplete={() => setShowEnvSetup(false)}
          onDismiss={() => setShowEnvSetup(false)}
        />
      )}
      <OnboardingModal />
      <DebugOverlay />
      {showShortcutsEditor && (
        <KeyboardShortcutsEditor onClose={() => setShowShortcutsEditor(false)} />
      )}

      {showRecovery && (
        <CrashRecoveryDialog
          autoSaveData={recoveryData}
          onDismiss={() => {
            setShowRecovery(false);
            dismissCrashRecovery();
          }}
        />
      )}
    </>
  );
};

function AppContentWrapped() {
  const { mediaUrl } = useStudio();
  return (
    <AudioReactiveProvider mediaUrl={mediaUrl}>
      <AppContent />
    </AudioReactiveProvider>
  );
}

function App() {
  return (
    <ErrorBoundary>
      <StudioProvider>
        <AppContentWrapped />
      </StudioProvider>
    </ErrorBoundary>
  );
}

export default App;
