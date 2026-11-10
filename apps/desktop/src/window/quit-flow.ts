import type { BrowserWindow, MessageBoxSyncOptions, PowerMonitor } from 'electron';
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
  // 'plain' or 'unsaved': the user said quit, to that question ('unsaved'
  // also for a quit that asks nothing).
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

    /**
     * Quit with no question at all, unsaved changes included: on SIGINT or
     * SIGTERM, and when the OS logs out or shuts down (whenSessionEnds),
     * which must not wait on a box.
     */
    quitWithoutAsking(): void {
      answered = 'unsaved';
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

/**
 * An OS logout or shutdown arrives as an app quit that closes the window, not
 * as SIGTERM: powerMonitor 'shutdown' says so first on macOS and Linux, the
 * window's 'session-end' on Windows. From then on the quit asks nothing.
 */
export function whenSessionEnds(
  quitFlow: { quitWithoutAsking: () => void },
  powerMonitor: Pick<PowerMonitor, 'on'>,
  window: Pick<BrowserWindow, 'on'>
): void {
  powerMonitor.on('shutdown', () => quitFlow.quitWithoutAsking());
  window.on('session-end', () => quitFlow.quitWithoutAsking());
}

/**
 * SIGINT and SIGTERM (a terminal's Ctrl+C, `kill`, a Linux session ending)
 * quit with no question. Call once the app is ready: a listener added before
 * that is never called (Electron, measured on 35.7.5 macOS), Electron quits
 * on its own and the window asks as for any quit. Added after, it replaces
 * Electron's handling, so it must quit itself.
 */
export function listenForQuitSignals(
  target: { on(signal: 'SIGINT' | 'SIGTERM', listener: () => void): unknown },
  quitFlow: { quitWithoutAsking: () => void },
  quit: () => void
): void {
  for (const signal of ['SIGINT', 'SIGTERM'] as const) {
    target.on(signal, () => {
      quitFlow.quitWithoutAsking();
      quit();
    });
  }
}

