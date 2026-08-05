import { createContext, useContext } from "react";
import type { Model } from "flexlayout-react";

export interface DockContextType {
  model: Model | null;
  addPanel: (panelId: string) => void;
}

export const DockContext = createContext<DockContextType>({
  model: null,
  addPanel: () => {},
});

export function useDock() {
  return useContext(DockContext);
}
