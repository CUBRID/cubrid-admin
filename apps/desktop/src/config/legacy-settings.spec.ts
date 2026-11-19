import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { adoptLegacyDesktopSettings } from './legacy-settings';
import { isPathInsideAppBundle, isPathInsideInstallFolder } from './portable-root';

jest.mock('electron', () => ({ app: { isPackaged: false } }));
jest.mock('./portable-root', () => ({
  ...jest.requireActual('./portable-root'),
  isPathInsideAppBundle: jest.fn(() => false),
  isPathInsideInstallFolder: jest.fn(() => false),
}));
const inBundle = isPathInsideAppBundle as jest.Mock;
const inInstallFolder = isPathInsideInstallFolder as jest.Mock;

describe('settings of a 0.1.0 app updated in place', () => {
  let base: string;
  let legacyRoot: string;
  let currentRoot: string;

  beforeEach(() => {
    base = fs.mkdtempSync(path.join(os.tmpdir(), 'cwm-legacy-'));
    legacyRoot = path.join(base, 'Applications');
    currentRoot = path.join(base, 'Application Support', 'CUBRID Admin');
    fs.mkdirSync(legacyRoot, { recursive: true });
  });

  afterEach(() => {
    inBundle.mockReset().mockReturnValue(false);
    inInstallFolder.mockReset().mockReturnValue(false);
    fs.chmodSync(base, 0o755);
    fs.rmSync(base, { recursive: true, force: true });
  });

  const write = (root: string, settings: object) => {
    fs.mkdirSync(root, { recursive: true });
    fs.writeFileSync(path.join(root, 'desktop-settings.json'), JSON.stringify(settings));
  };
  const read = (root: string) => JSON.parse(fs.readFileSync(path.join(root, 'desktop-settings.json'), 'utf8'));
  const legacyWorkspace = () => {
    const workspace = path.join(legacyRoot, 'cwm-workspace');
    fs.mkdirSync(path.join(workspace, 'data'), { recursive: true });
    fs.writeFileSync(path.join(workspace, 'data', 'secrets.json'), '{"seed":"s","salt":"t"}');
    return workspace;
  };

  it('uses the workspace beside the app, writes the settings in the new place and leaves the old file and the workspace', () => {
    const workspace = legacyWorkspace();
    const old = { lastUpdateCheckAt: '2026-11-01T00:00:00.000Z', workspaceRoot: workspace, workspaceSetupComplete: true };
    write(legacyRoot, old);

    const adopted = adoptLegacyDesktopSettings(currentRoot, legacyRoot);

    expect(adopted).toEqual({
      from: path.join(legacyRoot, 'desktop-settings.json'),
      to: path.join(currentRoot, 'desktop-settings.json'),
      workspaceRoot: workspace,
    });
    expect(read(currentRoot)).toEqual(old);
    expect(read(legacyRoot)).toEqual(old);
    expect(fs.readFileSync(path.join(workspace, 'data', 'secrets.json'), 'utf8')).toBe('{"seed":"s","salt":"t"}');
  });

  it('points at the default workspace beside the app when the old settings name none', () => {
    const workspace = legacyWorkspace();
    write(legacyRoot, { workspaceSetupComplete: true });

    expect(adoptLegacyDesktopSettings(currentRoot, legacyRoot)?.workspaceRoot).toBe(workspace);
    expect(read(currentRoot)).toEqual({ workspaceSetupComplete: true, workspaceRoot: workspace });
  });

  it('keeps a workspace chosen elsewhere', () => {
    const elsewhere = path.join(base, 'my-workspace');
    write(legacyRoot, { workspaceRoot: elsewhere, workspaceSetupComplete: true });

    expect(adoptLegacyDesktopSettings(currentRoot, legacyRoot)?.workspaceRoot).toBe(elsewhere);
  });

  it('also when the new place already has update check times only, and keeps them', () => {
    const workspace = legacyWorkspace();
    write(legacyRoot, { workspaceRoot: workspace, workspaceSetupComplete: true, lastUpdateCheckAt: '2026-11-01T00:00:00.000Z' });
    write(currentRoot, { lastUpdateCheckAt: '2026-11-19T00:00:00.000Z', checkForUpdatesOnStartup: false });

    adoptLegacyDesktopSettings(currentRoot, legacyRoot);

    expect(read(currentRoot)).toEqual({
      workspaceRoot: workspace,
      workspaceSetupComplete: true,
      lastUpdateCheckAt: '2026-11-19T00:00:00.000Z',
      checkForUpdatesOnStartup: false,
    });
  });

  it.each([
    ['a workspace is already set up in the new place', { workspaceSetupComplete: true }],
    ['a workspace is already chosen in the new place', { workspaceRoot: '/somewhere' }],
  ])('does nothing when %s', (_case, current) => {
    write(legacyRoot, { workspaceRoot: legacyWorkspace(), workspaceSetupComplete: true });
    write(currentRoot, current);

    expect(adoptLegacyDesktopSettings(currentRoot, legacyRoot)).toBeNull();
    expect(read(currentRoot)).toEqual(current);
  });

  it('does nothing without old settings, for the same place, or when the old app never set up a workspace', () => {
    expect(adoptLegacyDesktopSettings(currentRoot, legacyRoot)).toBeNull();
    expect(adoptLegacyDesktopSettings(currentRoot, null)).toBeNull();

    write(legacyRoot, { workspaceSetupComplete: true });
    expect(adoptLegacyDesktopSettings(legacyRoot, legacyRoot)).toBeNull();

    write(legacyRoot, { lastUpdateCheckAt: '2026-11-01T00:00:00.000Z' });
    expect(adoptLegacyDesktopSettings(currentRoot, legacyRoot)).toBeNull();
    expect(fs.existsSync(path.join(currentRoot, 'desktop-settings.json'))).toBe(false);
  });

  it('does nothing when the old settings name no workspace and none is beside the app', () => {
    write(legacyRoot, { workspaceSetupComplete: true });

    expect(adoptLegacyDesktopSettings(currentRoot, legacyRoot)).toBeNull();
  });

  it('leaves an unreadable old file alone and starts as without it', () => {
    fs.writeFileSync(path.join(legacyRoot, 'desktop-settings.json'), '{ not json');
    const warn = jest.spyOn(console, 'warn').mockImplementation(() => undefined);

    expect(adoptLegacyDesktopSettings(currentRoot, legacyRoot)).toBeNull();
    expect(warn).toHaveBeenCalled();
    expect(fs.existsSync(path.join(currentRoot, 'desktop-settings.json'))).toBe(false);
    warn.mockRestore();
  });

  it('takes a workspace inside the app bundle as none and uses the default one beside the app', () => {
    const workspace = legacyWorkspace();
    const bundled = path.join(legacyRoot, 'CUBRID Admin.app', 'Contents', 'ws');
    inBundle.mockImplementation((p: string) => p === bundled);
    write(legacyRoot, { workspaceRoot: bundled, workspaceSetupComplete: true });

    expect(adoptLegacyDesktopSettings(currentRoot, legacyRoot)?.workspaceRoot).toBe(workspace);
    expect(read(currentRoot).workspaceRoot).toBe(workspace);
  });

  it('does not use a workspace in the Windows install folder (an update or uninstall removes it)', () => {
    const workspace = legacyWorkspace();
    inInstallFolder.mockImplementation((p: string) => p === workspace);
    write(legacyRoot, { workspaceSetupComplete: true });
    const warn = jest.spyOn(console, 'warn').mockImplementation(() => undefined);

    expect(adoptLegacyDesktopSettings(currentRoot, legacyRoot)).toBeNull();
    expect(warn.mock.calls[0].join(' ')).toContain('install folder');
    expect(fs.existsSync(path.join(currentRoot, 'desktop-settings.json'))).toBe(false);
    warn.mockRestore();
  });

  it('does not use a 0.1.0 workspace that is a server folder', () => {
    const server = path.join(base, 'server');
    fs.mkdirSync(path.join(server, 'cwm-vault'), { recursive: true });
    write(legacyRoot, { workspaceRoot: server, workspaceSetupComplete: true });
    const warn = jest.spyOn(console, 'warn').mockImplementation(() => undefined);

    expect(adoptLegacyDesktopSettings(currentRoot, legacyRoot)).toBeNull();
    expect(warn.mock.calls[0].join(' ')).toContain('Server folder');
    warn.mockRestore();
  });

  it('says the current settings file is the one that cannot be read, and leaves both files', () => {
    write(legacyRoot, { workspaceRoot: legacyWorkspace(), workspaceSetupComplete: true });
    fs.mkdirSync(currentRoot, { recursive: true });
    fs.writeFileSync(path.join(currentRoot, 'desktop-settings.json'), '{ broken');
    const warn = jest.spyOn(console, 'warn').mockImplementation(() => undefined);

    expect(adoptLegacyDesktopSettings(currentRoot, legacyRoot)).toBeNull();
    expect(warn.mock.calls[0].join(' ')).toContain('current settings file cannot be read');
    expect(fs.readFileSync(path.join(currentRoot, 'desktop-settings.json'), 'utf8')).toBe('{ broken');
    warn.mockRestore();
  });

  it('only warns when the settings cannot be written in the current place', () => {
    write(legacyRoot, { workspaceRoot: legacyWorkspace(), workspaceSetupComplete: true });
    const readOnly = path.join(base, 'read-only');
    fs.mkdirSync(readOnly);
    fs.chmodSync(readOnly, 0o555);
    const warn = jest.spyOn(console, 'warn').mockImplementation(() => undefined);
    try {
      expect(adoptLegacyDesktopSettings(path.join(readOnly, 'CUBRID Admin'), legacyRoot)).toBeNull();
      expect(warn.mock.calls[0].join(' ')).toContain('not copied to');
    } finally {
      fs.chmodSync(readOnly, 0o755);
      warn.mockRestore();
    }
  });
});
