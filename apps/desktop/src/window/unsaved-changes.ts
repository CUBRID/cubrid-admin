import type { BrowserWindow, MessageBoxSyncOptions } from 'electron';
import { MENU_LABELS, type MenuLanguage } from '../menu/application-menu';

type ShowMessageBoxSync = (window: BrowserWindow, options: MessageBoxSyncOptions) => number;

/**
 * Asks whether to drop unsaved changes when the page refuses to unload (its
 * beforeunload, while a conf tab is being edited). Electron honours the
 * answer only when given synchronously, hence the blocking box. Returns true
 * to unload anyway (quit, close or reload goes on), false to stay.
 */
export function confirmUnloadWithUnsavedChanges(
  window: BrowserWindow,
  { quitting, language, showMessageBoxSync }: {
    quitting: boolean;
    language: MenuLanguage;
    showMessageBoxSync: ShowMessageBoxSync;
  }
): boolean {
  const L = MENU_LABELS[language];
  const choice = showMessageBoxSync(window, {
    type: 'question',
    buttons: [quitting ? L.unsavedQuitButton : L.unsavedLeaveButton, L.unsavedCancelButton],
    defaultId: 1,
    cancelId: 1,
    noLink: true,
    message: L.unsavedChangesMessage,
    detail: quitting ? L.unsavedQuitDetail : L.unsavedLeaveDetail,
  });
  return choice === 0;
}
