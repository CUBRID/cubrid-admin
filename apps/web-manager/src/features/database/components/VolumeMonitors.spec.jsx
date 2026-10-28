import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import { Provider } from 'react-redux';
import { configureStore } from '@reduxjs/toolkit';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// Data comes straight from the store in these tests; polling is not under test.
vi.mock('../../../infrastructure/hooks/usePollingRefresh', () => ({
  usePollingRefresh: () => ({ isManualRefreshing: false, lastRefreshed: new Date(0), handleRefresh: vi.fn() }),
}));
vi.mock('../databaseSlice', () => ({ fetchDatabaseSpaceInfo: vi.fn(() => ({ type: 'test/noop' })) }));
vi.mock('../../user/components/MonitoringSettingsPopover', () => ({ default: () => null }));

import VolumeInfoMonitor from './VolumeInfoMonitor';
import VolumeCategoryMonitor from './VolumeCategoryMonitor';
import { CM } from '../../../constants/cmLabels';

const KEY = 'host1:demodb';

const makeStore = ({ spaceInfo = {}, dashboardData = {} } = {}) => configureStore({
  reducer: {
    user: (s = { preferences: { uiLocale: 'en', dashboardInterval: 0 } }) => s,
    databaseMonitoring: (s = { spaceInfo, spaceInfoLoading: {}, dashboardData }) => s,
  },
});

const dbSpace = (volumes) => ({ volumes, summary: [], files: [], pagesize: '16384', logpagesize: '16384' });
const volume = { spacename: 'demodb_x001', type: 'PERMANENT', purpose: 'PERMANENT', totalpage: '100', freepage: '40', usedpage: '60', location: '/data' };

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

const render = (ui, store) => act(async () => {
  root.render(<Provider store={store}>{ui}</Provider>);
});

describe('VolumeInfoMonitor', () => {
  const ui = <VolumeInfoMonitor tabId="vol_info:host1:demodb:demodb_x001" />;

  it('shows loading, not "volume not found", before space info has been fetched', async () => {
    await render(ui, makeStore());
    expect(container.textContent).toContain(CM.loadingVolumeInfo);
    expect(container.textContent).not.toContain(CM.volumeNotFound);
  });

  it('shows "volume not found" only when loaded space info lacks the volume', async () => {
    await render(ui, makeStore({ spaceInfo: { [KEY]: dbSpace([]) } }));
    expect(container.textContent).toContain(CM.volumeNotFound);
  });

  it('shows an unavailable state when the space info fetch failed', async () => {
    await render(ui, makeStore({ dashboardData: { [KEY]: { spaceInfoStatus: 'error' } } }));
    expect(container.textContent).toContain(CM.dataUnavailableTitle);
    expect(container.textContent).not.toContain(CM.volumeNotFound);
  });

  it('keeps showing cached space info when a later refresh failed', async () => {
    await render(ui, makeStore({
      spaceInfo: { [KEY]: dbSpace([volume]) },
      dashboardData: { [KEY]: { spaceInfoStatus: 'error' } },
    }));
    expect(container.textContent).not.toContain(CM.dataUnavailableTitle);
    expect(container.textContent).not.toContain(CM.volumeNotFound);
  });
});

describe('VolumeCategoryMonitor', () => {
  const ui = <VolumeCategoryMonitor hostUid="host1" dbname="demodb" category="Permanent_PermanentData" />;

  it('shows loading before space info has been fetched', async () => {
    await render(ui, makeStore());
    expect(container.textContent).toContain(CM.loadingLabel);
    expect(container.textContent).not.toContain(CM.noDataAvailableMsg);
  });

  it('shows "no data" after a successful fetch with no volumes in the category', async () => {
    await render(ui, makeStore({ spaceInfo: { [KEY]: dbSpace([]) } }));
    expect(container.textContent).toContain(CM.noDataAvailableMsg);
  });

  it('shows an unavailable state when the fetch failed', async () => {
    await render(ui, makeStore({ dashboardData: { [KEY]: { spaceInfoStatus: 'error' } } }));
    expect(container.textContent).toContain(CM.dataUnavailableTitle);
  });
});
