import { useEffect, useSyncExternalStore } from 'react';
import { useLatestRef } from '../../infrastructure/hooks/useLatestRef';
import { adminApi } from './adminApi';

/** How often an administrator's screens ask for new sign-up requests. */
export const PENDING_POLL_MS = 60_000;

// One count for the whole app, so the header, the console's menu and the
// Accounts page agree, and a change on one (approve, reject) shows on all.
let count = null;
const listeners = new Set();
let inFlight = null;

function publish(next) {
  const previous = count;
  count = next;
  for (const listener of listeners) listener(next, previous);
}

// For useSyncExternalStore: every screen reads the one count.
function subscribe(listener) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}
const getCount = () => count;

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
  const value = useSyncExternalStore(subscribe, getCount);
  const onIncreaseRef = useLatestRef(onIncrease);

  useEffect(() => {
    if (!enabled) return undefined;
    // Not for the first answer this screen sees: only a rise after it.
    let seen = count !== null;
    const unsubscribe = subscribe((next, previous) => {
      if (seen && previous !== null && next > previous) onIncreaseRef.current?.(next - previous, next);
      seen = true;
    });
    void refreshPendingApprovals();

    const timer = setInterval(() => void refreshPendingApprovals(), PENDING_POLL_MS);
    const onVisible = () => {
      if (document.visibilityState === 'visible') void refreshPendingApprovals();
    };
    document.addEventListener('visibilitychange', onVisible);
    window.addEventListener('focus', onVisible);
    return () => {
      unsubscribe();
      clearInterval(timer);
      document.removeEventListener('visibilitychange', onVisible);
      window.removeEventListener('focus', onVisible);
    };
  }, [enabled, onIncreaseRef]);

  return enabled ? value : null;
}

/** The shared count without asking the server; null until someone has. */
export function usePendingCount() {
  return useSyncExternalStore(subscribe, getCount);
}

/** For tests. */
export function resetPendingApprovals() {
  count = null;
  inFlight = null;
  listeners.clear();
}
