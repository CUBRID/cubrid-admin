import React, { act, StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { Provider } from 'react-redux';
import { configureStore } from '@reduxjs/toolkit';
import { beforeEach, afterEach, expect, it, vi } from 'vitest';

vi.mock('../../database/databaseSlice', () => ({ fetchDatabaseVolumes: vi.fn() }));
import { fetchDatabaseVolumes } from '../../database/databaseSlice';
import DatabaseVolumes from './DatabaseVolumes';

const deferred = () => {
  let resolve;
  const promise = new Promise((r) => { resolve = r; });
  return { promise, resolve };
};

let container;
let root;
let baseState;

beforeEach(() => {
  globalThis.IS_REACT_ACT_ENVIRONMENT = true;
  vi.resetAllMocks();
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
  baseState = {
    host: { authorizedHosts: ['host1'] },
    database: { loggedInDatabases: ['host1:demodb'] },
    user: { preferences: { uiLocale: 'en' } },
  };
});

afterEach(async () => {
  await act(async () => root.unmount());
  container.remove();
  delete globalThis.IS_REACT_ACT_ENVIRONMENT;
});

// A store whose reducer can be swapped out mid-test via a SET_STATE action,
// so we can simulate a redux state change (e.g. logging out of a database)
// without needing a full slice/reducer setup.
const makeStore = () => configureStore({
  reducer: (state = baseState, action) => (action.type === 'SET_STATE' ? action.payload : state),
});

const render = async (store, activeDatabases = ['demodb']) => act(async () => {
  root.render(
    <StrictMode>
      <Provider store={store}>
        <DatabaseVolumes hostUid="host1" activeDatabases={activeDatabases} />
      </Provider>
    </StrictMode>
  );
});

// Mocks fetchDatabaseVolumes as a redux-thunk-compatible action creator
// whose dispatch result exposes `.unwrap()`, matching how the real
// createAsyncThunk-based action is consumed in DatabaseVolumes.jsx.
const mockFetchReturning = (promise) => {
  fetchDatabaseVolumes.mockImplementation(() => () => ({ unwrap: () => promise }));
};

const volumeCard = () => container.querySelector('[data-testid="server-dashboard-storage-volumes"]');

it('shows volumes for the active, logged-in database once the fetch resolves', async () => {
  const request = deferred();
  mockFetchReturning(request.promise);

  const store = makeStore();
  await render(store);
  expect(fetchDatabaseVolumes).toHaveBeenCalled();

  await act(async () => request.resolve([{ dbname: 'demodb', spaceinfo: [], freespace: '0' }]));

  expect(volumeCard().textContent).toContain('demodb');
});

it('ignores a stale volumes response that resolves after logging out of the last active database', async () => {
  const request = deferred();
  mockFetchReturning(request.promise);

  const store = makeStore();
  await render(store);
  expect(fetchDatabaseVolumes).toHaveBeenCalled();

  // Log out of the only active database while its volumes request is still
  // in flight: the effect re-runs, sees no logged-in active databases left,
  // and clears the table.
  await act(async () => {
    store.dispatch({
      type: 'SET_STATE',
      payload: { ...baseState, database: { loggedInDatabases: [] } },
    });
  });
  expect(volumeCard().textContent).not.toContain('demodb');

  // The earlier, now-stale request resolves afterwards with the logged-out
  // database's volume info. Without a staleness guard this would repopulate
  // the table; with it, the response must be dropped.
  await act(async () => request.resolve([{ dbname: 'demodb', spaceinfo: [], freespace: '0' }]));

  expect(volumeCard().textContent).not.toContain('demodb');
});
