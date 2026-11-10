import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import { Provider } from 'react-redux';
import { configureStore } from '@reduxjs/toolkit';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// CUBRID 10+ CMS sends a data volume's full file path as its location, but a
// log volume's folder. Both screens should show the folder.
vi.hoisted(() => {
  window.matchMedia ??= () => ({ matches: false, addEventListener: () => undefined, removeEventListener: () => undefined });
});
vi.mock('../databaseSlice', () => ({ fetchDatabaseSpaceInfo: vi.fn(() => ({ type: 'test/noop' })) }));
vi.mock('../databaseApi', () => ({ databaseApi: { getVolumeInfo: vi.fn() } }));

import VolumeInfoMonitor from './VolumeInfoMonitor';
import { VolumeTopology } from './DatabaseSpaceMonitor';

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

const dataVolume = { spacename: '/db/demodb/demodb', location: '/db/demodb/demodb', volid: '0', type: 'PERMANENT', purpose: 'PERMANENT', totalpage: '8192', freepage: '3904', usedpage: '4288' };
const logVolume = { spacename: 'demodb_lgat', location: '/db/demodb/log', type: 'Active_log', purpose: ' ', totalpage: '32768', freepage: ' ' };

const makeStore = () => configureStore({
  reducer: {
    user: (s = { preferences: { uiLocale: 'en', dashboardInterval: 0 } }) => s,
    host: (s = { authorizedHosts: [], reconnectQueue: [] }) => s,
    // The volume screen shows nothing without the database's login.
    database: (s = { loggedInDatabases: ['h1:demodb'] }) => s,
    layout: (s = { refreshCounter: 0, activeMainTab: null }) => s,
    databaseMonitoring: (s = {
      spaceInfo: { 'h1:demodb': { pagesize: '16384', logpagesize: '16384', volumes: [dataVolume, logVolume] } },
      spaceInfoLoading: {},
      dashboardData: {},
    }) => s,
  },
});
const render = (ui) => act(async () => root.render(<Provider store={makeStore()}>{ui}</Provider>));

describe('volume location', () => {
  it('shows the folder of a data volume on the volume screen', async () => {
    await render(<VolumeInfoMonitor tabId="vol_info:h1:demodb:/db/demodb/demodb" />);
    expect(container.textContent).not.toContain('/db/demodb/demodb');
    expect(container.querySelector('[title="/db/demodb"]')).not.toBeNull();
  });

  it('shows the folder of a log volume as it is', async () => {
    await render(<VolumeInfoMonitor tabId="vol_info:h1:demodb:demodb_lgat" />);
    expect(container.querySelector('[title="/db/demodb/log"]')).not.toBeNull();
  });

  it('shows folders in the space screen path column', async () => {
    await render(<VolumeTopology hostUid="h1" dbname="demodb" spaceinfo={[dataVolume, logVolume]} />);
    // The path column is the last one; the name column also has a title.
    const titles = [...container.querySelectorAll('tbody tr')].map((tr) => tr.querySelector('td:last-child span[title]')?.getAttribute('title'));
    expect(titles).toContain('/db/demodb');
    expect(titles).toContain('/db/demodb/log');
    expect(titles).not.toContain('/db/demodb/demodb');
  });
});
