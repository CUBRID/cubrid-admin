import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import { Provider } from 'react-redux';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { configureStore } from '@reduxjs/toolkit';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
// The real slices pull in apiClient/localStorage at import time; the menu
// only needs their action creators.
vi.mock('../layoutSlice', () => ({
  openTab: (payload) => ({ type: 'layout/openTab', payload }),
  showStatusModal: (payload) => ({ type: 'layout/showStatusModal', payload }),
}));
vi.mock('../appBarSlice', () => ({
  setAboutCubrid: (payload) => ({ type: 'appBar/setAboutCubrid', payload }),
  openUpdateCheck: (payload) => ({ type: 'appBar/openUpdateCheck', payload }),
}));
vi.mock('../../host/hostSlice', () => Object.fromEntries(
  ['openAddHostModal', 'openEditHostModal', 'openServerVersionModal', 'openImportExportModal', 'openCmsUserManagementModal']
    .map((name) => [name, (payload) => ({ type: `host/${name}`, payload })])
));

import HeaderMenu from './HeaderMenu';
import { CM } from '../../../constants/cmLabels';

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
});

const store = () => configureStore({
  reducer: {
    host: (state = { selectedHostUid: null, authorizedHosts: [] }) => state,
    user: (state = { preferences: { uiLocale: 'en' } }) => state,
  },
});

const renderMenu = async () => {
  await act(async () => root.render(
    <Provider store={store()}>
      <MemoryRouter initialEntries={['/home']}>
        <Routes>
          <Route path="/home" element={<HeaderMenu />} />
          <Route path="/desktop/workspace" element={<div>WORKSPACE PAGE</div>} />
        </Routes>
      </MemoryRouter>
    </Provider>
  ));
};

// Menus render their items only while open; the items are in a portal.
const openFileMenu = async () => {
  const button = [...container.querySelectorAll('button')].find((b) => b.textContent.includes(CM.file));
  await act(async () => button.click());
};
const menuItem = (label) =>
  [...document.body.querySelectorAll('button, a, [role="menuitem"]')].find((el) => el.textContent.trim().endsWith(label));

describe('header File menu', () => {
  it('shows Switch Workspace and Quit in the desktop app only', async () => {
    await renderMenu();
    await openFileMenu();
    expect(menuItem(CM.importHost)).toBeTruthy();
    expect(menuItem(CM.switchWorkspace)).toBeUndefined();
    expect(menuItem(CM.quit)).toBeUndefined();
    await act(async () => root.unmount());
    root = createRoot(container);

    window.desktopConfig = { isDesktop: true };
    await renderMenu();
    await openFileMenu();
    expect(menuItem(CM.switchWorkspace)).toBeTruthy();
    expect(menuItem(CM.quit)).toBeTruthy();
  });

  it('opens the workspace page on Switch Workspace', async () => {
    window.desktopConfig = { isDesktop: true };
    await renderMenu();
    await openFileMenu();
    await act(async () => menuItem(CM.switchWorkspace).click());
    expect(container.textContent).toContain('WORKSPACE PAGE');
  });

  it('quits the app through the desktop bridge on Quit', async () => {
    window.desktopConfig = { isDesktop: true };
    window.desktopBridge = { quitApp: vi.fn().mockResolvedValue(undefined) };
    await renderMenu();
    await openFileMenu();
    await act(async () => menuItem(CM.quit).click());
    expect(window.desktopBridge.quitApp).toHaveBeenCalledTimes(1);
  });
});
