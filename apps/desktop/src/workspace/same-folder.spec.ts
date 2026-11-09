import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

jest.mock('../config/desktop-settings', () => ({ loadDesktopSettings: () => ({}) }));
jest.mock('../config/portable-root', () => ({ getPortableAppRoot: () => '/tmp' }));

import { isSameWorkspaceFolder } from './workspace-paths';
import { listActiveJobs } from '../api/active-jobs';

describe('isSameWorkspaceFolder', () => {
  const base = fs.mkdtempSync(path.join(os.tmpdir(), 'cwm-ws-'));
  const ws = path.join(base, 'ws');
  fs.mkdirSync(ws);

  it('takes a trailing separator, a relative path and a symbolic link as the same folder', () => {
    expect(isSameWorkspaceFolder(`${ws}/`, ws)).toBe(true);
    expect(isSameWorkspaceFolder(path.relative(process.cwd(), ws), ws)).toBe(true);
    const link = path.join(base, 'link');
    fs.symlinkSync(ws, link);
    expect(isSameWorkspaceFolder(link, ws)).toBe(true);
  });

  it('expands ~ and ignores case where the file system does', () => {
    expect(isSameWorkspaceFolder('~', os.homedir())).toBe(true);
    expect(isSameWorkspaceFolder(ws.toUpperCase(), ws, 'darwin')).toBe(true);
    expect(isSameWorkspaceFolder('/x/WS', '/x/ws', 'linux')).toBe(false);
  });

  it('tells two different folders apart', () => {
    expect(isSameWorkspaceFolder(path.join(base, 'other'), ws)).toBe(false);
  });
});

describe('listActiveJobs', () => {
  it('is null, not empty, when the server does not answer', async () => {
    await expect(listActiveJobs(path.join(os.tmpdir(), 'no-such-cwm.sock'))).resolves.toBeNull();
  });
});
