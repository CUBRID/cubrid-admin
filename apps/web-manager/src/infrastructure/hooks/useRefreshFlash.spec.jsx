import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { Icon } from '../../components/ds/foundation/Icon';
import { useRefreshFlash } from './useRefreshFlash';

let container;
let root;
let flashing;

beforeEach(() => {
  globalThis.IS_REACT_ACT_ENVIRONMENT = true;
  vi.useFakeTimers();
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
});

afterEach(async () => {
  await act(async () => root.unmount());
  container.remove();
  vi.useRealTimers();
  delete globalThis.IS_REACT_ACT_ENVIRONMENT;
});

function Harness({ refreshCounter }) {
  flashing = useRefreshFlash(refreshCounter);
  return (
    <>
      <button type="button" data-testid="refresh"><Icon name="refresh" /> Refresh</button>
      <div role="menuitem" data-testid="menu-refresh"><Icon name="refresh" /><span>Refresh</span></div>
      <button type="button" data-testid="other"><Icon name="close" /> Close</button>
    </>
  );
}
const render = (refreshCounter = 0) => act(async () => root.render(<Harness refreshCounter={refreshCounter} />));
const click = (id) => act(async () => container.querySelector(`[data-testid="${id}"] span`).click());

it('flashes when the user presses a refresh button or menu item, then fades', async () => {
  await render();
  expect(flashing).toBe(false);
  await click('refresh');
  expect(flashing).toBe(true);
  await act(async () => vi.advanceTimersByTime(400));
  expect(flashing).toBe(false);
  await click('menu-refresh');
  expect(flashing).toBe(true);
});

it('does not flash for other buttons', async () => {
  await render();
  await click('other');
  expect(flashing).toBe(false);
});

it('flashes on a refresh of the active tab, not when first shown', async () => {
  await render(0);
  expect(flashing).toBe(false);
  await render(1);
  expect(flashing).toBe(true);
});
