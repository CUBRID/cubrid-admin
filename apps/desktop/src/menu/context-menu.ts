import { Menu, type BrowserWindow, type ContextMenuParams, type MenuItemConstructorOptions } from 'electron';
import { getMenuLanguage, MENU_LABELS, type MenuLanguage } from './application-menu';

type EditParams = Pick<ContextMenuParams, 'isEditable' | 'selectionText' | 'editFlags'>;

/**
 * The context menu for places the app has no menu of its own: the OS edit
 * items in a text field, and Copy on selected text. Electron shows nothing
 * by default. Where the page shows its own menu (trees, tabs) it stops the
 * event, so this is not asked.
 */
export function buildContextMenuTemplate(params: EditParams, language: MenuLanguage): MenuItemConstructorOptions[] {
  const L = MENU_LABELS[language];
  const flags = params.editFlags;
  if (params.isEditable) {
    return [
      { role: 'undo', label: L.undo, enabled: flags.canUndo },
      { role: 'redo', label: L.redo, enabled: flags.canRedo },
      { type: 'separator' },
      { role: 'cut', label: L.cut, enabled: flags.canCut },
      { role: 'copy', label: L.copy, enabled: flags.canCopy },
      { role: 'paste', label: L.paste, enabled: flags.canPaste },
      { type: 'separator' },
      { role: 'selectAll', label: L.selectAll, enabled: flags.canSelectAll },
    ];
  }
  if (params.selectionText.trim().length > 0) {
    return [{ role: 'copy', label: L.copy, enabled: flags.canCopy }];
  }
  return [];
}

export function installContextMenu(window: BrowserWindow): void {
  window.webContents.on('context-menu', (_event, params) => {
    const template = buildContextMenuTemplate(params, getMenuLanguage());
    if (template.length === 0) return;
    Menu.buildFromTemplate(template).popup({ window });
  });
}
