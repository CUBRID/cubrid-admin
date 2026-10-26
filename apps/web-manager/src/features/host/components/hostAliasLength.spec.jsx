import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import { Provider } from 'react-redux';
import { configureStore } from '@reduxjs/toolkit';
import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest';

// layoutSlice reads the OS theme at import time; jsdom has no matchMedia.
vi.hoisted(() => {
  window.matchMedia ??= () => ({ matches: false, addEventListener: vi.fn(), removeEventListener: vi.fn() });
});

vi.mock('../hostApi', () => ({
  hostApi: {
    addHost: vi.fn(async () => ({ host_groups: {} })),
    editHost: vi.fn(async () => ({ host_groups: {} })),
  },
}));
import { hostApi } from '../hostApi';
import AddHostModal from './AddHostModal';
import EditHostModal from './EditHostModal';
import { MAX_HOST_ALIAS_LENGTH, UNGROUPED_GROUP_ID } from '../hostGroupUtils';
import { CM } from '../../../constants/cmLabels';

let container;
let root;

beforeEach(() => {
  globalThis.IS_REACT_ACT_ENVIRONMENT = true;
  vi.clearAllMocks();
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
});

afterEach(async () => {
  await act(async () => root.unmount());
  container.remove();
  delete globalThis.IS_REACT_ACT_ENVIRONMENT;
});

const existingHost = { uid: 'h1', alias: 'A', address: '10.0.0.1', port: 8001, id: 'admin' };

function makeStore(hostOverrides = {}) {
  const host = {
    loading: false,
    error: null,
    initialHostData: null,
    isEditHostModalOpen: false,
    hostToEditUid: null,
    hosts: [existingHost],
    hostGroups: {
      [UNGROUPED_GROUP_ID]: { name: '', defaultHostUid: 'h1', hosts: { h1: existingHost } },
    },
    ...hostOverrides,
  };
  return configureStore({
    reducer: {
      host: () => host,
      user: () => ({ preferences: { uiLocale: 'en' } }),
    },
  });
}

const render = (store, element) => act(async () => {
  root.render(<Provider store={store}>{element}</Provider>);
});

const aliasInput = () => container.querySelector('input[name="alias"]');
const click = (testId) => act(async () => {
  container.querySelector(`[data-testid="${testId}"]`).click();
});

describe('AddHostModal alias length', () => {
  const prefilled = (alias) => makeStore({
    initialHostData: { alias, address: '10.0.0.2', port: 8001, id: 'admin', password: 'pw' },
  });

  it('caps typing at the max length', async () => {
    await render(makeStore(), <AddHostModal isOpen onClose={vi.fn()} />);
    expect(aliasInput().maxLength).toBe(MAX_HOST_ALIAS_LENGTH);
  });

  // maxLength only limits typing; a prefilled value (e.g. from discovery)
  // can still exceed it, so validation must catch it before the request.
  it('blocks save and shows an error for a prefilled alias over the max', async () => {
    await render(prefilled('x'.repeat(MAX_HOST_ALIAS_LENGTH + 1)), <AddHostModal isOpen onClose={vi.fn()} />);
    await click('add-host-save-btn');
    expect(container.textContent).toContain(CM.hostNameTooLong(MAX_HOST_ALIAS_LENGTH));
    expect(hostApi.addHost).not.toHaveBeenCalled();
  });

  it('saves an alias of exactly the max length', async () => {
    const alias = 'x'.repeat(MAX_HOST_ALIAS_LENGTH);
    await render(prefilled(alias), <AddHostModal isOpen onClose={vi.fn()} />);
    await click('add-host-save-btn');
    expect(container.textContent).not.toContain(CM.hostNameTooLong(MAX_HOST_ALIAS_LENGTH));
    expect(hostApi.addHost).toHaveBeenCalledWith(expect.objectContaining({ alias }));
  });
});

describe('EditHostModal alias length', () => {
  const editing = (alias) => {
    const host = { ...existingHost, alias };
    return makeStore({
      isEditHostModalOpen: true,
      hostToEditUid: 'h1',
      hosts: [host],
      hostGroups: { [UNGROUPED_GROUP_ID]: { name: '', defaultHostUid: 'h1', hosts: { h1: host } } },
    });
  };

  it('caps typing at the max length', async () => {
    await render(editing('A'), <EditHostModal />);
    expect(aliasInput().maxLength).toBe(MAX_HOST_ALIAS_LENGTH);
  });

  // A host saved before the cap existed can already carry a longer alias.
  it('blocks save for a stored alias over the max', async () => {
    await render(editing('y'.repeat(MAX_HOST_ALIAS_LENGTH + 1)), <EditHostModal />);
    await click('edit-host-save-btn');
    expect(container.textContent).toContain(CM.hostNameTooLong(MAX_HOST_ALIAS_LENGTH));
    expect(hostApi.editHost).not.toHaveBeenCalled();
  });

  it('saves an alias of exactly the max length', async () => {
    const alias = 'y'.repeat(MAX_HOST_ALIAS_LENGTH);
    await render(editing(alias), <EditHostModal />);
    await click('edit-host-save-btn');
    expect(container.textContent).not.toContain(CM.hostNameTooLong(MAX_HOST_ALIAS_LENGTH));
    expect(hostApi.editHost).toHaveBeenCalledWith('h1', expect.objectContaining({ alias }));
  });
});
