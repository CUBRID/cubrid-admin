import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import { Provider } from 'react-redux';
import { configureStore } from '@reduxjs/toolkit';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import SystemInfo from './SystemInfo';
import { CM } from '../../../constants/cmLabels';

let container;
let root;

beforeEach(() => {
  globalThis.IS_REACT_ACT_ENVIRONMENT = true;
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
});

afterEach(async () => {
  await act(async () => root.unmount());
  container.remove();
  delete globalThis.IS_REACT_ACT_ENVIRONMENT;
});

const render = async (hostEnvs) => {
  const store = configureStore({
    reducer: {
      user: (s = { preferences: { uiLocale: 'en' } }) => s,
      host: (s = { hosts: [{ uid: 'h1', address: '10.0.0.1', port: 8001, id: 'admin' }], hostEnvs }) => s,
    },
  });
  await act(async () => {
    root.render(<Provider store={store}><SystemInfo hostUid="h1" /></Provider>);
  });
  // The card starts collapsed; expand it.
  await act(async () => {
    container.querySelector('[data-testid="server-dashboard-system-info"] .cursor-pointer').click();
  });
};

describe('SystemInfo environment states', () => {
  it('shows loading before the environment has been fetched', async () => {
    await render({});
    expect(container.textContent).toContain(CM.loadingLabel);
    expect(container.textContent).not.toContain(CM.environmentUnavailable);
  });

  it('shows "unavailable" after the environment fetch failed', async () => {
    await render({ h1: null });
    expect(container.textContent).toContain(CM.environmentUnavailable);
  });

  it('shows the environment once loaded', async () => {
    await render({ h1: { CUBRIDVER: '11.4.0.0001', osinfo: 'Linux' } });
    expect(container.textContent).toContain('11.4.0.0001');
  });
});

describe('fetchHostEnv.rejected', () => {
  it('marks a never-loaded environment as failed but keeps a loaded one', async () => {
    const { default: hostReducer, fetchHostEnv } = await import('../../host/hostSlice');
    const rejected = { type: fetchHostEnv.rejected.type, meta: { arg: 'h1' } };

    const fresh = hostReducer(undefined, { type: 'init' });
    expect(hostReducer(fresh, rejected).hostEnvs.h1).toBeNull();

    const loaded = hostReducer(fresh, { type: fetchHostEnv.fulfilled.type, payload: { hostUid: 'h1', env: { CUBRIDVER: '11.4' } } });
    expect(hostReducer(loaded, rejected).hostEnvs.h1).toEqual({ CUBRIDVER: '11.4' });
  });
});
