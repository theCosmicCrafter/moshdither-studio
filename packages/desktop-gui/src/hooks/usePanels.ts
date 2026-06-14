import { useContext } from 'react';
import { PanelContext } from '../context/PanelContext';
import type { PanelContextType } from '../context/PanelContext';

export function usePanels(): PanelContextType {
  const ctx = useContext(PanelContext);
  if (!ctx) throw new Error('usePanels must be inside StudioLayout');
  return ctx;
}
