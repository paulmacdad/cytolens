/**
 * UI store — transient interface state.
 *
 * Theme, panel sizes, active tool, modal state.
 * Does not persist to disk (use experiment store for durable state).
 */

import { create } from 'zustand';
import type { DrawMode } from '@cytolens/ui';

export type ActiveTool = DrawMode;
export type PanelId = 'workspace' | 'properties' | 'statistics';

export interface UIState {
  activeTool: ActiveTool;
  leftPanelWidth: number;
  rightPanelWidth: number;
  isLeftPanelOpen: boolean;
  isRightPanelOpen: boolean;
  expandedPanels: Set<PanelId>;
  isDragOver: boolean;
  showWelcome: boolean;

  setActiveTool: (tool: ActiveTool) => void;
  setLeftPanelWidth: (w: number) => void;
  setRightPanelWidth: (w: number) => void;
  togglePanel: (panel: 'left' | 'right') => void;
  setIsDragOver: (v: boolean) => void;
  dismissWelcome: () => void;
}

export const useUIStore = create<UIState>((set) => ({
  activeTool: 'select',
  leftPanelWidth: 220,
  rightPanelWidth: 240,
  isLeftPanelOpen: true,
  isRightPanelOpen: true,
  expandedPanels: new Set(['workspace', 'properties']),
  isDragOver: false,
  showWelcome: true,

  setActiveTool: (tool) => set({ activeTool: tool }),
  setLeftPanelWidth: (leftPanelWidth) => set({ leftPanelWidth }),
  setRightPanelWidth: (rightPanelWidth) => set({ rightPanelWidth }),
  togglePanel: (panel) => set(s => ({
    isLeftPanelOpen: panel === 'left' ? !s.isLeftPanelOpen : s.isLeftPanelOpen,
    isRightPanelOpen: panel === 'right' ? !s.isRightPanelOpen : s.isRightPanelOpen,
  })),
  setIsDragOver: (isDragOver) => set({ isDragOver }),
  dismissWelcome: () => set({ showWelcome: false }),
}));
