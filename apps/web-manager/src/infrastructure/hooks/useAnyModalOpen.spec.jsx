import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import { Provider } from 'react-redux';
import { configureStore } from '@reduxjs/toolkit';
import { afterEach, beforeEach, expect, it } from 'vitest';
import { markModalOpen, useAnyModalOpen } from './useAnyModalOpen';
import { Modal } from '../../components/ds/layout/Modal';

let container;
let root;
let seen;

function Probe() {
  seen.push(useAnyModalOpen());
  return null;
}

beforeEach(() => {
  globalThis.IS_REACT_ACT_ENVIRONMENT = true;
  seen = [];
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
});

afterEach(async () => {
  await act(async () => root.unmount());
  container.remove();
  delete globalThis.IS_REACT_ACT_ENVIRONMENT;
});

const latest = () => seen[seen.length - 1];

it('stays open until every modal has closed, and closing twice counts once', async () => {
  await act(async () => root.render(<Probe />));
  expect(latest()).toBe(false);

  let closeA;
  let closeB;
  await act(async () => { closeA = markModalOpen(); closeB = markModalOpen(); });
  expect(latest()).toBe(true);
  await act(async () => { closeA(); closeA(); });
  expect(latest()).toBe(true);
  await act(async () => { closeB(); });
  expect(latest()).toBe(false);
});

it('counts a Modal as open while isOpen is true and until it unmounts', async () => {
  const store = configureStore({ reducer: { user: (s = { preferences: { uiLocale: 'en' } }) => s } });
  const view = (isOpen, mounted = true) => (
    <Provider store={store}>
      <Probe />
      {mounted && <Modal isOpen={isOpen} onClose={() => {}} title="t">body</Modal>}
    </Provider>
  );
  await act(async () => root.render(view(false)));
  expect(latest()).toBe(false);
  await act(async () => root.render(view(true)));
  expect(latest()).toBe(true);
  await act(async () => root.render(view(false)));
  expect(latest()).toBe(false);
  await act(async () => root.render(view(true)));
  await act(async () => root.render(view(true, false)));
  expect(latest()).toBe(false);
});
