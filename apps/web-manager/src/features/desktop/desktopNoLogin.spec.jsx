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

    await act(async () => container.querySelector('[data-testid="workspace-save-btn"]').click());
    expect(window.desktopBridge.setWorkspaceRoot).toHaveBeenCalledWith('/ws');
    expect(container.textContent).toContain(CM.applyingWorkspaceMsg);
    expect(container.textContent).not.toContain('LOGIN PAGE');
  });
});
