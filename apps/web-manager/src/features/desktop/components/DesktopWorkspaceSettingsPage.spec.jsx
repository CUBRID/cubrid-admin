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

  describe('server start', () => {
    let emit;

    async function renderWithStatus(initial) {
      window.desktopBridge.getApiStartStatus = vi.fn().mockResolvedValue(initial);
      window.desktopBridge.onApiStartStatus = vi.fn((callback) => {
        emit = callback;
        return () => undefined;
      });
      window.desktopBridge.decideApiStart = vi.fn().mockResolvedValue({ ok: true });
      const store = configureStore({ reducer: { user: userReducer, auth: () => ({}) } });
      await act(async () => {
        root.render(<Provider store={store}><MemoryRouter><Page /></MemoryRouter></Provider>);
      });
    }
    const byTestId = (id) => container.querySelector(`[data-testid="${id}"]`);

    it('shows a slow but running start as progress, with Continue off, and no error', async () => {
      await renderWithStatus({ state: 'starting', elapsedMs: 12_400 });
      expect(byTestId('api-start-progress').textContent).toBe('Starting the server… 12 s');
      expect(byTestId('workspace-continue-btn').disabled).toBe(true);
      expect(container.textContent).not.toMatch(/could not start/);

      await act(async () => emit({ state: 'starting', elapsedMs: 45_000 }));
      expect(byTestId('api-start-progress').textContent).toBe('Starting the server… 45 s');
    });

    it('after the soft limit, offers Keep waiting and Stop, and sends the answer', async () => {
      await renderWithStatus({ state: 'slow', elapsedMs: 120_000 });
      expect(byTestId('api-start-slow').textContent).toMatch(/longer than usual to start \(120 s\)/);

      await act(async () => byTestId('api-start-keep-waiting-btn').click());
      expect(window.desktopBridge.decideApiStart).toHaveBeenLastCalledWith('wait');
      await act(async () => byTestId('api-start-stop-btn').click());
      expect(window.desktopBridge.decideApiStart).toHaveBeenLastCalledWith('stop');
    });

    it('shows a failed start in words, not as a raw code', async () => {
      window.desktopBridge.getWorkspaceStartupError = vi.fn().mockResolvedValue('WORKSPACE_API_START_FAILED: listen EADDRINUSE');
      await renderWithStatus({ state: 'idle' });
      expect(container.textContent).toMatch(/The server could not start\. \(listen EADDRINUSE\)/);
      expect(byTestId('workspace-continue-btn').disabled).toBe(false);
    });
  });
});
