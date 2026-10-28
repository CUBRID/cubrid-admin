import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import { Provider } from 'react-redux';
import { configureStore } from '@reduxjs/toolkit';
import { beforeEach, afterEach, expect, it } from 'vitest';
import HaClusterStatusSection from './HaClusterStatusSection';

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

const nodes = [
  { hostname: 'node-c', status: 'replica' },
  { hostname: 'node-a', status: 'master' },
  { hostname: 'node-b', status: 'slave' },
];

const render = async () => {
  const state = {
    monitoring: { hostsData: { host1: { haHeartbeat: { hanodelist: [{ node: nodes }] } } } },
    host: { haInfo: { host1: { isHA: true } } },
    user: { preferences: { uiLocale: 'en' } },
  };
  const store = configureStore({ reducer: (s = state) => s });
  await act(async () => {
    root.render(
      <Provider store={store}>
        <HaClusterStatusSection hostUid="host1" />
      </Provider>
    );
  });
};

const classesOf = (el) => el.className.split(/\s+/);

it('keeps the title block and node badges on one row at every width', async () => {
  await render();
  const row = container.querySelector('[data-testid="ha-cluster-status"]');
  const cls = classesOf(row);
  expect(cls).toContain('flex');
  expect(cls).toContain('min-w-fit');
  expect(cls).not.toContain('flex-col');
  // No viewport-breakpoint layout switch (e.g. md:flex-row) on the row.
  expect(cls.filter((c) => /^(sm|md|lg|xl|2xl):/.test(c))).toEqual([]);
  expect(classesOf(row.firstElementChild)).toContain('shrink-0');
});

it('does not wrap the node badges', async () => {
  await render();
  const list = container.querySelector('[data-testid="ha-cluster-node-list"]');
  const cls = classesOf(list);
  expect(cls).not.toContain('flex-wrap');
  expect(cls).toContain('shrink-0');
  expect(cls).toContain('ml-auto');
  expect(list.children).toHaveLength(3);
  for (const badge of list.children) {
    expect(classesOf(badge)).toEqual(expect.arrayContaining(['shrink-0', 'whitespace-nowrap']));
  }
  // Role order is preserved: master, slave, replica.
  expect([...list.children].map((b) => b.textContent)).toEqual([
    expect.stringContaining('node-a'),
    expect.stringContaining('node-b'),
    expect.stringContaining('node-c'),
  ]);
});
