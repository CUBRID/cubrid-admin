import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import { Provider } from 'react-redux';
import { configureStore } from '@reduxjs/toolkit';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// layoutSlice reads the OS theme at import time; jsdom has no matchMedia.
vi.hoisted(() => {
  window.matchMedia ??= () => ({ matches: false, addEventListener: vi.fn(), removeEventListener: vi.fn() });
});

import databaseUIReducer, { openUnloadResultModal } from '../databaseUISlice';
import UnloadResultModal from './UnloadResultModal';

const WARNING = "warning: [dba.tb] has object type. So for class [dba.tb], '--thread-count' option is ignored.";
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

const render = async (payload) => {
  const store = configureStore({
    reducer: {
      databaseUI: databaseUIReducer,
      user: () => ({ preferences: { uiLocale: 'en' } }),
      layout: () => ({ statusModal: { isOpen: false } }),
    },
  });
  store.dispatch(openUnloadResultModal(payload));
  await act(async () => root.render(<Provider store={store}>{<UnloadResultModal />}</Provider>));
};

describe('unload result', () => {
  it('shows the warnings and no empty table when CMS stopped before counting', async () => {
    await render({ result: [], warnings: [WARNING, 'CMS stopped after this warning, so the table counts and the Load Database list entry were not written.'] });
    expect(container.textContent).toContain(WARNING);
    expect(container.textContent).toContain('table counts');
    expect(container.querySelector('table')).toBeNull();
  });

  it('shows the counted tables as before', async () => {
    await render({ result: [{ 'dba.tc': '2 (100%/100%)' }] });
    expect(container.querySelector('table')).not.toBeNull();
    expect(container.textContent).toContain('dba.tc');
    expect(container.textContent).toContain('2 (100%/100%)');
    expect(container.querySelectorAll('[role="alert"]')).toHaveLength(0);
  });
});
