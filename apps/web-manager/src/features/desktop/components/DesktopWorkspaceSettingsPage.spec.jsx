import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { Provider } from 'react-redux';
import { MemoryRouter } from 'react-router-dom';
import { configureStore } from '@reduxjs/toolkit';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import userReducer from '../../user/userSlice';
import { LOCALE_STORAGE_KEY } from '../../../constants/useCM';
import { useDesktopMenuLanguage } from '../hooks/useDesktopMenuLanguage';
import DesktopWorkspaceSettingsPage from './DesktopWorkspaceSettingsPage';

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

let container;
let root;

// App calls useDesktopMenuLanguage on every route, the workspace page included.
function Page() {
  useDesktopMenuLanguage();
  return <DesktopWorkspaceSettingsPage />;
}

beforeEach(() => {
  localStorage.setItem(LOCALE_STORAGE_KEY, 'en');
  window.desktopBridge = {
    getWorkspaceInfo: vi.fn().mockResolvedValue({ workspaceRoot: '/w', defaultWorkspaceRoot: '/w', isCustomWorkspace: false, settingsFilePath: '/s.json' }),
    isWorkspaceSetupRequired: vi.fn().mockResolvedValue(true),
    setMenuLanguage: vi.fn().mockResolvedValue({ ok: true }),
  };
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
});

afterEach(async () => {
  await act(() => root.unmount());
  container.remove();
  delete window.desktopBridge;
  localStorage.removeItem(LOCALE_STORAGE_KEY);
});

describe('DesktopWorkspaceSettingsPage', () => {
  it('switches the first-run screen, the stored UI language and the desktop menu language together', async () => {
    const store = configureStore({ reducer: { user: userReducer, auth: () => ({}) } });
    await act(async () => {
      root.render(<Provider store={store}><MemoryRouter><Page /></MemoryRouter></Provider>);
    });
    const title = () => container.querySelector('[data-testid="workspace-setup-title"]').textContent;
    expect(title()).toBe('Select Workspace');

    const kr = [...container.querySelectorAll('button')].find((b) => b.textContent === 'KR');
    await act(async () => kr.click());

    expect(title()).toBe('워크스페이스 선택');
    expect(localStorage.getItem(LOCALE_STORAGE_KEY)).toBe('ko');
    expect(window.desktopBridge.setMenuLanguage).toHaveBeenLastCalledWith('ko');
  });
});

