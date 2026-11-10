import { setSelectedHost } from '../features/host/hostSlice';
import { setActiveMainTab } from '../features/layout/layoutSlice';

/** The host a tab belongs to (host:<uid>, db:<uid>:<db>), or null. */
export function hostUidOfTab(tabId) {
  const parts = String(tabId ?? '').split(':');
  if (parts[0] === 'host' && parts[1]) return parts[1];
  if (parts[0] === 'db' && parts.length > 2 && parts[1]) return parts[1];
  return null;
}

/**
 * A click on a tab. App's effect selects the host of a newly active tab; a
 * click on the tab already shown does not change it, so its host is chosen
 * here (the host list may have highlighted another one since).
 */
export function chooseTab(dispatch, tabId, activeMainTab) {
  if (tabId === activeMainTab) {
    const hostUid = hostUidOfTab(tabId);
    if (hostUid) dispatch(setSelectedHost(hostUid));
  }
  dispatch(setActiveMainTab(tabId));
}
