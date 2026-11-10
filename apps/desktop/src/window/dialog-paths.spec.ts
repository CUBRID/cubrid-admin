import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

let settings: Record<string, unknown> = {};
jest.mock('../config/desktop-settings', () => ({
  loadDesktopSettings: () => settings,
  saveDesktopSettings: (next: Record<string, unknown>) => { settings = next; },
}));

import { dialogDefaultDirectory, installDownloadDialogDefaults, rememberDialogPath } from './dialog-paths';

describe('file dialog default folder', () => {
  const documents = '/Users/someone/Documents';
  let tmp: string;
  beforeEach(() => {
    settings = { workspaceRoot: '/w' };
    tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'dlg-'));
  });
  afterEach(() => fs.rmSync(tmp, { recursive: true, force: true }));

  it('opens in Documents the first time', () => {
    expect(dialogDefaultDirectory(documents)).toBe(documents);
  });

  it('opens where the last file was chosen, keeping the other settings', () => {
    rememberDialogPath(path.join(tmp, 'hosts.json'), false);
    expect(dialogDefaultDirectory(documents)).toBe(tmp);
    expect(settings.workspaceRoot).toBe('/w');
  });

  it('opens in a chosen folder itself', () => {
    rememberDialogPath(tmp, true);
    expect(dialogDefaultDirectory(documents)).toBe(tmp);
  });

  it('falls back to Documents when the last folder is gone', () => {
    rememberDialogPath(tmp, true);
    fs.rmSync(tmp, { recursive: true, force: true });
    expect(dialogDefaultDirectory(documents)).toBe(documents);
  });

  it('opens the save dialog of a download in the default folder with its name, and remembers where it went', () => {
    let onDownload: ((e: unknown, item: unknown) => void) | undefined;
    installDownloadDialogDefaults({ on: (_name, listener) => { onDownload = listener as typeof onDownload; } }, () => documents);
    let onDone: ((e: unknown, state: string) => void) | undefined;
    const options: { defaultPath?: string }[] = [];
    const item = {
      getFilename: () => 'hosts.json',
      getSavePath: () => path.join(tmp, 'hosts.json'),
      setSaveDialogOptions: (o: { defaultPath: string }) => options.push(o),
      once: (_name: string, listener: (e: unknown, state: string) => void) => { onDone = listener; },
    };
    onDownload?.({}, item);
    expect(options).toEqual([{ defaultPath: path.join(documents, 'hosts.json') }]);
    onDone?.({}, 'completed');
    expect(dialogDefaultDirectory(documents)).toBe(tmp);
  });
});
