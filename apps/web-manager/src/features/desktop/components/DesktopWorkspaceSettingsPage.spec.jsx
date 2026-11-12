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
