import React, { act, useLayoutEffect, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useResetEffect } from './useResetEffect';

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
const render = (element) => act(async () => root.render(element));

describe('useResetEffect', () => {
  it('calls reset on the first render, then only when a dependency changes', async () => {
    const reset = vi.fn();
    function Probe({ a, b }) {
      useResetEffect(reset, [a, b]);
      return null;
    }
    await render(<Probe a={1} b="x" />);
    expect(reset).toHaveBeenCalledTimes(1);
    await render(<Probe a={1} b="x" />);
    expect(reset).toHaveBeenCalledTimes(1);
    await render(<Probe a={2} b="x" />);
    expect(reset).toHaveBeenCalledTimes(2);
  });

  it('compares an array dependency by its items, so a list built on every render does not reset', async () => {
    const reset = vi.fn();
    function Probe({ names }) {
      useResetEffect(reset, [names || []]);
      return null;
    }
    await render(<Probe names={undefined} />);
    await render(<Probe names={undefined} />);
    expect(reset).toHaveBeenCalledTimes(1);
    await render(<Probe names={['a']} />);
    expect(reset).toHaveBeenCalledTimes(2);
    await render(<Probe names={['a']} />);
    expect(reset).toHaveBeenCalledTimes(2);
    await render(<Probe names={['a', 'b']} />);
    expect(reset).toHaveBeenCalledTimes(3);
  });

  it("passes this render's values first and the previous dependencies second, none on the first render", async () => {
    const reset = vi.fn();
    function Probe({ open, user }) {
      useResetEffect(reset, [open], { user });
      return null;
    }
    await render(<Probe open={false} user="u1" />);
    expect(reset).toHaveBeenLastCalledWith({ user: 'u1' }, undefined);
    await render(<Probe open user="u2" />);
    expect(reset).toHaveBeenLastCalledWith({ user: 'u2' }, [false]);
  });

  it('applies the state set in reset before the render output is shown', async () => {
    const shown = [];
    function Probe({ open }) {
      const [text, setText] = useState('closed');
      useResetEffect(() => setText(open ? 'open' : 'closed'), [open]);
      useLayoutEffect(() => { shown.push(container.textContent); });
      return <span>{text}</span>;
    }
    await render(<Probe open={false} />);
    await render(<Probe open />);
    expect(container.textContent).toBe('open');
    expect(shown).toEqual(['closed', 'open']);
  });
});
