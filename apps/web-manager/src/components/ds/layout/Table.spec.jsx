import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { Provider } from 'react-redux';
import { configureStore } from '@reduxjs/toolkit';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Table } from './Table';

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

const ROW_PX = 30;
const columns = [{ header: 'Name', accessor: 'name' }];
const rows = (n) => Array.from({ length: n }, (_, i) => ({ name: `row-${i}` }));
const store = configureStore({ reducer: { user: () => ({ preferences: { uiLocale: 'en' } }) } });

let container;
let root;
let heightSpy;

beforeEach(() => {
  // jsdom has no layout; give every row and the header a fixed height.
  heightSpy = vi.spyOn(HTMLElement.prototype, 'offsetHeight', 'get').mockReturnValue(ROW_PX);
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
});

afterEach(async () => {
  await act(() => root.unmount());
  container.remove();
  heightSpy.mockRestore();
});

const render = (props) => act(async () => {
  root.render(<Provider store={store}><Table columns={columns} {...props} /></Provider>);
});
const scrollArea = () => container.querySelector('[data-testid="table-scroll-area"]');
const grip = () => container.querySelector('[data-testid="table-resize-grip"]');

describe('Table maxRows', () => {
  it('leaves a table at or under the limit as it was', async () => {
    await render({ data: rows(15), maxRows: 15 });
    expect(scrollArea()).toBeNull();
    expect(grip()).toBeNull();
    expect(container.querySelectorAll('tbody tr')).toHaveLength(15);
  });

  it('caps a longer table at the header plus maxRows rows and scrolls the rest', async () => {
    await render({ data: rows(40), maxRows: 15 });
    expect(scrollArea().style.maxHeight).toBe(`${ROW_PX * 16}px`);
    expect(container.querySelectorAll('tbody tr')).toHaveLength(40);
    expect(container.querySelector('thead').className).toContain('sticky');
    expect(grip()).not.toBeNull();
  });

  it('lets the grip set a height from the keyboard and resets it on double-click', async () => {
    await render({ data: rows(40), maxRows: 15 });
    vi.spyOn(scrollArea(), 'getBoundingClientRect').mockReturnValue({ height: ROW_PX * 16 });

    await act(() => { grip().dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true })); });
    expect(scrollArea().style.height).toBe(`${ROW_PX * 16 + 40}px`);

    await act(() => { grip().dispatchEvent(new MouseEvent('dblclick', { bubbles: true })); });
    expect(scrollArea().style.height).toBe('');
    expect(scrollArea().style.maxHeight).toBe(`${ROW_PX * 16}px`);
  });

  it('does nothing without maxRows', async () => {
    await render({ data: rows(40) });
    expect(scrollArea()).toBeNull();
    expect(grip()).toBeNull();
  });
});
