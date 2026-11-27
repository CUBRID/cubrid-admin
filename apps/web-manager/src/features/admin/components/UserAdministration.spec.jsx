import React, { act, useEffect } from 'react';
import { createRoot } from 'react-dom/client';
import { Provider } from 'react-redux';
import { configureStore } from '@reduxjs/toolkit';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// layoutSlice reads the OS theme at import time; jsdom has no matchMedia.
vi.hoisted(() => {
  window.matchMedia ??= () => ({ matches: false, addEventListener: () => undefined, removeEventListener: () => undefined });
});
vi.mock('../../layout/components/LanguageToggle', () => ({ default: () => null }));
vi.mock('../adminApi', () => ({
  adminApi: {
    listAccounts: vi.fn(),
    getSettings: vi.fn(),
    setStatus: vi.fn(),
    setRole: vi.fn(),
    resetPassword: vi.fn(),
    signOutEverywhere: vi.fn(),
    deleteAccount: vi.fn(),
    createAccount: vi.fn(),
    setRegistrationEnabled: vi.fn(),
    setRegistrationApproval: vi.fn(),
    countPending: vi.fn(),
    approveAccount: vi.fn(),
    rejectAccount: vi.fn(),
    queryAudit: vi.fn(),
  },
}));
import { adminApi } from '../adminApi';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom';
import AdminConsolePage from './AdminConsolePage';
import { resetPendingApprovals } from '../usePendingApprovals';
import { ConfirmProvider } from '../../../infrastructure/context/ConfirmContext';

const ACCOUNTS = [
  { id: 'alice', role: 'user', adminByConfig: false, status: 'active', mustChangePassword: false, hostCount: 4, lastLoginAt: new Date().toISOString() },
  { id: 'boss', role: 'admin', adminByConfig: true, status: 'active', mustChangePassword: false, hostCount: 0 },
  { id: 'root', role: 'admin', adminByConfig: false, status: 'active', mustChangePassword: false, hostCount: 1 },
  { id: 'zed', role: 'user', adminByConfig: false, status: 'disabled', mustChangePassword: true, hostCount: 0 },
];

let container;
let root;
let actions;
let state;
let store;

beforeEach(() => {
  globalThis.IS_REACT_ACT_ENVIRONMENT = true;
  vi.clearAllMocks();
  resetPendingApprovals();
  adminApi.countPending.mockResolvedValue({ count: 0 });
  adminApi.approveAccount.mockResolvedValue({});
  adminApi.rejectAccount.mockResolvedValue({ success: true });
  adminApi.listAccounts.mockResolvedValue(ACCOUNTS);
  adminApi.getSettings.mockResolvedValue({ registrationEnabled: false, registrationSource: 'auto', configuredAdmins: ['boss'] });
  adminApi.queryAudit.mockResolvedValue({ entries: [], total: 0 });
  for (const fn of ['setStatus', 'setRole', 'signOutEverywhere', 'deleteAccount', 'createAccount', 'resetPassword']) {
    adminApi[fn].mockResolvedValue({});
  }
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
  actions = [];
  state = {
    auth: { user: { id: 'root', isAdmin: true } },
    // The page shows its own StatusModal, which reads these.
    layout: { theme: 'dark', statusModal: { isOpen: false } },
    host: { hostGroups: {}, haInfo: {} },
    user: { preferences: { uiLocale: 'en' } },
  };
  store = configureStore({
    reducer: (s = state, action) => {
      actions.push(action);
      return s;
    },
  });
});

afterEach(async () => {
  await act(async () => root.unmount());
  container.remove();
  delete globalThis.IS_REACT_ACT_ENVIRONMENT;
});

let currentPath = '';
function PathProbe() {
  const { pathname } = useLocation();
  // After render, not during it: a component must not write outside itself while rendering.
  useEffect(() => {
    currentPath = pathname;
  }, [pathname]);
  return null;
}
const render = async (path = '/admin/accounts') =>
  act(async () =>
    root.render(
      <Provider store={store}>
        <ConfirmProvider>
          <MemoryRouter initialEntries={[path]}>
            <PathProbe />
            <Routes>
              <Route path="/admin/*" element={<AdminConsolePage />} />
              <Route path="/home" element={<div data-testid="dashboard" />} />
            </Routes>
          </MemoryRouter>
        </ConfirmProvider>
      </Provider>
    )
  );

const el = (testId) => document.querySelector(`[data-testid="${testId}"]`);
const buttonWithText = (text) => [...document.querySelectorAll('button')].find((b) => b.textContent.trim() === text);
const statusModals = () => actions.filter((a) => a.type === 'layout/showStatusModal').map((a) => a.payload);
const click = async (node) => act(async () => node.click());
const rows = () => [...el('admin-account-table').querySelectorAll('tbody tr[data-testid]')].map((tr) => tr.dataset.testid.replace('admin-account-', ''));
function setValue(input, value) {
  Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(input, value);
  input.dispatchEvent(new Event('input', { bubbles: true }));
}

