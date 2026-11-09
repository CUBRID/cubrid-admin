import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import { Provider } from 'react-redux';
import { configureStore } from '@reduxjs/toolkit';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import UnloadAdvancedOptions from './UnloadAdvancedOptions';

const NOTE = 'The schema of the whole database is unloaded too.';
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

const render = (formData) => {
  const store = configureStore({ reducer: () => ({ user: { preferences: { uiLocale: 'en' } } }) });
  return act(async () => root.render(
    <Provider store={store}>
      <UnloadAdvancedOptions formData={{ useDelimitedIdentifier: false, ...formData }} handleInputChange={() => undefined} />
    </Provider>
  ));
};

describe('the note under Include referenced tables', () => {
  it('shows only while the box is checked', async () => {
    await render({ schemaScope: 'selected', includeReferencedTables: true });
    expect(container.textContent).toContain(NOTE);
    await render({ schemaScope: 'selected', includeReferencedTables: false });
    expect(container.textContent).not.toContain(NOTE);
  });

  it('is hidden while the box is off for every-table or no-schema unloads', async () => {
    for (const schemaScope of ['all', 'none']) {
      await render({ schemaScope, includeReferencedTables: true });
      expect(container.textContent).not.toContain(NOTE);
    }
  });
});
