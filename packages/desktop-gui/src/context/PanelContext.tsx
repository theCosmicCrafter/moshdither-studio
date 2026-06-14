import { createContext } from 'react';

export interface PanelControl {
  width: number;
  collapsed: boolean;
  setWidth: (w: number) => void;
  toggleCollapse: () => void;
}

export interface PanelContextType {
  left: PanelControl;
  right: PanelControl;
}

export const PanelContext = createContext<PanelContextType | null>(null);
