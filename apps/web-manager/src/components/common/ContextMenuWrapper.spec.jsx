import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, beforeEach, expect, it } from 'vitest';
import ContextMenuWrapper from './ContextMenuWrapper';

const PADDING = 18;
const VIEWPORT = { width: 1000, height: 800 };

let container;
let root;
let menuSize;
const restorers = [];

const override = (target, prop, descriptor) => {
  const original = Object.getOwnPropertyDescriptor(target, prop);
  Object.defineProperty(target, prop, { configurable: true, ...descriptor });
  restorers.push(() => {
    if (original) Object.defineProperty(target, prop, original);
    else delete target[prop];
  });
};

beforeEach(() => {
  globalThis.IS_REACT_ACT_ENVIRONMENT = true;
  menuSize = { width: 240, height: 300 };
  override(window, 'innerWidth', { value: VIEWPORT.width });
  override(window, 'innerHeight', { value: VIEWPORT.height });
  const isMenu = (el) => el.getAttribute('role') === 'menu';
  override(HTMLElement.prototype, 'offsetWidth', { get() { return isMenu(this) ? menuSize.width : 0; } });
  override(HTMLElement.prototype, 'offsetHeight', { get() { return isMenu(this) ? menuSize.height : 0; } });
  // The menu opens at scale(0.95), and getBoundingClientRect includes transforms.
  override(HTMLElement.prototype, 'getBoundingClientRect', {
    value() {
      const scale = isMenu(this) ? 0.95 : 0;
      return { top: 0, left: 0, right: 0, bottom: 0, x: 0, y: 0, width: menuSize.width * scale, height: menuSize.height * scale };
    },
  });
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
});

afterEach(async () => {
  await act(async () => root.unmount());
  container.remove();
  while (restorers.length) restorers.pop()();
  delete globalThis.IS_REACT_ACT_ENVIRONMENT;
});

const renderAt = (x, y) => act(async () => {
  root.render(
    <ContextMenuWrapper x={x} y={y} onClose={() => undefined}>
      <button type="button">Item</button>
    </ContextMenuWrapper>,
  );
});

const menuBox = () => {
  const menu = container.querySelector('[role="menu"]');
  return { menu, top: parseFloat(menu.style.top), left: parseFloat(menu.style.left) };
};

const expectInsideViewport = ({ top, left }) => {
  expect(top).toBeGreaterThanOrEqual(PADDING);
  expect(left).toBeGreaterThanOrEqual(PADDING);
  expect(top + menuSize.height).toBeLessThanOrEqual(VIEWPORT.height - PADDING);
  expect(left + menuSize.width).toBeLessThanOrEqual(VIEWPORT.width - PADDING);
};

it('flips up and left when opened near the bottom-right corner', async () => {
  await renderAt(900, 760);
  const box = menuBox();
  expect(box.top).toBe(760 - menuSize.height);
  expect(box.left).toBe(900 - menuSize.width);
  expectInsideViewport(box);
});

it('keeps the whole untransformed menu inside the viewport, not just its scaled-down opening frame', async () => {
  menuSize = { width: 240, height: 700 };
  // 110 + 700 runs past the bottom even though 110 + 0.95 * 700 does not.
  await renderAt(100, 110);
  expectInsideViewport(menuBox());
});

it('scrolls a menu that is taller than the viewport instead of letting items spill off-screen', async () => {
  menuSize = { width: 240, height: VIEWPORT.height - 2 * PADDING };
  await renderAt(100, 600);
  const box = menuBox();
  expect(box.top).toBe(PADDING);
  expect(box.menu.className).toContain('overflow-y-auto');
});

it('repositions when reopened at new coordinates without unmounting', async () => {
  await renderAt(100, 100);
  expect(menuBox().top).toBe(100);

  await renderAt(900, 760);
  const box = menuBox();
  expect(box.top).toBe(760 - menuSize.height);
  expectInsideViewport(box);
});

it('re-clamps when the window shrinks while the menu is open', async () => {
  await renderAt(500, 400);
  expect(menuBox().top).toBe(400);

  override(window, 'innerHeight', { value: 500 });
  await act(async () => window.dispatchEvent(new Event('resize')));
  const { top } = menuBox();
  expect(top + menuSize.height).toBeLessThanOrEqual(500 - PADDING);
});
