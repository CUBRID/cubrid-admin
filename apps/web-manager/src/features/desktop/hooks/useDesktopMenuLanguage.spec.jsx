import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import { Provider } from 'react-redux';
import { configureStore, createSlice } from '@reduxjs/toolkit';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { useDesktopMenuLanguage } from './useDesktopMenuLanguage';

const userSlice = createSlice({
  name: 'user',
  initialState: { preferences: { uiLocale: 'en' } },
  reducers: {
    setUiLocale: (state, action) => {
      state.preferences.uiLocale = action.payload;
    },
  },
});

let container;
let root;
let store;

function Harness() {
  useDesktopMenuLanguage();
  return null;
}

const render = async (uiLocale) => {
  store = configureStore({
    reducer: { user: userSlice.reducer },
    preloadedState: { user: { preferences: { uiLocale } } },
  });
  await act(async () => root.render(<Provider store={store}><Harness /></Provider>));
};

beforeEach(() => {
  globalThis.IS_REACT_ACT_ENVIRONMENT = true;
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
});

afterEach(async () => {
  await act(async () => root.unmount());
  container.remove();
  delete window.desktopBridge;
  delete globalThis.IS_REACT_ACT_ENVIRONMENT;
});

it('reports the initial locale and every change to the desktop menu', async () => {
  const setMenuLanguage = vi.fn().mockResolvedValue({ ok: true });
  window.desktopBridge = { setMenuLanguage };

  await render('ko');
  expect(setMenuLanguage).toHaveBeenLastCalledWith('ko');

  await act(async () => store.dispatch(userSlice.actions.setUiLocale('en')));
  expect(setMenuLanguage).toHaveBeenLastCalledWith('en');
  expect(setMenuLanguage).toHaveBeenCalledTimes(2);
});

it('swallows a rejected menu update', async () => {
  window.desktopBridge = { setMenuLanguage: vi.fn().mockRejectedValue(new Error('ipc down')) };
  await expect(render('en')).resolves.toBeUndefined();
});

it('does nothing outside the desktop app', async () => {
  await expect(render('ko')).resolves.toBeUndefined();
});
