import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import { Provider } from 'react-redux';
import { configureStore } from '@reduxjs/toolkit';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { DatePicker } from './forms/DatePicker';
import { MultiSelect } from './forms/MultiSelect';
import { Select } from './forms/Select';
import { Modal } from './layout/Modal';
import TabItem from '../../features/layout/components/TabItem';

let container;
let root;
let store;

beforeEach(() => {
  globalThis.IS_REACT_ACT_ENVIRONMENT = true;
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
  store = configureStore({
    reducer: () => ({ user: { preferences: { uiLocale: 'en' } } }),
  });
  Element.prototype.scrollIntoView = vi.fn();
});

afterEach(async () => {
  await act(async () => root.unmount());
  container.remove();
  delete globalThis.IS_REACT_ACT_ENVIRONMENT;
});

const render = (node) => act(async () => {
  root.render(<Provider store={store}>{node}</Provider>);
});

it('lets only the topmost modal handle Escape', async () => {
  const closeParent = vi.fn();
  const closeChild = vi.fn();
  await render(
    <>
      <Modal isOpen onClose={closeParent} title="Parent">Parent content</Modal>
      <Modal isOpen onClose={closeChild} title="Child">Child content</Modal>
    </>,
  );

  await act(async () => {
    document.dispatchEvent(new KeyboardEvent('keydown', {
      key: 'Escape', bubbles: true, cancelable: true,
    }));
  });

  expect(closeChild).toHaveBeenCalledTimes(1);
  expect(closeParent).not.toHaveBeenCalled();
});

it('closes an open date picker before its parent modal', async () => {
  const closeModal = vi.fn();
  await render(
    <Modal isOpen onClose={closeModal} title="Schedule">
      <DatePicker label="Date" value="2026-10-13" onChange={vi.fn()} />
    </Modal>,
  );
  const picker = container.querySelector('[aria-haspopup="dialog"]');
  await act(async () => picker.click());
  expect(picker.getAttribute('aria-expanded')).toBe('true');

  await act(async () => {
    document.dispatchEvent(new KeyboardEvent('keydown', {
      key: 'Escape', bubbles: true, cancelable: true,
    }));
  });

  expect(picker.getAttribute('aria-expanded')).toBe('false');
  expect(closeModal).not.toHaveBeenCalled();
});

it('exposes and scrolls the active Select option during keyboard navigation', async () => {
  await render(
    <Select
      label="Database"
      value="first"
      onChange={vi.fn()}
      options={[
        { value: 'first', label: 'First' },
        { value: 'second', label: 'Second' },
      ]}
    />,
  );
  const select = container.querySelector('[role="combobox"]');
  await act(async () => select.click());
  await act(async () => {
    select.dispatchEvent(new KeyboardEvent('keydown', {
      key: 'ArrowDown', bubbles: true, cancelable: true,
    }));
  });
  await act(async () => new Promise((resolve) => requestAnimationFrame(resolve)));

  const activeId = select.getAttribute('aria-activedescendant');
  expect(activeId).toBeTruthy();
  expect(document.getElementById(activeId).textContent).toContain('Second');
  expect(Element.prototype.scrollIntoView).toHaveBeenCalled();
});

it('does not activate a tab when a child button handles the key', async () => {
  const activate = vi.fn();
  await render(
    <TabItem
      tabId="config"
      isActive
      label="Config"
      closeLabel="Close Config"
      onClick={activate}
      onClose={vi.fn()}
      onContextMenu={vi.fn()}
    />,
  );
  const closeButton = container.querySelector('[data-testid="tab-config-close"]');
  await act(async () => {
    closeButton.dispatchEvent(new KeyboardEvent('keydown', {
      key: 'Enter', bubbles: true, cancelable: true,
    }));
  });

  expect(activate).not.toHaveBeenCalled();
});

it('does not let a MultiSelect remove button key open the list', async () => {
  await render(
    <MultiSelect
      label="Databases"
      value={['first']}
      onChange={vi.fn()}
      options={[{ value: 'first', label: 'First' }]}
    />,
  );
  const combobox = container.querySelector('[role="combobox"]');
  const removeButton = combobox.querySelector('button');
  await act(async () => {
    removeButton.dispatchEvent(new KeyboardEvent('keydown', {
      key: 'Enter', bubbles: true, cancelable: true,
    }));
  });

  expect(combobox.getAttribute('aria-expanded')).toBe('false');
});
