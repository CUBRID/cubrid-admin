import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import { Provider } from 'react-redux';
import { configureStore } from '@reduxjs/toolkit';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../../auth/authSlice', () => ({ logoutUser: () => ({ type: 'logout' }), fetchUser: () => ({ type: 'fetchUser' }) }));
vi.mock('../../user/userSlice', () => ({ fetchPreferences: () => ({ type: 'fetchPreferences' }) }));
vi.mock('../../user/components/UserProfileModal', () => ({ default: () => null }));
vi.mock('./LanguageToggle', () => ({ default: () => <span>EN KR</span> }));
vi.mock('./HeaderMenu', () => ({ default: ({ folded }) => <nav data-testid="menu" data-folded={String(folded)} /> }));

import Header from './Header';
import { CM } from '../../../constants/cmLabels';

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

let container;
let root;
let overflowBy;
const spies = [];

beforeEach(() => {
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

const render = () => act(async () => {
  const store = configureStore({ reducer: () => ({ auth: { user: { id: 'admin1' }, isAuthenticated: true }, user: { preferences: { uiLocale: 'en' } } }) });
  root.render(<Provider store={store}><Header theme="light" toggleTheme={() => undefined} /></Provider>);
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
