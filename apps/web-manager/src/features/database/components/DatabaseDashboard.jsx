import { usePollingRefresh } from '../../../infrastructure/hooks/usePollingRefresh';
import { useAnyModalOpen } from '../../../infrastructure/hooks/useAnyModalOpen';
import React, { useState } from 'react';
import { useSelector, shallowEqual } from 'react-redux';
import { fetchDashboardData } from '../databaseSlice';
import DBPerformanceSection from './dashboard/DBPerformanceSection';
import DBVolumesSection from './dashboard/DBVolumesSection';
import DBSpaceInfoSection from './dashboard/DBSpaceInfoSection';
import DBBrokersCASSection from './dashboard/DBBrokersCASSection';
import DBLockTransactionSection from './dashboard/DBLockTransactionSection';
import DBJobAutomationSection from './dashboard/DBJobAutomationSection';
import CASLogModal from './CASLogModal';
import { isDatabaseInHa } from '../../host/haPeerUtils';
import { useStatdumpWatcher } from '../useStatdumpWatcher';
import { isLinuxHost } from '../hostOs';
import { totalCasQps } from '../casMetrics';
import { pagesToSize, volumePageSize } from '../volumePages';
import { dbMemorySegments, formatBytes1, recentHostMemory, hostMemoryMaxAgeMs } from '../dbMemorySegments';

import MonitoringSettingsPopover from '../../user/components/MonitoringSettingsPopover';
import { Icon } from '../../../components/ds/foundation/Icon';
import { Typography } from '../../../components/ds/foundation/Typography';
import { useCM } from '../../../constants/useCM';
import DbLoginRequiredState from './DbLoginRequiredState';

