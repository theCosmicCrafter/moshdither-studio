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
        // Rail toggles can empty this zone; keep the tabset alive so
        // addPanel("left-zone") keeps resolving instead of silent no-op.
        enableDeleteWhenEmpty: false,
        children: [
          { type: "tab", id: "browser", name: "Library", component: "browser" },
        ]
      },
      {
        type: "tabset",
        weight: 60,
        id: "center-zone",
        // Drops, drags and divides are all allowed here. These were locked
        // shut, which made the largest region of the window -- the obvious
        // place to aim a panel at -- silently reject every drop: the drag
        // started, the indicator appeared, and nothing happened.
        // Preview keeps enableClose: false so it cannot be lost entirely,
        // but it can be moved and stacked like any other panel.
        //
        // There is no bottom tabset any more. The Timeline is not a panel: it
        // is the transport strip AppLayout pins under the whole workspace (see
        // Timeline/index.tsx). As a panel it took 30 % of this column for
        // ~55 px of controls, with a tab header above and empty space below.
        enableClose: false,
        children: [
          { type: "tab", id: "preview", name: "Preview", component: "preview", enableClose: false }
        ]
      },
      {
        type: "tabset",
        weight: 20,
        id: "right-zone",
        enableDeleteWhenEmpty: false,
        children: [
          { type: "tab", id: "stack", name: "Layers", component: "stack" },
          { type: "tab", id: "mask", name: "Mask", component: "mask" },
          { type: "tab", id: "audio", name: "Audio Reactive", component: "audio" },
          { type: "tab", id: "export", name: "Export", component: "export" },
        ]
      }
    ]
  }
};
