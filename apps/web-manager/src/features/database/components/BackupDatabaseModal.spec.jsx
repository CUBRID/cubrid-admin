import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import { Provider } from 'react-redux';
import { configureStore } from '@reduxjs/toolkit';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// layoutSlice reads the OS theme at import time; jsdom has no matchMedia.
vi.hoisted(() => {
  window.matchMedia ??= () => ({ matches: false, addEventListener: () => undefined, removeEventListener: () => undefined });
});
const mocks = vi.hoisted(() => ({ trackJob: vi.fn(), dismissJobResult: vi.fn(), submitBackup: vi.fn(), getBackupDbInfo: vi.fn() }));
vi.mock('../../../api/apiClient', () => ({ default: { defaults: { headers: { common: {} } } } }));
vi.mock('../../../infrastructure/hooks/useCmsJobs', () => ({
  useCmsJobs: () => ({ trackJob: mocks.trackJob, dismissJobResult: mocks.dismissJobResult }),
}));
vi.mock('../databaseJobApi', () => ({ databaseJobApi: { submitBackup: mocks.submitBackup } }));
vi.mock('../databaseApi', () => ({ databaseApi: { getBackupDbInfo: mocks.getBackupDbInfo } }));
import BackupDatabaseModal from './BackupDatabaseModal';
import uiReducer, { closeBackupDatabaseModal, openBackupDatabaseModal } from '../databaseUISlice';
import operationReducer from '../databaseOperationSlice';

let container;
let root;
let store;

beforeEach(() => {
  globalThis.IS_REACT_ACT_ENVIRONMENT = true;
  vi.resetAllMocks();
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
  const fixed = {
    user: { preferences: { uiLocale: 'en' } },
    host: { selectedHostUid: 'host-1' },
  };
  store = configureStore({
    reducer: {
      ...Object.fromEntries(Object.entries(fixed).map(([key, value]) => [key, () => value])),
      database: (state = { selectedDatabase: 'demodb' }, action) => (
        action.type === 'test/selectDatabase' ? { selectedDatabase: action.payload } : state
      ),
      databaseUI: uiReducer,
      databaseOperation: operationReducer,
    },
    preloadedState: {
      databaseUI: { ...uiReducer(undefined, { type: 'init' }), isBackupDatabaseModalOpen: true },
    },
  });
  mocks.getBackupDbInfo.mockResolvedValue({ dbdir: '/db/demodb', level0: [{ path: '/db/demodb/backup/demodb_bk0v000', date: '', size: '1' }] });
  mocks.submitBackup.mockResolvedValue({ jobId: 'job-1' });
  mocks.trackJob.mockResolvedValue({ jobId: 'job-1', jobStatus: 'succeeded' });
});

afterEach(async () => {
  await act(async () => root.unmount());
  container.remove();
  delete globalThis.IS_REACT_ACT_ENVIRONMENT;
});

const render = () => act(async () => root.render(<Provider store={store}><BackupDatabaseModal /></Provider>));
const run = () => act(async () => container.querySelector('[data-testid="backup-database-run-btn"]').click());
const setDir = (value) => act(async () => {
  const input = container.querySelector('[data-testid="backup-database-dir-input"]');
  Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(input, value);
  input.dispatchEvent(new Event('input', { bubbles: true }));
});

it('shows one result: the modal\'s own, with the job tray\'s result for the same backup dismissed', async () => {
  await render();
  await setDir('/backup');
  await run();

  expect(mocks.trackJob).toHaveBeenCalledWith('job-1', expect.anything());
  expect(mocks.dismissJobResult).toHaveBeenCalledWith('job-1');
  expect(container.textContent).toContain('Full Backup of "demodb" was written to "/backup".');
});

it('leaves the job tray\'s result as the only notice when the modal was closed meanwhile', async () => {
  let finish;
  mocks.trackJob.mockReturnValue(new Promise((resolve) => { finish = resolve; }));
  await render();
  await setDir('/backup');
  await run();
  await act(async () => store.dispatch(closeBackupDatabaseModal()));

  await act(async () => finish({ jobId: 'job-1', jobStatus: 'succeeded' }));
  expect(mocks.dismissJobResult).not.toHaveBeenCalled();
});

it('dismisses the tray\'s failure result too while the modal shows the failure', async () => {
  mocks.trackJob.mockRejectedValue(new Error('backupdb failed'));
  await render();
  await setDir('/backup');
  await run();

  expect(mocks.dismissJobResult).toHaveBeenCalledWith('job-1');
  expect(container.textContent).toContain('Backup Failed');
});

it('names an incremental backup as incremental, not complete', async () => {
  await render();
  await setDir('/backup');
  await act(async () => container.querySelector('[data-testid="backup-database-level-select"]').click());
  // The option list renders into document.body.
  await act(async () => document.querySelector('[data-testid="backup-database-level-select-option-1"]')
    .dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true })));
  await run();

  expect(container.textContent).toContain('Incremental (L1) of "demodb" was written to "/backup".');
  expect(container.textContent).not.toMatch(/complete backup/i);
  // The dialog title says it once; the result below does not repeat it.
  expect(document.body.textContent.split('Backup Completed').length - 1).toBe(1);
});

describe('a backup that ends after the modal was reopened for another database', () => {
  // The modal is one instance reused for every database. A backup started
  // for demodb must not end up on otherdb's window, nor take away the job
  // tray's result, which names the right database.
  const reopenFor = async (dbname) => {
    await act(async () => store.dispatch(closeBackupDatabaseModal()));
    await act(async () => store.dispatch({ type: 'test/selectDatabase', payload: dbname }));
    await act(async () => store.dispatch(openBackupDatabaseModal()));
  };

  it('leaves its success to the job tray', async () => {
    let finish;
    mocks.trackJob.mockReturnValue(new Promise((resolve) => { finish = resolve; }));
    await render();
    await setDir('/backup');
    await run();
    await reopenFor('otherdb');

    await act(async () => finish({ jobId: 'job-1', jobStatus: 'succeeded' }));
    expect(mocks.dismissJobResult).not.toHaveBeenCalled();
    expect(container.textContent).not.toContain('was written to');
    expect(container.querySelector('[data-testid="backup-database-run-btn"]')).not.toBeNull();
  });

  it('leaves its failure to the job tray', async () => {
    let fail;
    mocks.trackJob.mockReturnValue(new Promise((_, reject) => { fail = reject; }));
    await render();
    await setDir('/backup');
    await run();
    await reopenFor('otherdb');

    await act(async () => fail(new Error('backupdb failed')));
    expect(mocks.dismissJobResult).not.toHaveBeenCalled();
    expect(container.textContent).not.toContain('Backup Failed');
    expect(container.querySelector('[data-testid="backup-database-run-btn"]')).not.toBeNull();
  });
});
