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

const type = (input, value) => act(async () => {
  Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(input, value);
  input.dispatchEvent(new Event('input', { bubbles: true }));
});
const credentialInputs = (dbname) => q(`select-databases-credentials-${dbname}`).querySelectorAll('input');

it('asks for an account per database without a saved login before logging in', async () => {
  const onAction = vi.fn();
  await render({ initialSelected: ['a', 'b', 'c'], onAction });

  await click(q('select-databases-action-login'));
  expect(onAction).not.toHaveBeenCalled();
  // 'a' is already logged in; 'b' and 'c' have no saved login.
  expect(q('select-databases-credentials-a')).toBeNull();
  const [bId, bPassword] = credentialInputs('b');
  const [cId] = credentialInputs('c');
  await type(bId, 'dba');
  await type(bPassword, 'pw');
  await type(cId, 'public');

  await click(q('select-databases-action-login'));
  expect(onAction).toHaveBeenCalledWith('login', expect.any(Array), {
    b: { id: 'dba', password: 'pw' },
    c: { id: 'public', password: '' },
  });
});

it('copies the first row\'s account to every database', async () => {
  const onAction = vi.fn();
  await render({ initialSelected: ['b', 'c'], onAction });
  await click(q('select-databases-action-login'));
  const [bId, bPassword] = credentialInputs('b');
  await type(bId, 'dba');
  await type(bPassword, 'pw');

  await click(q('select-databases-apply-first'));
  await click(q('select-databases-action-login'));

  expect(onAction).toHaveBeenCalledWith('login', expect.any(Array), {
    b: { id: 'dba', password: 'pw' },
    c: { id: 'dba', password: 'pw' },
  });
});

it('shows each database\'s state in words', async () => {
  await render({});
  const rowA = [...document.querySelectorAll('tbody tr')].find((tr) => tr.textContent.includes('a'));
  expect(rowA.textContent).toContain('Running');
  expect(rowA.textContent).toContain('Logged in');
  expect(rowA.textContent).toContain('Login saved');
  expect(rowA.textContent).toContain('HA');
});
