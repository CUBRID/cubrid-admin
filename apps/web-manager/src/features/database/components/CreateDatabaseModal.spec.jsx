import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import { Provider } from 'react-redux';
import { configureStore } from '@reduxjs/toolkit';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';

vi.hoisted(() => {
  window.matchMedia ??= () => ({ matches: false, addEventListener: vi.fn(), removeEventListener: vi.fn() });
});
vi.mock('../../../api/apiClient', () => ({ default: { defaults: { headers: { common: {} } } } }));
vi.mock('../databaseJobApi', async (importOriginal) => ({
  ...await importOriginal(),
  databaseJobApi: { submitCreate: vi.fn(), listRecent: async () => [] },
}));
const startInfo = vi.hoisted(() => ({ fails: false }));
vi.mock('../databaseSlice', () => {
  const settle = (p) => Object.assign(p, { unwrap: () => p });
  const done = (data) => () => () => settle(Promise.resolve(data));
  return {
    closeCreateDatabaseModal: () => ({ type: 'test/close' }),
    fetchCreateDatabaseInfo: done({ default_db_dir: '/db' }),
    fetchDatabaseStartInfo: () => () => settle(startInfo.fails ? Promise.reject(new Error('no answer')) : Promise.resolve({})),
  };
});

import { CmsJobProvider } from '../../../infrastructure/context/CmsJobContext';
import CreateDatabaseModal from './CreateDatabaseModal';

let container;
let root;
beforeEach(() => {
  globalThis.IS_REACT_ACT_ENVIRONMENT = true;
  startInfo.fails = false;
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
});
afterEach(async () => {
  await act(async () => root.unmount());
  container.remove();
  delete globalThis.IS_REACT_ACT_ENVIRONMENT;
});

const render = (dbs) => {
  const state = {
    auth: { isAuthenticated: true },
    databaseUI: { isCreateDatabaseModalOpen: true },
    database: { databasesByHost: { h1: dbs } },
    host: { selectedHostUid: 'h1', hostEnvs: {} },
    user: { preferences: { uiLocale: 'en' } },
    layout: { statusModal: { isOpen: false } },
  };
  const store = configureStore({ reducer: (s = state) => s });
  return act(async () => root.render(<Provider store={store}><CmsJobProvider><CreateDatabaseModal /></CmsJobProvider></Provider>));
};
const typeName = (value) => act(async () => {
  const input = container.querySelector('[data-testid="create-database-name-input"]');
  Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(input, value);
  input.dispatchEvent(new Event('input', { bubbles: true }));
});
const next = () => container.querySelector('[data-testid="create-database-next-btn"]');

it("refuses a name the host's database list already has, replica ones too, as the engine compares (case-sensitive)", async () => {
  await render([{ dbname: 'demodb' }, { dbname: 'repdb', cmsListed: false }]);

  await typeName('demodb');
  expect(container.textContent).toContain('A database with this name already exists on this host');
  expect(next().disabled).toBe(true);

  await typeName('repdb');
  expect(container.textContent).toContain('A database with this name already exists on this host');
  expect(next().disabled).toBe(true);

  await typeName('DemoDB');
  expect(container.textContent).not.toContain('already exists');
  expect(next().disabled).toBe(false);
});

it('does not refuse a listed name when the database list could not be read again (it may have been deleted since)', async () => {
  startInfo.fails = true;
  await render([{ dbname: 'demodb' }]);

  await typeName('demodb');
  expect(container.textContent).not.toContain('already exists');
  expect(next().disabled).toBe(false);
});