const Component = function DatabaseDashboard({ hostUid: propHostUid, dbname }) {
  const CM = useCM();
  const { selectedHostUid, hosts, haInfo } = useSelector((state) => state.host, shallowEqual);
  
  const hostUid = propHostUid || selectedHostUid;
  const hostHaInfo = haInfo[hostUid] || {};
  const isHA = hostHaInfo.isHA;

  const hostData = useSelector((state) => state.monitoring.hostsData[hostUid] || {});
  // The host's memory as the host or service dashboard last read it
  // (gethoststat). The DB dashboard does not read it itself, so the bar uses
  // only a recent read (dbMemorySegments.js, recentHostMemory) and is hidden
  // otherwise.
  const hostSummary = useSelector((state) => state.globalMonitoring?.summaries?.[hostUid]);
  // CMS getenv osinfo ("LINUX", "NT", ...). On Linux the broker never fills
  // per-CAS CPU (get_psinfo in broker_process_info.c is Solaris/HP-UX only),
  // so CMS as_cpu is always 0.00 there; unknown OS keeps the CAS sum.
  const hostOs = useSelector((state) => state.host.hostEnvs?.[hostUid]?.osinfo);
  const casCpuNotCollected = isLinuxHost(hostOs);
  const haHeartbeat = hostData?.haHeartbeat;
  const isDbInHa = React.useMemo(
    () => isDatabaseInHa(haHeartbeat, dbname),
    [haHeartbeat, dbname]
  );

  const { dashboardData, dashboardLoading } = useSelector((state) => state.databaseMonitoring, shallowEqual);
  const { preferences } = useSelector((state) => state.user, shallowEqual);
  const { activeMainTab } = useSelector((state) => state.layout, shallowEqual);

  const [logModal, setLogModal] = useState({ isOpen: false, brokerName: '', casId: '', type: 'sql' });
  


  // Which sections are collapsed (useRefreshWhenShown); the refresh skips them.
  const collapsedSections = React.useRef({});

  const { isManualRefreshing, lastRefreshed, handleRefresh, isDbLoggedIn } = usePollingRefresh({
    hostUid,
    dbname,
    tabId: propHostUid ? `db:${hostUid}:${dbname}` : `db:${dbname}`,
    pollingIntervalSeconds: preferences.dashboardInterval,
    onFetch: (silent) => (dispatch) => dispatch(fetchDashboardData({ hostUid, dbname, isBackground: silent, collapsed: { ...collapsedSections.current } }))
  });

  const activeHost = hosts.find(h => h.uid === selectedHostUid);
  const dashboardKey = `${hostUid}:${dbname}`;
  const data = dashboardData[dashboardKey] || { volumes: [], spaceInfo: [], locks: [], performance: {} };

  // statdump counters only move while a watcher is attached; keep one running
  // while this dashboard is open so the performance rates are real.
  useStatdumpWatcher(hostUid, dbname, data.perfSample);
  const isLoading = dashboardLoading[dashboardKey];

  // Tabs are always opened as `db:${hostUid}:${dbname}` (DatabaseTree.jsx) —
  // comparing against a bare `db:${dbname}` here never matched, so every
  // dashboard section's "became active, refetch" effect silently never fired.
  // Sections stop polling while a modal covers the dashboard.
  const anyModalOpen = useAnyModalOpen();
  const isTabActive = document.visibilityState === 'visible' && activeMainTab === `db:${hostUid}:${dbname}` && !anyModalOpen;


  // Pass polling props to sections
  const pollingProps = { hostUid, dbname, isTabActive, refreshInterval: preferences.dashboardInterval, collapsedSections };

  // Page counts are shown as sizes: pages × the database's page size.
  const pageSizes = { pagesize: data.pagesize, logpagesize: data.logpagesize };
  const mappedVolumes = (data.volumes || []).map(v => ({
    name: v.spacename, 
    type: v.type, 
    purpose: v.purpose || '-',
    free: v.freepage,
    total: v.totalpage,
    pageSize: volumePageSize(v, pageSizes),
    freePct: v.totalpage && parseInt(v.totalpage) > 0 && v.freepage && v.freepage.trim() !== '' ? (parseInt(v.freepage) / parseInt(v.totalpage)) * 100 : 0,
    date: v.date || '-', 
    path: v.location
  }));

  const mappedSpaceInfo = (data.spaceInfo || []).map(f => ({
    type: f.data_type, 
    fileCount: f.file_count, 
    usedPages: pagesToSize(f.used_size, data.pagesize),
    fileTablePages: pagesToSize(f.file_table_size, data.pagesize),
    reservedPages: pagesToSize(f.reserved_size, data.pagesize),
    totalPages: pagesToSize(f.total_size, data.pagesize)
  }));

  const perf = data.performance || {};
  const brokersCAS = data.brokersCAS || [];
  
  const casStats = brokersCAS.reduce((acc, cas) => {
    acc.cpu += parseFloat(cas.cpu || 0);
    acc.memKB += parseFloat(cas.psize || 0);
    return acc;
  }, { cpu: 0, memKB: 0 });

  const totalQps = totalCasQps(brokersCAS);
  const rawHitRatio = parseFloat(perf.data_page_buffer_hit_ratio);
  const hitRatio = Number.isFinite(rawHitRatio) ? rawHitRatio : null;
  // psize is in KiB.
  const casMemBytes = casStats.memKB * 1024;
  const hostMem = recentHostMemory([hostData.currentStatus, hostSummary], Date.now(), hostMemoryMaxAgeMs(preferences.dashboardInterval));
  const memSegments = dbMemorySegments(casMemBytes, hostMem?.memTotal, hostMem?.memUsed);
  // Per-second rates from consecutive statdump samples (statdumpRates.js);
  // null until two samples exist, or after a counter reset.
  const rates = perf.calculatedRates || {};
  const formatRate = (value) => (value === null || value === undefined ? '-' : value.toFixed(1));
  
  const dbStats = [{
    cpu: casCpuNotCollected ? '-' : casStats.cpu.toFixed(1) + '%',
    cpuPct: casCpuNotCollected ? 0 : Math.min(casStats.cpu, 100),
    cpuNote: casCpuNotCollected ? CM.casCpuNotCollectedLinux : undefined,
    memory: formatBytes1(casMemBytes),
    memSegments,
    tps: formatRate(rates.tps),
    qps: formatRate(totalQps), 
    // CMS reads the engine's ratio as a whole number (cm_mem_cpu_stat.cpp).
    hitRatio: hitRatio === null ? '-' : `${Math.round(hitRatio)}%`,
    hitPct: hitRatio,
    fetch: formatRate(rates.fetchPerSec),
    dirty: formatRate(rates.dirtyPerSec),
    ioReads: formatRate(rates.ioReadPerSec),
    ioWrites: formatRate(rates.ioWritePerSec)
  }];
  
  const handleExport = () => {
    const headers = [CM.sectionLabel, CM.keyLabel, CM.value];
    const rows = [
      [CM.summaryLabel, CM.database, dbname],
      [CM.summaryLabel, CM.host, `${activeHost?.address}:${activeHost?.port}`],
      // Memory in the bar's order: host (without this db's CAS), CAS, free, total.
      [CM.performance, `${CM.memory} (${CM.dbMemHostLabel})`, memSegments ? formatBytes1(memSegments.host) : '-'],
      [CM.performance, `${CM.memory} (${CM.dbMemCasLabel})`, formatBytes1(casMemBytes)],
      [CM.performance, `${CM.memory} (${CM.dbMemFreeLabel})`, memSegments ? formatBytes1(memSegments.free) : '-'],
      [CM.performance, `${CM.memory} (${CM.dbMemTotalLabel})`, memSegments ? formatBytes1(memSegments.total) : '-'],
      [CM.performance, CM.tps, dbStats[0].tps],
      [CM.performance, CM.qps, dbStats[0].qps],
      [CM.performance, CM.hitRatioLabel, dbStats[0].hitRatio],
      [CM.performance, CM.fetchPerSecLabel, dbStats[0].fetch],
      [CM.performance, CM.dirtyPerSec, dbStats[0].dirty],
      [CM.performance, CM.ioReadsPerSec, dbStats[0].ioReads],
      [CM.performance, CM.ioWritesPerSec, dbStats[0].ioWrites],
      // Used / total, as the Space Usage column shows it.
      ...(data.volumes || []).map(v => {
        const total = parseInt(v.totalpage, 10);
        const free = parseInt(v.freepage, 10);
        const pageSize = volumePageSize(v, pageSizes);
        const value = Number.isNaN(total) || Number.isNaN(free)
          ? '-'
          : `${pagesToSize(Math.max(0, total - free), pageSize)} / ${pagesToSize(total, pageSize)}`;
        return [CM.volumeLabel, v.spacename, value];
      })
    ];
    const csvField = (value) => {
      const text = String(value ?? '');
      return /[",\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
    };
    const csv = [headers, ...rows].map(r => r.map(csvField).join(',')).join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = `${dbname}_dashboard_${new Date().toISOString().slice(0, 10)}.csv`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  return (
    <div data-testid="database-dashboard" className="flex-1 flex flex-col h-full bg-white dark:bg-background-dark overflow-hidden font-sans">
      <header className="h-14 px-6 border-b border-slate-100 dark:border-white/4 flex items-center shrink-0 min-w-fit sticky top-0 z-20 bg-white dark:bg-background-dark">
        <div className="flex items-center gap-3 shrink-0">
          <div className="w-9 h-9 rounded-lg bg-amber-500/10 border border-amber-500/20 flex items-center justify-center shrink-0 shadow-sm">
            <Icon name="database" size="sm" weight={300} className="text-amber-500" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <Typography variant="h1" className="text-15 font-bold text-slate-800 dark:text-slate-100 tracking-tight leading-tight">{CM.databaseDashboard}</Typography>
              <div className={`px-2 py-0.5 rounded-full border flex items-center gap-1.5 shrink-0 transition-all duration-300 ${preferences.dashboardInterval > 0 ? 'bg-emerald-500/10 border-emerald-500/30' : 'bg-slate-100 dark:bg-white/5 border-slate-200 dark:border-white/10'}`}>
                <div className={`w-1 h-1 rounded-full ${preferences.dashboardInterval > 0 ? 'bg-emerald-500 animate-pulse' : 'bg-slate-400'}`} />
                <span className={`text-11 font-bold ${preferences.dashboardInterval > 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-slate-500 dark:text-slate-400'}`}>
                  {preferences.dashboardInterval > 0 ? CM.live : CM.paused}
                </span>
              </div>
            </div>
            <div className="flex items-center gap-1.5 mt-0.5">
              <div className="w-1.5 h-1.5 rounded-full bg-amber-500/60" />
              <Typography variant="label" className="text-12 text-slate-400 font-bold uppercase tracking-widest leading-none">@{dbname}</Typography>
              {isHA && isDbInHa && (
                <span className="px-1 py-0.5 rounded-sm bg-amber-500/10 border border-amber-500/20 text-10 font-bold text-amber-600 dark:text-amber-400 tracking-wide uppercase leading-none">
                  HA
                </span>
              )}
            </div>
          </div>
        </div>

        <div className="flex items-center gap-1.5 ml-auto shrink-0">
          <Typography variant="label" className="text-12 text-slate-400 font-mono tracking-tight mr-2 whitespace-nowrap">
            {CM.syncedAt(lastRefreshed.toLocaleTimeString())}
          </Typography>

          <button
            data-testid="database-dashboard-refresh-btn"
            onClick={handleRefresh}
            disabled={isLoading || isManualRefreshing}
            className={`w-9 h-9 flex items-center justify-center rounded-xl border transition-all active:scale-[0.98]
              ${(isLoading || isManualRefreshing)
                ? 'bg-slate-100 dark:bg-white/5 text-slate-300 dark:text-slate-600 border-slate-200 dark:border-white/5 cursor-not-allowed opacity-50'
                : 'bg-slate-50 dark:bg-white/[0.03] border-slate-200 dark:border-white/10 text-slate-400 hover:text-amber-600 dark:hover:text-amber-500 hover:border-amber-500/50 hover:bg-white dark:hover:bg-white/5 shadow-xs'}`}
            title={CM.refreshDatabaseStatus}
          >
            <Icon name="refresh" size="19px" className={(isLoading || isManualRefreshing) ? 'animate-spin' : ''} />
          </button>

          <div className="w-[1px] h-4 bg-slate-200 dark:bg-white/10 mx-0.5" />
          <MonitoringSettingsPopover />

          <div className="w-px h-4 bg-slate-200 dark:bg-white/10 mx-0.5" />
          <button
            onClick={handleExport}
            className={`w-9 h-9 flex items-center justify-center rounded-xl border transition-all active:scale-[0.98] bg-slate-50 dark:bg-white/[0.03] border-slate-200 dark:border-white/10 text-slate-400 hover:text-amber-600 dark:hover:text-amber-500 hover:border-amber-500/50 hover:bg-white dark:hover:bg-white/5 shadow-xs`}
            title={CM.exportMetricsCsv}
          >
            <Icon name="ios_share" size="19px" weight={300} />
          </button>
        </div>
      </header>



      <div className="flex-1 overflow-y-auto p-6 space-y-4 relative">
        {/* Without this database's login nothing is read: no section is mounted to poll. */}
        {!isDbLoggedIn ? (
          <DbLoginRequiredState />
        ) : isLoading && (!data.volumes || data.volumes.length === 0) ? (
          <div className="flex items-center justify-center h-64">
            <div className="flex flex-col items-center gap-3">
              <div className="h-8 w-8 border-2 border-amber-500 border-t-transparent rounded-full animate-spin" />
              <Typography variant="label" className="text-13 text-slate-400 uppercase tracking-widest">{CM.loadingDashboard}</Typography>
            </div>
          </div>
        ) : (
          <div className="space-y-4">
            <DBPerformanceSection dbStats={dbStats} pollingProps={pollingProps} />
            <DBVolumesSection volumes={mappedVolumes} volumesStatus={data.volumesStatus} pollingProps={pollingProps} />
            <DBSpaceInfoSection spaceInfo={mappedSpaceInfo} spaceInfoStatus={data.spaceInfoStatus} pollingProps={pollingProps} />
            <DBBrokersCASSection
              brokersCAS={brokersCAS}
              casStatus={data.casStatus}
              pollingProps={pollingProps}
              onViewSQLLog={(row) => setLogModal({ isOpen: true, brokerName: row.broker, casId: row.id, type: 'sql' })}
              onViewSlowQueryLog={(row) => setLogModal({ isOpen: true, brokerName: row.broker, casId: row.id, type: 'slow' })}
            />
            <DBLockTransactionSection locks={data.locks || []} locksStatus={data.locksStatus} pollingProps={pollingProps} />
            <DBJobAutomationSection pollingProps={pollingProps} />
          </div>
        )}
      </div>

      <CASLogModal
        isOpen={logModal.isOpen}
        onClose={() => setLogModal(prev => ({ ...prev, isOpen: false }))}
        hostUid={hostUid}
        brokerName={logModal.brokerName}
        casId={logModal.casId}
        type={logModal.type}
      />

    </div>
  );
}

export default React.memo(Component);
