import React, { act, useEffect, useLayoutEffect } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { useLatestRef } from './useLatestRef';

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

describe('useLatestRef', () => {
  it('holds the value of the current commit for effects, written in a layout effect, not during render', async () => {
    const seen = { render: [], layout: [], effect: [] };
    function Probe({ value }) {
      const ref = useLatestRef(value);
      seen.render.push(ref.current);
      useLayoutEffect(() => { seen.layout.push(ref.current); });
      useEffect(() => { seen.effect.push(ref.current); });
      return null;
    }
    await render(<Probe value={1} />);
    await render(<Probe value={2} />);
    // During the second render the ref still holds the first commit's value.
    expect(seen.render).toEqual([1, 1]);
    // The write is a layout effect of the hook, so later layout effects and
    // the effects of the same commit read the new value.
    expect(seen.layout).toEqual([1, 2]);
    expect(seen.effect).toEqual([1, 2]);
  });

  it('keeps the same ref object across renders', async () => {
    const refs = [];
    function Probe({ value }) {
      refs.push(useLatestRef(value));
      return null;
    }
    await render(<Probe value="a" />);
    await render(<Probe value="b" />);
    expect(refs[0]).toBe(refs[1]);
    expect(refs[0].current).toBe('b');
  });
});
