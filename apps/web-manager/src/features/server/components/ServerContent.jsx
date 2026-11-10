import { usePollingRefresh } from '../../../infrastructure/hooks/usePollingRefresh';
import { useAnyModalOpen } from '../../../infrastructure/hooks/useAnyModalOpen';
import React, { useState, useRef, useEffect, useCallback } from 'react';
import { useSelector, useDispatch , shallowEqual } from 'react-redux';
import { hostApi } from '../../host/hostApi';
import { fetchHostEnv } from '../../host/hostSlice';
import { fetchDatabaseStartInfo } from '../../database/databaseSlice';
import { fetchBrokerList } from '../../broker/brokerSlice';
import DatabaseVolumes from './DatabaseVolumes';
import Brokers from './Brokers';
import SystemInfo from './SystemInfo';
import { fetchMonitoringData, fetchHaHeartbeatOnly, fetchHaNodesOnly } from '../monitoringSlice';
import { isHaClusterMissingMaster, getHaDbServerModes } from '../../host/haPeerUtils';

import SystemStatusSection from './server/SystemStatusSection';
import HostReadErrorBanner from './server/HostReadErrorBanner';
import DatabaseListSection from './server/DatabaseListSection';
import HaClusterStatusSection from './server/HaClusterStatusSection';
import MonitoringSettingsPopover from '../../user/components/MonitoringSettingsPopover';
import { Typography } from '../../../components/ds/foundation/Typography';
import { Icon } from '../../../components/ds/foundation/Icon';
import { useCM } from '../../../constants/useCM';
import { autoStartDatabases } from '@api-interfaces';

// See the HA-abnormal fast-poll effect below.
const HA_ABNORMAL_POLL_INTERVAL_MS = 1000;
const HA_ABNORMAL_POLL_MAX_MS = 30000;
// Stable fallback so a selector without reconnectQueue (older persisted
// state, a test mock) doesn't crash the .includes() check below.
const EMPTY_RECONNECT_QUEUE = [];