describe('sign-up approval', () => {
  const NEWBIE = { id: 'newbie', role: 'user', adminByConfig: false, status: 'pending', mustChangePassword: false, hostCount: 0, createdAt: new Date().toISOString() };
  beforeEach(() => {
    adminApi.listAccounts.mockResolvedValue([...ACCOUNTS, NEWBIE]);
    adminApi.countPending.mockResolvedValue({ count: 1 });
  });

  it('lists waiting sign-ups with a count on the Accounts menu item', async () => {
    await render();
    expect(el('admin-pending-approvals').textContent).toContain('1 sign-up request awaiting approval');
    expect(el('admin-pending-newbie')).not.toBeNull();
    expect(el('admin-nav-pending-approvals').textContent).toBe('1');
    expect(el('admin-account-newbie').textContent).toContain('Awaiting approval');
  });

  it('approves a sign-up as a plain user without asking again', async () => {
    await render();
    adminApi.listAccounts.mockResolvedValue([...ACCOUNTS, { ...NEWBIE, status: 'active' }]);
    adminApi.countPending.mockResolvedValue({ count: 0 });
    await click(el('admin-approve-newbie'));
    expect(adminApi.approveAccount).toHaveBeenCalledWith('newbie', 'user');
    expect(statusModals()).toContainEqual(expect.objectContaining({ type: 'success', message: '"newbie" was approved and can now sign in.' }));
    expect(el('admin-pending-approvals')).toBeNull();
    expect(el('admin-nav-pending-approvals')).toBeNull();
  });

  it('asks before approving a sign-up as an administrator', async () => {
    await render();
    await click(el('admin-pending-role-newbie'));
    // The list picks on mousedown, so focus stays on the field.
    await act(async () => el('admin-pending-role-newbie-option-admin').dispatchEvent(new MouseEvent('mousedown', { bubbles: true })));
    await click(el('admin-approve-newbie'));
    expect(adminApi.approveAccount).not.toHaveBeenCalled();
    await click(buttonWithText('Approve'));
    expect(adminApi.approveAccount).toHaveBeenCalledWith('newbie', 'admin');
  });

  it('rejects a sign-up after confirmation', async () => {
    await render();
    await click(el('admin-reject-newbie'));
    expect(adminApi.rejectAccount).not.toHaveBeenCalled();
    await click(buttonWithText('Reject'));
    expect(adminApi.rejectAccount).toHaveBeenCalledWith('newbie');
  });

  it('offers only approve, reject and nothing else for a waiting sign-up in its details', async () => {
    await render();
    await click(el('admin-account-newbie'));
    expect(el('admin-detail-approve')).not.toBeNull();
    expect(el('admin-detail-reject')).not.toBeNull();
    for (const action of ['reset', 'sign-out', 'role', 'status']) {
      expect(el(`admin-detail-${action}`)).toBeNull();
    }
  });

  it('reports when another administrator already handled the request', async () => {
    adminApi.approveAccount.mockRejectedValue({ response: { data: { message: 'This sign-up request was already approved or rejected.' } } });
    await render();
    await click(el('admin-approve-newbie'));
    expect(statusModals()).toContainEqual(expect.objectContaining({ type: 'error' }));
  });

  it('switches whether sign-ups need approval', async () => {
    adminApi.getSettings.mockResolvedValue({ registrationEnabled: true, registrationSource: 'auto', registrationApproval: true, registrationApprovalSource: 'auto', configuredAdmins: [] });
    adminApi.setRegistrationApproval.mockResolvedValue({ registrationEnabled: true, registrationSource: 'auto', registrationApproval: false, registrationApprovalSource: 'admin', configuredAdmins: [] });
    await render('/admin/settings');
    expect(el('admin-registration-approval-source').textContent).toContain('Default: required.');
    await click(el('admin-registration-approval-toggle'));
    expect(adminApi.setRegistrationApproval).toHaveBeenCalledWith(false);
    expect(el('admin-registration-approval-source').textContent).toContain('Set by an administrator.');
  });
});

