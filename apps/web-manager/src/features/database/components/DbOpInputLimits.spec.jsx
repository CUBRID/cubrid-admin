import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import { Provider } from 'react-redux';
import { configureStore } from '@reduxjs/toolkit';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// layoutSlice reads the OS theme at import time; jsdom has no matchMedia.
vi.hoisted(() => {
  window.matchMedia ??= () => ({ matches: false, addEventListener: vi.fn(), removeEventListener: vi.fn() });
});

const mocks = vi.hoisted(() => ({
  addBackupSchedule: vi.fn(),
  editBackupSchedule: vi.fn(),
  fetchBackupSchedule: vi.fn(),
  updateAutoVolumeConfig: vi.fn(),
  fetchSpaceInfo: vi.fn(),
  schedules: [],
  autoVolume: null,
  // What a volume-info read answers with; null for a read that fails.
  spacePagesize: null,
}));

// Stand-ins for the thunks: each records its argument and resolves.
const { thunk } = vi.hoisted(() => ({
  thunk: (fn, result) => (arg) => {
    fn(arg);
    const promise = Promise.resolve(typeof result === 'function' ? result() : result);
    return () => Object.assign(promise, { unwrap: () => promise });
  },
}));
vi.mock('../databaseSlice', () => ({
  closeAddBackupPlanModal: () => ({ type: 'test/close' }),
  closeEditBackupPlanModal: () => ({ type: 'test/close' }),
  closeSetAutomationVolumeModal: () => ({ type: 'test/close' }),
  fetchBackupDbInfo: thunk(() => undefined, {}),
  addBackupSchedule: thunk(mocks.addBackupSchedule, {}),
  editBackupSchedule: thunk(mocks.editBackupSchedule, {}),
  fetchBackupSchedule: thunk(mocks.fetchBackupSchedule, () => ({ schedules: mocks.schedules })),
  fetchAutoVolumeConfig: () => () => Promise.resolve({}),
  updateAutoVolumeConfig: thunk(mocks.updateAutoVolumeConfig, {}),
  fetchDatabaseSpaceInfo: (arg) => (dispatch) => {
    mocks.fetchSpaceInfo(arg);
    if (mocks.spacePagesize) dispatch({ type: 'test/spaceInfo', key: `${arg.hostUid}:${arg.dbname}`, pagesize: mocks.spacePagesize });
    return Promise.resolve();
  },
}));

import AddBackupPlanModal from './AddBackupPlanModal';
import EditBackupPlanModal from './EditBackupPlanModal';
import SetAutomationVolumeModal from './SetAutomationVolumeModal';

let container;
let root;
beforeEach(() => {
  globalThis.IS_REACT_ACT_ENVIRONMENT = true;
  vi.clearAllMocks();
  mocks.schedules = [];
  mocks.autoVolume = null;
  mocks.spacePagesize = null;
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
});
afterEach(async () => {
  await act(async () => root.unmount());
  container.remove();
  delete globalThis.IS_REACT_ACT_ENVIRONMENT;
});

const render = (ui, { pagesize, loggedIn = false, running = false } = {}) => {
  const state = {
    databaseUI: { isAddBackupPlanModalOpen: true, isEditBackupPlanModalOpen: true, isSetAutomationVolumeModalOpen: true, selectedBackupId: 'p1' },
    database: {
      selectedDatabase: 'demodb',
      databasesByHost: {},
      loggedInDatabases: loggedIn ? ['h1:demodb'] : [],
      activeDatabasesByHost: running ? { h1: ['demodb'] } : {},
    },
    databaseOperation: { backupDbInfo: {} },
    databaseConfiguration: { autoVolumeConfigs: mocks.autoVolume ? { 'h1:demodb': mocks.autoVolume } : {}, autoVolumeLoading: false },
    databaseMonitoring: { spaceInfo: pagesize ? { 'h1:demodb': { pagesize: String(pagesize) } } : {}, dashboardData: {} },
    host: { selectedHostUid: 'h1' },
    user: { preferences: { uiLocale: 'en' } },
    layout: { statusModal: { isOpen: false } },
  };
  const store = configureStore({
    reducer: (s = state, action) => (action.type === 'test/spaceInfo'
      ? { ...s, databaseMonitoring: { ...s.databaseMonitoring, spaceInfo: { [action.key]: { pagesize: action.pagesize } } } }
      : s),
  });
  return act(async () => root.render(<Provider store={store}>{ui}</Provider>));
};
const q = (id) => container.querySelector(`[data-testid="${id}"]`);
const setValue = (input, value) => act(async () => {
  Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(input, value);
  input.dispatchEvent(new Event('input', { bubbles: true }));
});

describe('backup plan: backups to keep', () => {
  it('starts at 1 (CMS default) for a new plan, and refuses 0, which would delete every older backup', async () => {
    await render(<AddBackupPlanModal />);
    expect(q('backup-plan-keep-input').value).toBe('1');

    await setValue(q('backup-plan-keep-input'), '0');
    expect(q('add-backup-plan-save-btn').disabled).toBe(true);
    expect(container.textContent).toContain('Must be ≥ 1');
  });

  it('shows 1 for a saved plan that keeps 0', async () => {
    mocks.schedules = [{ backupid: 'p1', path: '/b', period_type: 'Daily', period_date: '', time: '0130', level: '0', mt: '0', bknum: '0' }];
    await render(<EditBackupPlanModal />);
    await act(() => Promise.resolve());
    expect(q('backup-plan-keep-input').value).toBe('1');
    expect(q('edit-backup-plan-save-btn').disabled).toBe(false);
  });

  it('refuses negative threads', async () => {
    await render(<AddBackupPlanModal />);
    await setValue(q('backup-plan-threads-input'), '-2');
    expect(q('add-backup-plan-save-btn').disabled).toBe(true);
    expect(container.textContent).toContain('Must be ≥ 0');
  });
});

