import React, { act, lazy } from 'react';
import { createRoot } from 'react-dom/client';
import { Provider } from 'react-redux';
import { configureStore } from '@reduxjs/toolkit';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import EditorLoadBoundary from './EditorLoadBoundary';

const store = (locale) => configureStore({ reducer: { user: () => ({ preferences: { uiLocale: locale } }) } });
let container;
let root;

beforeEach(() => {
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
  vi.spyOn(console, 'error').mockImplementation(() => {});
});
afterEach(() => {
  act(() => root.unmount());
  container.remove();
  vi.restoreAllMocks();
});

const page = (locale, editor) => (
  <Provider store={store(locale)}>
    <p data-testid="around">around</p>
    <EditorLoadBoundary fallback={<span data-testid="loading" />}>{editor}</EditorLoadBoundary>
  </Provider>
);

it('shows a reload message in place of an editor whose code cannot be loaded, and keeps the rest', async () => {
  const Broken = lazy(() => Promise.reject(new TypeError('Failed to fetch dynamically imported module')));
  await act(async () => { root.render(page('ko', <Broken />)); });
  await act(async () => { await new Promise((resolve) => setTimeout(resolve, 0)); });
  expect(container.querySelector('[data-testid="around"]')).not.toBeNull();
  const failed = container.querySelector('[data-testid="editor-load-failed"]');
  expect(failed?.textContent).toContain('편집기를 불러오지 못했습니다');
  expect(failed?.querySelector('button')?.textContent).toContain('새로 고침');
});

it('shows the editor once its code is loaded', async () => {
  const Editor = lazy(() => Promise.resolve({ default: () => <textarea data-testid="editor" /> }));
  await act(async () => { root.render(page('en', <Editor />)); });
  await act(async () => { await new Promise((resolve) => setTimeout(resolve, 0)); });
  expect(container.querySelector('[data-testid="editor"]')).not.toBeNull();
  expect(container.querySelector('[data-testid="editor-load-failed"]')).toBeNull();
});
