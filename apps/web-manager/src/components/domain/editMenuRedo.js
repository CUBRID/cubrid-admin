import { EditorView } from '@codemirror/view';
import { redo } from '@codemirror/commands';

/**
 * Edit > Redo in the desktop app: the menu cannot redo in a CodeMirror editor
 * by itself (the browser's redo command finds nothing to redo there), so the
 * desktop app offers this event to the focused element first
 * (apps/desktop/src/window/edit-redo.ts) and falls back to the browser's redo
 * when no editor takes it. The keyboard (Cmd+Shift+Z, Ctrl+Y) goes through the
 * editor's own keymap, not here.
 */
export const EDIT_MENU_REDO_EVENT = 'cwm-edit-redo';

export const editMenuRedo = EditorView.domEventHandlers({
  [EDIT_MENU_REDO_EVENT]: (event, view) => {
    redo(view);
    event.preventDefault();
    return true;
  },
});
