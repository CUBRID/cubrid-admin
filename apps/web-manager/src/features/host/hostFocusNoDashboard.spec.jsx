import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import { Provider } from 'react-redux';
import { configureStore } from '@reduxjs/toolkit';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';

// layoutSlice reads the OS theme at import time; jsdom has no matchMedia.
vi.hoisted(() => {
  window.matchMedia ??= () => ({ matches: false, addEventListener: vi.fn(), removeEventListener: vi.fn() });
});
// The reads activation sends (start-info, broker list, env) are stand-ins.
vi.mock('../database/databaseCoreSlice', () => ({
  resetDatabaseState: (uid) => ({ type: 'test/resetDb', payload: uid }),
  fetchDatabaseStartInfo: (uid) => ({ type: 'test/startInfo', payload: uid }),
}));
vi.mock('../broker/brokerSlice', () => ({
  resetBrokerState: (uid) => ({ type: 'test/resetBroker', payload: uid }),
  fetchBrokerList: (uid) => ({ type: 'test/brokerList', payload: uid }),
}));
vi.mock('./hostSlice', () => ({
  loginToHostWithSideEffects: () => ({ type: 'test/login' }),
  fetchHostEnv: (uid) => ({ type: 'test/env', payload: uid }),
  openEditHostModal: () => ({ type: 'test/edit' }),
  setSelectedHost: (uid) => ({ type: 'test/select', payload: uid }),
}));
vi.mock('../server/monitoringSlice', () => ({ fetchHaHeartbeatOnly: () => ({ type: 'test/hb' }) }));

import ServerListItem from '../layout/sidebar/components/ServerListItem';
import { useHostActivation } from './useHostActivation';

let container;
let root;
let actions;
beforeEach(() => {
  globalThis.IS_REACT_ACT_ENVIRONMENT = true;
  actions = [];
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
});
afterEach(async () => {
  await act(async () => root.unmount());
  container.remove();
  delete globalThis.IS_REACT_ACT_ENVIRONMENT;
});

function HostRow({ host }) {
  const activateHost = useHostActivation();
  return <ServerListItem host={host} isAuthorized onContextMenu={() => undefined} onSelect={() => undefined} onActivate={activateHost} />;
}

const render = async () => {
  const state = {
    host: { authorizedHosts: ['h1', 'h2'], selectedHostUid: 'h1', haInfo: {} },
    user: { preferences: { uiLocale: 'en' } },
    layout: { activeMainTab: 'service_dashboard' },
  };
  const store = configureStore({ reducer: (s = state, a) => { actions.push(a); return s; } });
  await act(async () => root.render(<Provider store={store}><HostRow host={{ uid: 'h2', id: 'admin', alias: 'h2', address: '10.0.0.2', port: '8001' }} /></Provider>));
};
const row = () => container.querySelector('[data-testid="host-item-h2"]');
const tabChanges = () => actions.filter((a) => a.type === 'layout/setActiveMainTab' || a.type === 'layout/openTab');

it('a single click on a connected host switches the sidebar to it without opening its dashboard', async () => {
  await render();
  await act(async () => row().click());
  expect(actions.map((a) => a.type)).toContain('test/select');
  // No dashboard on screen, so nothing reads that host's volumes.
  expect(tabChanges()).toEqual([]);
});

it('a double click opens its dashboard', async () => {
  await render();
  await act(async () => row().dispatchEvent(new MouseEvent('dblclick', { bubbles: true })));
  expect(tabChanges().map((a) => a.payload)).toEqual(['host:h2']);
});