describe('auto add volume: page size', () => {
  it("counts the pages in the database's own page size", async () => {
    mocks.autoVolume = { data: 'ON', data_warn_outofspace: '0.15', data_ext_page: '16384', index: 'ON', index_warn_outofspace: '0.15', index_ext_page: '16384' };
    await render(<SetAutomationVolumeModal />, { pagesize: 4096 });
    // 16384 pages of 4 KiB = 64 MiB.
    expect(q('auto-volume-size-input').value).toBe('64');

    await act(async () => q('auto-volume-save-btn').click());
    expect(mocks.updateAutoVolumeConfig).toHaveBeenCalledWith(expect.objectContaining({
      payload: expect.objectContaining({ data_ext_page: '16384', index_ext_page: '16384' }),
    }));
  });

  it('refuses a size below 1000 pages (CMS adds nothing below that or rounds it up)', async () => {
    mocks.autoVolume = { data: 'ON', data_warn_outofspace: '0.15', data_ext_page: '16384', index: 'ON', index_warn_outofspace: '0.15', index_ext_page: '16384' };
    await render(<SetAutomationVolumeModal />, { pagesize: 16384 });
    await setValue(q('auto-volume-size-input'), '15');
    // 1000 pages of 16 KiB is 15.6 MiB, so the smallest whole size is 16 MiB.
    expect(container.textContent).toContain('Must be ≥ 16');
    expect(q('auto-volume-save-btn').disabled).toBe(true);
  });

  it('does not save while the page size is unknown, and says why', async () => {
    mocks.autoVolume = { data: 'ON', data_warn_outofspace: '0.15', data_ext_page: '16384', index: 'ON', index_warn_outofspace: '0.15', index_ext_page: '16384' };
    await render(<SetAutomationVolumeModal />);
    expect(q('auto-volume-save-btn').disabled).toBe(true);
    expect(q('auto-volume-footer-note').textContent).toContain("page size isn't known");
    // Not logged in: nothing is read for it.
    expect(mocks.fetchSpaceInfo).not.toHaveBeenCalled();
  });

  it('reads the page size itself when opened before any dashboard (a reload, then the sidebar), and saves ON', async () => {
    mocks.autoVolume = { data: 'ON', data_warn_outofspace: '0.15', data_ext_page: '16384', index: 'ON', index_warn_outofspace: '0.15', index_ext_page: '16384' };
    mocks.spacePagesize = '4096';
    await render(<SetAutomationVolumeModal />, { loggedIn: true, running: true });
    expect(mocks.fetchSpaceInfo).toHaveBeenCalledTimes(1);
    expect(mocks.fetchSpaceInfo).toHaveBeenCalledWith({ hostUid: 'h1', dbname: 'demodb' });
    expect(q('auto-volume-size-input').value).toBe('64');

    await act(async () => q('auto-volume-save-btn').click());
    expect(mocks.updateAutoVolumeConfig).toHaveBeenCalledWith(expect.objectContaining({
      payload: expect.objectContaining({ data: 'ON', data_ext_page: '16384', index: 'ON', index_ext_page: '16384' }),
    }));
  });

  it('reads once and does not ask again when that read fails', async () => {
    mocks.autoVolume = { data: 'ON', data_warn_outofspace: '0.15', data_ext_page: '16384', index: 'ON', index_warn_outofspace: '0.15', index_ext_page: '16384' };
    await render(<SetAutomationVolumeModal />, { loggedIn: true, running: true });
    await setValue(q('auto-volume-size-input'), '100');
    await act(() => Promise.resolve());
    expect(mocks.fetchSpaceInfo).toHaveBeenCalledTimes(1);
    expect(q('auto-volume-save-btn').disabled).toBe(true);
  });

  it('reads nothing for a database that is logged in but not running', async () => {
    await render(<SetAutomationVolumeModal />, { loggedIn: true, running: false });
    expect(mocks.fetchSpaceInfo).not.toHaveBeenCalled();
  });

  it('saves OFF without a page size, sending the stored pages back as they are', async () => {
    mocks.autoVolume = { data: 'ON', data_warn_outofspace: '0.15', data_ext_page: '16384', index: 'ON', index_warn_outofspace: '0.2', index_ext_page: '8192' };
    await render(<SetAutomationVolumeModal />);
    expect(q('auto-volume-save-btn').disabled).toBe(true);

    // Turn the policy off.
    await act(async () => container.querySelector('button[role="switch"], input[type="checkbox"]').click());
    expect(q('auto-volume-save-btn').disabled).toBe(false);
    await act(async () => q('auto-volume-save-btn').click());
    expect(mocks.updateAutoVolumeConfig).toHaveBeenCalledWith(expect.objectContaining({
      payload: expect.objectContaining({ data: 'OFF', data_ext_page: '16384', index: 'OFF', index_ext_page: '8192' }),
    }));
  });
});
