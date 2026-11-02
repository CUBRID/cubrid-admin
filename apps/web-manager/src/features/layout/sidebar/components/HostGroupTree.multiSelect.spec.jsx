import { act, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { Provider } from 'react-redux';
import { configureStore } from '@reduxjs/toolkit';
import { afterEach, beforeEach, expect, it } from 'vitest';
import HostGroupTree from './HostGroupTree';

let container;
let root;
let selection;

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

const host = (uid) => ({ uid, id: 'admin', alias: uid, address: `10.0.0.${uid.slice(1)}`, port: '8001' });
const hostGroups = { __ungrouped__: { name: 'Ungrouped', hosts: { h1: host('h1'), h2: host('h2'), h3: host('h3') } } };

function Harness() {
  const [selected, setSelected] = useState(() => new Set());
  selection = selected;
  return (
    <HostGroupTree
      hostGroups={hostGroups}
      authorizedHosts={[]}
      haInfo={{}}
      onContextMenu={() => undefined}
      onGroupContextMenu={() => undefined}
      onHostActivate={() => undefined}
      selectedHostUids={selected}
      onSelectedHostUidsChange={setSelected}
    />
  );
}

const render = () => {
  const store = configureStore({ reducer: (s = { user: { preferences: { uiLocale: 'en' } }, host: {}, layout: {} }) => s });
  return act(async () => root.render(<Provider store={store}><Harness /></Provider>));
};
const clickHost = (uid, init = {}) => act(async () => {
  container.querySelector(`[data-testid="host-item-${uid}"]`).dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, ...init }));
});

it('counts the plain-clicked host when Ctrl/Cmd-clicking another, as a file explorer does', async () => {
  await render();
  await clickHost('h1');
  await clickHost('h3', { metaKey: true });
  expect([...selection].sort()).toEqual(['h1', 'h3']);

  await clickHost('h1', { ctrlKey: true });
  expect([...selection]).toEqual(['h3']);
});

it('selects the range from the plain-clicked host with Shift, and a plain click outside ends it', async () => {
  await render();
  await clickHost('h1');
  await clickHost('h3', { shiftKey: true });
  expect([...selection]).toEqual(['h1', 'h2', 'h3']);

  await clickHost('h2');
  expect([...selection]).toEqual(['h1', 'h2', 'h3']);
});

it('does not bring back a host taken out with Ctrl/Cmd-click when Ctrl/Cmd-clicking another', async () => {
  await render();
  await clickHost('h1', { ctrlKey: true });
  await clickHost('h1', { ctrlKey: true });
  expect([...selection]).toEqual([]);

  await clickHost('h2', { metaKey: true });
  expect([...selection]).toEqual(['h2']);
});
