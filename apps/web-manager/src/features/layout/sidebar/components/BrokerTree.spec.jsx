import React, { act, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { Provider } from 'react-redux';
import { combineReducers, configureStore } from '@reduxjs/toolkit';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';

// layoutSlice reads the OS theme at import time; jsdom has no matchMedia.
vi.hoisted(() => {
  window.matchMedia ??= () => ({ matches: false, addEventListener: () => undefined, removeEventListener: () => undefined });
});
vi.mock('../../../broker/brokerApi', () => ({
  brokerApi: { getBrokerList: vi.fn(), getBrokerLogs: vi.fn(), getDatabaseLogs: vi.fn() },
}));
import brokerReducer from '../../../broker/brokerSlice';
import layoutReducer from '../../layoutSlice';
import BrokerTree from './BrokerTree';

let container;
let root;
let store;
let selection;

beforeEach(() => {
  globalThis.IS_REACT_ACT_ENVIRONMENT = true;
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
  const reducer = combineReducers({ broker: brokerReducer, layout: layoutReducer, user: () => ({ preferences: { uiLocale: 'en' } }) });
  const initial = reducer(undefined, { type: '@@init' });
  store = configureStore({
    reducer,
    preloadedState: {
      ...initial,
      broker: {
        ...initial.broker,
        navigatorBrokersByHost: { h1: ['b1', 'b2', 'b3'].map((name) => ({ name, state: 'ON' })) },
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
    <BrokerTree
      hostUid="h1"
      onContextMenu={() => undefined}
      selectedBrokerNames={selected}
      onSelectedBrokerNamesChange={setSelected}
    />
  );
}

const render = () => act(async () => root.render(<Provider store={store}><Harness /></Provider>));
const fire = (name, type, init = {}) => act(async () => {
  const summary = container.querySelector(`[data-testid="tree-node-${name}"] summary`);
  summary.dispatchEvent(new MouseEvent(type, { bubbles: true, cancelable: true, ...init }));
});

// Right-clicking moves the selection the way a file explorer does (#29).
it('selects just the right-clicked broker when it is outside the selection', async () => {
  await render();
  await fire('b1', 'click');
  await fire('b2', 'click', { ctrlKey: true });
  await fire('b3', 'contextmenu');

  expect(selection.size).toBe(0);
  expect(store.getState().broker.selectedBroker).toBe('b3');
});

it('keeps a multi-selection and the highlight on a right-click inside it', async () => {
  await render();
  await fire('b1', 'click');
  await fire('b2', 'click', { ctrlKey: true });
  await fire('b2', 'contextmenu');

  expect([...selection].sort()).toEqual(['b1', 'b2']);
  expect(store.getState().broker.selectedBroker).toBe('b1');
});

it('starts a Ctrl/Cmd click from a broker selected by right-click', async () => {
  await render();
  await fire('b1', 'click');
  await fire('b2', 'contextmenu');
  await fire('b3', 'click', { ctrlKey: true });

  expect([...selection].sort()).toEqual(['b2', 'b3']);
});

it('shows a SUSPENDED broker with an orange dot and passes its state to the menu', async () => {
  store = configureStore({
    reducer: combineReducers({ broker: brokerReducer, layout: layoutReducer, user: () => ({ preferences: { uiLocale: 'en' } }) }),
    preloadedState: {
      ...store.getState(),
      broker: {
        ...store.getState().broker,
        navigatorBrokersByHost: { h1: [{ name: 's1', state: 'SUSPENDED' }, { name: 'o1' }, { name: 'n1', state: 'ON' }] },
      },
    },
  });
  const onContextMenu = vi.fn();
  await act(async () => root.render(
    <Provider store={store}>
      <BrokerTree hostUid="h1" onContextMenu={onContextMenu} selectedBrokerNames={new Set()} onSelectedBrokerNamesChange={() => undefined} />
    </Provider>,
  ));

  const node = (name) => container.querySelector(`[data-testid="tree-node-${name}"]`);
  expect(node('s1').dataset.status).toBe('suspended');
  expect(node('o1').dataset.status).toBe('off');
  expect(node('n1').dataset.status).toBe('on');
  expect(node('s1').querySelector('summary .bg-amber-500')).not.toBeNull();

  await fire('s1', 'contextmenu');
  expect(onContextMenu).toHaveBeenCalledWith(expect.anything(), 's1', 'SUSPENDED');
});
