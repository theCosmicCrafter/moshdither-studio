import { useEffect, useState, Suspense } from "react";
import { Layout, Model, TabNode, Actions, DockLocation } from "flexlayout-react";
import "flexlayout-react/style/dark.css";
import { useAppStore } from "../../store";
import { PANEL_REGISTRY } from "./panelRegistry";
import PanelRail from "./PanelRail";
import { DockContext } from "./DockContext";
import { DEFAULT_LAYOUT } from "./defaultLayout";

// Import components that are hardcoded into the layout
import PreviewViewport from "../PreviewViewport";
import Timeline from "../Timeline";

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
          <Suspense fallback={<div className="p-4 text-xs text-on-surface-variant">Loading...</div>}>
            <Component />
          </Suspense>
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
