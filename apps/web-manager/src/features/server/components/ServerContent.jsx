import { usePollingRefresh } from '../../../infrastructure/hooks/usePollingRefresh';
import React, { useState, useCallback, useRef, useEffect } from 'react';
import { useSelector, useDispatch , shallowEqual } from 'react-redux';
import { hostApi } from '../../host/hostApi';
import { fetchHostEnv } from '../../host/hostSlice';
import { fetchDatabaseStartInfo } from '../../database/databaseSlice';
import { fetchBrokerList } from '../../broker/brokerSlice';
import DatabaseVolumes from './DatabaseVolumes';
import Brokers from './Brokers';
import SystemInfo from './SystemInfo';
import { fetchDatabaseVolumes } from '../../database/databaseMonitoringSlice';
import { fetchMonitoringData, fetchHaHeartbeatOnly } from '../monitoringSlice';
import { isHaClusterMissingMaster } from '../../host/haPeerUtils';

import SystemStatusSection from './server/SystemStatusSection';
import DatabaseListSection from './server/DatabaseListSection';
import HaClusterStatusSection from './server/HaClusterStatusSection';
import MonitoringSettingsPopover from '../../user/components/MonitoringSettingsPopover';
import { Typography } from '../../../components/ds/foundation/Typography';
import { Icon } from '../../../components/ds/foundation/Icon';
import { useCM } from '../../../constants/useCM';

// See the HA-abnormal fast-poll effect below.
const HA_ABNORMAL_POLL_INTERVAL_MS = 1000;
const HA_ABNORMAL_POLL_MAX_MS = 30000;

