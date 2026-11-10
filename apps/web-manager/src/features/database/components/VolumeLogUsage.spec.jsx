import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import { Provider } from 'react-redux';
import { configureStore } from '@reduxjs/toolkit';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// Log volumes come from CMS with freepage " " and no usedpage. These screens
// used to read that as 0 and show a log volume as fully used.
vi.hoisted(() => {
  window.matchMedia ??= () => ({ matches: false, addEventListener: () => undefined, removeEventListener: () => undefined });
});
vi.mock('../databaseSlice', () => ({ fetchDatabaseSpaceInfo: vi.fn(() => ({ type: 'test/noop' })) }));
vi.mock('../databaseApi', () => ({ databaseApi: { getVolumeInfo: vi.fn() } }));

import VolumeInfoMonitor from './VolumeInfoMonitor';
import { VolumeTopology } from './DatabaseSpaceMonitor';
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

const logVolume = { spacename: '/data/demodb_lgat', type: 'Active_log', purpose: ' ', totalpage: '32768', freepage: ' ', location: '/data' };
const dataVolume = { spacename: '/data/demodb', type: 'PERMANENT', purpose: 'PERMANENT', totalpage: '8192', freepage: '3904', usedpage: '4288', location: '/data' };

const makeStore = () => configureStore({
  reducer: {
    user: (s = { preferences: { uiLocale: 'en', dashboardInterval: 0 } }) => s,
    host: (s = { authorizedHosts: [], reconnectQueue: [] }) => s,
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

describe('VolumeInfoMonitor', () => {
  it('shows "-" for a log volume\'s used share instead of 100% used', async () => {
    await render(<VolumeInfoMonitor tabId="vol_info:h1:demodb:/data/demodb_lgat" />);
    const text = container.textContent;
    expect(text).not.toContain('100.00%');
    expect(text).toContain('- / 512 MiB');
  });

  it('still shows a data volume\'s used share', async () => {
    await render(<VolumeInfoMonitor tabId="vol_info:h1:demodb:/data/demodb" />);
    expect(container.textContent).toContain('52.3%');
    expect(container.textContent).toContain('67 MiB / 128 MiB');
  });
});

describe('DatabaseSpaceMonitor allocation column', () => {
  it('shows "-" for a log volume instead of "0 / N, 100% free"', async () => {
    await render(<VolumeTopology hostUid="h1" dbname="demodb" spaceinfo={[dataVolume, logVolume]} />);
    const rows = [...container.querySelectorAll('tr')].map((tr) => tr.textContent);
    const logRow = rows.find((t) => t.includes('demodb_lgat'));
    expect(logRow).toContain('- / ');
    expect(logRow).not.toMatch(/100%/);
    const headers = [...container.querySelectorAll('th')].map((th) => th.textContent.trim());
    const freeIndex = headers.indexOf(CM.freeLabel);
    const logCells = [...[...container.querySelectorAll('tr')].find((tr) => tr.textContent.includes('demodb_lgat')).querySelectorAll('td')].map((td) => td.textContent.trim());
    expect(freeIndex).toBeGreaterThanOrEqual(0);
    expect(logCells[freeIndex]).toBe('-'); // not a blank cell
    const dataRow = rows.find((t) => t.includes('demodb') && !t.includes('demodb_lgat'));
    expect(dataRow).toMatch(/47\.7%/);
  });
});
