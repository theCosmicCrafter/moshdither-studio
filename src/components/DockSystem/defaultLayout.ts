import { IJsonModel } from "flexlayout-react";

export const DEFAULT_LAYOUT: IJsonModel = {
  global: {
    tabEnableClose: true,
    tabSetEnableMaximize: true,
  },
  borders: [],
  layout: {
    type: "row",
    weight: 100,
    children: [
      {
        type: "tabset",
        weight: 20,
        id: "left-zone",
        children: [
          { type: "tab", id: "browser", name: "Effects", component: "browser" },
          { type: "tab", id: "stack", name: "Stack", component: "stack" },
        ]
      },
      {
        type: "row",
        weight: 60,
        id: "center-column",
        children: [
          {
            type: "tabset",
            weight: 70,
            id: "center-zone",
            enableDrop: false,
            enableDrag: false,
            enableDivide: false,
            enableClose: false,
            children: [
              { type: "tab", id: "preview", name: "Preview", component: "preview", enableClose: false, enableDrag: false }
            ]
          },
          {
            type: "tabset",
            weight: 30,
            id: "bottom-zone",
            enableDrop: false,
            enableDrag: false,
            enableDivide: false,
            enableClose: false,
            children: [
              { type: "tab", id: "timeline", name: "Timeline", component: "timeline", enableClose: false, enableDrag: false }
            ]
          }
        ]
      },
      {
        type: "tabset",
        weight: 20,
        id: "right-zone",
        children: [
          { type: "tab", id: "mask", name: "Mask", component: "mask" },
          { type: "tab", id: "audio", name: "Audio Reactive", component: "audio" },
          { type: "tab", id: "lut", name: "LUTs", component: "lut" },
          { type: "tab", id: "export", name: "Export", component: "export" },
        ]
      }
    ]
  }
};
