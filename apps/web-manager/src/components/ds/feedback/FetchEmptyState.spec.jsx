import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import { Provider } from 'react-redux';
import { configureStore } from '@reduxjs/toolkit';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { FetchEmptyState } from './FetchEmptyState';
import { CM } from '../../../constants/cmLabels';

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

const store = configureStore({ reducer: { user: (s = { preferences: { uiLocale: 'en' } }) => s } });
const render = (props) => act(async () => {
  root.render(<Provider store={store}><FetchEmptyState title="Section" {...props} /></Provider>);
});

describe('FetchEmptyState', () => {
  it('shows loading while the first fetch has not settled', async () => {
    await render({ status: undefined });
    expect(container.textContent).toContain(CM.loadingLabel);
    expect(container.textContent).not.toContain(CM.noDataAvailableMsg);

    await render({ status: 'loading' });
    expect(container.textContent).toContain(CM.loadingLabel);
  });

  it('shows the empty message only after a successful fetch', async () => {
    await render({ status: 'loaded' });
    expect(container.textContent).toContain(CM.noDataAvailableMsg);
    expect(container.textContent).not.toContain(CM.loadingLabel);

    await render({ status: 'loaded', empty: <span>nothing here</span> });
    expect(container.textContent).toBe('nothing here');
  });

  it('shows an unavailable state after a failed fetch', async () => {
    await render({ status: 'error' });
    expect(container.textContent).toContain(CM.dataUnavailableTitle);
    expect(container.textContent).not.toContain(CM.noDataAvailableMsg);

    await render({ status: 'error', errorTitle: 'Custom', errorSubtitle: 'Why' });
    expect(container.textContent).toContain('Custom');
    expect(container.textContent).toContain('Why');
  });
});
