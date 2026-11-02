import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import { Provider } from 'react-redux';
import { configureStore } from '@reduxjs/toolkit';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import DeleteDatabaseModal from './DeleteDatabaseModal';
import uiReducer from '../databaseUISlice';
import databaseCoreReducer from '../databaseCoreSlice';
import { CmsJobProvider } from '../../../infrastructure/context/CmsJobContext';
import { CM } from '../../../constants/cmLabels';

const mocks = vi.hoisted(() => ({
  submitDelete: vi.fn(), run: vi.fn(), getStartInfo: vi.fn(), loginDatabase: vi.fn(), getVolumeInfo: vi.fn(),
}));
vi.mock('../../../api/apiClient', () => ({ default: { defaults: { headers: { common: {} } } } }));
vi.mock('../databaseJobApi', async importOriginal => ({
  ...await importOriginal(),
  databaseJobApi: { submitDelete: mocks.submitDelete, listRecent: async () => [] },
}));
vi.mock('../../../infrastructure/services/cmsJobRunner', () => ({
  runCmsJobInBackground: mocks.run, isCmsJobPolling: () => false,
  cancelAllCmsJobPolls: vi.fn(), cancelCmsJobPoll: vi.fn(),
}));
vi.mock('../databaseApi', () => ({
  databaseApi: { getStartInfo: mocks.getStartInfo, loginDatabase: mocks.loginDatabase, getVolumeInfo: mocks.getVolumeInfo },
}));
// The tray's shared result popup isn't under test here.
vi.mock('../../../infrastructure/cmsJob/JobResultModal', () => ({ JobResultModal: () => null }));

let container;
let root;
let store;
const job = { jobId: 'job-1', type: 'delete', dbname: 'demodb', jobStatus: 'succeeded', result: { success: true } };

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
        loggedInDatabases: ['host-1:demodb', 'host-1:otherdb'],
      },
      databaseUI: { ...uiReducer(undefined, { type: 'init' }), isDeleteDatabaseModalOpen: true },
    },
  });
  mocks.submitDelete.mockResolvedValue({ jobId: 'job-1' });
  mocks.getStartInfo.mockResolvedValue({});
  mocks.getVolumeInfo.mockResolvedValue({});
  mocks.loginDatabase.mockResolvedValue({ success: true });
});

afterEach(async () => {
  await act(async () => root.unmount());
  container.remove();
  delete globalThis.IS_REACT_ACT_ENVIRONMENT;
});

const render = () => act(async () => root.render(
  <Provider store={store}><CmsJobProvider><DeleteDatabaseModal /></CmsJobProvider></Provider>
));
const confirmBtn = () => container.querySelector('[data-testid="delete-database-confirm-btn"]');
const click = (el) => act(async () => el.click());
const errorDetail = async () => {
  const toggle = [...container.querySelectorAll('button')].find((b) => b.textContent.includes(CM.showDetails));
  await click(toggle);
  return container.textContent;
};
const confirmTwice = async () => {
  await click(confirmBtn());
  await click(confirmBtn());
};

it('logs in, submits a delete job, and clears the deleted database\'s login once it succeeds', async () => {
  mocks.run.mockResolvedValue(job);
  await render();
  await confirmTwice();

  expect(mocks.loginDatabase).toHaveBeenCalledWith('host-1', 'demodb', { id: 'dba', password: '' });
  expect(mocks.submitDelete).toHaveBeenCalledWith('host-1', 'demodb', { delbackup: 'n' });
  expect(store.getState().database.loggedInDatabases).toEqual(['host-1:otherdb']);
  expect(container.textContent).toContain('demodb');
});

it('does not submit the job when the DBA login fails, and shows the error', async () => {
  mocks.loginDatabase.mockRejectedValue(new Error('Invalid password'));
  await render();
  await confirmTwice();

  expect(mocks.submitDelete).not.toHaveBeenCalled();
  expect(await errorDetail()).toContain('Invalid password');
  expect(store.getState().database.loggedInDatabases).toContain('host-1:demodb');
});

it('shows the job failure and keeps the login state', async () => {
  mocks.run.mockRejectedValue(new Error('database is running'));
  await render();
  await confirmTwice();

  expect(mocks.submitDelete).toHaveBeenCalled();
  expect(await errorDetail()).toContain('database is running');
  expect(store.getState().database.loggedInDatabases).toContain('host-1:demodb');
});

it('shows what the cleanup after the delete could not do', async () => {
  mocks.run.mockResolvedValue({ ...job, warnings: ['cubrid.conf could not be updated'] });
  await render();
  await confirmTwice();

  expect(container.textContent).toContain('cubrid.conf could not be updated');
});
