import { useEffect, useState, Suspense } from "react";
import { Layout, Model, TabNode, Actions, DockLocation } from "flexlayout-react";
import "flexlayout-react/style/dark.css";
import { useAppStore } from "../../store";
import { PANEL_REGISTRY } from "./panelRegistry";
import PanelRail from "./PanelRail";
import { DockContext } from "./DockContext";
import { DEFAULT_LAYOUT } from "./defaultLayout";
import { getActiveDragPanelId, setActiveDragPanelId } from "./tabDropState";
import { resolveExternalDrag } from "./externalDrag";

// Import components that are hardcoded into the layout
import PreviewViewport from "../PreviewViewport";
import Timeline from "../Timeline";
import { ErrorBoundary } from "../ErrorBoundary";

export default function DockLayout({ isDropTarget }: { isDropTarget: boolean }) {
  const panelOpacity = useAppStore((s) => s.panelOpacity);
  const theme = useAppStore((s) => s.theme);
  const layoutTrigger = useAppStore(s => s.layoutTrigger);
  
  // We'll manage the flexlayout model in local state
  const [model, setModel] = useState<Model | null>(null);

  // Initialize model on mount (or if the user resets it)
  useEffect(() => {
    // We could potentially load from localStorage or the store here
    // For now, we load the default layout
    const newModel = Model.fromJson(DEFAULT_LAYOUT);
    setModel(newModel);
    
    // Initial sync
    const activePanels: string[] = [];
    newModel.visitNodes((n) => {
      if (n.getType() === "tab") activePanels.push((n as TabNode).getComponent() as string);
    });
    useAppStore.getState().setDockedPanels(activePanels);
  }, []);



  const factory = (node: TabNode) => {
    const componentStr = node.getComponent() as string;

    if (componentStr === "preview") {
      return (
        <div className="w-full h-full flex flex-col">
          <PreviewViewport isDropTarget={isDropTarget} />
        </div>
      );
    }
    
    if (componentStr === "timeline") {
      return (
        <div className="w-full h-full flex flex-col">
          <Timeline />
        </div>
      );
    }

    const panelMeta = PANEL_REGISTRY.find((p) => p.id === componentStr);
    if (panelMeta) {
      const Component = panelMeta.component;
      return (
        <div className="w-full h-full overflow-hidden" style={{ ["--panel-opacity" as string]: panelOpacity }}>
          <ErrorBoundary
            fallback={(error, reset) => (
              <div className="w-full h-full flex flex-col items-center justify-center gap-2 p-4 text-center">
                <span
                  className="material-symbols-outlined text-on-surface-variant"
                  style={{ fontSize: 20, opacity: 0.5 }}
                  aria-hidden="true"
                >
                  error
                </span>
                <p className="font-body-sm text-body-sm text-on-surface-variant">
                  {panelMeta.label} panel failed to load
                </p>
                <p className="font-body-sm text-body-sm text-on-surface-variant" style={{ opacity: 0.7 }}>
                  {error.message}
                </p>
                <button
                  type="button"
                  onClick={reset}
                  className="font-label-md text-label-md text-accent-teal hover:underline"
                >
                  Try again
                </button>
              </div>
            )}
          >
            <Suspense fallback={<div className="p-4 font-body-sm text-body-sm text-on-surface-variant">Loading...</div>}>
              <Component />
            </Suspense>
          </ErrorBoundary>
        </div>
      );
    }

    return <div>Unknown Component</div>;
  };

  const addPanel = (panelId: string) => {
    if (!model) return;
    
    let exists = false;
    model.visitNodes((n) => {
      if (n.getType() === "tab" && (n as TabNode).getComponent() === panelId) {
        exists = true;
      }
    });

    if (exists) return;

    const panelMeta = PANEL_REGISTRY.find((p) => p.id === panelId);
    if (!panelMeta) return;

    model.doAction(Actions.addNode({
      type: "tab",
      id: panelId,
      component: panelId,
      name: panelMeta.label
    }, panelMeta.defaultZone === "right" ? "right-zone" : "left-zone", DockLocation.CENTER, -1));
  };

  // PanelRail's icons are `draggable` with directional hints suggesting a
  // drop-to-position gesture, but nothing consumed the drag: PanelRail set
  // `dataTransfer` data that had no reader, and flexlayout's `Layout` rejects
  // any drag it doesn't recognize unless `onExternalDrag` opts in. Only the
  // click-to-add-to-default-zone fallback worked. The decision logic itself
  // lives in `resolveExternalDrag` (pure, unit-tested); this just supplies it
  // the current drag id and the live set of docked panels.
  const onExternalDrag = () => {
    if (!model) return undefined;
    const dockedComponentIds = new Set<string>();
    model.visitNodes((n) => {
      if (n.getType() === "tab") dockedComponentIds.add((n as TabNode).getComponent() as string);
    });
    const target = resolveExternalDrag(getActiveDragPanelId(), dockedComponentIds);
    return target && { ...target, onDrop: () => setActiveDragPanelId(null) };
  };

  const removePanel = (panelId: string) => {
    if (!model) return;
    model.visitNodes((n) => {
      if (n.getType() === "tab" && (n as TabNode).getComponent() === panelId) {
        model.doAction(Actions.deleteTab(n.getId()));
      }
    });
  };


  useEffect(() => {
    if (!model || !layoutTrigger) return;
    
    if (layoutTrigger.action === "reset") {
      const newModel = Model.fromJson(DEFAULT_LAYOUT);
      setModel(newModel);
      const activePanels: string[] = [];
      newModel.visitNodes((n) => {
        if (n.getType() === "tab") activePanels.push((n as TabNode).getComponent() as string);
      });
      useAppStore.getState().setDockedPanels(activePanels);
    } else if (layoutTrigger.action === "add" && layoutTrigger.panelId) {
      addPanel(layoutTrigger.panelId);
    } else if (layoutTrigger.action === "remove" && layoutTrigger.panelId) {
      removePanel(layoutTrigger.panelId);
    }
    // layoutTrigger.ts is a one-shot nonce: every dispatch bumps it, so this is
    // meant to fire exactly once per dispatched action, reading the CURRENT
    // model/addPanel/removePanel via closure rather than re-running whenever
    // their per-render identities change. Adding them to the array (as
    // exhaustive-deps wants) would refire this on every unrelated re-render
    // while a stale action/panelId was still the latest dispatched, redoing
    // that action.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [layoutTrigger?.ts]);

  if (!model) return null;

  return (
    <DockContext.Provider value={{ model, addPanel }}>
      <div
        className={`dock-layout flex flex-row h-full w-full min-h-0 overflow-hidden theme-${theme}`}
        style={{ ["--panel-opacity" as string]: panelOpacity }}
      >
        <PanelRail />
        <div className="flex-1 relative min-w-0 min-h-0 bg-surface">
          <Layout
            model={model}
            factory={factory}
            onExternalDrag={onExternalDrag}
            onModelChange={(m) => {
              const activePanels: string[] = [];
              m.visitNodes((n) => {
                if (n.getType() === "tab") {
                  const tabNode = n as TabNode;
                  const componentStr = tabNode.getComponent() as string;
                  if (componentStr) activePanels.push(componentStr);
                }
              });
              useAppStore.getState().setDockedPanels(activePanels);
            }}
          />
        </div>
      </div>
    </DockContext.Provider>
  );
}
