import { useSyncExternalStore } from 'react';

// How many modals are open right now. Every modal covers the whole app with a
// blurred backdrop, so while one is open nothing behind it can be read and
// polling for it only delays the modal's own requests (a host's CMS requests
// run one at a time).
let openCount = 0;
const listeners = new Set();
const notify = () => listeners.forEach((listener) => listener());

/** Counts one modal as open until the returned function is called. */
export const markModalOpen = () => {
  openCount += 1;
  notify();
  let closed = false;
  return () => {
    if (closed) return;
    closed = true;
    openCount -= 1;
    notify();
  };
};

const subscribe = (listener) => {
  listeners.add(listener);
  return () => listeners.delete(listener);
};
const isAnyOpen = () => openCount > 0;

/** True while any modal is open. Polling of what is behind it pauses. */
export const useAnyModalOpen = () => useSyncExternalStore(subscribe, isAnyOpen, isAnyOpen);
