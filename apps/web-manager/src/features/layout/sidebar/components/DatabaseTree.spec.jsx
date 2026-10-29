import { act, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { Provider } from 'react-redux';
import { combineReducers, configureStore } from '@reduxjs/toolkit';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';

// layoutSlice reads the OS theme at import time; jsdom has no matchMedia.
vi.hoisted(() => {
  window.matchMedia ??= () => ({ matches: false, addEventListener: () => undefined, removeEventListener: () => undefined });
});
import hostReducer from '../../../host/hostSlice';
import databaseReducer from '../../../database/databaseCoreSlice';
import databaseOperationReducer from '../../../database/databaseOperationSlice';
import databaseMonitoringReducer from '../../../database/databaseMonitoringSlice';
import monitoringReducer from '../../../server/monitoringSlice';
import userReducer from '../../../user/userSlice';
import layoutReducer from '../../layoutSlice';
import DatabaseTree from './DatabaseTree';

let container;
let root;
let store;
let selection;

beforeEach(() => {
  globalThis.IS_REACT_ACT_ENVIRONMENT = true;
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
  const reducer = combineReducers({
    host: hostReducer, database: databaseReducer, databaseOperation: databaseOperationReducer, databaseMonitoring: databaseMonitoringReducer, monitoring: monitoringReducer, user: userReducer, layout: layoutReducer,
  });
  const initial = reducer(undefined, { type: '@@init' });
  store = configureStore({
    reducer,
    preloadedState: {
      ...initial,
      host: { ...initial.host, selectedHostUid: 'h1' },
      database: {
        ...initial.database,
        // The tree reads the navigator mirror of the per-host lists.
        navigatorDatabasesByHost: { h1: ['a', 'b', 'c', 'd'].map((dbname) => ({ dbname })) },
        navigatorActiveDatabasesByHost: { h1: [] },
      },
    },
  });
});

afterEach(async () => {
  await act(async () => root.unmount());
  container.remove();
  delete globalThis.IS_REACT_ACT_ENVIRONMENT;
});

function Harness() {
  const [selected, setSelected] = useState(() => new Set());
  selection = selected;
  return (
    <DatabaseTree
      onContextMenu={() => undefined}
      onRootContextMenu={() => undefined}
      selectedDbNames={selected}
      onSelectedDbNamesChange={setSelected}
    />
  );
}

const render = () => act(async () => root.render(<Provider store={store}><Harness /></Provider>));
const clickDb = (dbname, init = {}) => act(async () => {
  const summary = container.querySelector(`[data-testid="tree-node-${dbname}"] summary`);
  summary.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, ...init }));
});

it('toggles databases with Ctrl/Cmd and selects a range with Shift', async () => {
  await render();
  await clickDb('a', { ctrlKey: true });
  await clickDb('c', { metaKey: true });
  expect([...selection]).toEqual(['a', 'c']);

  await clickDb('a', { ctrlKey: true });
  expect([...selection]).toEqual(['c']);

  await clickDb('b');
  await clickDb('d', { shiftKey: true });
  expect([...selection]).toEqual(['b', 'c', 'd']);
  expect(container.querySelector('[data-testid="tree-node-c"]').dataset.multiSelected).toBe('true');
});

it('keeps the selection on a plain click inside it and ends it on one outside', async () => {
  await render();
  await clickDb('a', { ctrlKey: true });
  await clickDb('b', { ctrlKey: true });

  await clickDb('a');
  expect([...selection]).toEqual(['a', 'b']);

  await clickDb('d');
  expect([...selection]).toEqual([]);
  expect(store.getState().database.selectedDatabase).toBe('d');
});

it('does not select the database or open its node on a multi-select click', async () => {
  await render();
  await clickDb('c', { ctrlKey: true });

  expect(store.getState().database.selectedDatabase).not.toBe('c');
  expect(container.querySelector('[data-testid="tree-node-c"]').open).toBe(false);
});
