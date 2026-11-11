import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import { Provider } from 'react-redux';
import { configureStore } from '@reduxjs/toolkit';
import { afterEach, beforeEach, expect, it } from 'vitest';
import AboutModal from './AboutModal';

let container;
let root;

const render = async (uiLocale) => {
  const state = { appBar: { isAboutCubridOpen: true }, user: { preferences: { uiLocale } } };
  await act(async () => {
    root.render(
      <Provider store={configureStore({ reducer: () => state })}>
        <AboutModal />
      </Provider>
    );
  });
};

beforeEach(() => {
  globalThis.IS_REACT_ACT_ENVIRONMENT = true;
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
});

afterEach(async () => {
  await act(async () => root.unmount());
  container.remove();
});

it('shows the product version baked in at build time, not a hardcoded one', async () => {
  await render('en');

  // vite.config.mjs injects major.minor.patch.commit_num (scripts/product-version.cjs).
  const rootVersion = import.meta.env.VITE_APP_VERSION;
  expect(rootVersion).toMatch(/^\d+\.\d+\.\d+\.\d{4,}$/);
  expect(container.querySelector('[data-testid="about-app-version"]').textContent.trim()).toBe(`v${rootVersion}`);
  expect(container.textContent).not.toContain('0.0.1 Alpha');
});

it('uses the same title as the Help menu item that opens it', async () => {
  await render('en');
  expect(container.textContent).toContain('About CUBRID Admin');

  await render('ko');
  expect(container.textContent).toContain('CUBRID Admin 정보');
});
