import { useState } from 'react';

const NEVER = Symbol('never');

// Like an effect's dependency check, except that two arrays with the same
// items count as the same list: a list built on every render (`x || []`)
// would otherwise reset on every render, without end.
function sameDep(a, b) {
  if (Object.is(a, b)) return true;
  return Array.isArray(a) && Array.isArray(b) && a.length === b.length && a.every((item, i) => Object.is(item, b[i]));
}

/**
 * Calls `reset` during render on the first render and whenever one of `deps`
 * changes (compared like effect dependencies), for state that must follow a
 * prop, a store value or another state: what `useEffect(reset, deps)` did,
 * but React applies the state set here before this render's output is shown,
 * so nothing is shown with the old state in between ("Storing information
 * from previous renders" in the React docs). `reset` may only set this
 * component's state; anything else (a dispatch, a request, a ref) belongs in
 * an effect. `reset` gets the previous deps (undefined on the first render).
 */
export function useResetWhen(deps, reset) {
  const [seen, setSeen] = useState(NEVER);
  if (seen === NEVER || seen.length !== deps.length || deps.some((dep, i) => !sameDep(dep, seen[i]))) {
    setSeen(deps);
    reset(seen === NEVER ? undefined : seen);
  }
}
