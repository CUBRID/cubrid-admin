import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import { Provider } from 'react-redux';
import { configureStore } from '@reduxjs/toolkit';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';

vi.mock('../hostSlice', () => ({ closeServerVersionModal: () => ({ type: 'host/closeServerVersionModal' }) }));
vi.mock('../hostApi', () => ({ hostApi: { getHostEnv: vi.fn() } }));
import { hostApi } from '../hostApi';
import ServerVersionModal from './ServerVersionModal';

let container;
let root;
let store;
const hosts = [
  { uid: 'a', id: 'admin', alias: 'Alpha' },
  { uid: 'b', id: 'admin', alias: 'Beta' },
];

beforeEach(() => {
  globalThis.IS_REACT_ACT_ENVIRONMENT = true;
  hostApi.getHostEnv.mockReset();
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
});
afterEach(async () => {
  await act(async () => root.unmount());
  container.remove();
  delete globalThis.IS_REACT_ACT_ENVIRONMENT;
});

const render = async (host) => {
  const reducer = (state = { host, user: { preferences: { uiLocale: 'en' } } }, a) =>
    (a.type === 'test/host' ? { ...state, host: { ...state.host, ...a.payload } } : state);
  store = configureStore({ reducer });
  await act(async () => root.render(<Provider store={store}><ServerVersionModal /></Provider>));
};
const open = (uid) => act(async () => store.dispatch({ type: 'test/host', payload: { isServerVersionModalOpen: true, serverVersionHostUid: uid } }));
const close = () => act(async () => store.dispatch({ type: 'test/host', payload: { isServerVersionModalOpen: false, serverVersionHostUid: null } }));
const text = () => document.body.textContent;

it('does not show the previous host when the next read fails', async () => {
  hostApi.getHostEnv.mockResolvedValueOnce({ CUBRIDVER: '11.4.5.1908' });
  hostApi.getHostEnv.mockRejectedValueOnce(Object.assign(new Error('CMS did not answer'), {}));
  await render({ hosts, authorizedHosts: ['a', 'b'], isServerVersionModalOpen: false, serverVersionHostUid: null });
  await open('a');
  expect(text()).toContain('11.4.5.1908');
  await close();
  await open('b');
  expect(text()).not.toContain('11.4.5.1908');
  expect(text()).toContain('CMS did not answer');
});

it('does not ask a host that is not connected, and says so', async () => {
  hostApi.getHostEnv.mockResolvedValueOnce({ CUBRIDVER: '11.4.5.1908' });
  await render({ hosts, authorizedHosts: ['a'], isServerVersionModalOpen: false, serverVersionHostUid: null });
  await open('a');
  await close();
  await open('b');
  expect(hostApi.getHostEnv.mock.calls).toEqual([['a']]);
  expect(text()).not.toContain('11.4.5.1908');
  expect(text()).toContain('Disconnected');
});

it('names the host the info belongs to in the title', async () => {
  hostApi.getHostEnv.mockResolvedValue({ CUBRIDVER: '11.4.5.1908' });
  await render({
    hosts: [...hosts, { uid: 'c', id: 'admin', alias: '', address: '10.0.0.9' }],
    authorizedHosts: ['a', 'c'],
    isServerVersionModalOpen: false,
    serverVersionHostUid: null,
  });
  await open('a');
  expect(document.body.textContent).toContain('Host Engine Version — Alpha');
  await close();
  await open('c');
  expect(document.body.textContent).toContain('Host Engine Version — 10.0.0.9');
});
