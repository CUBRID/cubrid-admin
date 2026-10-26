import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import { Provider } from 'react-redux';
import { configureStore } from '@reduxjs/toolkit';
import { beforeEach, afterEach, expect, it, vi } from 'vitest';

vi.mock('../../host/hostApi', () => ({ hostApi: { getHostConfig: vi.fn() } }));
vi.mock('../../broker/brokerApi', () => ({ brokerApi: { getBrokerList: vi.fn() } }));
vi.mock('../databaseSlice', () => ({ closeDatabasePropertyModal: vi.fn(() => ({ type: 'close' })) }));
vi.mock('../../layout/layoutSlice', () => ({ openTab: vi.fn(tabId => ({ type: 'openTab', payload: tabId })) }));
import { hostApi } from '../../host/hostApi';
import { brokerApi } from '../../broker/brokerApi';
import { closeDatabasePropertyModal } from '../databaseSlice';
import { openTab } from '../../layout/layoutSlice';
import { ToastProvider } from '../../../infrastructure/context/ToastContext';
import DatabasePropertyModal from './DatabasePropertyModal';

// A trimmed-down stand-in for DATABASE_PARAM_SCHEMA — just the shapes this
// modal's read-only rendering depends on: the 'data' buffer pair (pages/
// size, matching cubrid.conf's real data_buffer_pages/data_buffer_size) and
// one plain general param (max_clients).
const DATABASE_PARAM_SCHEMA = [
  { key: 'data_buffer_pages', category: 'buffer', guard: { kind: 'int', min: 1024 }, default: '32768', bufferGroup: { pairKey: 'data', role: 'pages' } },
  { key: 'data_buffer_size', category: 'buffer', guard: { kind: 'size' }, default: '512', bufferGroup: { pairKey: 'data', role: 'size' } },
  { key: 'max_clients', category: 'general', guard: { kind: 'int', min: 10, max: 4000 }, default: '100' },
];

let container;
let root;
beforeEach(async () => {
  globalThis.IS_REACT_ACT_ENVIRONMENT = true;
  vi.resetAllMocks();
  // selectedDatabase is 'demodb' below, so the modal targets [@demodb], not
  // [common] — see DatabasePropertyModal's fetch effect (`target`).
  hostApi.getHostConfig.mockResolvedValue({ conflist: [{ confdata: [
    '[@demodb]', 'max_clients=123', 'data_buffer_size=512M',
  ] }] });
  brokerApi.getBrokerList.mockResolvedValue({ result: [] });
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
  const state = {
    databaseUI: { isDatabasePropertyModalOpen: true },
    database: { selectedDatabase: 'demodb' },
    host: {
      selectedHostUid: 'host',
      authorizedHosts: ['host'],
      hostEnvs: { host: { paramSchemas: { database: DATABASE_PARAM_SCHEMA } } },
    },
    user: { preferences: { uiLocale: 'en' } },
  };
  const store = configureStore({ reducer: () => state });
  await act(async () => root.render(
    <Provider store={store}><ToastProvider><DatabasePropertyModal /></ToastProvider></Provider>
  ));
});
afterEach(async () => {
  await act(async () => root.unmount());
  container.remove();
  delete globalThis.IS_REACT_ACT_ENVIRONMENT;
});

const control = id => container.querySelector(`[data-testid="database-property-${id}"]`);
const click = async element => act(async () => element.click());

it('shows the loaded values as read-only text — no inputs or selects in the Server Parameter table', async () => {
  // General tab renders the 'data' buffer pair + the general params table.
  expect(container.textContent).toContain('data_buffer_size');
  expect(container.textContent).toContain('512');
  expect(container.textContent).toContain('max_clients');
  expect(container.textContent).toContain('123');
  expect(container.querySelector('input')).toBeNull();
  expect(container.querySelector('select')).toBeNull();
  expect(container.querySelector('[role="combobox"]')).toBeNull();
});

it('shows a notice directing edits to the text editor instead of an Apply button', async () => {
  expect(control('open-editor-inline-btn')).not.toBeNull();
  expect(control('apply-btn')).toBeNull();
  expect(control('reset-btn')).toBeNull();
});

it('the inline "Edit in Text Editor" button opens the cubridconf tab and closes the modal', async () => {
  await click(control('open-editor-inline-btn'));
  expect(openTab).toHaveBeenCalledWith('edit_config:host:cubridconf');
  expect(closeDatabasePropertyModal).toHaveBeenCalledTimes(1);
});

it('the footer "Edit in Text Editor" button does the same', async () => {
  await click(control('open-editor-btn'));
  expect(openTab).toHaveBeenCalledWith('edit_config:host:cubridconf');
  expect(closeDatabasePropertyModal).toHaveBeenCalledTimes(1);
});

it('opening the text editor triggers no additional config fetch/write — it only redirects', async () => {
  expect(hostApi.getHostConfig).toHaveBeenCalledTimes(1);
  await click(control('open-editor-btn'));
  expect(hostApi.getHostConfig).toHaveBeenCalledTimes(1);
});

it('Connection Information stays local-only — Apply just closes the modal, no editor redirect, no API write', async () => {
  const connectionTab = Array.from(container.querySelectorAll('button')).find(b => b.textContent.includes('Connection'));
  await click(connectionTab);
  expect(control('apply-btn')).not.toBeNull();
  expect(control('open-editor-btn')).toBeNull();
  await click(control('apply-btn'));
  expect(closeDatabasePropertyModal).toHaveBeenCalledTimes(1);
  expect(openTab).not.toHaveBeenCalled();
});

it('matches [@dbname] case-sensitively, like the engine — [@demodb] is not DemoDB\'s section', async () => {
  await act(async () => root.unmount());
  root = createRoot(container);
  hostApi.getHostConfig.mockResolvedValue({ conflist: [{ confdata: ['[@demodb]', 'max_clients=123', '[@DemoDB]', 'max_clients=456'] }] });
  const state = {
    databaseUI: { isDatabasePropertyModalOpen: true },
    database: { selectedDatabase: 'DemoDB' },
    host: { selectedHostUid: 'host', authorizedHosts: ['host'], hostEnvs: { host: { paramSchemas: { database: DATABASE_PARAM_SCHEMA } } } },
    user: { preferences: { uiLocale: 'en' } },
  };
  await act(async () => root.render(
    <Provider store={configureStore({ reducer: () => state })}><ToastProvider><DatabasePropertyModal /></ToastProvider></Provider>
  ));
  expect(container.textContent).toContain('456');
  expect(container.textContent).not.toContain('123');
});
