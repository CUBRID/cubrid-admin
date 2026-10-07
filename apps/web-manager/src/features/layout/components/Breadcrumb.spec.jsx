import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import { Provider } from 'react-redux';
import { configureStore } from '@reduxjs/toolkit';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import Breadcrumb from './Breadcrumb';

let container;
let root;

const callbacks = () => ({
  onTabChange: vi.fn(),
  onCloseTab: vi.fn(),
  onCloseOthers: vi.fn(),
  onCloseAll: vi.fn(),
  onReload: vi.fn(),
});

const renderBreadcrumb = async (handlers, dirtyTabs = ['dirty']) => {
  const state = {
    layout: { dirtyTabs },
    user: { preferences: { uiLocale: 'en' } },
  };
  const store = configureStore({ reducer: () => state });
  await act(async () => {
    root.render(
      <Provider store={store}>
        <Breadcrumb
          activeTab="keep"
          openTabs={['keep', 'clean', 'dirty']}
          labels={{ keep: 'Keep', clean: 'Clean', dirty: 'Dirty' }}
          {...handlers}
        />
      </Provider>,
    );
  });
};

const openTabMenu = async (tabId) => {
  await act(async () => {
    container.querySelector(`[data-testid="tab-${tabId}"]`).dispatchEvent(
      new MouseEvent('contextmenu', { bubbles: true, clientX: 20, clientY: 20 }),
    );
  });
};

const clickButtonWithText = async (text) => {
  const button = Array.from(document.querySelectorAll('button')).find((node) => node.textContent.includes(text));
  await act(async () => button.click());
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
  delete globalThis.IS_REACT_ACT_ENVIRONMENT;
});

it('keeps every tab unchanged until a dirty bulk close is confirmed', async () => {
  const handlers = callbacks();
  await renderBreadcrumb(handlers);
  await openTabMenu('keep');
  await clickButtonWithText('Close Other Tabs');

  expect(handlers.onCloseTab).not.toHaveBeenCalled();
  expect(handlers.onCloseOthers).not.toHaveBeenCalled();
  expect(handlers.onTabChange).not.toHaveBeenCalled();

  await act(async () => document.querySelector('[data-testid="close-dirty-tab-cancel-btn"]').click());
  expect(handlers.onCloseOthers).not.toHaveBeenCalled();

  await openTabMenu('keep');
  await clickButtonWithText('Close Other Tabs');
  await act(async () => document.querySelector('[data-testid="close-dirty-tab-confirm-btn"]').click());
  expect(handlers.onCloseOthers).toHaveBeenCalledWith('keep');
});

it('activates and reloads only the tab selected from the context menu', async () => {
  const handlers = callbacks();
  await renderBreadcrumb(handlers, []);
  await openTabMenu('dirty');
  await clickButtonWithText('Reload');

  expect(handlers.onTabChange).toHaveBeenCalledWith('dirty');
  expect(handlers.onReload).toHaveBeenCalledWith('dirty');
  expect(handlers.onCloseTab).not.toHaveBeenCalled();
});

it('protects unsaved tabs from browser refresh or window close', async () => {
  await renderBreadcrumb(callbacks(), ['dirty']);
  const event = new Event('beforeunload', { cancelable: true });

  window.dispatchEvent(event);

  expect(event.defaultPrevented).toBe(true);
});
