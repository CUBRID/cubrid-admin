import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import { Provider } from 'react-redux';
import { configureStore } from '@reduxjs/toolkit';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// layoutSlice reads the OS theme at import time; jsdom has no matchMedia.
vi.hoisted(() => {
  window.matchMedia ??= () => ({ matches: false, addEventListener: vi.fn(), removeEventListener: vi.fn() });
});

const mocks = vi.hoisted(() => ({ schedules: [] }));
const { thunk } = vi.hoisted(() => ({
  thunk: (result) => () => {
    const promise = Promise.resolve(typeof result === 'function' ? result() : result);
    return () => Object.assign(promise, { unwrap: () => promise });
  },
}));
vi.mock('../databaseSlice', () => ({
  closeAddBackupPlanModal: () => ({ type: 'test/close' }),
  closeEditBackupPlanModal: () => ({ type: 'test/close' }),
  fetchBackupDbInfo: thunk({}),
  addBackupSchedule: thunk({}),
  editBackupSchedule: thunk({}),
  fetchBackupSchedule: thunk(() => ({ schedules: mocks.schedules })),
}));

import AddBackupPlanModal from './AddBackupPlanModal';
import EditBackupPlanModal from './EditBackupPlanModal';

let container;
let root;
beforeEach(() => {
  globalThis.IS_REACT_ACT_ENVIRONMENT = true;
  mocks.schedules = [];
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
});
afterEach(async () => {
  await act(async () => root.unmount());
  container.remove();
  delete globalThis.IS_REACT_ACT_ENVIRONMENT;
});

const render = async (ui, { running }) => {
  const state = {
    databaseUI: { isAddBackupPlanModalOpen: true, isEditBackupPlanModalOpen: true, selectedBackupId: 'p1' },
    database: {
      selectedDatabase: 'demodb',
      databasesByHost: { h1: [{ dbname: 'demodb', dbdir: '/data/demodb' }] },
      activeDatabasesByHost: running ? { h1: ['demodb'] } : { h1: [] },
    },
    databaseOperation: { backupDbInfo: {} },
    host: { selectedHostUid: 'h1' },
    user: { preferences: { uiLocale: 'en' } },
    layout: { statusModal: { isOpen: false } },
  };
  const store = configureStore({ reducer: (s = state) => s });
  await act(async () => root.render(<Provider store={store}>{ui}</Provider>));
  await act(() => Promise.resolve());
};
const mode = (value) => container.querySelector(`[data-testid="backup-plan-mode-${value}"]`);
const checked = (value) => mode(value).getAttribute('aria-checked') === 'true';
const plan = (onoff) => [{ backupid: 'p1', path: '/b', period_type: 'Daily', period_date: '', time: '0130', level: '0', mt: '0', bknum: '1', onoff }];

describe('new backup plan', () => {
  it('defaults to online for a running database, with offline still allowed', async () => {
    await render(<AddBackupPlanModal />, { running: true });
    expect(checked('online')).toBe(true);
    expect(mode('online').disabled).toBe(false);
    expect(mode('offline').disabled).toBe(false);
  });

  it('allows only offline for a stopped database', async () => {
    await render(<AddBackupPlanModal />, { running: false });
    expect(checked('offline')).toBe(true);
    expect(mode('online').disabled).toBe(true);
    expect(mode('offline').disabled).toBe(false);
  });
});

describe('editing a backup plan', () => {
  it('keeps an online plan of a stopped database online, but it cannot be chosen again', async () => {
    mocks.schedules = plan('ON');
    await render(<EditBackupPlanModal />, { running: false });
    expect(checked('online')).toBe(true);
    expect(mode('online').disabled).toBe(true);
    expect(mode('offline').disabled).toBe(false);
  });

  it('leaves both choices for an online plan of a running database', async () => {
    mocks.schedules = plan('ON');
    await render(<EditBackupPlanModal />, { running: true });
    expect(mode('online').disabled).toBe(false);
  });

  it('leaves both choices for an offline plan, as CA does', async () => {
    mocks.schedules = plan('OFF');
    await render(<EditBackupPlanModal />, { running: false });
    expect(checked('offline')).toBe(true);
    expect(mode('online').disabled).toBe(false);
  });
});
