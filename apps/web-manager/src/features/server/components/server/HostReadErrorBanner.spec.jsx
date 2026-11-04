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

const render = (hostData) => act(async () => {
  const store = configureStore({
    reducer: {
      user: (s = { preferences: { uiLocale: 'en' } }) => s,
      monitoring: (s = { hostsData: hostData ? { h1: hostData } : {} }) => s,
    },
  });
  root.render(<Provider store={store}><HostReadErrorBanner hostUid="h1" /></Provider>);
});
const banner = () => container.querySelector('[data-testid="server-dashboard-host-error"]');

it.each([
  ['a message', 'connect ECONNREFUSED'],
  ['an error object', { message: 'connect ECONNREFUSED' }],
])('shows why the host could not be read, given %s', async (_, error) => {
  await render({ error });
  expect(banner().textContent).toContain(CM.systemStatusError);
  expect(banner().textContent).toContain('connect ECONNREFUSED');
});

it('shows nothing when the host was read, or not yet', async () => {
  await render({ error: null });
  expect(banner()).toBeNull();
  await render(undefined);
  expect(banner()).toBeNull();
});
