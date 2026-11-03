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
import { fetchMonitoringData } from '../../monitoringSlice';
import { CM } from '../../../../constants/cmLabels';

let container;
let root;

beforeEach(() => {
  vi.clearAllMocks();
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

const render = (hostData, { isTabActive = false, dashboardInterval = 3, onExpandedChange } = {}) => act(async () => {
  const store = configureStore({
    reducer: {
      user: (s = { preferences: { uiLocale: 'en', dashboardInterval } }) => s,
      host: (s = { authorizedHosts: ['h1'], haInfo: {} }) => s,
      monitoring: (s = { hostsData: { h1: hostData } }) => s,
    },
  });
  root.render(
    <Provider store={store}>
      <SystemStatusSection hostUid="h1" isTabActive={isTabActive} onExpandedChange={onExpandedChange} />
    </Provider>
  );
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

  describe('refresh', () => {
    const empty = { currentStatus: {}, averages: {}, disk: null };
    const toggle = () => act(async () => container.querySelector('[class*="cursor-pointer"]')?.click());

    it('does not poll on its own; the host dashboard\'s refresh reads it', async () => {
      vi.useFakeTimers();
      try {
        await render(empty, { isTabActive: true });
        await act(async () => vi.advanceTimersByTime(60_000));
        expect(fetchMonitoringData).not.toHaveBeenCalled();
      } finally {
        vi.useRealTimers();
      }
    });

    it('tells the dashboard whether it is expanded, and reads once when expanded again', async () => {
      const onExpandedChange = vi.fn();
      await render(empty, { isTabActive: true, onExpandedChange });
      expect(onExpandedChange).toHaveBeenLastCalledWith(true);

      await toggle();
      expect(onExpandedChange).toHaveBeenLastCalledWith(false);
      expect(fetchMonitoringData).not.toHaveBeenCalled();

      await toggle();
      expect(onExpandedChange).toHaveBeenLastCalledWith(true);
      expect(fetchMonitoringData).toHaveBeenCalledTimes(1);
    });

    it('shows Paused when the dashboard interval is 0', async () => {
      await render(empty, { isTabActive: true, dashboardInterval: 0 });
      expect(container.textContent).toContain(CM.paused);
      expect(container.textContent).not.toContain(CM.live);
    });
  });
});
