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

  it('drops a dragged height once the rows fall to the limit', async () => {
    await render({ data: rows(40), maxRows: 15 });
    vi.spyOn(scrollArea(), 'getBoundingClientRect').mockReturnValue({ height: ROW_PX * 16 });
    await act(() => { grip().dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true })); });

    await render({ data: rows(5), maxRows: 15 });
    expect(scrollArea()).toBeNull();
    expect(grip()).toBeNull();

    await render({ data: rows(40), maxRows: 15 });
    expect(scrollArea().style.height).toBe('');
    expect(scrollArea().style.maxHeight).toBe(`${ROW_PX * 16}px`);
  });

  it('keeps the header in view while the page scrolls the table out of view', async () => {
    container.style.overflowY = 'auto';
    vi.spyOn(container, 'getBoundingClientRect').mockReturnValue({ top: 100 });
    await render({ data: rows(40), maxRows: 15 });
    const box = scrollArea();
    const thead = container.querySelector('thead');
    Object.defineProperty(box, 'clientHeight', { configurable: true, value: ROW_PX * 16 });
    const scrollTo = (top) => act(() => {
      vi.spyOn(box, 'getBoundingClientRect').mockReturnValue({ top });
      container.dispatchEvent(new Event('scroll'));
    });

    await scrollTo(40);
    expect(thead.style.top).toBe('60px');
    await scrollTo(-1000);
    expect(thead.style.top).toBe(`${ROW_PX * 15}px`);
    await scrollTo(120);
    expect(thead.style.top).toBe('');
  });

  it('does nothing without maxRows', async () => {
    await render({ data: rows(40) });
    expect(scrollArea()).toBeNull();
    expect(grip()).toBeNull();
  });

  it('keeps the caller className on the element that holds the sticky header', async () => {
    await render({ data: rows(40), stickyHeader: true, className: 'max-h-[180px] overflow-auto' });
    const thead = container.querySelector('thead');
    expect(thead.className).toContain('sticky');
    expect(thead.closest('table').parentElement.className).toContain('max-h-[180px]');
  });
});

