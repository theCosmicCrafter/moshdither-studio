import { lazy, type ComponentType, type LazyExoticComponent } from "react";

export type DockZone = "left" | "right" | "bottom";

export interface PanelMeta {
  id: string;
  label: string;
  icon: string;
  defaultZone: DockZone;
  minWidth: number;
  minHeight: number;
  component: LazyExoticComponent<ComponentType>;
}

export const PANEL_REGISTRY: PanelMeta[] = [
  {
    id: "browser",
    label: "Effects",
    icon: "palette",
    defaultZone: "left",
    minWidth: 220,
    minHeight: 200,
    component: lazy(() => import("../EffectBrowser")),
  },
  {
    id: "stack",
    label: "Stack",
    icon: "layers",
    defaultZone: "right",
    minWidth: 260,
    minHeight: 160,
    component: lazy(() => import("../EffectStack")),
  },
  {
    id: "audio",
    label: "Audio Reactive",
    icon: "graphic_eq",
    defaultZone: "right",
    minWidth: 260,
    minHeight: 120,
    component: lazy(() => import("../AudioPanel")),
  },
  {
    id: "export",
    label: "Export",
    icon: "file_export",
    defaultZone: "right",
    minWidth: 260,
    minHeight: 120,
    component: lazy(() => import("../ExportPanel")),
  },
  {
    id: "presets",
    label: "Presets",
    icon: "bookmark",
    defaultZone: "right",
    minWidth: 260,
    minHeight: 120,
    component: lazy(() => import("../PresetPanel")),
  },
  {
    id: "mask",
    label: "Mask",
    icon: "cut",
    defaultZone: "right",
    minWidth: 260,
    minHeight: 160,
    component: lazy(() => import("../MaskPanel")),
  },
  {
    id: "lut",
    label: "LUTs",
    icon: "tune",
    defaultZone: "right",
    minWidth: 260,
    minHeight: 120,
    component: lazy(() => import("../LUTPanel")),
  },
  {
    id: "proxy",
    label: "Proxy Media",
    icon: "cloud_sync",
    defaultZone: "left",
    minWidth: 240,
    minHeight: 140,
    component: lazy(() => import("../ProxyPanel")),
  },
  {
    id: "tracks",
    label: "Tracks",
    icon: "view_timeline",
    defaultZone: "left",
    minWidth: 240,
    minHeight: 160,
    component: lazy(() => import("../TrackPanel")),
  },
  {
    id: "verify",
    label: "Verify",
    icon: "verified",
    defaultZone: "bottom",
    minWidth: 400,
    minHeight: 200,
    component: lazy(() => import("../VerificationPanel")),
  },
];

const PANEL_MAP: Record<string, PanelMeta> = Object.fromEntries(
  PANEL_REGISTRY.map((p) => [p.id, p])
);

export function getPanelMeta(id: string): PanelMeta | undefined {
  return PANEL_MAP[id];
}

export function getAllPanelIds(): string[] {
  return PANEL_REGISTRY.map((p) => p.id);
}
