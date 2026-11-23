import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { findPreviousWorkspace, isWorkspaceFolder, rememberLastWorkspace } from './last-workspace';
import { isPathInsideAppBundle, isPathInsideInstallFolder } from './portable-root';

jest.mock('electron', () => ({ app: { isPackaged: false, getPath: () => '/unused' } }));
jest.mock('./portable-root', () => ({
  ...jest.requireActual('./portable-root'),
  isPathInsideAppBundle: jest.fn(() => false),
  isPathInsideInstallFolder: jest.fn(() => false),
}));
const inBundle = isPathInsideAppBundle as jest.Mock;
const inInstallFolder = isPathInsideInstallFolder as jest.Mock;

describe('the workspace used last', () => {
  let base: string;
  let note: string;

  beforeEach(() => {
    base = fs.mkdtempSync(path.join(os.tmpdir(), 'cwm-last-'));
    note = path.join(base, 'userData', 'last-workspace.json');
  });

  afterEach(() => {
    inBundle.mockReset().mockReturnValue(false);
    inInstallFolder.mockReset().mockReturnValue(false);
    fs.chmodSync(base, 0o755);
    fs.rmSync(base, { recursive: true, force: true });
  });

  const workspace = (name = 'ws') => {
    const root = path.join(base, name);
    fs.mkdirSync(path.join(root, 'data'), { recursive: true });
    fs.writeFileSync(path.join(root, 'data', 'secrets.json'), '{"seed":"s","salt":"t"}');
    return root;
  };

  it('notes paths only and finds the workspace again', () => {
    const root = workspace();
    rememberLastWorkspace(root, path.join(base, 'portable-X'), note);

    const written = JSON.parse(fs.readFileSync(note, 'utf8'));
    expect(Object.keys(written).sort()).toEqual(['savedAt', 'settingsFolder', 'workspaceRoot']);
    expect(fs.readFileSync(note, 'utf8')).not.toContain('seed');
    expect(findPreviousWorkspace(note)).toEqual({ workspaceRoot: root, settingsFolder: path.join(base, 'portable-X') });
  });

  it('offers nothing when the folder is gone or is not a workspace (no data/secrets.json)', () => {
    const plain = path.join(base, 'plain');
    fs.mkdirSync(path.join(plain, 'data'), { recursive: true });
    rememberLastWorkspace(plain, base, note);
    expect(isWorkspaceFolder(plain)).toBe(false);
    expect(findPreviousWorkspace(note)).toBeNull();

    rememberLastWorkspace(path.join(base, 'gone'), base, note);
    expect(findPreviousWorkspace(note)).toBeNull();
  });

  it('offers nothing that is a server folder', () => {
    const server = path.join(base, 'server');
    fs.mkdirSync(path.join(server, 'cwm-vault'), { recursive: true });
    fs.mkdirSync(path.join(server, 'data'));
    rememberLastWorkspace(server, base, note);
    expect(findPreviousWorkspace(note)).toBeNull();
  });

  it('offers nothing in the app bundle or the Windows install folder', () => {
    const root = workspace();
    rememberLastWorkspace(root, base, note);
    inBundle.mockReturnValue(true);
    expect(findPreviousWorkspace(note)).toBeNull();
    inBundle.mockReturnValue(false);
    inInstallFolder.mockReturnValue(true);
    expect(findPreviousWorkspace(note)).toBeNull();
  });

  it('offers nothing without a note, with a broken note, or without a place for it (dev mode, CWM_PORTABLE_APP_ROOT)', () => {
    expect(findPreviousWorkspace(note)).toBeNull();
    fs.mkdirSync(path.dirname(note), { recursive: true });
    fs.writeFileSync(note, '{ broken');
    const warn = jest.spyOn(console, 'warn').mockImplementation(() => undefined);
    expect(findPreviousWorkspace(note)).toBeNull();
    warn.mockRestore();
    expect(findPreviousWorkspace(null)).toBeNull();
    rememberLastWorkspace(workspace(), base, null);
  });

  it('only warns when the note cannot be written', () => {
    fs.chmodSync(base, 0o555);
    const warn = jest.spyOn(console, 'warn').mockImplementation(() => undefined);
    expect(() => rememberLastWorkspace('/somewhere', base, note)).not.toThrow();
    expect(warn).toHaveBeenCalled();
    warn.mockRestore();
  });
});
