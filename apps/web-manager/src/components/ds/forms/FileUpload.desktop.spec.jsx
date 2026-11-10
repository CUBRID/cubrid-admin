import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import { Provider } from 'react-redux';
import { configureStore } from '@reduxjs/toolkit';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { FileUpload } from './FileUpload';

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
  delete window.desktopBridge;
  delete globalThis.IS_REACT_ACT_ENVIRONMENT;
});

const render = (onFileSelect) => act(async () => root.render(
  <Provider store={configureStore({ reducer: (s = { user: { preferences: { uiLocale: 'en' } } }) => s })}>
    <FileUpload onFileSelect={onFileSelect} accept=".json,.xml" />
  </Provider>
));

it("uses the desktop app's open dialog, which opens in the app's default folder, and hands over the file", async () => {
  const pickOpenFile = vi.fn().mockResolvedValue({ name: 'hosts.json', base64: btoa('{"a":1}') });
  window.desktopBridge = { pickOpenFile };
  const onFileSelect = vi.fn();
  await render(onFileSelect);
  const inputClick = vi.spyOn(container.querySelector('input[type="file"]'), 'click');

  await act(async () => container.querySelector('[role="button"]').click());

  expect(pickOpenFile).toHaveBeenCalledWith('.json,.xml');
  expect(inputClick).not.toHaveBeenCalled();
  const file = onFileSelect.mock.calls[0][0];
  expect(file.name).toBe('hosts.json');
  const text = await new Promise((resolve) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.readAsText(file);
  });
  expect(text).toBe('{"a":1}');
});

it('selects nothing when the dialog is cancelled', async () => {
  window.desktopBridge = { pickOpenFile: vi.fn().mockResolvedValue(null) };
  const onFileSelect = vi.fn();
  await render(onFileSelect);
  await act(async () => container.querySelector('[role="button"]').click());
  expect(onFileSelect).not.toHaveBeenCalled();
});

it("keeps the browser's file chooser outside the desktop app", async () => {
  await render(vi.fn());
  const inputClick = vi.spyOn(container.querySelector('input[type="file"]'), 'click');
  await act(async () => container.querySelector('[role="button"]').click());
  expect(inputClick).toHaveBeenCalled();
});
