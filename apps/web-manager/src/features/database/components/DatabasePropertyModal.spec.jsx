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
  { key: 'data_buffer_pages', category: 'buffer', guard: { kind: 'int', min: 1024 }, default: '32768', bufferGroup: { pairKey: 'data', role: 'pages' }, deprecated: { replacedBy: 'data_buffer_size' } },
  { key: 'data_buffer_size', category: 'buffer', guard: { kind: 'size' }, default: '512', bufferGroup: { pairKey: 'data', role: 'size' } },
  { key: 'max_clients', category: 'general', guard: { kind: 'int', min: 10, max: 4000 }, default: '100' },
  { key: 'checkpoint_interval', category: 'general', guard: { kind: 'time', min: 59001 }, default: '6min' },
  { key: 'lock_timeout_in_secs', category: 'general', guard: { kind: 'int', min: -1 }, default: '-1', deprecated: { replacedBy: 'lock_timeout' } },
];

let container;
let root;
let dispatch;
beforeEach(async () => {
  globalThis.IS_REACT_ACT_ENVIRONMENT = true;
  vi.resetAllMocks();
  // selectedDatabase is 'demodb' below, so the modal targets [@demodb], not
  // [common] — see DatabasePropertyModal's fetch effect (`target`).
  hostApi.getHostConfig.mockResolvedValue({ conflist: [{ confdata: [
    '[@demodb]', 'max_clients=123', 'data_buffer_size=512M',
  ] }] });
  brokerApi.getBrokerList.mockResolvedValue({ result: [{ name: 'query_editor', port: 30000, state: 'ON' }, { name: 'broker1', port: 33000, state: 'OFF' }] });
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
  const state = {
    databaseUI: { isDatabasePropertyModalOpen: true },
    database: { selectedDatabase: 'demodb' },
    host: {
      selectedHostUid: 'host',
      authorizedHosts: ['host'],
      hosts: [{ uid: 'host', address: '192.168.3.80' }],
      hostEnvs: { host: { paramSchemas: { database: DATABASE_PARAM_SCHEMA } } },
    },
    user: { preferences: { uiLocale: 'en' } },
  };
  const store = configureStore({ reducer: () => state });
  dispatch = vi.spyOn(store, 'dispatch');
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

it('draws the navigation sidebar light in light mode and dark only in dark mode', async () => {
  const sidebar = [...document.querySelectorAll('div')].find((el) => el.className.includes?.('w-[180px]'));
  const classes = sidebar.className.split(/\s+/);
  expect(classes).toContain('bg-slate-50');
  expect(classes).toContain('dark:bg-black/40');
  expect(classes).not.toContain('bg-slate-900');
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

it('shows Connection Information as read-only values: the host address, each broker\'s port, the character set', async () => {
  const connectionTab = Array.from(container.querySelectorAll('button')).find(b => b.textContent.includes('Connection'));
  await click(connectionTab);
  expect(control('broker-ip').textContent).toBe('192.168.3.80');
  expect([...control('broker-ports').querySelectorAll('li')].map((li) => li.textContent)).toEqual(['query_editor [30000/ON]', 'broker1 [33000/OFF]']);
  expect(control('charset').textContent).toBe('UTF-8');
  expect(container.querySelector('input, select, [role="combobox"]')).toBeNull();
  expect(control('apply-btn')).toBeNull();
  expect(control('open-editor-btn')).not.toBeNull();
  expect(control('cancel-btn').textContent).toBe('Close');
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

const discardControl = id => container.querySelector(`[data-testid="database-property-discard-${id}"]`);
const escape = async () => act(async () => {
  document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
});

it.each(['modal-close', 'cancel-btn'])('closes unchanged properties through %s without confirmation', async trigger => {
  await click(control(trigger));
  expect(discardControl('modal')).toBeNull();
  expect(dispatch).toHaveBeenCalledWith({ type: 'close' });
});

const openConnectionTab = () => click(Array.from(container.querySelectorAll('button')).find(b => b.textContent.includes('Connection')));

it.each(['modal-close', 'cancel-btn'])('closes from Connection Information through %s at once, with nothing to discard', async trigger => {
  await openConnectionTab();
  await click(control(trigger));
  expect(discardControl('modal')).toBeNull();
  expect(dispatch).toHaveBeenCalledWith({ type: 'close' });
});

it('closes from Connection Information on Escape at once', async () => {
  await openConnectionTab();
  await escape();
  expect(discardControl('modal')).toBeNull();
  expect(dispatch).toHaveBeenCalledWith({ type: 'close' });
});

it('Server Parameter tables are read-only, so closing from them never prompts', async () => {
  await click(Array.from(container.querySelectorAll('button')).find(el => el.textContent.includes('Advanced Settings')));
  await click(control('cancel-btn'));
  expect(discardControl('modal')).toBeNull();
  expect(dispatch).toHaveBeenCalledWith({ type: 'close' });
});

async function renderWith(confdata) {
  await act(async () => root.unmount());
  root = createRoot(container);
  hostApi.getHostConfig.mockResolvedValue({ conflist: [{ confdata }] });
  brokerApi.getBrokerList.mockResolvedValue({ result: [] });
  const state = {
    databaseUI: { isDatabasePropertyModalOpen: true },
    database: { selectedDatabase: 'demodb' },
    host: { selectedHostUid: 'host', authorizedHosts: ['host'], hostEnvs: { host: { paramSchemas: { database: DATABASE_PARAM_SCHEMA } } } },
    user: { preferences: { uiLocale: 'en' } },
  };
  await act(async () => root.render(
    <Provider store={configureStore({ reducer: () => state })}><ToastProvider><DatabasePropertyModal /></ToastProvider></Provider>
  ));
}

it('hides deprecated keys (and the deprecated pages side of a buffer pair) that the conf does not set', async () => {
  expect(container.textContent).not.toContain('data_buffer_pages');
  expect(container.textContent).not.toContain('lock_timeout_in_secs');
  expect(container.querySelector('[data-testid="param-deprecated-badge"]')).toBeNull();
});

it('shows a deprecated key that the conf does set, labelled with its replacement', async () => {
  await renderWith(['[@demodb]', 'data_buffer_pages=40000', 'lock_timeout_in_secs=10']);
  expect(container.textContent).toContain('data_buffer_pages');
  expect(container.textContent).toContain('40000');
  expect(container.textContent).toContain('lock_timeout_in_secs');
  const badges = Array.from(container.querySelectorAll('[data-testid="param-deprecated-badge"]'));
  expect(badges).toHaveLength(2);
  expect(badges.map(b => b.getAttribute('title'))).toEqual([
    expect.stringContaining('use data_buffer_size instead'),
    expect.stringContaining('use lock_timeout instead'),
  ]);
});

it('compares time values in ms, so 360000 (ms) counts as the 6min default', async () => {
  await renderWith(['[@demodb]', 'checkpoint_interval=360000']);
  const row = Array.from(container.querySelectorAll('tr')).find(r => r.textContent.includes('checkpoint_interval'));
  expect(row.textContent).toContain('360000');
  expect(row.textContent).toContain('Default');
});

// A database runs with [common] and its own [@db] over it, so its view shows
// both (test DB #20/#27: some values in the view were not the ones in effect).
const renderConf = async (confdata, schema = DATABASE_PARAM_SCHEMA, selectedDatabase = 'demodb') => {
  await act(async () => root.unmount());
  root = createRoot(container);
  hostApi.getHostConfig.mockResolvedValue({ conflist: [{ confdata }] });
  const state = {
    databaseUI: { isDatabasePropertyModalOpen: true },
    database: { selectedDatabase },
    host: { selectedHostUid: 'host', authorizedHosts: ['host'], hostEnvs: { host: { paramSchemas: { database: schema } } } },
    user: { preferences: { uiLocale: 'en' } },
  };
  await act(async () => root.render(
    <Provider store={configureStore({ reducer: () => state })}><ToastProvider><DatabasePropertyModal /></ToastProvider></Provider>
  ));
};
const rowOf = (key) => [...container.querySelectorAll('tbody tr')].find((tr) => tr.textContent.includes(key));

it('shows a [common] value the database does not set, marked as from [common]', async () => {
  await renderConf(['[common]', 'max_clients=200', 'checkpoint_interval=10min', '[@demodb]', 'max_clients=123']);
  expect(rowOf('checkpoint_interval').textContent).toContain('10min');
  expect(rowOf('checkpoint_interval').querySelector('[data-testid="param-from-common-badge"]').textContent).toBe('[common]');
});

it('shows the database\'s own value over [common], unmarked', async () => {
  await renderConf(['[common]', 'max_clients=200', '[@demodb]', 'max_clients=123']);
  expect(rowOf('max_clients').textContent).toContain('123');
  expect(rowOf('max_clients').textContent).not.toContain('200');
  expect(rowOf('max_clients').querySelector('[data-testid="param-from-common-badge"]')).toBeNull();
});

it('does not flag a [common]-only key as set in the wrong section when it comes from [common]', async () => {
  const schema = [...DATABASE_PARAM_SCHEMA, { key: 'cubrid_port_id', category: 'general', commonOnly: true, guard: { kind: 'int', min: 1 }, default: '1523' }];
  await renderConf(['[common]', 'cubrid_port_id=1523', '[@demodb]', 'max_clients=123'], schema);
  expect(container.textContent).not.toMatch(/\d+ invalid/);
});

it('leaves the [common] view as it was: no badge', async () => {
  await renderConf(['[common]', 'max_clients=200', 'checkpoint_interval=10min'], DATABASE_PARAM_SCHEMA, null);
  expect(rowOf('checkpoint_interval').textContent).toContain('10min');
  expect(container.querySelector('[data-testid="param-from-common-badge"]')).toBeNull();
});

it('takes a buffer pair from [@db] whole when it sets either key, as the engine reads it', async () => {
  await renderConf(['[common]', 'data_buffer_pages=40000', '[@demodb]', 'data_buffer_size=1G']);
  expect(container.textContent).toContain('1G');
  expect(container.textContent).not.toContain('40000');
  expect(container.textContent).not.toContain('data_buffer_pages');
});

it('still checks the [@db] side of a buffer pair when [common] sets the other key', async () => {
  await renderConf(['[common]', 'data_buffer_pages=40000', '[@demodb]', 'data_buffer_size=abc']);
  expect(container.textContent).toMatch(/1 invalid/);
});

it('keeps the newer database\'s values when an earlier database\'s config answers late', async () => {
  await act(async () => root.unmount());
  root = createRoot(container);
  let answerFirst;
  hostApi.getHostConfig
    .mockReturnValueOnce(new Promise((resolve) => { answerFirst = resolve; }))
    .mockResolvedValueOnce({ conflist: [{ confdata: ['[@otherdb]', 'max_clients=456'] }] });
  const base = {
    databaseUI: { isDatabasePropertyModalOpen: true },
    database: { selectedDatabase: 'demodb' },
    host: { selectedHostUid: 'host', authorizedHosts: ['host'], hostEnvs: { host: { paramSchemas: { database: DATABASE_PARAM_SCHEMA } } } },
    user: { preferences: { uiLocale: 'en' } },
  };
  const store = configureStore({ reducer: (state = base, action) => (action.type === 'test/select' ? { ...state, database: { selectedDatabase: action.payload } } : state) });
  await act(async () => root.render(
    <Provider store={store}><ToastProvider><DatabasePropertyModal /></ToastProvider></Provider>
  ));
  await act(async () => store.dispatch({ type: 'test/select', payload: 'otherdb' }));
  expect(rowOf('max_clients').textContent).toContain('456');

  await act(async () => answerFirst({ conflist: [{ confdata: ['[@demodb]', 'max_clients=123'] }] }));
  expect(rowOf('max_clients').textContent).toContain('456');
  expect(rowOf('max_clients').textContent).not.toContain('123');
});

it('takes a deprecated key and its replacement from [@db] whole when it sets either', async () => {
  const schema = [...DATABASE_PARAM_SCHEMA, { key: 'lock_timeout', category: 'general', guard: { kind: 'time' }, default: '-1' }];
  await renderConf(['[common]', 'lock_timeout_in_secs=10', '[@demodb]', 'lock_timeout=5s'], schema);
  expect(rowOf('lock_timeout').textContent).toContain('5s');
  expect(container.textContent).not.toContain('lock_timeout_in_secs');
});

it('stops showing the loading view when the config read fails', async () => {
  vi.spyOn(console, 'error').mockImplementation(() => undefined);
  await act(async () => root.unmount());
  root = createRoot(container);
  hostApi.getHostConfig.mockRejectedValue(new Error('connect ECONNREFUSED'));
  const state = {
    databaseUI: { isDatabasePropertyModalOpen: true },
    database: { selectedDatabase: 'demodb' },
    host: { selectedHostUid: 'host', authorizedHosts: ['host'], hostEnvs: { host: { paramSchemas: { database: DATABASE_PARAM_SCHEMA } } } },
    user: { preferences: { uiLocale: 'en' } },
  };
  await act(async () => root.render(
    <Provider store={configureStore({ reducer: () => state })}><ToastProvider><DatabasePropertyModal /></ToastProvider></Provider>
  ));
  expect(container.querySelector('.animate-spin')).toBeNull();
});
