import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import { Provider } from 'react-redux';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { configureStore } from '@reduxjs/toolkit';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../layout/components/HeaderMenu', () => ({ default: () => null }));
vi.mock('../layout/components/LanguageToggle', () => ({ default: () => null }));
vi.mock('../user/components/UserProfileModal', () => ({ default: () => null }));
vi.mock('../user/userSlice', () => ({ fetchPreferences: () => ({ type: 'test/fetchPreferences' }) }));
import Header from '../layout/components/Header';
import DesktopWorkspaceSettingsPage from './components/DesktopWorkspaceSettingsPage';
import { CM } from '../../constants/cmLabels';

let container;
let root;

beforeEach(() => {
  globalThis.IS_REACT_ACT_ENVIRONMENT = true;
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
});

afterEach(async () => {
  await act(async () => root.unmount());
  container.remove();
  delete globalThis.IS_REACT_ACT_ENVIRONMENT;
  delete window.desktopConfig;
  delete window.desktopBridge;
  vi.resetModules();
});

// Types into a controlled input the way a user does (React reads the value setter).
const typeInto = (input, value) => act(async () => {
  Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(input, value);
  input.dispatchEvent(new Event('input', { bubbles: true }));
});

const store = () => configureStore({
  reducer: {
    auth: (state = { isAuthenticated: true, user: { id: 'desktop' }, loading: false, error: null }) => state,
    user: (state = { preferences: { uiLocale: 'en' } }) => state,
  },
});

