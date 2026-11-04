import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import { Provider } from 'react-redux';
import { configureStore } from '@reduxjs/toolkit';
import { afterEach, beforeEach, expect, it } from 'vitest';
import HostReadErrorBanner from './HostReadErrorBanner';
import { CM } from '../../../../constants/cmLabels';

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

const render = (hostData, props = {}) => act(async () => {
  const store = configureStore({
    reducer: {
      user: (s = { preferences: { uiLocale: 'en' } }) => s,
      monitoring: (s = { hostsData: hostData ? { h1: hostData } : {} }) => s,
    },
  });
  root.render(<Provider store={store}><HostReadErrorBanner hostUid="h1" {...props} /></Provider>);
});
const banner = () => container.querySelector('[data-testid="server-dashboard-host-error"]');

it.each([
  ['a message', 'connect ECONNREFUSED'],
  ['an error object', { message: 'connect ECONNREFUSED' }],
])('shows why the system status read failed, given %s', async (_, error) => {
  await render({ error });
  expect(banner().textContent).toContain(CM.systemStatusError);
  expect(banner().textContent).toContain('connect ECONNREFUSED');
});

it('shows a failed database list read even while the system status is not read', async () => {
  await render(undefined, { startInfoError: 'Failed to fetch database information', statusReadActive: false });
  expect(banner().textContent).toContain('Failed to fetch database information');
});

it('drops a system status error once that section is no longer read', async () => {
  await render({ error: 'connect ECONNREFUSED' }, { statusReadActive: false });
  expect(banner()).toBeNull();
});

it('names the database list failure first when both reads failed', async () => {
  await render({ error: 'host stat failed' }, { startInfoError: 'Failed to fetch database information' });
  expect(banner().textContent).toContain('Failed to fetch database information');
  expect(banner().textContent).not.toContain('host stat failed');
});

it('shows nothing when the host was read, or not yet', async () => {
  await render({ error: null });
  expect(banner()).toBeNull();
  await render(undefined);
  expect(banner()).toBeNull();
});
