import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import { Provider } from 'react-redux';
import { configureStore } from '@reduxjs/toolkit';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import CopyDatabaseModal from './CopyDatabaseModal';
import uiReducer from '../databaseUISlice';
import databaseCoreReducer, { fetchDatabaseStartInfo } from '../databaseCoreSlice';
import { CmsJobProvider } from '../../../infrastructure/context/CmsJobContext';

const mocks = vi.hoisted(() => ({ submitCopy: vi.fn(), run: vi.fn(), getStartInfo: vi.fn(), readStartInfo: vi.fn(), getVolumeInfo: vi.fn() }));
vi.mock('../../../api/apiClient', () => ({ default: { defaults: { headers: { common: {} } } } }));
vi.mock('../databaseJobApi', async importOriginal => ({
  ...await importOriginal(),
  databaseJobApi: { submitCopy: mocks.submitCopy, listRecent: async () => [] },
}));
vi.mock('../../../infrastructure/services/cmsJobRunner', () => ({
  runCmsJobInBackground: mocks.run, isCmsJobPolling: () => false,
  cancelAllCmsJobPolls: vi.fn(), cancelCmsJobPoll: vi.fn(),
}));
vi.mock('../databaseApi', () => ({ databaseApi: { getStartInfo: mocks.getStartInfo, readStartInfo: mocks.readStartInfo, getVolumeInfo: mocks.getVolumeInfo } }));
// The tray's shared result popup isn't under test here.
vi.mock('../../../infrastructure/cmsJob/JobResultModal', () => ({ JobResultModal: () => null }));

let container;
let root;
let store;
const job = { jobId: 'job-1', type: 'copy', dbname: 'demodb', jobStatus: 'succeeded', result: {} };

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
      databaseUI: { ...uiReducer(undefined, { type: 'init' }), isCopyDatabaseModalOpen: true },
    },
  });
  mocks.submitCopy.mockResolvedValue({ jobId: 'job-1' });
  mocks.getStartInfo.mockResolvedValue({});
  mocks.run.mockResolvedValue(job);
  mocks.getVolumeInfo.mockResolvedValue({ spaceinfo: spaces });
});

afterEach(async () => {
  await act(async () => root.unmount());
  container.remove();
  delete globalThis.IS_REACT_ACT_ENVIRONMENT;
});

const render = () => act(async () => root.render(
  <Provider store={store}><CmsJobProvider><CopyDatabaseModal /></CmsJobProvider></Provider>
));
const typeNewName = (value) => act(async () => {
  const input = container.querySelector('[data-testid="copy-database-dest-name-input"]');
  Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(input, value);
  input.dispatchEvent(new Event('input', { bubbles: true }));
});
const click = (el) => act(async () => el.click());

const spaces = [
  { type: 'PERMANENT', volid: '2', location: '/a/extra2', spacename: '/a/extra2' },
  { type: 'PERMANENT', volid: '0', location: '/db/demodb/demodb', spacename: '/db/demodb/demodb' },
  { type: 'PERMANENT', volid: '1', location: '/z/extra1', spacename: '/z/extra1' },
];
const execute = () => container.querySelector('[data-testid="copy-database-execute-btn"]');
const individual = () => container.querySelector('[data-testid="copy-database-individual-toggle"]');
const volumeName = path => [...container.querySelectorAll('input')].find(el => el.getAttribute('aria-label') === `New volume name: ${path}`);
const type = (el, value) => act(async () => {
  Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(el, value);
  el.dispatchEvent(new Event('input', { bubbles: true }));
});

it('submits normalized source files in physical volume order', async () => {
  await render();
  await typeNewName('clone');
  await click(individual());
  await click(execute());
  expect(mocks.submitCopy).toHaveBeenCalledWith('host-1', expect.objectContaining({
    advanced: 'on',
    volume: [
      { '/db/demodb/demodb': '/db/clone/clone' },
      { '/z/extra1': '/db/clone/clone_x001' },
      { '/a/extra2': '/db/clone/clone_x002' },
    ],
  }));
});

it('uses the current destination name when volume metadata arrives late', async () => {
  let finish;
  mocks.getVolumeInfo.mockReturnValue(new Promise(resolve => { finish = resolve; }));
  await render();
  await typeNewName('clone');
  await click(individual());
  expect(execute().disabled).toBe(true);
  await act(async () => finish({ spaceinfo: spaces }));
  expect(volumeName('/z/extra1').value).toBe('clone_x001');
  expect(execute().disabled).toBe(false);
  await click(execute());
  expect(mocks.submitCopy.mock.calls[0][1].volume[0]).toEqual({ '/db/demodb/demodb': '/db/clone/clone' });
});

