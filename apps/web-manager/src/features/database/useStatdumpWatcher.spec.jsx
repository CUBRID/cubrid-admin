import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import { Provider } from 'react-redux';
import { configureStore } from '@reduxjs/toolkit';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const release = vi.fn();
vi.mock('./statdumpWatcher', () => ({
  acquireStatdumpWatcher: vi.fn(() => release),
  restartFrozenStatdumpWatcher: vi.fn(),
  setStatdumpWatcherPaused: vi.fn(),
}));

import { acquireStatdumpWatcher, restartFrozenStatdumpWatcher, setStatdumpWatcherPaused } from './statdumpWatcher';
import { useStatdumpWatcher } from './useStatdumpWatcher';
import { markModalOpen } from '../../infrastructure/hooks/useAnyModalOpen';

function Probe({ hostUid, dbname, perfSample }) {
  useStatdumpWatcher(hostUid, dbname, perfSample);
  return null;
}

let container;
let root;
beforeEach(() => {
  globalThis.IS_REACT_ACT_ENVIRONMENT = true;
  vi.clearAllMocks();
  container = document.createElement('div');
  root = createRoot(container);
});
afterEach(() => {
  delete globalThis.IS_REACT_ACT_ENVIRONMENT;
});

// `database` takes a `setLoggedIn` action so a test can log the db out.
const store = (authorizedHosts, loggedInDatabases = ['h1:demodb']) => configureStore({
  reducer: {
    host: (s = { authorizedHosts, reconnectQueue: [] }, action) =>
      (action.type === 'setReconnectQueue' ? { ...s, reconnectQueue: action.payload } : s),
    database: (s = { loggedInDatabases }, action) => (action.type === 'setLoggedIn' ? { loggedInDatabases: action.payload } : s),
  },
});
const render = (s, props) => act(async () => {
  root.render(<Provider store={s}><Probe hostUid="h1" dbname="demodb" {...props} /></Provider>);
});

describe('useStatdumpWatcher', () => {
  it('holds a watcher while mounted on an authorized host and releases it on unmount', async () => {
    await render(store(['h1']));
    expect(acquireStatdumpWatcher).toHaveBeenCalledWith('h1', 'demodb', undefined, { paused: false });
    expect(release).not.toHaveBeenCalled();

    await act(async () => root.unmount());
    expect(release).toHaveBeenCalledTimes(1);
  });

  it('pauses the watcher while the host waits in the reconnect window, and resumes when it leaves', async () => {
    const s = store(['h1']);
    await render(s);
    expect(setStatdumpWatcherPaused).toHaveBeenLastCalledWith('h1', 'demodb', false);

    await act(async () => s.dispatch({ type: 'setReconnectQueue', payload: ['h1'] }));
    expect(setStatdumpWatcherPaused).toHaveBeenLastCalledWith('h1', 'demodb', true);

    await act(async () => s.dispatch({ type: 'setReconnectQueue', payload: [] }));
    expect(setStatdumpWatcherPaused).toHaveBeenLastCalledWith('h1', 'demodb', false);
    await act(async () => root.unmount());
  });

  it('pauses the watcher while a modal is open, as the dashboard polling does', async () => {
    await render(store(['h1']));
    let closeModal;
    await act(async () => { closeModal = markModalOpen(); });
    expect(setStatdumpWatcherPaused).toHaveBeenLastCalledWith('h1', 'demodb', true);
    await act(async () => { closeModal(); });
    expect(setStatdumpWatcherPaused).toHaveBeenLastCalledWith('h1', 'demodb', false);
    await act(async () => root.unmount());
  });

  it('acquires the watcher paused when the host is already waiting to reconnect', async () => {
    const s = store(['h1']);
    await act(async () => s.dispatch({ type: 'setReconnectQueue', payload: ['h1'] }));
    await render(s);
    expect(acquireStatdumpWatcher).toHaveBeenCalledWith('h1', 'demodb', undefined, { paused: true });
    await act(async () => root.unmount());
  });

  it('does not start a watcher for a host that is not logged in', async () => {
    await render(store([]));
    expect(acquireStatdumpWatcher).not.toHaveBeenCalled();
    await act(async () => root.unmount());
  });

  it('does not start a watcher for a database that is not logged in', async () => {
    await render(store(['h1'], []));
    expect(acquireStatdumpWatcher).not.toHaveBeenCalled();
    await act(async () => root.unmount());
  });

  it('releases the watcher when the database login goes away', async () => {
    const s = store(['h1']);
    await render(s);
    expect(acquireStatdumpWatcher).toHaveBeenCalledTimes(1);

    await act(async () => s.dispatch({ type: 'setLoggedIn', payload: [] }));
    expect(release).toHaveBeenCalledTimes(1);
    await act(async () => root.unmount());
    expect(release).toHaveBeenCalledTimes(1);
  });

  it('checks for frozen counters on every new sample', async () => {
    const s = store(['h1']);
    await render(s, { perfSample: { time: 1000, unchangedSince: 500 } });
    await render(s, { perfSample: { time: 2000, unchangedSince: 500 } });
    expect(restartFrozenStatdumpWatcher.mock.calls).toEqual([
      ['h1', 'demodb', 500, 1000],
      ['h1', 'demodb', 500, 2000],
    ]);
    await act(async () => root.unmount());
  });
});
