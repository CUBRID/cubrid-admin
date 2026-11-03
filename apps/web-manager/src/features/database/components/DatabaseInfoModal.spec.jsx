import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import { Provider } from 'react-redux';
import { configureStore } from '@reduxjs/toolkit';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';

// The real slices pull in apiClient and every thunk.
vi.mock('../databaseSlice', () => ({
  closeDatabaseInfoModal: vi.fn(() => ({ type: 'test/close' })),
  fetchDatabaseParamDump: vi.fn(() => () => ({ unwrap: () => Promise.resolve() })),
}));
vi.mock('../../host/hostSlice', () => ({
  fetchHostEnv: vi.fn((uid) => ({ type: 'test/fetchHostEnv', payload: uid })),
}));

import { fetchHostEnv } from '../../host/hostSlice';
import DatabaseInfoModal from './DatabaseInfoModal';
import { dbKey } from '../dbKey';

let container;
let root;

beforeEach(() => {
  globalThis.IS_REACT_ACT_ENVIRONMENT = true;
  vi.clearAllMocks();
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
});

afterEach(async () => {
  await act(async () => root.unmount());
  container.remove();
  delete globalThis.IS_REACT_ACT_ENVIRONMENT;
});

const makeStore = (hostEnv) => configureStore({
  reducer: {
    user: (s = { preferences: { uiLocale: 'en' } }) => s,
    databaseUI: (s = { isDatabaseInfoModalOpen: true }) => s,
    database: (s = { selectedDatabase: 'demodb', activeDatabasesByHost: { h1: ['demodb'] } }) => s,
    databaseConfiguration: (s = {
      databaseInfoData: { [dbKey('h1', 'demodb')]: { server: [{ data_buffer_size: '512M', db_hosts: 'h', db_volume_size: '512M' }] } },
    }) => s,
    host: (s = { selectedHostUid: 'h1', authorizedHosts: ['h1'], hostEnvs: hostEnv === undefined ? {} : { h1: hostEnv } }) => s,
  },
});

const rowOf = (name) => Array.from(document.querySelectorAll('tbody tr')).find((tr) => tr.textContent.includes(name));

it('shows whether each dumped parameter is a server or client parameter', async () => {
  const scopes = { data_buffer_size: 'SERVER', db_hosts: 'CLIENT' };
  await act(async () => {
    root.render(<Provider store={makeStore({ paramSchemas: { knownKeys: { databaseScopes: scopes } } })}><DatabaseInfoModal /></Provider>);
  });
  await act(async () => document.querySelector('[data-testid="database-info-run-btn"]').click());

  expect(rowOf('data_buffer_size').textContent).toContain('SERVER');
  expect(rowOf('db_hosts').textContent).toContain('CLIENT');
  // Neither PRM_FOR_SERVER nor PRM_FOR_CLIENT.
  expect(rowOf('db_volume_size').textContent).toContain('-');
  expect(fetchHostEnv).not.toHaveBeenCalled();
});

it('fetches the host environment once when it was never loaded, not after a failed load', async () => {
  await act(async () => {
    root.render(<Provider store={makeStore(undefined)}><DatabaseInfoModal /></Provider>);
  });
  expect(fetchHostEnv).toHaveBeenCalledWith('h1');

  vi.clearAllMocks();
  await act(async () => {
    root.render(<Provider store={makeStore(null)}><DatabaseInfoModal /></Provider>);
  });
  expect(fetchHostEnv).not.toHaveBeenCalled();
});
