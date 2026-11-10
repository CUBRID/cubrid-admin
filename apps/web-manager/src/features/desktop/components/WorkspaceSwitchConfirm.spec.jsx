import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import { Provider } from 'react-redux';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { configureStore, createSlice } from '@reduxjs/toolkit';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';

// layoutSlice reads the OS theme at import time; jsdom has no matchMedia.
vi.hoisted(() => {
  window.matchMedia ??= () => ({ matches: false, addEventListener: vi.fn(), removeEventListener: vi.fn() });
});
import WorkspaceSwitchConfirm from './WorkspaceSwitchConfirm';

// Same action types as layoutSlice, for the two actions the dialog dispatches.
const layout = createSlice({
  name: 'layout',
  initialState: { workspaceSwitchConfirmOpen: true, dirtyTabs: ['edit_config:h1:cubridconf'] },
  reducers: {
    closeWorkspaceSwitchConfirm: (s) => { s.workspaceSwitchConfirmOpen = false; },
    clearDirtyTabs: (s) => { s.dirtyTabs = []; },
  },
});

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
});

const render = async () => {
  const store = configureStore({
    reducer: { layout: layout.reducer, user: (s = { preferences: { uiLocale: 'en' } }) => s },
  });
  await act(async () => root.render(
    <Provider store={store}>
      <MemoryRouter initialEntries={['/home']}>
        <Routes>
          <Route path="/home" element={<div>DASHBOARD<WorkspaceSwitchConfirm /></div>} />
          <Route path="/desktop/workspace" element={<div>WORKSPACE PAGE</div>} />
        </Routes>
      </MemoryRouter>
    </Provider>
  ));
  return store;
};
const button = (name) => document.querySelector(`[data-testid="workspace-switch-unsaved-${name}-btn"]`);

it('stays on the dashboard, edits kept, when cancelled', async () => {
  const store = await render();
  await act(async () => button('cancel').click());
  expect(container.textContent).toContain('DASHBOARD');
  expect(store.getState().layout.dirtyTabs).toEqual(['edit_config:h1:cubridconf']);
});

it('drops the unsaved marks and opens the workspace page when confirmed', async () => {
  const store = await render();
  await act(async () => button('confirm').click());
  expect(container.textContent).toContain('WORKSPACE PAGE');
  expect(store.getState().layout.dirtyTabs).toEqual([]);
});