describe('export and import', () => {
  const remoteError = (code) => new Error(`Error invoking remote method 'x': Error: ${code}`);
  const render = async ({ setup = false, path = '/desktop/workspace' } = {}) => {
    window.desktopBridge.isWorkspaceSetupRequired = vi.fn().mockResolvedValue(setup);
    Object.assign(window.desktopBridge, {
      pickWorkspaceArchive: vi.fn().mockResolvedValue('/exports/a.cubridws'),
      openWorkspaceArchive: vi.fn().mockResolvedValue({ token: 't1' }),
      forgetWorkspaceArchive: vi.fn().mockResolvedValue({ ok: true }),
      pickImportFolder: vi.fn().mockResolvedValue('/new-ws'),
      importWorkspaceArchive: vi.fn().mockResolvedValue({ workspaceRoot: '/new-ws' }),
      setWorkspaceRoot: vi.fn().mockResolvedValue({ ok: true }),
      finishWorkspaceSetup: vi.fn().mockResolvedValue({ ok: true }),
      exportWorkspace: vi.fn().mockResolvedValue({ filePath: '/exports/b.cubridws' }),
    });
    const store = configureStore({ reducer: { user: userReducer, auth: () => ({}) } });
    await act(async () => {
      root.render(<Provider store={store}><MemoryRouter initialEntries={[path]}><Page /></MemoryRouter></Provider>);
    });
  };
  const q = (id) => document.querySelector(`[data-testid="${id}"]`);
  const click = (el) => act(async () => el.click());
  const type = (el, value) => act(async () => {
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(el, value);
    el.dispatchEvent(new Event('input', { bubbles: true }));
  });

  it('asks the password again while it is wrong, then makes the chosen folder a workspace and switches to it', async () => {
    await render();
    await click(q('workspace-import-btn'));
    window.desktopBridge.openWorkspaceArchive.mockRejectedValueOnce(remoteError('WORKSPACE_ARCHIVE_WRONG_PASSWORD'));
    await type(q('workspace-import-password-input'), 'wrong');
    await click(q('workspace-import-submit-btn'));
    expect(q('workspace-import-modal')).not.toBeNull();
    expect(document.body.textContent).toContain('The password is wrong.');
    expect(window.desktopBridge.pickImportFolder).not.toHaveBeenCalled();

    await type(q('workspace-import-password-input'), 'right');
    await click(q('workspace-import-submit-btn'));
    expect(window.desktopBridge.openWorkspaceArchive).toHaveBeenLastCalledWith('/exports/a.cubridws', 'right');
    expect(window.desktopBridge.importWorkspaceArchive).toHaveBeenCalledWith('t1', '/new-ws');
    expect(window.desktopBridge.setWorkspaceRoot).toHaveBeenCalledWith('/new-ws');
    expect(q('workspace-import-modal')).toBeNull();
  });

  it('says a damaged file is damaged and stops', async () => {
    await render();
    await click(q('workspace-import-btn'));
    window.desktopBridge.openWorkspaceArchive.mockRejectedValueOnce(remoteError('WORKSPACE_ARCHIVE_DAMAGED'));
    await type(q('workspace-import-password-input'), 'pw');
    await click(q('workspace-import-submit-btn'));
    expect(q('workspace-import-modal')).toBeNull();
    expect(document.body.textContent).toContain('The file is damaged.');
    expect(window.desktopBridge.importWorkspaceArchive).not.toHaveBeenCalled();
  });

  it('on first run, sets up the imported workspace instead of switching, and offers no export', async () => {
    await render({ setup: true });
    expect(q('workspace-export-btn')).toBeNull();
    await click(q('workspace-import-btn'));
    await type(q('workspace-import-password-input'), 'pw');
    await click(q('workspace-import-submit-btn'));
    expect(window.desktopBridge.finishWorkspaceSetup).toHaveBeenCalledWith('/new-ws');
    expect(window.desktopBridge.setWorkspaceRoot).not.toHaveBeenCalled();
  });

  it('starts the import once when opened from File > Import Workspace', async () => {
    await render({ path: '/desktop/workspace?do=import' });
    expect(window.desktopBridge.pickWorkspaceArchive).toHaveBeenCalledTimes(1);
    expect(q('workspace-import-modal')).not.toBeNull();
  });

  it('asks only for another folder when the chosen one will not do', async () => {
    await render();
    window.desktopBridge.pickImportFolder.mockResolvedValueOnce('/busy').mockResolvedValueOnce('/new-ws');
    window.desktopBridge.importWorkspaceArchive.mockRejectedValueOnce(remoteError('WORKSPACE_IMPORT_FOLDER_NOT_EMPTY'));
    await click(q('workspace-import-btn'));
    await type(q('workspace-import-password-input'), 'pw');
    await click(q('workspace-import-submit-btn'));
    expect(q('workspace-import-folder-modal')).not.toBeNull();
    expect(document.body.textContent).toContain('Choose an empty or new folder.');

    await click(q('workspace-import-folder-btn'));
    expect(window.desktopBridge.openWorkspaceArchive).toHaveBeenCalledTimes(1);
    expect(window.desktopBridge.importWorkspaceArchive).toHaveBeenLastCalledWith('t1', '/new-ws');
    expect(window.desktopBridge.setWorkspaceRoot).toHaveBeenCalledWith('/new-ws');
    expect(q('workspace-import-folder-modal')).toBeNull();
  });

  it('drops the opened export when the folder step is cancelled', async () => {
    await render();
    window.desktopBridge.pickImportFolder.mockResolvedValueOnce(null);
    await click(q('workspace-import-btn'));
    await type(q('workspace-import-password-input'), 'pw');
    await click(q('workspace-import-submit-btn'));
    const cancel = [...q('workspace-import-folder-modal').querySelectorAll('button')].find((b) => b.textContent === 'Cancel');
    await click(cancel);
    expect(window.desktopBridge.forgetWorkspaceArchive).toHaveBeenCalledWith('t1');
    expect(q('workspace-import-folder-modal')).toBeNull();
  });

  it('says where the workspace was imported when the switch to it fails', async () => {
    await render();
    window.desktopBridge.setWorkspaceRoot.mockRejectedValueOnce(remoteError('WORKSPACE_JOBS_RUNNING'));
    await click(q('workspace-import-btn'));
    await type(q('workspace-import-password-input'), 'pw');
    await click(q('workspace-import-submit-btn'));
    expect(document.body.textContent).toContain('A CMS job is running. Try again when it ends.');
    expect(q('workspace-imported-at').textContent).toBe('Imported to: /new-ws');
  });

  it('drops the opened export when the page goes away mid-import', async () => {
    await render();
    window.desktopBridge.pickImportFolder.mockResolvedValueOnce(null);
    await click(q('workspace-import-btn'));
    await type(q('workspace-import-password-input'), 'pw');
    await click(q('workspace-import-submit-btn'));
    expect(q('workspace-import-folder-modal')).not.toBeNull();
    await act(async () => root.render(<div />));
    expect(window.desktopBridge.forgetWorkspaceArchive).toHaveBeenCalledWith('t1');
  });

  it('exports only with a password of 8 characters or more', async () => {
    await render();
    await click(q('workspace-export-btn'));
    await type(q('workspace-export-password-input'), 'short');
    await type(q('workspace-export-confirm-input'), 'short');
    await click(q('workspace-export-submit-btn'));
    expect(document.body.textContent).toContain('At least 8 characters.');
    expect(window.desktopBridge.exportWorkspace).not.toHaveBeenCalled();
  });

  it('says no workspace is running when there is none to export', async () => {
    await render();
    window.desktopBridge.exportWorkspace.mockRejectedValueOnce(remoteError('WORKSPACE_NOT_RUNNING'));
    await click(q('workspace-export-btn'));
    await type(q('workspace-export-password-input'), 'long enough');
    await type(q('workspace-export-confirm-input'), 'long enough');
    await click(q('workspace-export-submit-btn'));
    expect(document.body.textContent).toContain('No workspace is running.');
  });

  it('exports only with the password typed the same twice', async () => {
    await render();
    await click(q('workspace-export-btn'));
    await type(q('workspace-export-password-input'), 'password-one');
    await type(q('workspace-export-confirm-input'), 'password-two');
    await click(q('workspace-export-submit-btn'));
    expect(document.body.textContent).toContain('The passwords do not match.');
    expect(window.desktopBridge.exportWorkspace).not.toHaveBeenCalled();

    await type(q('workspace-export-confirm-input'), 'password-one');
    await click(q('workspace-export-submit-btn'));
    expect(window.desktopBridge.exportWorkspace).toHaveBeenCalledWith('password-one');
    expect(document.body.textContent).toContain('Exported to /exports/b.cubridws.');
  });
});
