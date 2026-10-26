import { useState, useEffect, useRef, useCallback } from 'react';
import { useSelector, useDispatch } from 'react-redux';

/**
 * A custom hook to manage background data polling, visibility-aware refresh,
 * and global F5 / Ctrl+R refresh synchronization for dashboard components.
 * 
 * @param {Object} options
 * @param {string} options.hostUid - The current host UID.
 * @param {string} options.tabId - The exact tab ID to check if this view is active (e.g., `brokers_status:${hostUid}`).
 * @param {number} options.pollingIntervalSeconds - The interval in seconds to poll for updates. Set to 0 to disable.
 * @param {Function} options.onFetch - A function that returns a thunk/promise to fetch the data.
 * 
 * @returns {Object} { isManualRefreshing, lastRefreshed, handleRefresh }
 */
export const usePollingRefresh = ({ hostUid, tabId, pollingIntervalSeconds, onFetch }) => {
  const dispatch = useDispatch();
  
  // We use shallowEqual in your app, but for these simple primitive states, normal selector is fine.
  const { authorizedHosts } = useSelector((state) => state.host);
  const { refreshCounter, activeMainTab } = useSelector((state) => state.layout);

  const [isManualRefreshing, setIsManualRefreshing] = useState(false);
  const [lastRefreshed, setLastRefreshed] = useState(new Date());

  const [isBrowserVisible, setIsBrowserVisible] = useState(document.visibilityState === 'visible');
  
  // A tab is "truly active" if the browser is visible AND it is the current foreground tab.
  const isTabActive = isBrowserVisible && activeMainTab === tabId;
  
  const isActiveRef = useRef(isTabActive);
  const initialLoadDone = useRef(false);
  // Guards every trigger path (initial load, polling tick, tab resume,
  // global refresh, online recovery) against overlapping with an
  // already-in-flight fetch — see handleRefresh for why this matters.
  const isFetchingRef = useRef(false);
  // A global refresh (F5 / triggerRefreshActiveTab) that lands while a fetch
  // is in flight can't just be skipped like a poll tick: that fetch may have
  // been sent before whatever the refresh was asked for (e.g. a broker
  // start/stop) and return pre-action data. Run one more fetch once it settles.
  const pendingRefreshRef = useRef(false);
  // Kept pointing at the latest handleRefresh (see below) — also lets
  // handleRefresh run the queued refresh with the latest onFetch closure.
  const handleRefreshRef = useRef(null);

  // 1. Browser Visibility Listener
  useEffect(() => {
    const handleVisibilityChange = () => setIsBrowserVisible(document.visibilityState === 'visible');
    document.addEventListener('visibilitychange', handleVisibilityChange);
    return () => document.removeEventListener('visibilitychange', handleVisibilityChange);
  }, []);

  const handleRefresh = useCallback(async (silent = false) => {
    // Only attempt to fetch if the host is authorized, or if it's the global dashboard
    const isAuthorized = hostUid === 'global' || (hostUid && authorizedHosts.includes(hostUid));
    if (!isAuthorized) return;
    // If a fetch triggered by ANY path (initial load, a poll tick, tab
    // resume, global refresh, network recovery) is still in flight, skip —
    // see the Polling Timer effect below for why letting fetches overlap is
    // actively harmful, not just wasteful.
    if (isFetchingRef.current) return;
    isFetchingRef.current = true;
    if (!silent) setIsManualRefreshing(true);
    try {
      const result = await dispatch(onFetch(silent));
      // Safely handle Redux thunk results that have .unwrap()
      if (result && typeof result.unwrap === 'function') {
        await result.unwrap();
      }
      setLastRefreshed(new Date());
    } catch (err) {
      console.error(`Failed to refresh data for ${tabId}:`, err);
    } finally {
      isFetchingRef.current = false;
      if (!silent) setIsManualRefreshing(false);
      if (pendingRefreshRef.current) {
        pendingRefreshRef.current = false;
        handleRefreshRef.current?.();
      }
    }
  }, [dispatch, hostUid, authorizedHosts, onFetch, tabId]);

  // Callers pass `onFetch` as an inline closure that's recreated every render,
  // so `handleRefresh` itself gets a new identity every render too. Effects
  // below that need to fire the LATEST refresh without tearing down and
  // rebuilding a live timer/listener on every unrelated re-render read this
  // ref instead of depending on `handleRefresh` directly.
  useEffect(() => {
    handleRefreshRef.current = handleRefresh;
  }, [handleRefresh]);

  const lastProcessedCounterRef = useRef(refreshCounter);
  // 2. Global Refresh (F5 / Ctrl+R) Listener — gated on this being the
  // foreground app tab, not on browser visibility. F5 can't land while the
  // window is hidden, so a refresh requested then comes from code (e.g. a
  // broker start/stop finishing, see refreshAfterBrokerAction); skipping it
  // would consume the request, and with polling off nothing refetches later.
  const isForegroundTab = activeMainTab === tabId;
  useEffect(() => {
    if (refreshCounter > lastProcessedCounterRef.current) {
      lastProcessedCounterRef.current = refreshCounter;
      if (isForegroundTab) {
        if (isFetchingRef.current) pendingRefreshRef.current = true;
        else handleRefresh();
      }
    }
  }, [refreshCounter, handleRefresh, isForegroundTab]);

  // Don't fire a queued refresh from a fetch that settles after unmount.
  useEffect(() => () => { pendingRefreshRef.current = false; }, []);

  // 3. Initial Load & Recovery
  const wasAuthorizedRef = useRef(false);
  useEffect(() => {
    const isAuthorized = hostUid === 'global' || (hostUid && authorizedHosts.includes(hostUid));
    
    // For the global dashboard, wait until at least one host is authorized before marking done.
    // Otherwise the fetch is skipped (no hosts yet) and never retried after hosts become available.
    if (hostUid === 'global' && authorizedHosts.length === 0) {
      wasAuthorizedRef.current = false;
      return;
    }

    if (!isAuthorized) {
      wasAuthorizedRef.current = false;
      return;
    }

    if (!initialLoadDone.current || !wasAuthorizedRef.current) {
      initialLoadDone.current = true;
      wasAuthorizedRef.current = true;
      handleRefresh();
    }
  }, [hostUid, authorizedHosts, handleRefresh]);

  // 4. On Tab Resume
  useEffect(() => {
    const becameActive = !isActiveRef.current && isTabActive;
    isActiveRef.current = isTabActive;
    // If we just switched to this tab, and we've already done the initial load, and polling is enabled: refresh silently.
    if (becameActive && initialLoadDone.current && pollingIntervalSeconds > 0) {
      handleRefresh(true);
    }
  }, [isTabActive, handleRefresh, pollingIntervalSeconds]);

  // 5. Polling Timer — deliberately NOT depending on `handleRefresh` (see
  // handleRefreshRef above): callers pass a fresh `onFetch` closure every
  // render, so depending on it here would tear down and restart this timer
  // on every unrelated re-render, and a component that re-renders faster
  // than the interval would never let it actually elapse.
  //
  // A tick that lands while a fetch is still in flight (from ANY trigger —
  // see isFetchingRef in handleRefresh) is a no-op, not just wasted work: if
  // a single fetch ever takes longer than the interval, every subsequent
  // tick would otherwise start its own overlapping request. Some consumers
  // (e.g. brokerSlice's fetchBrokerList) dedupe by "latest request wins" —
  // under sustained overlap, a newer request is *always* already pending by
  // the time any older one resolves, so every response gets discarded as
  // stale forever and the data never updates again.
  useEffect(() => {
    if (!isTabActive || pollingIntervalSeconds <= 0) return;

    const timer = setInterval(() => {
      // Extra safety check to avoid overlapping fetches if the user spams tabs
      if (isActiveRef.current) {
        handleRefreshRef.current(true);
      }
    }, pollingIntervalSeconds * 1000);

    return () => clearInterval(timer);
  }, [isTabActive, pollingIntervalSeconds]);

  // 6. Network Recovery — re-fetch immediately when the browser comes back online,
  // but only if this view is the active foreground tab (same guard as the polling timer).
  useEffect(() => {
    const handleOnline = () => {
      if (initialLoadDone.current && isActiveRef.current) {
        handleRefresh(true);
      }
    };
    window.addEventListener('online', handleOnline);
    return () => window.removeEventListener('online', handleOnline);
  }, [handleRefresh]);

  return { isManualRefreshing, lastRefreshed, handleRefresh };
};
