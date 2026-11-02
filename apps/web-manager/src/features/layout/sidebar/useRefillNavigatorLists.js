import { useEffect } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import { fetchDatabaseStartInfo } from '../../database/databaseCoreSlice';
import { fetchBrokerList } from '../../broker/brokerSlice';

/**
 * Reads the selected host's navigator lists when they are missing.
 *
 * Switching to another host drops the previous host's lists (see
 * useHostActivation), and returning to it by closing the other host's tab
 * only selects it; background polls never fill the navigator, so its trees
 * stayed empty. A list is read only when it is missing and no read that
 * fills it is running (host activation sends its own). A failed read leaves
 * an empty list, not a missing one, so this does not repeat.
 */
export function useRefillNavigatorLists() {
  const dispatch = useDispatch();
  const hostUid = useSelector((state) => state.host.selectedHostUid);
  const isAuthorized = useSelector((state) => Boolean(hostUid && state.host.authorizedHosts.includes(hostUid)));
  const needsDatabases = useSelector((state) =>
    state.database.navigatorDatabasesByHost?.[hostUid] === undefined && !state.database.loadingByHost?.[hostUid]);
  const needsBrokers = useSelector((state) =>
    state.broker.navigatorBrokersByHost?.[hostUid] === undefined && !state.broker.loadingByHost?.[hostUid]);

  useEffect(() => {
    if (!isAuthorized) return;
    if (needsDatabases) dispatch(fetchDatabaseStartInfo(hostUid));
    if (needsBrokers) dispatch(fetchBrokerList(hostUid));
  }, [dispatch, hostUid, isAuthorized, needsDatabases, needsBrokers]);
}
