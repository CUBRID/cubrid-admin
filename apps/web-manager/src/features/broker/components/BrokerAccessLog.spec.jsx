import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import { Provider } from 'react-redux';
import { configureStore } from '@reduxjs/toolkit';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import brokerReducer from '../brokerSlice';
import { brokerApi } from '../brokerApi';
import LogTree from '../../layout/sidebar/components/LogTree';
import LogViewer from './LogViewer';

vi.mock('../brokerApi', () => ({ brokerApi: { getBrokerList: vi.fn(), getBrokerLogs: vi.fn(), viewLog: vi.fn() } }));

vi.hoisted(() => {
  window.matchMedia = () => ({ matches: false });
});

let container, root, store, actions;
const path = '/cubrid/log/broker/query_editor.access';
const files = [
  { path, type: 'access' },
  { path: `${path}.20261028090000`, type: 'access' },
  { path: '/cubrid/log/broker/legacy.access', type: '' },
  { path: '/cubrid/log/broker/sql_log/query_editor_1.sql.log', type: 'script' },
  { path: '/cubrid/log/broker/error_log/query_editor_1.err', type: 'error' },
];

beforeEach(() => {
  globalThis.IS_REACT_ACT_ENVIRONMENT = true;
  vi.resetAllMocks();
  brokerApi.getBrokerList.mockResolvedValue({ result: [{ name: 'query_editor' }] });
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
  actions = [];
  store = configureStore({
    reducer: {
      broker: brokerReducer,
      database: (s = { navigatorDatabasesByHost: {} }) => s,
      user: (s = { preferences: { uiLocale: 'en' } }) => s,
    },
    preloadedState: { broker: {
      ...brokerReducer(undefined, { type: 'init' }),
      navigatorBrokersByHost: { h1: [{ name: 'query_editor' }] },
      brokersByHost: { h1: [{ name: 'query_editor', qps: 12.5, tps: 4.25 }] },
      logsByBroker: { unrelated: [{ path: '/other/other.access', type: 'access' }] },
    } },
    middleware: getDefault => getDefault().concat(() => next => action => {
      actions.push(action);
      return next(action);
    }),
  });
});
afterEach(async () => {
  await act(async () => root.unmount());
  container.remove();
  delete globalThis.IS_REACT_ACT_ENVIRONMENT;
});
const render = component => act(async () => {
  root.render(<Provider store={store}>{component}</Provider>);
});

