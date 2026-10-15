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

const renderBreadcrumb = async (handlers, dirtyTabs = ['dirty'], props = {}) => {
  const state = {
    layout: { dirtyTabs },
    user: { preferences: { uiLocale: 'en' } },
  };
  const store = configureStore({ reducer: () => state });
  await act(async () => {
    root.render(
      <Provider store={store}>
        <Breadcrumb
          activeTab={props.activeTab || 'keep'}
          openTabs={props.openTabs || ['keep', 'clean', 'dirty']}
          labels={props.labels || { keep: 'Keep', clean: 'Clean', dirty: 'Dirty' }}
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

it('requests reload for only the tab selected from the context menu', async () => {
  const handlers = callbacks();
  await renderBreadcrumb(handlers, []);
  await openTabMenu('dirty');
  await clickButtonWithText('Reload');

  expect(handlers.onTabChange).not.toHaveBeenCalled();
  expect(handlers.onReload).toHaveBeenCalledWith('dirty');
  expect(handlers.onCloseTab).not.toHaveBeenCalled();
});

it('confirms clean bulk tab closures before changing the open tabs', async () => {
  const handlers = callbacks();
  await renderBreadcrumb(handlers, []);

  await openTabMenu('keep');
  await clickButtonWithText('Close Other Tabs');

  expect(handlers.onCloseOthers).not.toHaveBeenCalled();
  expect(document.body.textContent).toContain('Close the other 2 open tabs?');

  await act(async () => document.querySelector('[data-testid="close-dirty-tab-confirm-btn"]').click());
  expect(handlers.onCloseOthers).toHaveBeenCalledWith('keep');

  await openTabMenu('keep');
  await clickButtonWithText('Close All Tabs');

  expect(handlers.onCloseAll).not.toHaveBeenCalled();
  expect(document.body.textContent).toContain('Close all 3 open tabs?');

  await act(async () => document.querySelector('[data-testid="close-dirty-tab-confirm-btn"]').click());
  expect(handlers.onCloseAll).toHaveBeenCalledOnce();
});

it('protects unsaved tabs from browser refresh or window close', async () => {
  await renderBreadcrumb(callbacks(), ['dirty']);
  const event = new Event('beforeunload', { cancelable: true });

  window.dispatchEvent(event);

  expect(event.defaultPrevented).toBe(true);
});

it('shows page navigation and an all-tabs menu when tabs overflow', async () => {
  const handlers = callbacks();
  await renderBreadcrumb(handlers, ['dirty'], {
    openTabs: ['keep', 'clean', 'dirty', 'logs', 'settings'],
    labels: {
      keep: 'Keep',
      clean: 'Clean',
      dirty: 'Dirty changes',
      logs: 'Server logs',
      settings: 'Database settings',
    },
  });

  const tabBar = container.querySelector('[data-testid="top-tab-bar"]');
  const tabScroller = container.querySelector('[data-testid="top-tab-scroller"]');
  Object.defineProperties(tabBar, {
    clientWidth: { configurable: true, value: 500 },
  });
  Object.defineProperties(tabScroller, {
    clientWidth: { configurable: true, value: 300 },
    scrollWidth: { configurable: true, value: 800 },
    scrollLeft: { configurable: true, writable: true, value: 0 },
  });
  tabScroller.scrollBy = vi.fn();

  await act(async () => window.dispatchEvent(new Event('resize')));

  expect(container.querySelector('[data-testid="tab-overflow-controls"]')).not.toBeNull();
  expect(container.querySelector('[data-testid="previous-tabs-btn"]').disabled).toBe(true);
  expect(container.querySelector('[data-testid="next-tabs-btn"]').disabled).toBe(false);

  await act(async () => container.querySelector('[data-testid="next-tabs-btn"]').click());
  expect(tabScroller.scrollBy).toHaveBeenCalledWith({ left: 255, behavior: 'smooth' });

  await act(async () => container.querySelector('[data-testid="all-tabs-menu-btn"]').click());
  const settingsMenuItem = Array.from(document.querySelectorAll('[role="menuitem"]'))
    .find((node) => node.textContent.includes('Database settings'));
  expect(settingsMenuItem).toBeDefined();

  await act(async () => settingsMenuItem.click());
  expect(handlers.onTabChange).toHaveBeenCalledWith('settings');
});

it('adds a full-name tooltip only while a tab label is truncated', async () => {
  const longLabel = 'Database configuration with a very long descriptive name';
  await renderBreadcrumb(callbacks(), [], {
    openTabs: ['long'],
    activeTab: 'long',
    labels: { long: longLabel },
  });

  const tab = container.querySelector('[data-testid="tab-long"]');
  const label = container.querySelector('[data-testid="tab-long-label"]');
  Object.defineProperties(label, {
    clientWidth: { configurable: true, value: 120 },
    scrollWidth: { configurable: true, value: 360 },
  });

  await act(async () => window.dispatchEvent(new Event('resize')));
  expect(tab.getAttribute('title')).toBe(longLabel);

  Object.defineProperty(label, 'scrollWidth', { configurable: true, value: 120 });
  await act(async () => window.dispatchEvent(new Event('resize')));
  expect(tab.hasAttribute('title')).toBe(false);
});
