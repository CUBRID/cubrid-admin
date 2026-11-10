import * as fs from 'fs';
import * as path from 'path';
import { loadDesktopSettings, saveDesktopSettings } from '../config/desktop-settings';

// One rule for every file and folder dialog of the app (the workspace folder,
// importing hosts, every download such as exporting hosts, CSVs and logs):
// open where the last one was used, or in the Documents folder the first
// time or when that folder is gone.

/** The folder a file or folder dialog opens in. */
export function dialogDefaultDirectory(documentsDir: string): string {
  const last = loadDesktopSettings().lastDialogDirectory;
  if (last) {
    try {
      if (fs.statSync(last).isDirectory()) return last;
    } catch {
      // Gone or not readable: fall back below.
    }
  }
  return documentsDir;
}

/** Remembers where a dialog was used: a chosen folder itself, or a file's folder. */
export function rememberDialogPath(chosen: string, isDirectory: boolean): void {
  if (!chosen) return;
  const dir = isDirectory ? chosen : path.dirname(chosen);
  const current = loadDesktopSettings();
  if (current.lastDialogDirectory === dir) return;
  saveDesktopSettings({ ...current, lastDialogDirectory: dir });
}

type DownloadItemLike = {
  getFilename(): string;
  getSavePath(): string;
  setSaveDialogOptions(options: { defaultPath: string }): void;
  once(event: 'done', listener: (event: unknown, state: string) => void): void;
};
type SessionLike = { on(event: 'will-download', listener: (event: unknown, item: DownloadItemLike) => void): void };

/**
 * Downloads (exporting hosts, CSVs, logs) ask where to save as usual, opening
 * in the default folder above with the file's own name, and remember the
 * folder of a completed one.
 */
export function installDownloadDialogDefaults(session: SessionLike, documentsDir: () => string): void {
  session.on('will-download', (_event, item) => {
    item.setSaveDialogOptions({ defaultPath: path.join(dialogDefaultDirectory(documentsDir()), item.getFilename()) });
    item.once('done', (_done, state) => {
      if (state === 'completed' && item.getSavePath()) rememberDialogPath(item.getSavePath(), false);
    });
  });
}