describe('broker access logs', () => {
  it('loads access files on expansion and opens the selected file in a log tab', async () => {
    brokerApi.getBrokerLogs.mockResolvedValue({ logfileinfo: [{ logfile: files }] });
    await render(<LogTree hostUid="h1" />);
    const node = container.querySelector('#broker-access-logs');
    await act(async () => {
      node.open = true;
      node.dispatchEvent(new Event('toggle'));
    });
    expect(brokerApi.getBrokerList).toHaveBeenCalledWith('h1');
    expect(brokerApi.getBrokerLogs).toHaveBeenCalledWith('h1', 'query_editor');
    const buttons = [...node.querySelectorAll('button')];
    expect(buttons.map(b => b.textContent).join(' ')).toContain('query_editor.access.20261028090000');
    expect(buttons.map(b => b.textContent).join(' ')).toContain('legacy.access');
    expect(buttons.map(b => b.textContent).join(' ')).not.toMatch(/sql\.log|\.err|other\.access/);
    const file = buttons.find(b => b.textContent.includes('query_editor.access') && !b.textContent.includes('20261028'));
    await act(async () => {
      file.click();
      file.dispatchEvent(new MouseEvent('dblclick', { bubbles: true }));
    });
    expect(store.getState().broker.selectedBrokerSubItem).toBe(path);
    expect(actions).toContainEqual({ type: 'layout/openTab', payload: `log:h1:${path}` });
  });

  it('discovers brokers when the Log tab is opened before the Broker tab', async () => {
    await act(async () => store.dispatch({ type: 'broker/resetBrokerState', payload: 'h1' }));
    brokerApi.getBrokerLogs.mockResolvedValue({ logfileinfo: [{ logfile: files }] });
    await render(<LogTree hostUid="h1" />);
    const node = container.querySelector('#broker-access-logs');
    await act(async () => {
      node.open = true;
      node.dispatchEvent(new Event('toggle'));
    });
    expect(brokerApi.getBrokerList).toHaveBeenCalledWith('h1');
    expect(node.textContent).toContain('query_editor.access');
  });

  it.each([false, true])('preserves dashboard rates and monitoring request tracking when discovery fails: %s', async fails => {
    const before = store.getState().broker;
    const liveBrokers = before.brokersByHost.h1;
    if (fails) brokerApi.getBrokerList.mockRejectedValue(new Error('CMS unavailable'));
    brokerApi.getBrokerLogs.mockResolvedValue({ logfileinfo: [{ logfile: files }] });
    await render(<LogTree hostUid="h1" />);
    const node = container.querySelector('#broker-access-logs');
    await act(async () => { node.open = true; node.dispatchEvent(new Event('toggle')); });
    const after = store.getState().broker;
    expect(after.brokersByHost.h1).toBe(liveBrokers);
    expect(after.latestBrokerListRequestIdByHost).toEqual(before.latestBrokerListRequestIdByHost);
    expect(after.brokerListFailedByHost).toEqual(before.brokerListFailedByHost);
    if (fails) expect(node.querySelector('[role="alert"]')).not.toBeNull();
    else expect(node.textContent).toContain('query_editor.access');
  });

  it('reloads cached empty metadata when access files are created later', async () => {
    brokerApi.getBrokerLogs.mockResolvedValue({ logfileinfo: [{ logfile: [] }] });
    await render(<LogTree hostUid="h1" />);
    const node = container.querySelector('#broker-access-logs');
    await act(async () => { node.open = true; node.dispatchEvent(new Event('toggle')); });
    expect(node.textContent).not.toContain('query_editor.access');
    await act(async () => { node.open = false; node.dispatchEvent(new Event('toggle')); });
    brokerApi.getBrokerLogs.mockResolvedValue({ logfileinfo: [{ logfile: files }] });
    await act(async () => { node.open = true; node.dispatchEvent(new Event('toggle')); });
    expect(node.textContent).toContain('query_editor.access');
  });

  it('shows discovery failures instead of reporting an empty list', async () => {
    brokerApi.getBrokerList.mockRejectedValue(new Error('CMS unavailable'));
    await render(<LogTree hostUid="h1" />);
    const node = container.querySelector('#broker-access-logs');
    await act(async () => { node.open = true; node.dispatchEvent(new Event('toggle')); });
    expect(node.querySelector('[role="alert"]')).not.toBeNull();
  });

  it.each([path, `${path}.20261028090000`])('displays %s as raw text without SQL analysis', async logPath => {
    brokerApi.viewLog.mockResolvedValue({ log: [{ line: ['client connected'] }], total: '1' });
    await render(<LogViewer hostUid="h1" path={logPath} />);
    expect(brokerApi.viewLog).toHaveBeenCalledWith('h1', { path: logPath, start: '1', end: '100' });
    expect(container.textContent).toContain('client connected');
    expect(container.querySelector('[data-testid="log-viewer-mode-top"]')).toBeNull();
  });

  it('shows a retrieval error instead of silently hiding the failure', async () => {
    brokerApi.viewLog.mockRejectedValue({ response: { data: { message: 'Cannot open access log' } } });
    await render(<LogViewer hostUid="h1" path={path} />);
    expect(container.querySelector('[role="alert"]').textContent).toBe('Cannot open access log');
  });

  it('keeps SQL analysis available for SQL logs', async () => {
    brokerApi.viewLog.mockResolvedValue({ log: [{ line: [] }], total: '0' });
    await render(<LogViewer hostUid="h1" path="/cubrid/log/broker/sql_log/query_editor_1.sql.log" />);
    expect(container.querySelector('[data-testid="log-viewer-mode-top"]')).not.toBeNull();
  });
});
