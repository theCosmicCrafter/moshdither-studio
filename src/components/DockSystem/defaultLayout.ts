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
            // Drops, drags and divides are all allowed here. These were locked
            // shut, which made the largest region of the window -- the obvious
            // place to aim a panel at -- silently reject every drop: the drag
            // started, the indicator appeared, and nothing happened. The lock
            // also had knock-on cost elsewhere; see the note on the Verify panel
            // in panelRegistry.ts, which had to declare a different zone because
            // the bottom tabset "was never a real target".
            // Preview keeps enableClose: false so it cannot be lost entirely,
            // but it can now be moved and stacked like any other panel.
            enableClose: false,
            children: [
              { type: "tab", id: "preview", name: "Preview", component: "preview", enableClose: false }
            ]
          },
          {
            type: "tabset",
            weight: 30,
            id: "bottom-zone",
            // Unlocked for the same reason as center-zone above. Timeline keeps
            // enableClose: false so it cannot be lost, but it can be dragged and
            // stacked, and other panels can now be dropped alongside it.
            enableClose: false,
            children: [
              { type: "tab", id: "timeline", name: "Timeline", component: "timeline", enableClose: false }
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
