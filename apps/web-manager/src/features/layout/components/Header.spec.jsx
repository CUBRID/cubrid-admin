import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import { Provider } from 'react-redux';
import { configureStore } from '@reduxjs/toolkit';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../../auth/authSlice', () => ({ logoutUser: () => ({ type: 'logout' }), fetchUser: () => ({ type: 'fetchUser' }) }));
vi.mock('../../user/userSlice', () => ({ fetchPreferences: () => ({ type: 'fetchPreferences' }) }));
vi.mock('../../user/components/UserProfileModal', () => ({ default: () => null }));
// layoutSlice reads the OS theme at import time; jsdom has no matchMedia.
vi.hoisted(() => {
  window.matchMedia ??= () => ({ matches: false, addEventListener: () => undefined, removeEventListener: () => undefined });
});
vi.mock('./LanguageToggle', () => ({ default: () => <span>EN KR</span> }));
vi.mock('./HeaderMenu', () => ({ default: ({ folded }) => <nav data-testid="menu" data-folded={String(folded)} /> }));
vi.mock('../../admin/adminApi', () => ({ adminApi: { countPending: vi.fn() } }));

import Header from './Header';
import { CM } from '../../../constants/cmLabels';
import { adminApi } from '../../admin/adminApi';
import { resetPendingApprovals } from '../../admin/usePendingApprovals';

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

let container;
let root;
let overflowBy;
const spies = [];

beforeEach(() => {
  resetPendingApprovals();
  adminApi.countPending.mockReset().mockResolvedValue({ count: 0 });
  // jsdom has no layout: the row is `overflowBy` wider than the header at
  // fold 0, and each fold step takes 100 off.
  overflowBy = 0;
  const fold = (el) => Number(el.closest('header')?.dataset.fold ?? 0);
  spies.push(vi.spyOn(HTMLElement.prototype, 'clientWidth', 'get').mockImplementation(function width() {
    return this.tagName === 'HEADER' ? 800 : 752;
  }));
  spies.push(vi.spyOn(HTMLElement.prototype, 'scrollWidth', 'get').mockImplementation(function width() {
    return 752 + Math.max(0, overflowBy - 100 * fold(this));
  }));
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
});

afterEach(async () => {
  await act(async () => root.unmount());
  container.remove();
  spies.splice(0).forEach((spy) => spy.mockRestore());
});

let actions = [];
const render = (user = { id: 'admin1' }, dirtyTabs = []) => act(async () => {
  actions = [];
  const state = { auth: { user, isAuthenticated: true }, user: { preferences: { uiLocale: 'en' } }, layout: { dirtyTabs } };
  const store = configureStore({ reducer: (s = state, action) => { actions.push(action); return s; } });
  root.render(
    <Provider store={store}>
      <MemoryRouter initialEntries={['/home']}>
        <Routes>
          <Route path="/home" element={<Header theme="light" toggleTheme={() => undefined} />} />
          <Route path="/admin/accounts" element={<div data-testid="admin-page" />} />
        </Routes>
      </MemoryRouter>
    </Provider>
  );
});
const logout = () => container.querySelector(`button[title="${CM.logout}"]`);

describe('Header folding', () => {
  it('shows everything when it fits', async () => {
    await render();
    expect(container.querySelector('header').dataset.fold).toBe('0');
    expect(logout().textContent).toContain(CM.logout);
    expect(container.textContent).toContain('admin1');
    expect(container.querySelector('[data-testid="menu"]').dataset.folded).toBe('false');
  });

  it('drops the logout text first, keeping the button', async () => {
    overflowBy = 80;
    await render();
    expect(container.querySelector('header').dataset.fold).toBe('1');
    expect(logout()).not.toBeNull();
    expect(logout().textContent).not.toContain(CM.logout);
    expect(container.textContent).toContain('admin1');
  });

  it('then the user name (kept as the tooltip), then folds the menus into one', async () => {
    overflowBy = 250;
    await render();
    expect(container.querySelector('header').dataset.fold).toBe('3');
    expect(container.textContent).not.toContain('admin1');
    expect(container.querySelector('button[title="admin1"]')).not.toBeNull();
    expect(container.querySelector('[data-testid="menu"]').dataset.folded).toBe('true');
    expect(logout()).not.toBeNull();
  });
});

describe('Header account control', () => {
  const accountsButton = () => container.querySelector('[data-testid="header-user-accounts-btn"]');

  it('shows no User Accounts button to a non-admin', async () => {
    await render({ id: 'alice', isAdmin: false });
    expect(accountsButton()).toBeNull();
  });

  it('opens the User Administration page for an admin', async () => {
    await render({ id: 'root', isAdmin: true });
    expect(accountsButton()).not.toBeNull();
    await act(async () => accountsButton().click());
    expect(container.querySelector('[data-testid="admin-page"]')).not.toBeNull();
  });

  it('asks before leaving unsaved edits for User Administration', async () => {
    await render({ id: 'root', isAdmin: true }, ['conf-cubrid']);
    const byId = (id) => document.querySelector(`[data-testid="user-administration-unsaved-${id}"]`);

    await act(async () => accountsButton().click());
    expect(container.querySelector('[data-testid="admin-page"]')).toBeNull();
    expect(byId('cancel-btn')).not.toBeNull();

    // Cancel keeps the dashboard and its edits.
    await act(async () => byId('cancel-btn').click());
    expect(container.querySelector('[data-testid="admin-page"]')).toBeNull();
    expect(actions.some((a) => a.type === 'layout/clearDirtyTabs')).toBe(false);

    // Going on drops the unsaved marks and opens the page.
    await act(async () => accountsButton().click());
    await act(async () => byId('confirm-btn').click());
    expect(actions.some((a) => a.type === 'layout/clearDirtyTabs')).toBe(true);
    expect(container.querySelector('[data-testid="admin-page"]')).not.toBeNull();
  });

  it('counts sign-ups awaiting approval on the button, for admins only', async () => {
    adminApi.countPending.mockResolvedValue({ count: 2 });
    await render({ id: 'root', isAdmin: true });
    expect(container.querySelector('[data-testid="header-pending-approvals"]').textContent).toBe('2');
    expect(accountsButton().getAttribute('aria-label')).toContain('2 sign-up requests awaiting approval');

    adminApi.countPending.mockClear();
    await render({ id: 'alice', isAdmin: false });
    expect(adminApi.countPending).not.toHaveBeenCalled();
    expect(container.querySelector('[data-testid="header-pending-approvals"]')).toBeNull();
  });

  it('shows no count when nothing is waiting', async () => {
    await render({ id: 'root', isAdmin: true });
    expect(adminApi.countPending).toHaveBeenCalled();
    expect(container.querySelector('[data-testid="header-pending-approvals"]')).toBeNull();
  });
});
