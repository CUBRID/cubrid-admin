import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import { Provider } from 'react-redux';
import { configureStore } from '@reduxjs/toolkit';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const release = vi.fn();
vi.mock('./statdumpWatcher', () => ({
  acquireStatdumpWatcher: vi.fn(() => release),
  restartFrozenStatdumpWatcher: vi.fn(),
}));

import { acquireStatdumpWatcher, restartFrozenStatdumpWatcher } from './statdumpWatcher';
import { useStatdumpWatcher } from './useStatdumpWatcher';

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

const store = (authorizedHosts) => configureStore({ reducer: { host: (s = { authorizedHosts }) => s } });
const render = (s, props) => act(async () => {
  root.render(<Provider store={s}><Probe hostUid="h1" dbname="demodb" {...props} /></Provider>);
});

describe('useStatdumpWatcher', () => {
  it('holds a watcher while mounted on an authorized host and releases it on unmount', async () => {
    await render(store(['h1']));
    expect(acquireStatdumpWatcher).toHaveBeenCalledWith('h1', 'demodb');
    expect(release).not.toHaveBeenCalled();

    await act(async () => root.unmount());
    expect(release).toHaveBeenCalledTimes(1);
  });

  it('does not start a watcher for a host that is not logged in', async () => {
    await render(store([]));
    expect(acquireStatdumpWatcher).not.toHaveBeenCalled();
    await act(async () => root.unmount());
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
