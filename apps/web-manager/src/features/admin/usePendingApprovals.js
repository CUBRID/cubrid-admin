import { useEffect, useRef, useState } from 'react';
import { adminApi } from './adminApi';

/** How often an administrator's screens ask for new sign-up requests. */
export const PENDING_POLL_MS = 60_000;

// One count for the whole app, so the header, the console's menu and the
// Accounts page agree, and a change on one (approve, reject) shows on all.
let count = null;
const listeners = new Set();
let inFlight = null;

function publish(next) {
  count = next;
  for (const listener of listeners) listener(next);
}

/**
 * Reads the count again now, e.g. after approving or rejecting. A failure
 * keeps the last count: the badge is a hint, and the list is the truth.
 */
export function refreshPendingApprovals() {
  if (inFlight) return inFlight;
  inFlight = Promise.resolve()
    .then(() => adminApi.countPending())
    .then((res) => {
      const n = Number(res?.count);
      if (Number.isFinite(n) && n >= 0) publish(n);
    })
    .catch(() => undefined)
    .finally(() => {
      inFlight = null;
    });
  return inFlight;
}

/**
 * Sign-ups awaiting approval, for administrators: null until known. While
 * `enabled`, it asks every PENDING_POLL_MS and when the window comes back
 * into view. `onIncrease(added, total)` runs when the count goes up after
 * the first answer, so a new request can be announced.
 */
export function usePendingApprovals(enabled, onIncrease) {
  const [value, setValue] = useState(enabled ? count : null);
  const onIncreaseRef = useRef(onIncrease);
  onIncreaseRef.current = onIncrease;

  useEffect(() => {
    if (!enabled) {
      setValue(null);
      return undefined;
    }
    let previous = count;
    const listener = (next) => {
      if (previous !== null && next > previous) onIncreaseRef.current?.(next - previous, next);
      previous = next;
      setValue(next);
    };
    listeners.add(listener);
    setValue(count);
    void refreshPendingApprovals();

    const timer = setInterval(() => void refreshPendingApprovals(), PENDING_POLL_MS);
    const onVisible = () => {
      if (document.visibilityState === 'visible') void refreshPendingApprovals();
    };
    document.addEventListener('visibilitychange', onVisible);
    window.addEventListener('focus', onVisible);
    return () => {
      listeners.delete(listener);
      clearInterval(timer);
      document.removeEventListener('visibilitychange', onVisible);
      window.removeEventListener('focus', onVisible);
    };
  }, [enabled]);

  return value;
}

/** The shared count without asking the server; null until someone has. */
export function usePendingCount() {
  const [value, setValue] = useState(count);
  useEffect(() => {
    listeners.add(setValue);
    setValue(count);
    return () => {
      listeners.delete(setValue);
    };
  }, []);
  return value;
}

/** For tests. */
export function resetPendingApprovals() {
  count = null;
  inFlight = null;
  listeners.clear();
}
