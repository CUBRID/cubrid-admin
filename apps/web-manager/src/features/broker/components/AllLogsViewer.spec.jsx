import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import { Provider } from 'react-redux';
import { configureStore } from '@reduxjs/toolkit';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../brokerApi', () => ({
  brokerApi: { getBrokerLogs: vi.fn(), getDatabaseLogs: vi.fn(), viewLog: vi.fn() },
}));
import { brokerApi } from '../brokerApi';
import brokerReducer from '../brokerSlice';
import AllLogsViewer from './AllLogsViewer';

let container;
let root;

beforeEach(() => {
  globalThis.IS_REACT_ACT_ENVIRONMENT = true;
  vi.resetAllMocks();
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
});

afterEach(async () => {
  await act(async () => root.unmount());
  container.remove();
  delete globalThis.IS_REACT_ACT_ENVIRONMENT;
});

const makeStore = () => configureStore({
  reducer: {
    broker: brokerReducer,
    user: (s = { preferences: { uiLocale: 'en' } }) => s,
  },
});

// Lets every failed request settle, and any request a failure would trigger.
const settle = () => act(async () => {
  for (let i = 0; i < 20; i++) await new Promise((r) => setTimeout(r, 0));
});

const unreachable = () => Promise.reject({ response: { status: 500, data: { message: 'NO_RESPONSE' } } });

describe('AllLogsViewer with an unreachable host', () => {
  it('does not ask for the log list again each time it fails', async () => {
    brokerApi.getBrokerLogs.mockImplementation(unreachable);
    await act(async () => {
      root.render(<Provider store={makeStore()}><AllLogsViewer hostUid="h1" targetName="broker1" /></Provider>);
    });
    await settle();
    expect(brokerApi.getBrokerLogs).toHaveBeenCalledTimes(1);
  });

  it('does not ask for a log file again each time it fails', async () => {
    brokerApi.getDatabaseLogs.mockResolvedValue({ loginfo: [{ log: [{ path: '/logs/demodb.err' }] }] });
    brokerApi.viewLog.mockImplementation(unreachable);
    await act(async () => {
      root.render(<Provider store={makeStore()}><AllLogsViewer type="database" hostUid="h1" targetName="demodb" /></Provider>);
    });
    await settle();
    expect(brokerApi.getDatabaseLogs).toHaveBeenCalledTimes(1);
    expect(brokerApi.viewLog).toHaveBeenCalledTimes(1);
  });
});
