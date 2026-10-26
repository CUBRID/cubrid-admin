import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import { Provider } from 'react-redux';
import { configureStore } from '@reduxjs/toolkit';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../brokerApi', () => ({ brokerApi: { getCMSLogs: vi.fn() } }));
import { brokerApi } from '../brokerApi';
import brokerReducer from '../brokerSlice';
import CMSLogViewer from './CMSLogViewer';
import { CM } from '../../../constants/cmLabels';

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

const deferred = () => {
  let resolve;
  let reject;
  const promise = new Promise((res, rej) => { resolve = res; reject = rej; });
  return { promise, resolve, reject };
};

const render = (store) => act(async () => {
  root.render(<Provider store={store}><CMSLogViewer hostUid="h1" type="access" /></Provider>);
});

describe('CMSLogViewer fetch states', () => {
  it('fetches on mount and shows loading, not "no entries", until it settles', async () => {
    const request = deferred();
    brokerApi.getCMSLogs.mockReturnValueOnce(request.promise);

    await render(makeStore());
    expect(brokerApi.getCMSLogs).toHaveBeenCalledWith('h1');
    expect(container.textContent).toContain(CM.loadingManagerLogs);
    expect(container.textContent).not.toContain(CM.noLogEntriesFound);

    await act(async () => request.resolve({ accesslog: [], errorlog: [] }));
    expect(container.textContent).toContain(CM.noLogEntriesFound);
  });

  it('shows an unavailable state when the first fetch fails', async () => {
    brokerApi.getCMSLogs.mockRejectedValueOnce(new Error('timeout'));

    await render(makeStore());

    expect(container.textContent).toContain(CM.dataUnavailableTitle);
    expect(container.textContent).not.toContain(CM.noLogEntriesFound);
  });

  it('keeps the loaded entries when a refresh fails', async () => {
    brokerApi.getCMSLogs.mockResolvedValueOnce({ accesslog: [{ time: 't1', '@user': 'admin', taskname: 'login' }], errorlog: [] });
    const store = makeStore();
    await render(store);
    expect(container.textContent).toContain('login');

    brokerApi.getCMSLogs.mockRejectedValueOnce(new Error('timeout'));
    const refreshBtn = container.querySelector(`button[title="${CM.refresh}"]`);
    await act(async () => refreshBtn.click());

    expect(brokerApi.getCMSLogs).toHaveBeenCalledTimes(2);
    expect(container.textContent).toContain('login');
    expect(container.textContent).not.toContain(CM.dataUnavailableTitle);
  });
});
