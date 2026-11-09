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

const host = { uid: 'h1', id: 'admin', alias: 'node-a', address: '10.0.0.5', port: '8001' };
const haInfo = { isHA: true, currentNodeType: 'master', haNodes: [] };

const render = async (isAuthorized) => {
  const store = configureStore({ reducer: (s = { user: { preferences: { uiLocale: 'en' } } }) => s });
  await act(async () => {
    root.render(
      <Provider store={store}>
        <ServerListItem host={host} isAuthorized={isAuthorized} haInfo={haInfo} onContextMenu={() => undefined} />
      </Provider>
    );
  });
  return container.querySelector('[data-testid="host-item-h1"]').textContent;
};

it('shows the HA role of a connected host', async () => {
  expect(await render(true)).toContain('Master');
});

it('does not show an HA role for a host that is not connected', async () => {
  expect(await render(false)).not.toContain('Master');
});
