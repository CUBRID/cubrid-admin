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
      openWorkspaceArchive: vi.fn().mockResolvedValue({ ok: true }),
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
    expect(window.desktopBridge.importWorkspaceArchive).toHaveBeenCalledWith('/exports/a.cubridws', 'right', '/new-ws');
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

  it('exports only with the password typed the same twice', async () => {
    await render();
    await click(q('workspace-export-btn'));
    await type(q('workspace-export-password-input'), 'one');
    await type(q('workspace-export-confirm-input'), 'two');
    await click(q('workspace-export-submit-btn'));
    expect(document.body.textContent).toContain('The passwords do not match.');
    expect(window.desktopBridge.exportWorkspace).not.toHaveBeenCalled();

    await type(q('workspace-export-confirm-input'), 'one');
    await click(q('workspace-export-submit-btn'));
    expect(window.desktopBridge.exportWorkspace).toHaveBeenCalledWith('one');
    expect(document.body.textContent).toContain('Exported to /exports/b.cubridws.');
  });
});