const Component = function ServerContent({ hostUid }) {
  const CM = useCM();
  const dispatch = useDispatch();
  // Database list/active list are fetched into this component's own state
  // (not the shared `state.database.databases/activeDatabases` slice) so that
  // multiple simultaneously-open dashboard tabs for different hosts, and the
  // navigator, don't clobber each other's displayed data.
  const [databases, setDatabases] = useState([]);
  const [activeDatabases, setActiveDatabases] = useState([]);
  const { hosts, authorizedHosts, haInfo } = useSelector((state) => state.host, shallowEqual);
  const { preferences } = useSelector((state) => state.user, shallowEqual);
  const { refreshCounter } = useSelector((state) => state.layout, shallowEqual);
  const [autoStartDBs, setAutoStartDBs] = useState([]);
  const [autoStartReady, setAutoStartReady] = useState(false);
  const autoStartReadVersion = useRef(0);
  const autoStartWritePending = useRef(false);
  
  const currentHost = hosts.find(h => h.uid === hostUid);
  const hostHaInfo = haInfo[hostUid] || {};
  const isHA = hostHaInfo.isHA;
  const hostLabel = currentHost ? (currentHost.alias || currentHost.id) : CM.unknownHost;
  const hostData = useSelector((state) => state.monitoring.hostsData[hostUid] || {});

  const { isManualRefreshing: isRefreshing, lastRefreshed, handleRefresh } = usePollingRefresh({
    hostUid,
    tabId: `host:${hostUid}`,
    pollingIntervalSeconds: preferences.dashboardInterval,
    onFetch: (silent) => async (dispatch) => {
      // 1. First fetch database status to get the current active list
      const dbInfo = await dispatch(fetchDatabaseStartInfo(silent ? { hostUid, isBackground: true } : hostUid)).unwrap();
      const newDatabases = dbInfo.dblist?.dbs || [];
      const newActiveDatabases = (dbInfo.activelist?.active || []).map((d) => d.dbname);
      setDatabases(newDatabases);
      setActiveDatabases(newActiveDatabases);

      // 2. Then fetch other data, using the just-fetched active databases list
      await Promise.all([
        dispatch(fetchBrokerList(silent ? { hostUid, isBackground: true } : hostUid)),
        dispatch(fetchHostEnv(hostUid)),
        dispatch(fetchDatabaseVolumes({ hostUid, activeDatabases: newActiveDatabases })),
        fetchAutoStartInfo(),
        isHA ? dispatch(fetchMonitoringData(hostUid)) : Promise.resolve()
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
      const lines = response?.conflist?.[0]?.confdata || [];
      let serviceEnabled = false, servers = [];
      for (const line of lines) {
        const trimmed = line.trim();
        if (trimmed.startsWith('#') || !trimmed) continue;
        if (trimmed.startsWith('service=')) {
          const val = trimmed.split('=')[1] || '';
          if (val.split(',').map(s => s.trim().toLowerCase()).includes('server')) serviceEnabled = true;
        }
        if (trimmed.startsWith('server=')) {
          servers = (trimmed.split('=')[1] || '').split(',').map(s => s.trim());
        }
      }
      if (version === autoStartReadVersion.current) {
        setAutoStartDBs(serviceEnabled ? servers : []);
        setAutoStartReady(true);
      }
    } catch (err) {
      if (version === autoStartReadVersion.current) setAutoStartReady(false);
      console.error('Failed to fetch auto-start info:', err);
    }
  };

  const { activeMainTab } = useSelector((state) => state.layout, shallowEqual);
  const isTabActive = activeMainTab === `host:${hostUid}`;

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
  useEffect(() => {
    if (!isTabActive || !isHaAbnormal || !authorizedHosts.includes(hostUid)) {
      haAbnormalSinceRef.current = null;
      return;
    }

    haAbnormalSinceRef.current = haAbnormalSinceRef.current ?? Date.now();

    const timer = setInterval(() => {
      if (Date.now() - haAbnormalSinceRef.current >= HA_ABNORMAL_POLL_MAX_MS) {
        clearInterval(timer);
        return;
      }
      dispatch(fetchHaHeartbeatOnly(hostUid));
    }, HA_ABNORMAL_POLL_INTERVAL_MS);

    return () => clearInterval(timer);
  }, [isTabActive, isHaAbnormal, authorizedHosts, hostUid, dispatch]);

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

  const dbListDisplay = databases.map(db => ({
    db: db.dbname,
    autoStart: autoStartDBs.includes(db.dbname),
    status: activeDatabases.includes(db.dbname) ? CM.statusOn : CM.statusOff,
    isHA: isHA && haDbs.has(db.dbname)
  }));

  return (
    <div data-testid="server-dashboard" className="flex-1 flex flex-col h-full bg-white dark:bg-background-dark overflow-hidden">

      {/* ── Header ── */}
      <header className="px-6 py-2.5 border-b border-slate-100 dark:border-white/4 flex items-center justify-between shrink-0 sticky top-0 z-20 bg-linear-to-r from-amber-500/[0.03] to-transparent bg-white dark:bg-background-dark font-sans shadow-[0_1px_2px_rgba(0,0,0,0.02)]">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-lg bg-amber-500/10 border border-amber-500/20 flex items-center justify-center shrink-0">
            <Icon name="dns" size="sm" weight={300} className="text-amber-500" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <Typography variant="h1" className="text-15 font-bold text-slate-800 dark:text-slate-100 leading-tight">
                {CM.serverDashboard}
              </Typography>
              <div className={`px-2 py-0.5 rounded-full border flex items-center gap-1.5 shrink-0 transition-all duration-300 ${preferences?.dashboardInterval > 0 ? 'bg-emerald-500/10 border-emerald-500/30' : 'bg-slate-100 dark:bg-white/5 border-slate-200 dark:border-white/10'}`}>
                <div className={`w-1 h-1 rounded-full ${preferences?.dashboardInterval > 0 ? 'bg-emerald-500 animate-pulse' : 'bg-slate-400'}`} />
                <span className={`text-11 font-bold ${preferences?.dashboardInterval > 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-slate-500 dark:text-slate-400'}`}>
                  {preferences?.dashboardInterval > 0 ? CM.live : CM.paused}
                </span>
              </div>
            </div>
            <Typography variant="label" className="text-12 text-slate-400 font-mono tracking-tight">{hostLabel}</Typography>
          </div>
        </div>

        <div className="flex items-center gap-1.5 text-14">
          <Typography variant="label" className="text-12 text-slate-400 font-mono tracking-tight hidden lg:block mr-2">
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
        <HaClusterStatusSection hostUid={hostUid} />
        <DatabaseVolumes hostUid={hostUid} activeDatabases={activeDatabases} />
        <Brokers hostUid={hostUid} isSection={true} />
        <SystemStatusSection hostUid={hostUid} isTabActive={isTabActive} />
        <DatabaseListSection dbListDisplay={dbListDisplay} />
        <SystemInfo hostUid={hostUid} />
      </div>
    </div>
  );
}

export default React.memo(Component);