describe('Table paginate', () => {
  const shown = () => [...container.querySelectorAll('tbody tr')].map((tr) => tr.textContent);
  const position = () => container.querySelector('[data-testid="table-pager-position"]')?.textContent;
  const click = (testId) => act(async () => {
    container.querySelector(`[data-testid="${testId}"]`).click();
  });

  it('shows every row and no pager when they fit in maxRows', async () => {
    await render({ data: rows(15), maxRows: 15, paginate: true });
    expect(shown()).toHaveLength(15);
    expect(container.querySelector('[data-testid="table-pager"]')).toBeNull();
  });

  it('splits longer tables into pages of maxRows - 1 rows instead of scrolling', async () => {
    await render({ data: rows(40), maxRows: 15, paginate: true });
    expect(shown()).toEqual(rows(14).map((r) => r.name));
    expect(position()).toBe('1 / 3');
    expect(scrollArea()).toBeNull();
    expect(grip()).not.toBeNull();
    expect(container.querySelector('[data-testid="table-pager-prev"]').disabled).toBe(true);

    await click('table-pager-next');
    await click('table-pager-next');
    expect(position()).toBe('3 / 3');
    expect(shown()).toEqual(rows(40).slice(28).map((r) => r.name));
    expect(container.querySelector('[data-testid="table-pager-next"]').disabled).toBe(true);
  });

  it('keeps the page and the sort across a refresh, and moves to the last page when it is gone', async () => {
    const numbered = (n) => Array.from({ length: n }, (_, i) => ({ name: `row-${String(i).padStart(2, '0')}` }));
    await render({ data: numbered(40), maxRows: 15, paginate: true, sortable: true });
    await click('table-pager-next'); // the first click on a header would go back to page 1
    await act(async () => container.querySelector('th').click()); // asc
    await act(async () => container.querySelector('th').click()); // desc
    await click('table-pager-next');
    expect(position()).toBe('2 / 3');
    expect(shown()[0]).toBe('row-25');

    await render({ data: numbered(40), maxRows: 15, paginate: true, sortable: true });
    expect(position()).toBe('2 / 3');
    expect(shown()[0]).toBe('row-25');

    await render({ data: numbered(20), maxRows: 15, paginate: true, sortable: true });
    expect(position()).toBe('2 / 2');
    expect(shown()).toEqual(['row-05', 'row-04', 'row-03', 'row-02', 'row-01', 'row-00']);
  });

  it('lets the grip set the rows a page shows, keeping the first row shown, and resets it', async () => {
    const key = (k) => act(async () => grip().dispatchEvent(new KeyboardEvent('keydown', { key: k, bubbles: true })));
    await render({ data: rows(40), maxRows: 15, paginate: true });
    await click('table-pager-next');
    expect(shown()[0]).toBe('row-14');

    await key('ArrowDown');
    expect(shown()).toHaveLength(15);
    expect(position()).toBe('1 / 3');
    expect(shown()).toContain('row-14');

    // A drag of 10 rows (ROW_PX each) down from 15 rows a page.
    await act(async () => {
      grip().dispatchEvent(new MouseEvent('pointerdown', { button: 0, clientY: 100, bubbles: true }));
      grip().dispatchEvent(new MouseEvent('pointermove', { clientY: 100 + ROW_PX * 10, bubbles: true }));
      grip().dispatchEvent(new MouseEvent('pointerup', { bubbles: true }));
    });
    expect(shown()).toHaveLength(25);
    expect(position()).toBe('1 / 2');

    await act(async () => grip().dispatchEvent(new MouseEvent('dblclick', { bubbles: true })));
    expect(shown()).toHaveLength(14);
    expect(grip()).not.toBeNull();
  });

  it('sorts every row, not just the page, and goes back to page 1', async () => {
    await render({ data: rows(40), maxRows: 15, paginate: true, sortable: true });
    await click('table-pager-next');
    await act(async () => container.querySelector('th').click());
    await act(async () => container.querySelector('th').click());
    expect(position()).toBe('1 / 3');
    expect(shown()[0]).toBe('row-9');
  });
});

describe('Table sort arrows', () => {
  const twoCols = [{ header: 'Name', accessor: 'name' }, { header: 'Size', accessor: 'size' }];
  const data = [{ name: 'b', size: 2 }, { name: 'a', size: 1 }];
  const header = (text) => [...container.querySelectorAll('th')].find((th) => th.textContent.startsWith(text));
  // An icon in the header's flex row takes room; one laid over the cell does not.
  const inlineIcon = (th) => th.querySelector(':scope > div > span:not(.truncate)');
  const overlayIcon = (th) => th.querySelector(':scope > div > span.absolute');

  it('gives only the sorted column an arrow that takes room; the others get an overlaid hover hint', async () => {
    await render({ columns: twoCols, data, sortable: true });
    for (const th of container.querySelectorAll('th')) {
      expect(overlayIcon(th)).not.toBeNull();
      expect(inlineIcon(th)).toBe(overlayIcon(th));
    }
    await act(async () => header('Name').click());
    expect(header('Name').querySelector(':scope > div > span.absolute')).toBeNull();
    expect(header('Name').querySelector(':scope > div > span.shrink-0')).not.toBeNull();
    expect(overlayIcon(header('Size'))).not.toBeNull();
    expect([...container.querySelectorAll('tbody tr')].map((tr) => tr.textContent)).toEqual(['a1', 'b2']);
  });

  it('stops ordering rows by a column that was hidden after sorting on it', async () => {
    await render({ columns: twoCols, data, sortable: true });
    await act(async () => header('Name').click());
    expect([...container.querySelectorAll('tbody tr')].map((tr) => tr.textContent)).toEqual(['a1', 'b2']);
    await render({ columns: [twoCols[1]], data, sortable: true });
    expect([...container.querySelectorAll('tbody tr')].map((tr) => tr.textContent)).toEqual(['2', '1']);
  });

  it('shows no arrow or hint on a table that does not sort', async () => {
    await render({ columns: twoCols, data });
    expect(container.querySelector('th span.absolute, th span.shrink-0')).toBeNull();
  });
});
