/**
 * Edit > Redo. The menu's own redo role runs the browser's redo command, which
 * does nothing in a CodeMirror editor (it keeps its own history), so the menu
 * item sends EDIT_REDO_CHANNEL instead and the preload calls redoInPage: the
 * focused element is offered EDIT_REDO_EVENT first (the editors take it and
 * redo; web-manager components/domain/editMenuRedo.js), and when nothing takes
 * it the browser's redo runs, as the role did (text fields, the login form).
 * The keyboard shortcut is not changed by this: the page sees the key first and
 * the menu only gets it when the page leaves it (an editor takes it itself).
 */
export const EDIT_REDO_CHANNEL = 'desktop:edit-redo';
export const EDIT_REDO_EVENT = 'cwm-edit-redo';

/** The accelerator Electron gives the redo role: Ctrl+Y on Windows, Shift+Cmd/Ctrl+Z elsewhere. */
export function redoAccelerator(platform: NodeJS.Platform = process.platform): string {
  return platform === 'win32' ? 'Control+Y' : 'Shift+CommandOrControl+Z';
}

/** The page's document, as far as Redo needs it (the desktop build has no DOM types). */
type RedoTarget = { dispatchEvent(event: Event): boolean };
export type PageDocument = {
  activeElement: RedoTarget | null;
  body: RedoTarget | null;
  execCommand(command: string): boolean;
};

export function redoInPage(doc: PageDocument): 'editor' | 'browser' {
  const target = doc.activeElement ?? doc.body;
  const event = new CustomEvent(EDIT_REDO_EVENT, { bubbles: true, cancelable: true });
  if (target && !target.dispatchEvent(event)) return 'editor';
  doc.execCommand('redo');
  return 'browser';
}
