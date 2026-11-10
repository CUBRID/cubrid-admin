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

describe('DBPerformanceSection memory', () => {
  const memCell = () => container.querySelectorAll('tbody tr td')[1];
  const GiB = 1024 ** 3;
  const MiB = 1024 ** 2;

  it('draws host, CAS and free parts of the host memory, with the amounts on hover', async () => {
    const memSegments = {
      host: 6 * GiB, cas: 512 * MiB, free: 9.5 * GiB, total: 16 * GiB,
      hostPct: 37.5, casPct: 3.125, freePct: 59.375,
    };
    await render([row({ memory: '512.0 MiB', memSegments })]);
    const bar = memCell().querySelector('[data-testid="db-mem-bar"]');
    expect(bar.textContent).toContain('512.0 MiB');
    expect(bar.getAttribute('title')).toBe('Host 6.0 GiB · CAS 512.0 MiB · Free 9.5 GiB / Total 16.0 GiB');
    const parts = [...bar.querySelectorAll('[data-segment]')].map((el) => [el.dataset.segment, el.style.width]);
    expect(parts).toEqual([['host', '37.5%'], ['cas', '3.125%'], ['free', '59.375%']]);
    expect(bar.querySelector('[data-segment="host"]').getAttribute('title')).toBe(`${CM.dbMemHostHint}: 6.0 GiB`);
  });

  it('shows only the CAS amount, without a bar, while the host memory is unknown', async () => {
    await render([row({ memory: '512.0 MiB', memSegments: null })]);
    expect(memCell().textContent).toBe('512.0 MiB');
    expect(memCell().querySelector('[data-testid="db-mem-bar"]')).toBeNull();
  });
});
