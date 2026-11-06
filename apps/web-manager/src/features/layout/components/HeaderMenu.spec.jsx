import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import { Provider } from 'react-redux';
import { configureStore } from '@reduxjs/toolkit';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';

// The menus as plain lists: every item rendered, with its state and tooltip.
vi.mock('../../../components/common/DropdownMenu', () => ({
  DropdownMenu: ({ children }) => <div>{children}</div>,
  SubMenu: ({ children }) => <div>{children}</div>,
  MenuDivider: () => null,
  MenuItem: ({ label, disabled, title }) => <button type="button" disabled={disabled} title={title}>{label}</button>,
}));
vi.mock('../menuActions', async (importOriginal) => ({ ...(await importOriginal()), runMenuAction: vi.fn() }));
vi.mock('../../host/hostSlice', () => ({}));
vi.mock('../layoutSlice', () => ({}));
vi.mock('../appBarSlice', () => ({}));

import HeaderMenu from './HeaderMenu';
import { getCM } from '../../../constants/useCM';

const KO = getCM('ko');
globalThis.IS_REACT_ACT_ENVIRONMENT = true;

let container;
let root;
beforeEach(() => {
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
});
afterEach(async () => {
  await act(async () => root.unmount());
  container.remove();
});

const render = (hostId) => act(async () => {
  const state = {
    host: { selectedHostUid: 'h1', authorizedHosts: ['h1'], hosts: [{ uid: 'h1', id: hostId }] },
    user: { preferences: { uiLocale: 'ko' } },
  };
  root.render(<Provider store={configureStore({ reducer: () => state })}><HeaderMenu /></Provider>);
});
const cmsAccounts = () => [...container.querySelectorAll('button')].find((b) => b.textContent === KO.cmsAccountManagement);

it('turns CMS Account Management off with the reason on a host connected with another account', async () => {
  await render('operator');
  expect(cmsAccounts().disabled).toBe(true);
  expect(cmsAccounts().title).toBe(KO.cmsAdminRequiredHint);
});

it('keeps CMS Account Management on for the CMS admin account', async () => {
  await render('admin');
  expect(cmsAccounts().disabled).toBe(false);
  expect(cmsAccounts().title).toBe('');
});
