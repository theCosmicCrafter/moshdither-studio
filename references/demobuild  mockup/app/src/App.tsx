import { useEffect, useRef } from 'react';
import { useAppStore } from '@/store/useAppStore';
import Toolbar from '@/components/Toolbar';
import EffectStack from '@/components/EffectStack';
import PropertiesPanel from '@/components/PropertiesPanel';
import WebGLCanvas from '@/components/WebGLCanvas';
import BottomBar from '@/components/BottomBar';
import GrainOverlay from '@/components/GrainOverlay';
import RenderModal from '@/components/RenderModal';
import { ResizableHandle, ResizablePanel, ResizablePanelGroup } from '@/components/ui/resizable';

export default function App() {
  const store = useAppStore();
  const playIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const selectedEffect = store.effects.find(e => e.id === store.selectedEffectId) || null;

  // Keyboard shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement;
      if (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA') return;

      // Space: Play/Pause
      if (e.code === 'Space') {
        e.preventDefault();
        store.setIsPlaying(prev => !prev);
      }
      // Ctrl+O: Import
      else if ((e.ctrlKey || e.metaKey) && e.code === 'KeyO') {
        e.preventDefault();
        store.importMedia();
      }
      // Ctrl+E: Export/Render
      else if ((e.ctrlKey || e.metaKey) && e.code === 'KeyE') {
        e.preventDefault();
        store.startRender();
      }
      // Ctrl+D: Duplicate
      else if ((e.ctrlKey || e.metaKey) && e.code === 'KeyD') {
        e.preventDefault();
        if (store.selectedEffectId) {
          store.duplicateEffect(store.selectedEffectId);
        }
      }
      // Delete: Remove
      else if (e.code === 'Delete' || e.code === 'Backspace') {
        if (store.selectedEffectId) {
          e.preventDefault();
          store.removeEffect(store.selectedEffectId);
        }
      }
      // F11: Fullscreen
      else if (e.code === 'F11') {
        e.preventDefault();
        store.setWorkspace(prev => prev === 'focus' ? 'standard' : 'focus');
      }
      // Esc: Close modal
      else if (e.code === 'Escape') {
        if (store.isRendering) {
          store.setIsRendering(false);
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [store]);

  // Playback timer
  useEffect(() => {
    if (store.isPlaying) {
      playIntervalRef.current = setInterval(() => {
        store.setCurrentTime(prev => {
          if (prev >= store.duration) {
            store.setIsPlaying(false);
            return 0;
          }
          return prev + 0.1;
        });
      }, 100);
    } else {
      if (playIntervalRef.current) {
        clearInterval(playIntervalRef.current);
      }
    }
    return () => {
      if (playIntervalRef.current) {
        clearInterval(playIntervalRef.current);
      }
    };
  }, [store.isPlaying]);

  // Auto-start render when triggered
  useEffect(() => {
    if (store.isRendering && store.renderProgress === 0) {
      const interval = setInterval(() => {
        store.setRenderProgress(prev => {
          if (prev >= 100) {
            clearInterval(interval);
            return 100;
          }
          return prev + 1.5;
        });
      }, 100);
      return () => clearInterval(interval);
    }
    if (store.renderProgress >= 100) {
      setTimeout(() => {
        store.setIsRendering(false);
        store.setRenderProgress(0);
        store.setStatus('Render complete');
      }, 1000);
    }
  }, [store.isRendering, store.renderProgress]);

  return (
    <div
      className="h-screen w-screen flex flex-col overflow-hidden"
      style={{ background: 'var(--bg-base)' }}
    >
      <GrainOverlay />

      {/* Toolbar */}
      <Toolbar
        workspace={store.workspace}
        onWorkspaceChange={store.setWorkspace}
        isPlaying={store.isPlaying}
        onPlayPause={() => store.setIsPlaying(!store.isPlaying)}
        onImport={store.importMedia}
        onExport={store.startRender}
      />

      {/* Main workspace */}
      <div className="flex-1 flex overflow-hidden">
        {store.workspace === 'focus' ? (
          <WebGLCanvas
            mediaLoaded={store.mediaLoaded}
            mediaSrc={store.mediaSrc}
            effects={store.effects}
            onImport={store.importMedia}
          />
        ) : (
          <ResizablePanelGroup className="flex-1">
            {/* Left panel: Effect Stack */}
            <ResizablePanel
              defaultSize={18}
              minSize={15}
              maxSize={35}
              collapsible
              collapsedSize={0}
            >
              <EffectStack
                effects={store.effects}
                selectedEffectId={store.selectedEffectId}
                onSelect={store.setSelectedEffectId}
                onToggle={store.toggleEffect}
                onRemove={store.removeEffect}
                onDuplicate={store.duplicateEffect}
                onAdd={store.addEffect}
                onMove={store.moveEffect}
              />
            </ResizablePanel>

            <ResizableHandle
              style={{
                width: 4,
                background: 'var(--border-subtle)',
              }}
            />

            {/* Center: WebGL Canvas */}
            <ResizablePanel defaultSize={64} minSize={30}>
              <WebGLCanvas
                mediaLoaded={store.mediaLoaded}
                mediaSrc={store.mediaSrc}
                effects={store.effects}
                onImport={store.importMedia}
              />
            </ResizablePanel>

            <ResizableHandle
              style={{
                width: 4,
                background: 'var(--border-subtle)',
              }}
            />

            {/* Right panel: Properties */}
            <ResizablePanel
              defaultSize={18}
              minSize={15}
              maxSize={35}
              collapsible
              collapsedSize={0}
            >
              <PropertiesPanel
                effect={selectedEffect}
                onUpdateParameter={store.updateParameter}
              />
            </ResizablePanel>
          </ResizablePanelGroup>
        )}
      </div>

      {/* Bottom bar */}
      <BottomBar
        isPlaying={store.isPlaying}
        currentTime={store.currentTime}
        duration={store.duration}
        status={store.status}
        onPlayPause={() => store.setIsPlaying(!store.isPlaying)}
      />

      {/* Render modal */}
      <RenderModal
        isOpen={store.isRendering}
        progress={store.renderProgress}
        onClose={() => store.setIsRendering(false)}
      />
    </div>
  );
}
