import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, beforeEach, expect, it } from 'vitest';
import { DropdownMenu, SubMenu, MenuItem } from './DropdownMenu';

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
  delete globalThis.IS_REACT_ACT_ENVIRONMENT;
});

const renderMenus = () => act(async () => {
  root.render(
    <>
      <div data-testid="scroller" style={{ overflowX: 'auto' }}>
        <DropdownMenu label="Tools">
          <SubMenu label="Config">
            <MenuItem label="Broker" onClick={() => undefined} />
          </SubMenu>
        </DropdownMenu>
      </div>
      <div data-testid="unrelated" style={{ overflowY: 'auto' }} />
    </>,
  );
});

const openSubMenu = async () => {
  await act(async () => {
    container.querySelector('button[aria-haspopup="menu"]').click();
  });
  const subMenuButton = [...container.querySelectorAll('button[aria-haspopup="menu"]')]
    .find((button) => button.textContent.includes('Config'));
  await act(async () => subMenuButton.click());
  return subMenuButton;
};

const subMenuPortal = () => [...document.body.querySelectorAll('[role="menu"]')]
  .find((menu) => !container.contains(menu));

const scroll = (target) => act(async () => {
  target.dispatchEvent(new Event('scroll'));
});

it('closes an open submenu when an ancestor scroll container scrolls', async () => {
  await renderMenus();
  const subMenuButton = await openSubMenu();
  expect(subMenuPortal()).toBeTruthy();

  await scroll(container.querySelector('[data-testid="scroller"]'));

  expect(subMenuPortal()).toBeUndefined();
  expect(subMenuButton.getAttribute('aria-expanded')).toBe('false');
  // The parent dropdown is absolutely positioned and moves with the scroll, so it stays open.
  expect(container.querySelector('[role="menu"]')).toBeTruthy();
});

it('keeps the submenu open for scrolls inside it or in unrelated containers', async () => {
  await renderMenus();
  await openSubMenu();

  await scroll(subMenuPortal());
  await scroll(container.querySelector('[data-testid="unrelated"]'));

  expect(subMenuPortal()).toBeTruthy();
});

const withLayout = async ({ viewport, parentRect, menuSize }, run) => {
  const restorers = [];
  const override = (target, prop, descriptor) => {
    const original = Object.getOwnPropertyDescriptor(target, prop);
    Object.defineProperty(target, prop, { configurable: true, ...descriptor });
    restorers.push(() => {
      if (original) Object.defineProperty(target, prop, original);
      else delete target[prop];
    });
  };
  const isPortalMenu = (el) => el.getAttribute('role') === 'menu' && !container.contains(el);
  const isSubMenuRow = (el) => el.firstElementChild?.matches?.('button[aria-haspopup="menu"]') && el.textContent.includes('Config');
  override(window, 'innerWidth', { value: viewport.width });
  override(window, 'innerHeight', { value: viewport.height });
  override(HTMLElement.prototype, 'offsetWidth', { get() { return isPortalMenu(this) ? menuSize.width : 0; } });
  override(HTMLElement.prototype, 'offsetHeight', { get() { return isPortalMenu(this) ? menuSize.height : 0; } });
  override(HTMLElement.prototype, 'getBoundingClientRect', {
    value() {
      if (isSubMenuRow(this)) return { ...parentRect, width: parentRect.right - parentRect.left, height: parentRect.bottom - parentRect.top };
      // The submenu opens at scale(0.95), and getBoundingClientRect includes transforms.
      const scale = isPortalMenu(this) ? 0.95 : 0;
      return { top: 0, left: 0, right: 0, bottom: 0, width: menuSize.width * scale, height: menuSize.height * scale };
    },
  });
  try {
    await run();
  } finally {
    while (restorers.length) restorers.pop()();
  }
};

const portalBox = () => {
  const menu = subMenuPortal();
  return { top: parseFloat(menu.style.top), left: parseFloat(menu.style.left) };
};

it('keeps a submenu inside a window too narrow for either side of its parent row', async () => {
  const menuSize = { width: 224, height: 120 };
  await withLayout({ viewport: { width: 400, height: 800 }, parentRect: { top: 100, bottom: 136, left: 100, right: 300 }, menuSize }, async () => {
    await renderMenus();
    await openSubMenu();
    const { left } = portalBox();
    expect(left).toBeGreaterThanOrEqual(20);
    expect(left + menuSize.width).toBeLessThanOrEqual(400 - 20);
  });
});

it('keeps the whole untransformed submenu above the bottom edge', async () => {
  const menuSize = { width: 224, height: 400 };
  await withLayout({ viewport: { width: 1200, height: 800 }, parentRect: { top: 390, bottom: 426, left: 100, right: 300 }, menuSize }, async () => {
    await renderMenus();
    await openSubMenu();
    const { top } = portalBox();
    // 390 + 0.95 * 400 still fits, 390 + 400 does not.
    expect(top + menuSize.height).toBeLessThanOrEqual(800 - 20);
  });
});

const renderItem = (props) => act(async () => {
  root.render(<MenuItem label="Rename" onClick={() => undefined} {...props} />);
});

it('exposes the title of a disabled item on a hoverable wrapper', async () => {
  await renderItem({ disabled: true, title: 'Not available' });
  const item = container.querySelector('[role="menuitem"]');
  expect(item.disabled).toBe(true);
  // Disabled buttons do not get mouse events in every browser, so the
  // tooltip has to hang off an element that does.
  const titled = item.closest('[title]');
  expect(titled).toBeTruthy();
  expect(titled).not.toBe(item);
  expect(titled.getAttribute('title')).toBe('Not available');
  expect(item.className).toContain('pointer-events-none');
});

it('puts the title on an enabled item directly', async () => {
  await renderItem({ title: 'Rename this database' });
  const item = container.querySelector('[role="menuitem"]');
  expect(item.getAttribute('title')).toBe('Rename this database');
  expect(item.parentElement).toBe(container);
});

it('renders no wrapper or title when none is given', async () => {
  await renderItem({ disabled: true });
  const item = container.querySelector('[role="menuitem"]');
  expect(item.closest('[title]')).toBeNull();
  expect(item.parentElement).toBe(container);
});
