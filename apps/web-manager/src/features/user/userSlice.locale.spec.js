import { configureStore } from '@reduxjs/toolkit';
import { beforeEach, expect, it, vi } from 'vitest';

vi.mock('./userApi', () => ({ userApi: { getPreferences: vi.fn(), updatePreferences: vi.fn() } }));

import { userApi } from './userApi';
import reducer, { fetchPreferences, updatePreferences } from './userSlice';
import { getStoredLocale, LOCALE_STORAGE_KEY } from '../../constants/useCM';

const store = () => configureStore({ reducer: { user: reducer } });
beforeEach(() => {
  localStorage.removeItem(LOCALE_STORAGE_KEY);
});

// apiClient words server errors (a Top SQL log too large, ...) by the stored
// locale; the screens use the account's preference.
it('stores the account language when preferences load, in a browser that never stored it', async () => {
  userApi.getPreferences.mockResolvedValue({ uiLocale: 'ko' });
  expect(getStoredLocale()).toBe('en');
  await store().dispatch(fetchPreferences());
  expect(getStoredLocale()).toBe('ko');
});

it('follows a language change saved to the server', async () => {
  userApi.updatePreferences.mockResolvedValue({ uiLocale: 'ko' });
  await store().dispatch(updatePreferences({ uiLocale: 'ko' }));
  expect(getStoredLocale()).toBe('ko');
});
