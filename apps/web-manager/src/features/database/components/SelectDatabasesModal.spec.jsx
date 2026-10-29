import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { Provider } from 'react-redux';
import { configureStore } from '@reduxjs/toolkit';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import databaseReducer from '../databaseCoreSlice';
import SelectDatabasesModal from './SelectDatabasesModal';

let container;
let root;
let store;

beforeEach(() => {
  globalThis.IS_REACT_ACT_ENVIRONMENT = true;
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
  store = configureStore({
    reducer: { database: databaseReducer },
    preloadedState: {
      database: {
        ...databaseReducer(undefined, { type: '@@init' }),
        databasesByHost: { h1: [{ dbname: 'a', isProfileExists: true }, { dbname: 'b' }, { dbname: 'c' }] },
        activeDatabasesByHost: { h1: ['a'] },
        haDbNamesByHost: { h1: ['a'] },
        loggedInDatabases: ['h1:a'],
      },
    },
  });
});

afterEach(async () => {
  await act(async () => root.unmount());
  container.remove();
  delete globalThis.IS_REACT_ACT_ENVIRONMENT;
});

const render = (props) => act(async () => root.render(
  <Provider store={store}>
    <SelectDatabasesModal isOpen hostUid="h1" onClose={() => undefined} {...props} />
  </Provider>
));
const q = (testId) => document.querySelector(`[data-testid="${testId}"]`);
const click = (el) => act(async () => el.click());

it('counts, per action, the selected databases it applies to', async () => {
  await render({ initialSelected: ['a', 'b'], onAction: vi.fn() });

  expect(q('select-databases-action-start').textContent).toContain('(1)');
  expect(q('select-databases-action-stop').textContent).toContain('(1)');
  expect(q('select-databases-action-logout').textContent).toContain('(1)');
  expect(q('select-databases-action-forgetCredentials').textContent).toContain('(1)');
});

it('passes the selected rows to onAction', async () => {
  const onAction = vi.fn();
  await render({ initialSelected: ['a'], onAction });
  await click(q('select-databases-checkbox-c').querySelector('input'));
  await click(q('select-databases-action-start'));

  expect(onAction).toHaveBeenCalledWith('start', [
    expect.objectContaining({ dbname: 'a', running: true, isHa: true }),
    expect.objectContaining({ dbname: 'c', running: false }),
  ], undefined);
});

it('asks for credentials before logging in to databases without saved ones', async () => {
  const onAction = vi.fn();
  await render({ initialSelected: ['b'], onAction });

  await click(q('select-databases-action-login'));
  expect(onAction).not.toHaveBeenCalled();
  expect(q('select-databases-credentials')).not.toBeNull();

  await click(q('select-databases-action-login'));
  expect(onAction).toHaveBeenCalledWith('login', [expect.objectContaining({ dbname: 'b' })], { id: '', password: '' });
});
