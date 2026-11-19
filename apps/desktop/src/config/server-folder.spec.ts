import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { isServerFolder } from './server-folder';

describe('server folder', () => {
  let root: string;

  beforeEach(() => {
    root = fs.mkdtempSync(path.join(os.tmpdir(), 'cwm-srv-'));
  });

  afterEach(() => {
    fs.rmSync(root, { recursive: true, force: true });
  });

  const touch = (...parts: string[]) => {
    fs.mkdirSync(path.join(root, ...parts.slice(0, -1)), { recursive: true });
    fs.writeFileSync(path.join(root, ...parts), '');
  };

  it('an unpacked server package before its first start (executable, conf/cwm.conf.sample)', () => {
    touch('cubrid-admin.exe');
    touch('conf', 'cwm.conf.sample');
    expect(isServerFolder(root)).toBe(true);
  });

  it.each([['cubrid-admin.exe'], ['cubrid-admin'], ['cubrid-admin-linux'], ['cubrid-admin-linux-el7'], ['cubrid-admin-macos-arm64'], ['cubrid-admin-service.exe']])(
    'a folder with the server executable %s',
    (name) => {
      touch(name);
      expect(isServerFolder(root)).toBe(true);
    }
  );

  it('a server that has run (cwm-vault/), even with a data/ folder (its storage)', () => {
    fs.mkdirSync(path.join(root, 'cwm-vault'));
    fs.mkdirSync(path.join(root, 'data'));
    expect(isServerFolder(root)).toBe(true);
  });

  it('an installed server data folder before its first start (conf/cwm.conf, no data/)', () => {
    touch('conf', 'cwm.conf');
    fs.mkdirSync(path.join(root, 'logs'));
    expect(isServerFolder(root)).toBe(true);
  });

  it('not a desktop workspace, even with its own conf/cwm.conf, ssl/ and logs/', () => {
    touch('data', 'secrets.json');
    touch('conf', 'cwm.conf');
    fs.mkdirSync(path.join(root, 'ssl'));
    fs.mkdirSync(path.join(root, 'logs'));
    expect(isServerFolder(root)).toBe(false);
  });

  it('not an empty folder, a missing one, or a folder of other files', () => {
    expect(isServerFolder(root)).toBe(false);
    expect(isServerFolder(path.join(root, 'missing'))).toBe(false);
    touch('notes.txt');
    touch('cubrid-admin-notes.txt');
    expect(isServerFolder(root)).toBe(false);
  });
});
