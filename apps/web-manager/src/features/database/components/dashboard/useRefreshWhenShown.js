import { useEffect, useRef } from 'react';

/**
 * Refreshes a dashboard section when it comes into view: when it is expanded,
 * or when its tab becomes active again (a tab switch or a closed modal).
 *
 * With auto refresh on, the dashboard itself refetches every section when its
 * tab becomes active again (usePollingRefresh's tab resume). Refreshing the
 * section then too would fetch the same data twice, including a lockdb that
 * can take tens of seconds on a database with many locks, so in that case
 * only an expand refreshes here.
 */
export function useRefreshWhenShown({ hostUid, dbname, isTabActive, isCollapsed, refreshInterval }, refresh) {
  const shownRef = useRef({ active: isTabActive, expanded: !isCollapsed });
  useEffect(() => {
    const was = shownRef.current;
    shownRef.current = { active: isTabActive, expanded: !isCollapsed };
    if (!isTabActive || isCollapsed) return;
    const dashboardRefreshes = refreshInterval > 0;
    if (!was.expanded || (!was.active && !dashboardRefreshes)) refresh();
  }, [isTabActive, isCollapsed, refreshInterval, hostUid, dbname]);
}
