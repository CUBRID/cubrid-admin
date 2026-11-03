import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import { Provider } from 'react-redux';
import { configureStore } from '@reduxjs/toolkit';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../../monitoringSlice', () => ({
  fetchMonitoringData: vi.fn(() => ({ type: 'test/noop' })),
  clearMonitoring: vi.fn(() => ({ type: 'test/noop' })),
}));

import SystemStatusSection from './SystemStatusSection';
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
      host: (s = { authorizedHosts: ['h1'], haInfo: {} }) => s,
      monitoring: (s = { hostsData: { h1: hostData } }) => s,
    },
  });
  // isTabActive=false: no polling in this test.
  root.render(<Provider store={store}><SystemStatusSection hostUid="h1" isTabActive={false} /></Provider>);
});

const nowRow = () => container.querySelectorAll('tbody tr')[0];

describe('SystemStatusSection', () => {
  it('shows "-" for TPS/QPS/CPU before a rate exists, not a fake 0', async () => {
    await render({
      currentStatus: { cpu: null, memory: 50, tps: null, qps: null, memUsed: 500, memTotal: 1000 },
      averages: { cpu: null, memory: 50, tps: null, qps: null },
      disk: null,
    });
    const cells = [...nowRow().querySelectorAll('td')].map((td) => td.textContent);
    expect(cells.slice(2)).toEqual(['—', '—', '-', '-']);
  });

  it('shows rates and root filesystem disk usage once available', async () => {
    await render({
      currentStatus: { cpu: 12.5, memory: 50, tps: 3.5, qps: 20, memUsed: 500, memTotal: 1000 },
      averages: { cpu: 10, memory: 50, tps: 3, qps: 18 },
      disk: { total: 1024 * 1024 * 1024, used: 512 * 1024 * 1024, pct: 50, names: ['/'] },
    });
    const text = nowRow().textContent;
    expect(text).toContain('512 MiB / 1 GiB (50.0%)');
    expect(text).toContain(CM.diskRootFilesystem);
    expect(text).toContain('12.5%');
    expect(text).toContain('3.50');
    expect(text).toContain('20.00');
  });
});
