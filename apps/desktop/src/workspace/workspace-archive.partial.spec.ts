import * as os from 'os';
import * as path from 'path';

// A write that stops part way (a full disk): the file it made is removed too.
const failOn = { suffix: '' };
jest.mock('fs', () => {
  const real = jest.requireActual('fs');
  return {
    ...real,
    writeFileSync: (target: string, data: unknown, options: unknown) => {
      if (failOn.suffix && String(target).endsWith(failOn.suffix)) {
        real.writeFileSync(target, 'half', options);
        const error = new Error('ENOSPC: no space left on device') as NodeJS.ErrnoException;
        error.code = 'ENOSPC';
        throw error;
      }
      return real.writeFileSync(target, data, options);
    },
  };
});

import * as fs from 'fs';
import { unpackWorkspaceArchive } from './workspace-archive';

it('removes a file it made before the write failed, and what it wrote before', () => {
  const base = fs.mkdtempSync(path.join(os.tmpdir(), 'cwm-partial-'));
  try {
    const user = `data/storage/${'a'.repeat(64)}`;
    failOn.suffix = path.join('data', 'secrets.json');
    expect(() => unpackWorkspaceArchive([
      { path: user, data: Buffer.from('x') },
      { path: 'data/secrets.json', data: Buffer.from('{}') },
    ], path.join(base, 'ws'))).toThrow(/ENOSPC/);
    expect(fs.existsSync(path.join(base, 'ws'))).toBe(false);
  } finally {
    failOn.suffix = '';
    fs.rmSync(base, { recursive: true, force: true });
  }
});

it('leaves a file that was there already (EEXIST) alone', () => {
  const base = fs.mkdtempSync(path.join(os.tmpdir(), 'cwm-partial-'));
  try {
    const root = path.join(base, 'ws');
    fs.mkdirSync(path.join(root, 'data'), { recursive: true });
    fs.writeFileSync(path.join(root, 'data', 'secrets.json'), 'theirs');
    expect(() => unpackWorkspaceArchive([
      { path: 'data/secrets.json', data: Buffer.from('{}') },
    ], root)).toThrow();
    expect(fs.readFileSync(path.join(root, 'data', 'secrets.json'), 'utf8')).toBe('theirs');
  } finally {
    fs.rmSync(base, { recursive: true, force: true });
  }
});
