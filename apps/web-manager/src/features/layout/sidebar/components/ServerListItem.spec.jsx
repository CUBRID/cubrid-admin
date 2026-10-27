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

const render = async (host) => {
  const store = configureStore({ reducer: (s = { user: { preferences: { uiLocale: 'en' } } }) => s });
  await act(async () => {
    root.render(
      <Provider store={store}>
        <ServerListItem host={host} isAuthorized={false} onContextMenu={() => {}} />
      </Provider>
    );
  });
  const row = container.querySelector(`[data-testid="host-item-${host.uid}"]`);
  const name = row.querySelector('span.truncate');
  return { row, name };
};

const longAlias = 'production-cubrid-primary-node-in-the-seoul-region-datacenter-rack-07';

it('shows the full alias when hovering a (possibly truncated) host name', async () => {
  const { row, name } = await render({ uid: 'h1', id: 'admin', alias: longAlias, address: '10.0.0.5', port: '8001' });
  expect(name.textContent).toBe(longAlias);
  expect(name.getAttribute('title')).toBe(longAlias);
  // Hovering elsewhere on the row gives both the alias and the address.
  expect(row.getAttribute('title')).toBe(`${longAlias} (10.0.0.5:8001)`);
});

it('keeps the full alias, HA role word included, in the tooltip', async () => {
  const { row, name } = await render({ uid: 'h2', id: 'admin', alias: 'ha-node-a (master)', address: '10.0.0.6', port: '8001' });
  expect(name.textContent).toContain('ha-node-a');
  expect(name.getAttribute('title')).toBe('ha-node-a (master)');
  expect(row.getAttribute('title')).toBe('ha-node-a (master) (10.0.0.6:8001)');
});

it('falls back to the host id when there is no alias', async () => {
  const { row, name } = await render({ uid: 'h3', id: 'admin', alias: '', address: '10.0.0.7', port: '8002' });
  expect(name.textContent).toBe('admin');
  expect(name.getAttribute('title')).toBe('admin');
  expect(row.getAttribute('title')).toBe('admin (10.0.0.7:8002)');
});
