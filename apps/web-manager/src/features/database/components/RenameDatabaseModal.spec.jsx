import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import { Provider } from 'react-redux';
import { configureStore } from '@reduxjs/toolkit';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import RenameDatabaseModal from './RenameDatabaseModal';
import uiReducer from '../databaseUISlice';
import databaseCoreReducer from '../databaseCoreSlice';
import { CmsJobProvider } from '../../../infrastructure/context/CmsJobContext';

const mocks = vi.hoisted(() => ({ submitRename: vi.fn(), run: vi.fn(), getStartInfo: vi.fn() }));
vi.mock('../../../api/apiClient', () => ({ default: { defaults: { headers: { common: {} } } } }));
vi.mock('../databaseJobApi', async importOriginal => ({
  ...await importOriginal(),
  databaseJobApi: { submitRename: mocks.submitRename, listRecent: async () => [] },
}));
vi.mock('../../../infrastructure/services/cmsJobRunner', () => ({
  runCmsJobInBackground: mocks.run, isCmsJobPolling: () => false,
  cancelAllCmsJobPolls: vi.fn(), cancelCmsJobPoll: vi.fn(),
}));
vi.mock('../databaseApi', () => ({ databaseApi: { getStartInfo: mocks.getStartInfo } }));
// The tray's shared result popup isn't under test here.
vi.mock('../../../infrastructure/cmsJob/JobResultModal', () => ({ JobResultModal: () => null }));

let container;
let root;
let store;
const job = { jobId: 'job-1', type: 'rename', dbname: 'demodb', jobStatus: 'succeeded', result: {} };

beforeEach(() => {
  globalThis.IS_REACT_ACT_ENVIRONMENT = true;
  vi.resetAllMocks();
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
  const fixed = {
    auth: { isAuthenticated: true }, user: { preferences: { uiLocale: 'en' } },
    host: { selectedHostUid: 'host-1' },
  };
  store = configureStore({
    reducer: {
      ...Object.fromEntries(Object.entries(fixed).map(([key, value]) => [key, () => value])),
      database: databaseCoreReducer,
      databaseUI: uiReducer,
    },
    preloadedState: {
      database: {
        ...databaseCoreReducer(undefined, { type: 'init' }),
        activeHostUid: 'host-1',
        selectedDatabase: 'demodb',
        databasesByHost: { 'host-1': [{ dbname: 'demodb', dbdir: '/db/demodb' }] },
        loggedInDatabases: ['host-1:demodb', 'host-1:newdb', 'host-1:otherdb'],
      },
      databaseUI: { ...uiReducer(undefined, { type: 'init' }), isRenameDatabaseModalOpen: true },
    },
  });
  mocks.submitRename.mockResolvedValue({ jobId: 'job-1' });
  mocks.getStartInfo.mockResolvedValue({});
});

afterEach(async () => {
  await act(async () => root.unmount());
  container.remove();
  delete globalThis.IS_REACT_ACT_ENVIRONMENT;
});

const render = () => act(async () => root.render(
  <Provider store={store}><CmsJobProvider><RenameDatabaseModal /></CmsJobProvider></Provider>
));
const typeNewName = (value) => act(async () => {
  const input = container.querySelector('[data-testid="rename-database-new-name-input"]');
  Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(input, value);
  input.dispatchEvent(new Event('input', { bubbles: true }));
});
const click = (el) => act(async () => el.click());

it('clears login state for both the old and new name once the rename job succeeds', async () => {
  mocks.run.mockResolvedValue(job);
  await render();
  await typeNewName('newdb');
  await click(container.querySelector('[data-testid="rename-database-execute-btn"]'));

  expect(mocks.submitRename).toHaveBeenCalledWith('host-1', 'demodb', expect.objectContaining({ rename: 'newdb' }));
  expect(store.getState().database.loggedInDatabases).toEqual(['host-1:otherdb']);
});

it('still clears both names when the job was backgrounded and finishes later', async () => {
  let finish;
  mocks.run.mockReturnValue(new Promise((resolve) => { finish = resolve; }));
  await render();
  await typeNewName('newdb');
  await click(container.querySelector('[data-testid="rename-database-execute-btn"]'));

  const backgroundBtn = [...container.querySelectorAll('button')].find((b) => b.textContent.includes('Confirm'));
  await click(backgroundBtn);
  expect(store.getState().databaseUI.isRenameDatabaseModalOpen).toBe(false);
  expect(store.getState().database.loggedInDatabases).toContain('host-1:demodb');

  await act(async () => finish(job));

  expect(store.getState().database.loggedInDatabases).toEqual(['host-1:otherdb']);
});

it('leaves login state alone when the rename job fails', async () => {
  mocks.run.mockRejectedValue(new Error('renamedb failed'));
  await render();
  await typeNewName('newdb');
  await click(container.querySelector('[data-testid="rename-database-execute-btn"]'));

  expect(store.getState().database.loggedInDatabases).toEqual(['host-1:demodb', 'host-1:newdb', 'host-1:otherdb']);
});
