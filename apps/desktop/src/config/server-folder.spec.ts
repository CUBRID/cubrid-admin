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
  const dir = (...parts: string[]) => fs.mkdirSync(path.join(root, ...parts), { recursive: true });

  describe('refused', () => {
    it.each([['cubrid-admin.exe'], ['cubrid-admin-linux'], ['cubrid-admin-linux-el7'], ['cubrid-admin-linux-arm64'], ['cubrid-admin-macos-arm64']])(
      'an unpacked server package before its first start (%s, conf/cwm.conf.sample)',
      (exe) => {
        touch(exe);
        touch('conf', 'cwm.conf.sample');
        touch('conf', 'cwm.conf.reference.md');
        expect(isServerFolder(root)).toBe(true);
      }
    );

    it('the server zip folder after it has run (cwm-vault/, conf/cwm.conf, data/ as its storage)', () => {
      touch('cubrid-admin.exe');
      touch('conf', 'cwm.conf.sample');
      touch('conf', 'cwm.conf');
      touch('cwm-vault', 'secrets.json');
      dir('data');
      dir('ssl');
      expect(isServerFolder(root)).toBe(true);
    });

    it('an installed server data folder once it has started (conf/, cwm-vault/, ssl/, storage/, logs/)', () => {
      touch('conf', 'cwm.conf');
      touch('cwm-vault', 'secrets.json');
      dir('ssl');
      dir('storage');
      dir('logs');
      expect(isServerFolder(root)).toBe(true);
    });

    it('the server setup install folder (cubrid-admin.exe, cubrid-admin-service.exe, cwm.conf.sample beside them)', () => {
      touch('cubrid-admin.exe');
      touch('cubrid-admin-service.exe');
      touch('cwm.conf.sample');
      expect(isServerFolder(root)).toBe(true);
    });
  });

  describe('allowed', () => {
    it('a desktop workspace, even with its own conf/cwm.conf, ssl/ and logs/', () => {
      touch('data', 'secrets.json');
      touch('conf', 'cwm.conf');
      dir('ssl');
      dir('logs');
      expect(isServerFolder(root)).toBe(false);
    });

    it('a desktop workspace with cwm.conf.sample copied into its conf/', () => {
      touch('data', 'secrets.json');
      touch('conf', 'cwm.conf.sample');
      touch('conf', 'cwm.conf');
      expect(isServerFolder(root)).toBe(false);
    });

    it('a desktop workspace that also holds a server executable', () => {
      touch('data', 'secrets.json');
      touch('cubrid-admin.exe');
      touch('conf', 'cwm.conf.sample');
      expect(isServerFolder(root)).toBe(false);
    });

    it('a new folder with only conf/cwm.conf made first', () => {
      touch('conf', 'cwm.conf');
      expect(isServerFolder(root)).toBe(false);
    });

    it('a folder holding a clone of the repository named cubrid-admin (~/work)', () => {
      dir('cubrid-admin', 'apps');
      touch('cubrid-admin', 'package.json');
      expect(isServerFolder(root)).toBe(false);
    });

    it('a Downloads or Desktop folder with a server executable downloaded into it', () => {
      touch('cubrid-admin.exe');
      touch('CUBRID-Admin-server-0.2.0.0106-windows-x64.zip');
      touch('notes.txt');
      expect(isServerFolder(root)).toBe(false);
    });

    it('a folder named like a server executable next to the sample', () => {
      dir('cubrid-admin');
      touch('conf', 'cwm.conf.sample');
      expect(isServerFolder(root)).toBe(false);
    });

    it('an empty folder or a missing one', () => {
      expect(isServerFolder(root)).toBe(false);
      expect(isServerFolder(path.join(root, 'missing'))).toBe(false);
    });
  });
});
