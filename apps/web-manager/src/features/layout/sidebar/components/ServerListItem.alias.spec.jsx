import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import { Provider } from 'react-redux';
import { configureStore } from '@reduxjs/toolkit';
import { beforeEach, afterEach, expect, it } from 'vitest';
import ServerListItem from './ServerListItem';

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

const renderName = async (host, haInfo) => {
  const store = configureStore({ reducer: (s = { user: { preferences: { uiLocale: 'en' } } }) => s });
  await act(async () => {
    root.render(
      <Provider store={store}>
        <ServerListItem host={host} haInfo={haInfo} isAuthorized={false} onContextMenu={() => undefined} />
      </Provider>
    );
  });
  return container.querySelector(`[data-testid="host-item-${host.uid}"]`).textContent;
};

it.each(['something (master)', 'node2 (slave)', 'cglee1_(replica)'])(
  'shows an alias ending in an HA role word as typed: %s',
  async (alias) => {
    expect(await renderName({ uid: 'h1', id: 'admin', alias, address: '10.0.0.5', port: '8001' })).toContain(alias);
  }
);

it('falls back to the CMS id when there is no alias', async () => {
  expect(await renderName({ uid: 'h2', id: 'admin', alias: '', address: '10.0.0.6', port: '8001' })).toContain('admin');
});
