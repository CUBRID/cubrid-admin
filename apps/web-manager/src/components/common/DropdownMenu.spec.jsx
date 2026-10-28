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
