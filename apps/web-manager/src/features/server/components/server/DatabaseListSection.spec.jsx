import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import { Provider } from 'react-redux';
import { configureStore } from '@reduxjs/toolkit';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import DatabaseListSection from './DatabaseListSection';
import { CM } from '../../../../constants/cmLabels';

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
  root.render(<Provider store={store}><DatabaseListSection dbListDisplay={[]} {...props} /></Provider>);
});

describe('DatabaseListSection empty state', () => {
  it('shows loading while the database list is still loading', async () => {
    await render({ dbListStatus: 'loading' });
    expect(container.textContent).toContain(CM.loadingLabel);
    expect(container.textContent).not.toContain(CM.noDataAvailableMsg);
  });

  it('shows "no data" after the list loaded empty', async () => {
    await render({ dbListStatus: 'loaded' });
    expect(container.textContent).toContain(CM.noDataAvailableMsg);
  });

  it('shows an unavailable state after the list failed to load', async () => {
    await render({ dbListStatus: 'error' });
    expect(container.textContent).toContain(CM.dataUnavailableTitle);
    expect(container.textContent).not.toContain(CM.noDataAvailableMsg);
  });

  it('keeps the rows it has regardless of the latest status', async () => {
    await render({ dbListStatus: 'error', dbListDisplay: [{ db: 'demodb', autoStart: false, status: CM.statusOn }] });
    expect(container.textContent).toContain('demodb');
  });
});
