import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import GlobalTooltip, { TOOLTIP_DELAY_MS } from './GlobalTooltip';

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

let container;
let root;
let host;

const tooltip = () => document.querySelector('[data-testid="global-tooltip"]');
const over = (el, from = null) => act(() => {
  el.dispatchEvent(new MouseEvent('mouseover', { bubbles: true, relatedTarget: from }));
});
const out = (el, to = document.body) => act(() => {
  el.dispatchEvent(new MouseEvent('mouseout', { bubbles: true, relatedTarget: to }));
});
const wait = (ms) => act(() => { vi.advanceTimersByTime(ms); });

beforeEach(async () => {
  vi.useFakeTimers();
  container = document.createElement('div');
  host = document.createElement('div');
  host.innerHTML = '<span id="a" title="Full host name: production-db-01"><b id="inner">prod…</b></span><span id="b" title="Second">b</span><span id="blank" title="  ">c</span>';
  document.body.append(container, host);
  root = createRoot(container);
  await act(() => root.render(<GlobalTooltip />));
});

afterEach(async () => {
  await act(() => root.unmount());
  container.remove();
  host.remove();
  vi.useRealTimers();
});

describe('GlobalTooltip', () => {
  it('shows the title after the delay and keeps the native tooltip from showing meanwhile', async () => {
    const a = host.querySelector('#a');
    await over(host.querySelector('#inner'));

    expect(a.hasAttribute('title')).toBe(false);
    expect(tooltip()).toBeNull();

    await wait(TOOLTIP_DELAY_MS);
    expect(tooltip()?.textContent).toBe('Full host name: production-db-01');
  });

  it('puts the title back and hides when the pointer leaves', async () => {
    const a = host.querySelector('#a');
    await over(a);
    await wait(TOOLTIP_DELAY_MS);
    await out(a);

    expect(tooltip()).toBeNull();
    expect(a.getAttribute('title')).toBe('Full host name: production-db-01');
    expect(a.hasAttribute('data-nca-title')).toBe(false);
  });

  it('stays while the pointer moves inside the element', async () => {
    const a = host.querySelector('#a');
    await over(a);
    await wait(TOOLTIP_DELAY_MS);
    await out(a, host.querySelector('#inner'));

    expect(tooltip()?.textContent).toBe('Full host name: production-db-01');
  });

  it('shows the next tooltip at once when moving straight to another titled element', async () => {
    const a = host.querySelector('#a');
    const b = host.querySelector('#b');
    await over(a);
    await wait(TOOLTIP_DELAY_MS);
    await out(a, b);
    await over(b, a);
    await wait(0);

    expect(tooltip()?.textContent).toBe('Second');
    expect(a.getAttribute('title')).toBe('Full host name: production-db-01');
  });

  it('ignores blank titles and hides on click', async () => {
    await over(host.querySelector('#blank'));
    await wait(TOOLTIP_DELAY_MS);
    expect(tooltip()).toBeNull();
    expect(host.querySelector('#blank').getAttribute('title')).toBe('  ');

    const a = host.querySelector('#a');
    await over(a);
    await wait(TOOLTIP_DELAY_MS);
    await act(() => { window.dispatchEvent(new MouseEvent('mousedown')); });
    expect(tooltip()).toBeNull();
    expect(a.getAttribute('title')).toBe('Full host name: production-db-01');
  });
});
