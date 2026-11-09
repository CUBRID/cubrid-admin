import type { BrowserWindow, MessageBoxSyncOptions } from 'electron';
import { MENU_LABELS, PRODUCT_NAME, type MenuLanguage } from '../menu/application-menu';

type ShowMessageBoxSync = (window: BrowserWindow, options: MessageBoxSyncOptions) => number;

/** Asks whether to quit. Returns true to quit, false to stay (Cancel, Esc). */
export function confirmQuit(
  window: BrowserWindow,
  { language, showMessageBoxSync }: { language: MenuLanguage; showMessageBoxSync: ShowMessageBoxSync }
): boolean {
  const L = MENU_LABELS[language];
  const choice = showMessageBoxSync(window, {
    type: 'question',
    title: PRODUCT_NAME,
    buttons: [L.unsavedQuitButton, L.unsavedCancelButton],
    defaultId: 0,
    cancelId: 1,
    noLink: true,
    message: L.quitConfirmMessage,
  });
  return choice === 0;
}

// Whether a conf tab has unsaved changes, as the page reports it
// (desktop:set-unsaved-changes). Main has to know before the window closes:
// the page's own beforeunload only answers after the quit question.
let pageUnsavedChanges = false;

export function setPageUnsavedChanges(value: boolean): void {
  pageUnsavedChanges = value;
}

export function hasPageUnsavedChanges(): boolean {
  return pageUnsavedChanges;
}

export type QuitQuestions = {
  /** "Do you want to quit?" */
  quit: () => boolean;
  /** Unsaved changes, quit anyway? */
  quitWithUnsavedChanges: () => boolean;
  /** Unsaved changes, leave this page anyway? (a reload) */
  leaveWithUnsavedChanges: () => boolean;
};

/**
 * One question per quit. Every quit (File > Quit, Cmd+Q, the header menu's
 * Quit, closing the window) closes the window first, so the question is asked
 * there; with unsaved changes it is the unsaved-changes question, and the
 * page's refusal to unload that follows is not asked again.
 */
export function createQuitFlow(questions: QuitQuestions, hasUnsavedChanges: () => boolean) {
  // 'plain' or 'unsaved': the user said quit, to that question.
  let answered: 'no' | 'plain' | 'unsaved' = 'no';

  return {
    /** The window is about to close. Returns false to keep it open. */
    onWindowClose(): boolean {
      if (answered !== 'no') return true;
      const unsaved = hasUnsavedChanges();
      const quit = unsaved ? questions.quitWithUnsavedChanges() : questions.quit();
      if (quit) answered = unsaved ? 'unsaved' : 'plain';
      return quit;
    },

    /** Quit with no question (SIGINT, SIGTERM). Unsaved changes are still asked. */
    quitWithoutAsking(): void {
      if (answered === 'no') answered = 'plain';
    },

    /** The page refused to unload (unsaved changes). Returns true to unload. */
    onPreventUnload(): boolean {
      if (answered === 'unsaved') return true;
      const unload = answered === 'plain'
        ? questions.quitWithUnsavedChanges()
        : questions.leaveWithUnsavedChanges();
      // Staying cancels the quit: the next one asks again.
      if (!unload) answered = 'no';
      return unload;
    },
  };
}