describe('desktop app without an app login', () => {
  it('starts signed in on the desktop, and signed out in a browser without a token', async () => {
    // authSlice reads it once, as it loads.
    vi.resetModules();
    window.desktopConfig = { isDesktop: true };
    expect((await import('../auth/authSlice')).default(undefined, { type: 'init' }).isAuthenticated).toBe(true);

    delete window.desktopConfig;
    vi.resetModules();
    localStorage.removeItem('token');
    expect((await import('../auth/authSlice')).default(undefined, { type: 'init' }).isAuthenticated).toBe(false);
  });

  it('shows no account or logout in the header on the desktop, but does in a browser', async () => {
    window.desktopConfig = { isDesktop: true };
    await act(async () => root.render(<Provider store={store()}><Header theme="light" toggleTheme={() => undefined} /></Provider>));
    expect(container.querySelector(`[title="${CM.logout}"]`)).toBeNull();

    delete window.desktopConfig;
    await act(async () => root.render(<Provider store={store()}><Header theme="dark" toggleTheme={() => undefined} /></Provider>));
    expect(container.querySelector(`[title="${CM.logout}"]`)).not.toBeNull();
  });

  it('shows why the workspace failed at launch, and waits for the app to reload after a change instead of going to the login page', async () => {
    window.desktopConfig = { isDesktop: true };
    window.desktopBridge = {
      getWorkspaceInfo: vi.fn().mockResolvedValue({ workspaceRoot: '/ws', defaultWorkspaceRoot: '/ws', isCustomWorkspace: false, settingsFilePath: '/s.json' }),
      isWorkspaceSetupRequired: vi.fn().mockResolvedValue(false),
      getWorkspaceStartupError: vi.fn().mockResolvedValue('WORKSPACE_NOT_WRITABLE: EACCES'),
      setWorkspaceRoot: vi.fn().mockResolvedValue({ ok: true }),
    };
    await act(async () => root.render(
      <Provider store={store()}>
        <MemoryRouter initialEntries={['/desktop/workspace']}>
          <Routes>
            <Route path="/desktop/workspace" element={<DesktopWorkspaceSettingsPage />} />
            <Route path="/login" element={<div>LOGIN PAGE</div>} />
          </Routes>
        </MemoryRouter>
      </Provider>
    ));
    expect(container.textContent).toContain('WORKSPACE_NOT_WRITABLE: EACCES');

    await typeInto(container.querySelector('[data-testid="workspace-root-input"] input, input[data-testid="workspace-root-input"]'), '/ws2');
    await act(async () => container.querySelector('[data-testid="workspace-save-btn"]').click());
    expect(window.desktopBridge.setWorkspaceRoot).toHaveBeenCalledWith('/ws2');
    expect(container.textContent).toContain(CM.applyingWorkspaceMsg);
    expect(container.textContent).not.toContain('LOGIN PAGE');
  });

  const workspaceBridge = (setupRequired, isCustomWorkspace = false) => ({
    getWorkspaceInfo: vi.fn().mockResolvedValue({ workspaceRoot: '/ws', defaultWorkspaceRoot: '/ws', isCustomWorkspace, settingsFilePath: '/s.json' }),
    isWorkspaceSetupRequired: vi.fn().mockResolvedValue(setupRequired),
    getWorkspaceStartupError: vi.fn().mockResolvedValue(null),
    setWorkspaceRoot: vi.fn().mockResolvedValue({ ok: true }),
    finishWorkspaceSetup: vi.fn().mockResolvedValue({ ok: true }),
  });
  const renderWorkspacePage = () => act(async () => root.render(
    <Provider store={store()}>
      <MemoryRouter initialEntries={['/desktop/workspace']}>
        <Routes>
          <Route path="/desktop/workspace" element={<DesktopWorkspaceSettingsPage />} />
          <Route path="/home" element={<div>DASHBOARD</div>} />
          <Route path="/login" element={<div>LOGIN PAGE</div>} />
        </Routes>
      </MemoryRouter>
    </Provider>
  ));

  it('goes back to the dashboard, not the login page, from the workspace page of a running app, changing nothing', async () => {
    window.desktopConfig = { isDesktop: true };
    window.desktopBridge = workspaceBridge(false);
    await renderWorkspacePage();
    expect(container.querySelector('a[href="/login"]')).toBeNull();
    expect(container.textContent).not.toContain(CM.signIn);
    const back = container.querySelector('[data-testid="workspace-back-link"]');
    expect(back.getAttribute('href')).toBe('/home');
    expect(back.textContent).toContain(CM.backBtn);

    await act(async () => back.click());
    expect(container.textContent).toContain('DASHBOARD');
    expect(container.textContent).not.toContain('LOGIN PAGE');
    expect(window.desktopBridge.setWorkspaceRoot).not.toHaveBeenCalled();
    expect(window.desktopBridge.finishWorkspaceSetup).not.toHaveBeenCalled();
  });

  it('offers no way back on first run, when no workspace is set up yet', async () => {
    window.desktopConfig = { isDesktop: true };
    window.desktopBridge = workspaceBridge(true);
    await renderWorkspacePage();
    expect(container.querySelector('[data-testid="workspace-continue-btn"]')).not.toBeNull();
    expect(container.querySelector('[data-testid="workspace-back-link"]')).toBeNull();
    expect(container.querySelector('a')).toBeNull();
  });

  const input = () => container.querySelector('input[data-testid="workspace-root-input"], [data-testid="workspace-root-input"] input');
  const saveButton = () => container.querySelector('[data-testid="workspace-save-btn"]');

  it('saves only a folder other than the current workspace', async () => {
    window.desktopConfig = { isDesktop: true };
    window.desktopBridge = workspaceBridge(false, true);
    await renderWorkspacePage();
    expect(input().value).toBe('/ws');
    expect(saveButton().disabled).toBe(true);

    for (const same of ['/ws/', '  /ws  ', '/ws//']) {
      await typeInto(input(), same);
      expect(saveButton().disabled).toBe(true);
    }
    await typeInto(input(), '');
    expect(saveButton().disabled).toBe(true);

    await typeInto(input(), '/ws-other');
    expect(saveButton().disabled).toBe(false);
    await act(async () => saveButton().click());
    expect(window.desktopBridge.setWorkspaceRoot).toHaveBeenCalledWith('/ws-other');
  });

  it('goes back to the dashboard when the main process finds it is the folder in use', async () => {
    window.desktopConfig = { isDesktop: true };
    window.desktopBridge = workspaceBridge(false, true);
    window.desktopBridge.setWorkspaceRoot.mockResolvedValue({ ok: true, unchanged: true });
    await renderWorkspacePage();
    await typeInto(input(), '/private/ws');
    await act(async () => saveButton().click());
    expect(container.textContent).toContain('DASHBOARD');
  });

  it('asks before switching when the running jobs could not be checked, and switches only if told', async () => {
    window.desktopConfig = { isDesktop: true };
    window.desktopBridge = workspaceBridge(false, true);
    const unknown = new Error("Error invoking remote method 'desktop:set-workspace-root': Error: WORKSPACE_JOBS_UNKNOWN");
    window.desktopBridge.setWorkspaceRoot.mockImplementation(async (_root, options) => {
      if (!options?.ignoreUnknownJobs) throw unknown;
      return { ok: true };
    });
    await renderWorkspacePage();
    await typeInto(input(), '/ws-other');
    await act(async () => saveButton().click());
    expect(document.body.textContent).toContain(CM.workspaceJobsUnknownDesc);

    await act(async () => document.querySelector('[data-testid="workspace-jobs-unknown-cancel-btn"]').click());
    expect(window.desktopBridge.setWorkspaceRoot).toHaveBeenCalledTimes(1);

    await act(async () => saveButton().click());
    await act(async () => document.querySelector('[data-testid="workspace-jobs-unknown-confirm-btn"]').click());
    expect(window.desktopBridge.setWorkspaceRoot).toHaveBeenLastCalledWith('/ws-other', { ignoreUnknownJobs: true });
  });

  it('shows no back link until it knows this is not the first-run setup', async () => {
    window.desktopConfig = { isDesktop: true };
    let answer;
    window.desktopBridge = workspaceBridge(false, true);
    window.desktopBridge.isWorkspaceSetupRequired = vi.fn(() => new Promise((resolve) => { answer = resolve; }));
    await renderWorkspacePage();
    expect(container.querySelector('[data-testid="workspace-back-link"]')).toBeNull();
    await act(async () => answer(false));
    expect(container.querySelector('[data-testid="workspace-back-link"]')).not.toBeNull();
  });

  it('has no button that resets to the default workspace', async () => {
    window.desktopConfig = { isDesktop: true };
    window.desktopBridge = workspaceBridge(false, true);
    await renderWorkspacePage();
    expect(saveButton()).not.toBeNull();
    expect(container.querySelector('[data-testid="workspace-reset-btn"]')).toBeNull();
    // A custom workspace is where the reset button used to show.
    expect([...container.querySelectorAll('button')].map((b) => b.textContent.trim()))
      .not.toContain('Default location');
    expect('defaultLocationBtn' in CM).toBe(false);
  });

  it('lets first run continue with the default folder as offered', async () => {
    window.desktopConfig = { isDesktop: true };
    window.desktopBridge = workspaceBridge(true);
    await renderWorkspacePage();
    const continueButton = container.querySelector('[data-testid="workspace-continue-btn"]');
    expect(input().value).toBe('/ws');
    expect(continueButton.disabled).toBe(false);
    await act(async () => continueButton.click());
    expect(window.desktopBridge.finishWorkspaceSetup).toHaveBeenCalledWith('/ws');
  });
});