const Component = function ServerContent({ hostUid }) {
  const CM = useCM();
  const dispatch = useDispatch();

  // The host's shared lists hold the newest read or action result for it
  // (applied in the order they were read), so a database started or stopped
  // anywhere shows here at once instead of on the next tick. Focusing another
  // host clears them (resetDatabaseState), so this tab's own last read stands
  // in until they are filled again.
  const sharedDatabases = useSelector((state) => state.database.databasesByHost[hostUid]);
  const sharedActiveDatabases = useSelector((state) => state.database.activeDatabasesByHost[hostUid]);
  const [lastReadDatabases, setDatabases] = useState([]);
  // 'loading' until the first database-list fetch settles, then 'loaded' or
  // 'error', so sections built on it don't read an empty list as "no databases".
  const [dbListStatus, setDbListStatus] = useState('loading');
  // The last database list read's failure, cleared by the next success.
  const [startInfoError, setStartInfoError] = useState(null);
  const [lastReadActiveDatabases, setActiveDatabases] = useState([]);
  const databases = sharedDatabases ?? lastReadDatabases;
  const activeDatabases = sharedActiveDatabases ?? lastReadActiveDatabases;
  const { hosts, authorizedHosts, haInfo, reconnectQueue = EMPTY_RECONNECT_QUEUE } = useSelector((state) => state.host, shallowEqual);
  const { preferences } = useSelector((state) => state.user, shallowEqual);

  const [autoStartDBs, setAutoStartDBs] = useState([]);
  const [, setAutoStartReady] = useState(false);
  // Bumped on every refresh of this dashboard while it is open (the button,
  // F5, the first load and its background ticks): the storage volume table
  // (DatabaseVolumes) re-reads volume-info for the logged-in running
  // databases then. Nothing reads it while no dashboard shows it.
  const [volumesRefreshKey, setVolumesRefreshKey] = useState(0);
  const autoStartReadVersion = useRef(0);
  const autoStartWritePending = useRef(false);
  
  const currentHost = hosts.find(h => h.uid === hostUid);
  const hostHaInfo = haInfo[hostUid] || {};
  const isHA = hostHaInfo.isHA;
  const hostLabel = currentHost ? (currentHost.alias || currentHost.id) : CM.unknownHost;
  const hostData = useSelector((state) => state.monitoring.hostsData[hostUid] || {});

  // The system status section is read by this refresh while it is expanded,
  // so its broker list is the one fetchBrokerList below is reading.
  const systemStatusExpanded = useRef(true);
  const [isSystemStatusExpanded, setIsSystemStatusExpanded] = useState(true);
  const handleSystemStatusExpanded = useCallback((expanded) => {
    systemStatusExpanded.current = expanded;
    setIsSystemStatusExpanded(expanded);
  }, []);

  const { isManualRefreshing: isRefreshing, lastRefreshed, handleRefresh } = usePollingRefresh({
    hostUid,
    tabId: `host:${hostUid}`,
    pollingIntervalSeconds: preferences.dashboardInterval,
    onFetch: (silent) => async (dispatch) => {
      // 1. First fetch database status to get the current active list
      let dbInfo;
      try {
        dbInfo = await dispatch(fetchDatabaseStartInfo(silent ? { hostUid, isBackground: true } : hostUid)).unwrap();
      } catch (err) {
        setDbListStatus('error');
        setStartInfoError(err);
        throw err;
      }
      setDbListStatus('loaded');
      setStartInfoError(null);
      const newDatabases = dbInfo.dblist?.dbs || [];
      const newActiveDatabases = (dbInfo.activelist?.active || []).map((d) => d.dbname);
      setDatabases(newDatabases);
      setActiveDatabases(newActiveDatabases);
      // Same render as the list above, so the volume table reads once with
      // the list it was asked to show, on every refresh of the open
      // dashboard (background ticks too; a failed read keeps the last rows).
      setVolumesRefreshKey((key) => key + 1);

      // 2. Then fetch other data, using the just-fetched active databases list.
      // fetchBrokerList goes first: the system status (fetchMonitoringData,
      // also the HA heartbeat) takes that broker list read instead of its own.
      await Promise.all([
        dispatch(fetchBrokerList(silent ? { hostUid, isBackground: true } : hostUid)),
        dispatch(fetchHostEnv(hostUid)),
        fetchAutoStartInfo(),
        isHA || systemStatusExpanded.current ? dispatch(fetchMonitoringData(hostUid)) : Promise.resolve()
      ]);
    }
  });

  const fetchAutoStartInfo = async (afterWrite = false) => {
    // Background refreshes must not publish a pre-write configuration while
    // the user is changing it. The write performs its own authoritative read.
    if (autoStartWritePending.current && !afterWrite) return;
    const version = ++autoStartReadVersion.current;
    try {
      const response = await hostApi.getHostConfig(hostUid, 'cubridconf');
      const servers = autoStartDatabases(response?.conflist?.[0]?.confdata || []);
      if (version === autoStartReadVersion.current) {
        setAutoStartDBs(servers);
        setAutoStartReady(true);
      }
    } catch (err) {
      if (version === autoStartReadVersion.current) setAutoStartReady(false);
      console.error('Failed to fetch auto-start info:', err);
    }
  };

  const { activeMainTab } = useSelector((state) => state.layout, shallowEqual);
  // The system status and HA heartbeat polls stop while a modal covers the dashboard.
  const anyModalOpen = useAnyModalOpen();
  const isTabActive = activeMainTab === `host:${hostUid}` && !anyModalOpen;

  const haHeartbeat = hostData?.haHeartbeat;

  // While no node reports master (likely mid-failover), poll just the HA
  // heartbeat at a much shorter interval than the normal dashboard refresh
  // so the UI catches the new master quickly — capped so a stuck/permanent
  // failure doesn't poll indefinitely, falling back to the normal interval
  // either way once the cap is hit. Deliberately its own lightweight fetch
  // (heartbeat only, not hostStat/brokers too) to avoid the extra traffic a
  // full fetchMonitoringData tick every second would cost.
  const isHaAbnormal = isHA && isHaClusterMissingMaster(haHeartbeat);
  const haAbnormalSinceRef = useRef(null);
  // authorizedHosts still lists a host pending reconnect (preserved so the
  // reconnect is seamless, see apiClient.js), so it alone can't tell us to
  // pause here — check reconnectQueue too, otherwise this fast 1s poll
  // just spins against a host already known to need reconnection. A boolean
  // (not the array) in the deps, so another host joining/leaving the queue
  // doesn't tear down and restart this host's timer.
  const isPendingReconnect = reconnectQueue.includes(hostUid);
  // While the host waits in the reconnect window nothing is read: the badge
  // says so instead of "Live".
  const liveStatus = isPendingReconnect ? 'lost' : preferences?.dashboardInterval > 0 ? 'live' : 'paused';
  useEffect(() => {
    if (!isTabActive || !isHaAbnormal || !authorizedHosts.includes(hostUid) || isPendingReconnect) {
      haAbnormalSinceRef.current = null;
      return;
    }

    haAbnormalSinceRef.current = haAbnormalSinceRef.current ?? Date.now();

    const timer = setInterval(() => {
      if (Date.now() - haAbnormalSinceRef.current >= HA_ABNORMAL_POLL_MAX_MS) {
        clearInterval(timer);
        return;
      }
      // Node states only; the databases are read once when the nodes change.
      dispatch(fetchHaNodesOnly(hostUid));
    }, HA_ABNORMAL_POLL_INTERVAL_MS);

    return () => clearInterval(timer);
  }, [isTabActive, isHaAbnormal, authorizedHosts, isPendingReconnect, hostUid, dispatch]);

  // The nodes changed under the 1s watch (a failover, or back to normal):
  // read the databases once so their HA badges match the new roles.
  const haDbInfoStale = Boolean(hostData?.haDbInfoStale);
  useEffect(() => {
    if (haDbInfoStale && authorizedHosts.includes(hostUid) && !isPendingReconnect) {
      dispatch(fetchHaHeartbeatOnly(hostUid));
    }
  }, [haDbInfoStale, authorizedHosts, isPendingReconnect, hostUid, dispatch]);

  const haDbs = React.useMemo(() => {
    const names = new Set();
    const raw = haHeartbeat?.hadbinfolist;
    if (!raw) return names;

    const ensureArray = (val) => {
      if (!val) return [];
      return Array.isArray(val) ? val : [val];
    };

    ensureArray(raw).forEach((entry) => {
      const servers = entry?.server;
      if (!servers) return;

      ensureArray(servers).forEach((server) => {
        if (!server) return;

        ensureArray(server.dbmode).forEach((row) => {
          if (row?.dbname) names.add(row.dbname);
        });

        ensureArray(server.dbprocinfo).forEach((row) => {
          if (row?.dbname) names.add(row.dbname);
        });

        ensureArray(server.applylogdb).forEach((block) => {
          if (block?.element) {
            ensureArray(block.element).forEach((el) => {
              if (el?.dbname) names.add(el.dbname);
            });
          }
        });

        ensureArray(server.copylogdb).forEach((block) => {
          if (block?.element) {
            ensureArray(block.element).forEach((el) => {
              if (el?.dbname) names.add(el.dbname);
            });
          }
        });
      });
    });

    return names;
  }, [haHeartbeat]);

  const haDbServerModes = React.useMemo(() => getHaDbServerModes(haHeartbeat), [haHeartbeat]);

  const dbListDisplay = databases.map(db => ({
    db: db.dbname,
    autoStart: autoStartDBs.includes(db.dbname),
    status: activeDatabases.includes(db.dbname) ? CM.statusOn : CM.statusOff,
    isHA: isHA && haDbs.has(db.dbname),
    haState: isHA && haDbs.has(db.dbname) ? haDbServerModes.get(db.dbname) : null,
  }));

  return (
    <div data-testid="server-dashboard" className="flex-1 flex flex-col h-full bg-white dark:bg-background-dark overflow-hidden">

      {/* ── Header ── */}
      <header className="h-14 px-6 border-b border-slate-100 dark:border-white/4 flex items-center shrink-0 min-w-fit sticky top-0 z-20 bg-linear-to-r from-amber-500/[0.03] to-transparent bg-white dark:bg-background-dark font-sans shadow-[0_1px_2px_rgba(0,0,0,0.02)]">
        <div className="flex items-center gap-3 shrink-0">
          <div className="w-9 h-9 rounded-lg bg-amber-500/10 border border-amber-500/20 flex items-center justify-center shrink-0 shadow-sm">
            <Icon name="dns" size="sm" weight={300} className="text-amber-500" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <Typography variant="h1" className="text-15 font-bold text-slate-800 dark:text-slate-100 tracking-tight leading-tight">
                {CM.serverDashboard}
              </Typography>
              <div data-testid="dashboard-live-badge" className={`px-2 py-0.5 rounded-full border flex items-center gap-1.5 shrink-0 transition-all duration-300 ${liveStatus === 'live' ? 'bg-emerald-500/10 border-emerald-500/30' : liveStatus === 'lost' ? 'bg-rose-500/10 border-rose-500/30' : 'bg-slate-100 dark:bg-white/5 border-slate-200 dark:border-white/10'}`}>
                <div className={`w-1 h-1 rounded-full ${liveStatus === 'live' ? 'bg-emerald-500 animate-pulse' : liveStatus === 'lost' ? 'bg-rose-500' : 'bg-slate-400'}`} />
                <span className={`text-11 font-bold ${liveStatus === 'live' ? 'text-emerald-600 dark:text-emerald-400' : liveStatus === 'lost' ? 'text-rose-600 dark:text-rose-400' : 'text-slate-500 dark:text-slate-400'}`}>
                  {liveStatus === 'live' ? CM.live : liveStatus === 'lost' ? CM.connectionLost : CM.paused}
                </span>
              </div>
            </div>
            <div className="flex items-center mt-0.5">
              <Typography variant="label" className="text-12 text-slate-400 font-mono tracking-tight leading-none">{hostLabel}</Typography>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-1.5 text-14 ml-auto shrink-0">
          <Typography variant="label" className="text-12 text-slate-400 font-mono tracking-tight mr-2 whitespace-nowrap">
            {CM.syncedAt(lastRefreshed.toLocaleTimeString())}
          </Typography>

          <button
            data-testid="server-dashboard-refresh-btn"
            onClick={() => handleRefresh()}
            disabled={isRefreshing}
            className={`w-9 h-9 flex items-center justify-center rounded-lg border transition-all active:scale-[0.98]
              ${isRefreshing
                ? 'bg-slate-100 dark:bg-white/5 text-slate-300 dark:text-slate-600 border-slate-200 dark:border-white/5 cursor-not-allowed opacity-50'
                : 'bg-slate-50 dark:bg-white/[0.03] border-slate-200 dark:border-white/10 text-slate-400 hover:text-amber-600 dark:hover:text-amber-500 hover:border-amber-500/50 hover:bg-white dark:hover:bg-white/5 shadow-sm'}`}
            title={CM.refreshDashboard}
          >
            <Icon 
              name="refresh" 
              size="19px"
              className={isRefreshing ? 'animate-spin' : ''} 
            />
          </button>
          <div className="w-px h-4 bg-slate-200 dark:bg-white/10 mx-0.5" />
          <MonitoringSettingsPopover />
        </div>
      </header>



      {/* ── Scrollable Body ── */}
      <div className="flex-1 overflow-y-auto p-6 space-y-4">
        <HostReadErrorBanner hostUid={hostUid} startInfoError={startInfoError} statusReadActive={isHA || isSystemStatusExpanded} />
        <HaClusterStatusSection hostUid={hostUid} />
        <DatabaseVolumes hostUid={hostUid} activeDatabases={activeDatabases} dbListStatus={dbListStatus} refreshKey={volumesRefreshKey} isShown={activeMainTab === `host:${hostUid}`} />
        <Brokers hostUid={hostUid} isSection={true} />
        <SystemStatusSection hostUid={hostUid} isTabActive={isTabActive} onExpandedChange={handleSystemStatusExpanded} />
        <DatabaseListSection dbListDisplay={dbListDisplay} dbListStatus={dbListStatus} />
        <SystemInfo hostUid={hostUid} />
      </div>
    </div>
  );
}

export default React.memo(Component);
