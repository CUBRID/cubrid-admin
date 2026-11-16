import { useLayoutEffect, useRef } from 'react';

/**
 * A ref that always holds the latest `value`, for effects and callbacks that
 * read what the component has now without depending on it (so they do not
 * run again when it changes). The ref is written in a layout effect, before
 * the other effects of the same commit run, never during render.
 */
export function useLatestRef(value) {
  const ref = useRef(value);
  useLayoutEffect(() => {
    ref.current = value;
  });
  return ref;
}