describe('User Administration page', () => {
  it('tells a non-admin it is for administrators only', async () => {
    state.auth.user.isAdmin = false;
    await render();
    expect(el('admin-no-access')).not.toBeNull();
    expect(adminApi.listAccounts).not.toHaveBeenCalled();
  });

  it('shows counts and every account', async () => {
    await render();
    expect(el('admin-stat-total').textContent).toContain('4');
    expect(el('admin-stat-admins').textContent).toContain('2');
    expect(el('admin-stat-disabled').textContent).toContain('1');
    expect(rows()).toEqual(['alice', 'boss', 'root', 'zed']);
  });

  it('searches by id', async () => {
    await render();
    const search = container.querySelector('input[placeholder="Search account ID"]');
    await act(async () => setValue(search, 'ze'));
    expect(rows()).toEqual(['zed']);
  });

  it('opens an account in the detail panel with its recent activity', async () => {
    adminApi.queryAudit.mockResolvedValue({ entries: [{ at: new Date().toISOString(), actor: 'root', action: 'reset_password', target: 'alice' }], total: 1 });
    await render();
    expect(el('admin-account-detail')).toBeNull();
    await click(el('admin-account-alice'));
    expect(el('admin-account-detail').textContent).toContain('alice');
    expect(el('admin-account-detail').textContent).toContain('4');
    expect(adminApi.queryAudit).toHaveBeenCalledWith({ target: 'alice', limit: 8 });
    expect(el('admin-detail-activity').textContent).toContain('Reset password');
  });

  it('keeps your own account and cwm.conf admins out of reach', async () => {
    await render();
    expect(el('admin-select-root').disabled).toBe(true);
    await click(el('admin-account-root'));
    for (const action of ['reset', 'sign-out', 'role', 'status', 'delete']) {
      expect(el(`admin-detail-${action}`).disabled).toBe(true);
    }
    await click(el('admin-account-boss'));
    expect(el('admin-detail-role').disabled).toBe(true);
    expect(el('admin-detail-status').disabled).toBe(true);
    expect(el('admin-detail-delete').disabled).toBe(true);
    expect(el('admin-detail-reset').disabled).toBe(false);
  });

  it('signs an account out everywhere after confirmation', async () => {
    await render();
    await click(el('admin-account-alice'));
    await click(el('admin-detail-sign-out'));
    expect(adminApi.signOutEverywhere).not.toHaveBeenCalled();
    await click(buttonWithText('Sign out everywhere'));
    expect(adminApi.signOutEverywhere).toHaveBeenCalledWith('alice');
    expect(statusModals()).toContainEqual(expect.objectContaining({ type: 'success' }));
  });

  it('disables several accounts at once, never your own, and reports failures', async () => {
    adminApi.setStatus.mockImplementation(async (id) => {
      if (id === 'zed') throw { response: { data: { message: 'At least one active administrator must remain.' } } };
      return {};
    });
    await render();
    await click(el('admin-select-all'));
    expect(el('admin-select-root').checked).toBe(false);
    expect(el('admin-bulk-bar').textContent).toContain('3 selected');

    await click(el('admin-bulk-disable'));
    await click(buttonWithText('Disable'));
    expect(adminApi.setStatus.mock.calls.map(([id]) => id)).toEqual(['alice', 'boss', 'zed']);
    expect(statusModals()).toContainEqual(
      expect.objectContaining({ type: 'error', message: '2 updated. 1 could not be changed:', detail: expect.stringContaining('zed:') })
    );
    expect(el('admin-bulk-bar')).toBeNull();
  });

  it('creates an account from the tab', async () => {
    await render();
    await click(el('admin-create-account-btn'));
    await act(async () => {
      setValue(el('admin-account-id-input'), 'carol');
      setValue(el('admin-account-password-input'), 'Temp1234');
      setValue(el('admin-account-password-confirm-input'), 'Temp1234');
    });
    await click(el('admin-account-password-submit-btn'));
    expect(adminApi.createAccount).toHaveBeenCalledWith('carol', 'Temp1234', 'user');
  });

  it('generates a temporary password, copies it, and shows it again after creating', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, 'clipboard', { value: { writeText }, configurable: true });
    await render();
    await click(el('admin-create-account-btn'));
    await act(async () => setValue(el('admin-account-id-input'), 'carol'));
    await click(el('admin-generate-password'));

    const generated = el('admin-generated-password').textContent;
    expect(generated).toHaveLength(14);
    expect(el('admin-account-password-input')).toBeNull();
    expect(el('admin-account-password-submit-btn').disabled).toBe(false);

    await click(el('admin-copy-password'));
    expect(writeText).toHaveBeenCalledWith(generated);
    expect(el('admin-copy-password').textContent).toContain('Copied');

    await click(el('admin-regenerate-password'));
    expect(el('admin-generated-password').textContent).not.toBe(generated);
    const final = el('admin-generated-password').textContent;

    await click(el('admin-account-password-submit-btn'));
    expect(adminApi.createAccount).toHaveBeenCalledWith('carol', final, 'user');
    expect(statusModals()).toContainEqual(expect.objectContaining({ type: 'success', detail: `Temporary password: ${final}` }));
  });

  it('goes back to typing a password by hand', async () => {
    await render();
    await click(el('admin-create-account-btn'));
    await click(el('admin-generate-password'));
    await click(el('admin-type-own-password'));
    expect(el('admin-generated-password')).toBeNull();
    expect(el('admin-account-password-input').value).toBe('');
  });

  it('shows no password in the confirmation when it was typed by hand', async () => {
    await render();
    await click(el('admin-account-alice'));
    await click(el('admin-detail-reset'));
    await act(async () => {
      setValue(el('admin-account-password-input'), 'Temp1234');
      setValue(el('admin-account-password-confirm-input'), 'Temp1234');
    });
    await click(el('admin-account-password-submit-btn'));
    expect(adminApi.resetPassword).toHaveBeenCalledWith('alice', 'Temp1234');
    const done = statusModals().find((m) => m.type === 'success');
    expect(done.detail).toBeUndefined();
  });

  it('reads the open page again on Refresh', async () => {
    await render();
    expect(adminApi.listAccounts).toHaveBeenCalledTimes(1);
    await click(el('admin-refresh'));
    expect(adminApi.listAccounts).toHaveBeenCalledTimes(2);
  });

  it('opens on Accounts, has its own address per section, and goes back to the dashboard', async () => {
    await render('/admin');
    expect(currentPath).toBe('/admin/accounts');
    await click(el('admin-section-settings'));
    expect(currentPath).toBe('/admin/settings');
    await click(el('admin-back-to-dashboard'));
    expect(el('dashboard')).not.toBeNull();
  });

  it('shows the details panel only once an account is clicked, and closes it on a second click', async () => {
    await render();
    expect(el('admin-account-detail')).toBeNull();
    await click(el('admin-account-alice'));
    expect(el('admin-account-detail')).not.toBeNull();
    await click(el('admin-account-alice'));
    expect(el('admin-account-detail')).toBeNull();
  });

  it('filters and pages the activity log', async () => {
    adminApi.queryAudit.mockResolvedValue({
      entries: [{ at: '2026-11-01T00:00:00.000Z', actor: 'root', action: 'disable', target: 'zed' }],
      total: 120,
    });
    await render();
    await click(el('admin-section-activity'));
    expect(adminApi.queryAudit).toHaveBeenLastCalledWith({ limit: 50, offset: 0 });
    expect(el('admin-activity-table').textContent).toContain('Disabled');
    expect(el('admin-activity-count').textContent).toContain('120 entries');

    await act(async () => setValue(el('admin-activity-target'), 'zed'));
    expect(adminApi.queryAudit).toHaveBeenLastCalledWith({ target: 'zed', limit: 50, offset: 0 });

    await click(buttonWithText('2'));
    expect(adminApi.queryAudit).toHaveBeenLastCalledWith({ target: 'zed', limit: 50, offset: 50 });
  });

  it('exports the matching activity as CSV', async () => {
    adminApi.queryAudit.mockResolvedValue({ entries: [{ at: '2026-11-01T00:00:00.000Z', actor: 'root', action: 'create', target: 'zed' }], total: 1 });
    const created = [];
    URL.createObjectURL = vi.fn((blob) => { created.push(blob); return 'blob:x'; });
    URL.revokeObjectURL = vi.fn();
    await render('/admin/activity');
    // Only the download link's click is stubbed, after the page is open.
    const clicks = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => undefined);
    const downloaded = await (async () => {
      try {
        await click(el('admin-activity-export'));
        return clicks.mock.calls.length > 0;
      } finally {
        clicks.mockRestore();
      }
    })();
    expect(adminApi.queryAudit).toHaveBeenLastCalledWith({ limit: 5000, offset: 0 });
    expect(downloaded).toBe(true);
    // jsdom's Blob has no text(); read it the way a browser's FileReader does.
    const text = await new Promise((resolve) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result);
      reader.readAsText(created[0]);
    });
    expect(text).toContain('"Created account"');
  });

  it('shows why sign-up is closed and the cwm.conf admins, and switches it', async () => {
    adminApi.setRegistrationEnabled.mockResolvedValue({ registrationEnabled: true, registrationSource: 'admin', configuredAdmins: ['boss'] });
    await render();
    await click(el('admin-section-settings'));
    expect(el('admin-registration-source').textContent).toContain('Default');
    expect(el('admin-configured-admins').textContent).toContain('boss');
    await click(el('admin-registration-toggle'));
    expect(adminApi.setRegistrationEnabled).toHaveBeenCalledWith(true);
    expect(el('admin-registration-source').textContent).toContain('Set by an administrator');
  });
});
