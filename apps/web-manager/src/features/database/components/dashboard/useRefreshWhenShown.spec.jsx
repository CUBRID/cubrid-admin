import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { useRefreshWhenShown } from './useRefreshWhenShown';

let container;
let root;
let refresh;

function Section(props) {
  useRefreshWhenShown({ hostUid: 'h1', dbname: 'demodb', ...props }, refresh);
  return null;
}

beforeEach(() => {
  globalThis.IS_REACT_ACT_ENVIRONMENT = true;
  refresh = vi.fn();
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
});

afterEach(async () => {
  await act(async () => root.unmount());
  container.remove();
  delete globalThis.IS_REACT_ACT_ENVIRONMENT;
});

const render = (props) => act(async () => root.render(<Section {...props} />));

it('refreshes when the section is expanded', async () => {
  await render({ isTabActive: true, isCollapsed: true, refreshInterval: 3 });
  await render({ isTabActive: true, isCollapsed: false, refreshInterval: 3 });
  expect(refresh).toHaveBeenCalledTimes(1);
});

it('leaves a tab resume to the dashboard while auto refresh is on', async () => {
  await render({ isTabActive: false, isCollapsed: false, refreshInterval: 3 });
  await render({ isTabActive: true, isCollapsed: false, refreshInterval: 3 });
  expect(refresh).not.toHaveBeenCalled();
});

it('refreshes on a tab resume when auto refresh is off', async () => {
  await render({ isTabActive: false, isCollapsed: false, refreshInterval: 0 });
  await render({ isTabActive: true, isCollapsed: false, refreshInterval: 0 });
  expect(refresh).toHaveBeenCalledTimes(1);
});

it('does nothing while the tab is inactive or the section collapsed', async () => {
  await render({ isTabActive: false, isCollapsed: true, refreshInterval: 0 });
  await render({ isTabActive: false, isCollapsed: false, refreshInterval: 0 });
  await render({ isTabActive: true, isCollapsed: true, refreshInterval: 0 });
  expect(refresh).not.toHaveBeenCalled();
});
