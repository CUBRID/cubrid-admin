import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import { Provider } from 'react-redux';
import { configureStore } from '@reduxjs/toolkit';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../../databaseSlice', () => ({ fetchDashboardPerformance: vi.fn(() => ({ type: 'test/noop' })) }));

import DBPerformanceSection from './DBPerformanceSection';
import { CM } from '../../../../constants/cmLabels';

const pollingProps = { hostUid: 'h1', dbname: 'demodb', isTabActive: false, refreshInterval: 0 };
const row = (overrides = {}) => ({
  cpu: '12.0%', cpuPct: 12, memory: '1.0MB', memPct: 1, tps: '-', qps: '0', hitRatio: '99%', hitPct: 99,
  fetch: '-', dirty: '-', ioReads: '-', ioWrites: '-', ...overrides,
});

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

const render = (dbStats) => act(async () => {
  const store = configureStore({ reducer: { user: (s = { preferences: { uiLocale: 'en' } }) => s } });
  root.render(<Provider store={store}><DBPerformanceSection dbStats={dbStats} pollingProps={pollingProps} /></Provider>);
});
const cpuCell = () => container.querySelector('tbody tr td');

describe('DBPerformanceSection CPU', () => {
  it('shows the CAS CPU sum when it is collected', async () => {
    await render([row()]);
    expect(cpuCell().textContent).toContain('12.0%');
  });

  it('shows "-" with the reason when CAS CPU is not collected (Linux)', async () => {
    await render([row({ cpu: '-', cpuPct: 0, cpuNote: CM.casCpuNotCollectedLinux })]);
    expect(cpuCell().textContent).toBe('-');
    expect(cpuCell().querySelector('[title]').getAttribute('title')).toBe(CM.casCpuNotCollectedLinux);
  });
});
