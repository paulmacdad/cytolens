/**
 * useKeyboardShortcuts — global keyboard shortcut handler for CytoLens.
 *
 * Binds to document.keydown so shortcuts work regardless of focus.
 * Skips when focus is inside an <input> or <textarea>.
 */

import { useEffect } from 'react';

export interface KeyboardActions {
  /** Activate the select/pan tool */
  onSelectTool: () => void;
  /** Activate the polygon gate tool */
  onPolygonTool: () => void;
  /** Activate the rectangle gate tool */
  onRectangleTool: () => void;
  /** Activate the ellipse gate tool */
  onEllipseTool: () => void;
  /** Delete the currently selected gate */
  onDeleteGate: () => void;
  /** Undo the last gate addition */
  onUndo: () => void;
  /** Open the file dialog */
  onOpenFile: () => void;
  /** Load demo data */
  onLoadDemo: () => void;
  /** Cancel current gate draw, or deselect */
  onEscape: () => void;
  /** Zoom in */
  onZoomIn: () => void;
  /** Zoom out */
  onZoomOut: () => void;
  /** Reset zoom to 100% */
  onZoomReset: () => void;
}

function isEditableTarget(target: EventTarget | null): boolean {
  return (
    target instanceof HTMLInputElement ||
    target instanceof HTMLTextAreaElement ||
    (target instanceof HTMLElement && target.isContentEditable)
  );
}

export function useKeyboardShortcuts(actions: KeyboardActions): void {
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (isEditableTarget(e.target)) return;

      const key = e.key;
      const ctrl = e.ctrlKey || e.metaKey;

      // Ctrl combos — check before single-key to avoid swallowing
      if (ctrl) {
        if (key === 'z' || key === 'Z') {
          e.preventDefault();
          actions.onUndo();
          return;
        }
        if (key === 'o' || key === 'O') {
          e.preventDefault();
          actions.onOpenFile();
          return;
        }
        if (key === 'd' || key === 'D') {
          e.preventDefault();
          actions.onLoadDemo();
          return;
        }
        // Let other Ctrl combos pass through
        return;
      }

      switch (key) {
        case 'v':
        case 'V':
          actions.onSelectTool();
          break;
        case 'p':
        case 'P':
          actions.onPolygonTool();
          break;
        case 'r':
        case 'R':
          actions.onRectangleTool();
          break;
        case 'e':
        case 'E':
          actions.onEllipseTool();
          break;
        case 'Delete':
        case 'Backspace':
          actions.onDeleteGate();
          break;
        case 'Escape':
          actions.onEscape();
          break;
        case '+':
        case '=':
          actions.onZoomIn();
          break;
        case '-':
          actions.onZoomOut();
          break;
        case '0':
          actions.onZoomReset();
          break;
        default:
          break;
      }
    };

    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [actions]);
}