it('preserves edited destination names and directories when the database name changes', async () => {
  await render();
  await typeNewName('clone');
  await click(individual());
  await type(volumeName('/z/extra1'), 'custom');
  const directory = [...container.querySelectorAll('input')].find(el => el.getAttribute('aria-label') === 'New directory path: /z/extra1');
  await type(directory, '/custom');
  await typeNewName('clone2');
  await click(execute());
  expect(mocks.submitCopy.mock.calls[0][1].volume).toEqual([
    { '/db/demodb/demodb': '/db/clone2/clone2' },
    { '/z/extra1': '/custom/custom' },
    { '/a/extra2': '/db/clone2/clone2_x002' },
  ]);
});

it('blocks incomplete mappings, including Enter-key submission', async () => {
  mocks.getVolumeInfo.mockResolvedValue({ spaceinfo: [] });
  await render();
  await typeNewName('clone');
  await click(individual());
  expect(execute().disabled).toBe(true);
  expect(container.querySelector('[role="alert"]').textContent).toContain('complete volume information');
  await act(async () => container.querySelector('[data-testid="copy-database-dest-name-input"]').dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true })));
  expect(mocks.submitCopy).not.toHaveBeenCalled();
});

it('keeps blank edited names invalid rather than silently reverting to source names', async () => {
  await render();
  await typeNewName('clone');
  await click(individual());
  await type(volumeName('/z/extra1'), '');
  expect(execute().disabled).toBe(true);
  expect(mocks.submitCopy).not.toHaveBeenCalled();
});

it('still supports normal copy without volume metadata', async () => {
  mocks.getVolumeInfo.mockResolvedValue({ spaceinfo: [] });
  await render();
  await typeNewName('clone');
  await click(execute());
  expect(mocks.submitCopy).toHaveBeenCalledWith('host-1', expect.objectContaining({ advanced: 'off' }));
  expect(mocks.submitCopy.mock.calls[0][1]).not.toHaveProperty('volume');
});

it.each([false, true])('blocks the source name before submission (individual copy: %s)', async individualCopy => {
  await render();
  await typeNewName('clone');
  if (individualCopy) await click(individual());
  await typeNewName(' demodb ');
  const input = container.querySelector('[data-testid="copy-database-dest-name-input"]');
  expect(input.getAttribute('aria-invalid')).toBe('true');
  expect(container.textContent).toContain('Destination database name must be different from the source.');
  expect(execute().disabled).toBe(true);
  await click(execute());
  await act(async () => input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true })));
  expect(mocks.submitCopy).not.toHaveBeenCalled();

  await typeNewName('clone');
  expect(input.getAttribute('aria-invalid')).toBeNull();
  expect(execute().disabled).toBe(false);
});

describe('a copy that deletes its source', () => {
  // The source leaves the list (the copy moved it) while the job runs and
  // after it succeeds, which used to reset the modal to an empty form.
  const sourceGone = { ok: true, seq: 50, value: { dblist: { dbs: [{ dbname: 'clone', dbdir: '/db/clone' }] }, activelist: { active: [] } } };
  const deleteSource = () => [...container.querySelectorAll('label')]
    .find((label) => label.textContent.includes('Delete a source database')).querySelector('input');
  const nameInput = () => container.querySelector('[data-testid="copy-database-dest-name-input"]');

  it('keeps the progress view while the source leaves the list', async () => {
    let finish;
    mocks.run.mockReturnValue(new Promise((resolve) => { finish = resolve; }));
    mocks.readStartInfo.mockResolvedValue(sourceGone);
    await render();
    await typeNewName('clone');
    await click(deleteSource());
    await click(execute());
    expect(mocks.submitCopy.mock.calls[0][1]).toMatchObject({ move: 'y' });

    await act(async () => store.dispatch(fetchDatabaseStartInfo('host-1')));
    expect(store.getState().database.databasesByHost['host-1'].map((db) => db.dbname)).toEqual(['clone']);
    expect(nameInput()).toBeNull();

    await act(async () => finish(job));
    expect(container.textContent).toContain('Copy completed: clone');
  });

  it('keeps the success view, with the new name, after the source leaves the list', async () => {
    mocks.readStartInfo.mockResolvedValue(sourceGone);
    await render();
    await typeNewName('clone');
    await click(deleteSource());
    await click(execute());

    expect(store.getState().database.databasesByHost['host-1'].map((db) => db.dbname)).toEqual(['clone']);
    expect(nameInput()).toBeNull();
    expect(container.textContent).toContain('Copy completed: clone');
  });
});
