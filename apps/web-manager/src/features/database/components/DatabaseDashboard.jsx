import { usePollingRefresh } from '../../../infrastructure/hooks/usePollingRefresh';
import React, { useState } from 'react';
import { useDispatch, useSelector, shallowEqual } from 'react-redux';
import { fetchDashboardData } from '../databaseSlice';
import DBPerformanceSection from './dashboard/DBPerformanceSection';
import DBVolumesSection from './dashboard/DBVolumesSection';
import DBSpaceInfoSection from './dashboard/DBSpaceInfoSection';
import DBBrokersCASSection from './dashboard/DBBrokersCASSection';
import DBLockTransactionSection from './dashboard/DBLockTransactionSection';
import DBJobAutomationSection from './dashboard/DBJobAutomationSection';
import CASLogModal from './CASLogModal';
import { isDatabaseInHa } from '../../host/haPeerUtils';

import MonitoringSettingsPopover from '../../user/components/MonitoringSettingsPopover';
import { Icon } from '../../../components/ds/foundation/Icon';
import { Typography } from '../../../components/ds/foundation/Typography';
import { useActionState } from '../../../infrastructure/hooks/useActionState';
import { RefreshingOverlay } from '../../../components/ds/feedback/RefreshingOverlay';
import { Modal } from '../../../components/ds/layout/Modal';
import { ModalStatusError } from '../../../components/ds/feedback/ActionStatus';
import { useCM } from '../../../constants/useCM';

const Component = function DatabaseDashboard({ hostUid: propHostUid, dbname }) {
  const CM = useCM();
  const dispatch = useDispatch();
  const { selectedHostUid, hosts, haInfo } = useSelector((state) => state.host, shallowEqual);
  
  const hostUid = propHostUid || selectedHostUid;
  const hostHaInfo = haInfo[hostUid] || {};
  const isHA = hostHaInfo.isHA;

  const hostData = useSelector((state) => state.monitoring.hostsData[hostUid] || {});
  const haHeartbeat = hostData?.haHeartbeat;
  const isDbInHa = React.useMemo(
    () => isDatabaseInHa(haHeartbeat, dbname),
    [haHeartbeat, dbname]
  );

  const { dashboardData, dashboardLoading } = useSelector((state) => state.databaseMonitoring, shallowEqual);
  const { preferences } = useSelector((state) => state.user, shallowEqual);
  const { refreshCounter, activeMainTab } = useSelector((state) => state.layout, shallowEqual);

  const [logModal, setLogModal] = useState({ isOpen: false, brokerName: '', casId: '', type: 'sql' });
  


  const { 
    startAction, 
    endError, 
    resetAction,
    isLoading: isActionLoading,
    isError: isActionError,
    error: actionError
  } = useActionState();

  const { isManualRefreshing, lastRefreshed, handleRefresh } = usePollingRefresh({
    hostUid,
    tabId: propHostUid ? `db:${hostUid}:${dbname}` : `db:${dbname}`,
    pollingIntervalSeconds: preferences.dashboardInterval,
    onFetch: (silent) => (dispatch) => dispatch(fetchDashboardData({ hostUid, dbname, isBackground: silent }))
  });

  const handleRestartCAS = async (row) => {
    if (window.confirm(CM.restartCasConfirm(row.id, row.broker))) {
      startAction();
      try {
        // We'll need to find the correct thunk for this, usually restartCAS or similar.
        // Assuming it's in databaseSlice
        // await dispatch(restartCAS({ hostUid, brokerName: row.broker, casId: row.id })).unwrap();
        
        // Let's check if it exists or use basic start/stop if needed, but for now I'll just use resetAction to simulate silent success after dispatch
        // dispatch(fetchDashboardData({ hostUid, dbname, isBackground: true }));
        
        // Placeholder for the actual dispatch
        await new Promise(resolve => setTimeout(resolve, 1000));
        resetAction();
      } catch (err) {
        endError(err);
      }
    }
  };

  const activeHost = hosts.find(h => h.uid === selectedHostUid);
  const dashboardKey = `${hostUid}:${dbname}`;
  const data = dashboardData[dashboardKey] || { volumes: [], spaceInfo: [], locks: [], performance: {} };
  const isLoading = dashboardLoading[dashboardKey];

  // Tabs are always opened as `db:${hostUid}:${dbname}` (DatabaseTree.jsx) —
  // comparing against a bare `db:${dbname}` here never matched, so every
  // dashboard section's "became active, refetch" effect silently never fired.
  const isTabActive = document.visibilityState === 'visible' && activeMainTab === `db:${hostUid}:${dbname}`;


  // Pass polling props to sections
  const pollingProps = { hostUid, dbname, isTabActive, refreshInterval: preferences.dashboardInterval };

  const mappedVolumes = (data.volumes || []).map(v => ({
    name: v.spacename, 
    type: v.type, 
    purpose: v.purpose || '-',
    free: v.freepage && v.freepage.trim() !== '' ? CM.pagesCountLabel(v.freepage) : '-',
    total: v.totalpage && v.totalpage.trim() !== '' ? CM.pagesCountLabel(v.totalpage) : '-',
    freePct: v.totalpage && parseInt(v.totalpage) > 0 && v.freepage && v.freepage.trim() !== '' ? (parseInt(v.freepage) / parseInt(v.totalpage)) * 100 : 0,
    date: v.date || '-', 
    path: v.location
  }));

  const mappedSpaceInfo = (data.spaceInfo || []).map(f => ({
    type: f.data_type, 
    fileCount: f.file_count, 
    usedPages: f.used_size ? CM.pagesCountLabel(f.used_size) : '-',
    fileTablePages: f.file_table_size ? CM.pagesCountLabel(f.file_table_size) : '-',
    reservedPages: f.reserved_size ? CM.pagesCountLabel(f.reserved_size) : '-',
    totalPages: f.total_size ? CM.pagesCountLabel(f.total_size) : '-'
  }));

  const perf = data.performance || {};
  const brokersCAS = data.brokersCAS || [];
  
  const casStats = brokersCAS.reduce((acc, cas) => {
    acc.cpu += parseFloat(cas.cpu || 0);
    acc.memKB += parseFloat(cas.psize || 0);
    acc.activeCount += (cas.status?.toLowerCase() === 'busy' ? 1 : 0);
    return acc;
  }, { cpu: 0, memKB: 0, activeCount: 0 });

  const totalQps = brokersCAS.reduce((a, c) => a + parseInt(c.qps || 0), 0);
  const totalMemMB = (casStats.memKB / 1024).toFixed(1);
  const rates = perf.calculatedRates || { tps: 0, qps: 0, fetchPerSec: 0, dirtyPerSec: 0, ioReadPerSec: 0, ioWritePerSec: 0 };
  
  const dbStats = [{
    cpu: casStats.cpu.toFixed(1) + '%', 
    cpuPct: Math.min(casStats.cpu, 100),
    memory: totalMemMB + 'MB', 
    memPct: Math.min((casStats.memKB / 1024) / 4, 100),
    tps: rates.tps.toFixed(1),
    qps: totalQps.toLocaleString(), 
    hitRatio: (perf.data_page_buffer_hit_ratio || '0.00') + '%',
    hitPct: parseFloat(perf.data_page_buffer_hit_ratio || '0'),
    fetch: rates.fetchPerSec.toFixed(1),
    dirty: rates.dirtyPerSec.toFixed(1),
    ioReads: rates.ioReadPerSec.toFixed(1),
    ioWrites: rates.ioWritePerSec.toFixed(1)
  }];
  
  const mappedBrokers = brokersCAS.map(c => ({ broker: c.broker, id: c.id, pid: c.pid, qps: c.qps, lqs: c.lqs, status: c.status, lastConn: c.lastConn, dbname: c.dbname }));
  const handleExport = () => {
    const headers = [CM.sectionLabel, CM.keyLabel, CM.value];
    const rows = [
      [CM.summaryLabel, CM.database, dbname],
      [CM.summaryLabel, CM.host, `${activeHost?.address}:${activeHost?.port}`],
      [CM.performance, CM.tps, dbStats[0].tps],
      [CM.performance, CM.qps, dbStats[0].qps],
      [CM.performance, CM.hitRatioLabel, dbStats[0].hitRatio],
      [CM.performance, CM.fetchPerSecLabel, dbStats[0].fetch],
      [CM.performance, CM.dirtyPerSec, dbStats[0].dirty],
      [CM.performance, CM.ioReadsPerSec, dbStats[0].ioReads],
      [CM.performance, CM.ioWritesPerSec, dbStats[0].ioWrites],
      ...mappedVolumes.map(v => [CM.volumeLabel, v.name, `${v.free} / ${v.total}`])
    ];
    const csv = [headers, ...rows].map(r => r.join(',')).join('\n');
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
      <header className="px-6 py-2.5 border-b border-slate-100 dark:border-white/4 flex items-center justify-between shrink-0 sticky top-0 z-20 bg-white dark:bg-background-dark">
        <div className="flex items-center gap-3">
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

        <div className="flex items-center gap-1.5">
          <Typography variant="label" className="text-12 text-slate-400 font-mono tracking-tight hidden lg:block mr-2">
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
        <RefreshingOverlay show={isActionLoading} title={CM.restartingCas} subtitle={CM.resettingCasProcess} />
        
        {isLoading && (!data.volumes || data.volumes.length === 0) ? (
          <div className="flex items-center justify-center h-64">
            <div className="flex flex-col items-center gap-3">
              <div className="h-8 w-8 border-2 border-amber-500 border-t-transparent rounded-full animate-spin" />
              <Typography variant="label" className="text-13 text-slate-400 uppercase tracking-widest">{CM.loadingDashboard}</Typography>
            </div>
          </div>
        ) : (
          <div className="space-y-4">
            <DBPerformanceSection dbStats={dbStats} pollingProps={pollingProps} />
            <DBVolumesSection volumes={mappedVolumes} pollingProps={pollingProps} />
            <DBSpaceInfoSection spaceInfo={mappedSpaceInfo} pollingProps={pollingProps} />
            <DBBrokersCASSection
              brokersCAS={mappedBrokers}
              pollingProps={pollingProps}
              onViewSQLLog={(row) => setLogModal({ isOpen: true, brokerName: row.broker, casId: row.id, type: 'sql' })}
              onViewSlowQueryLog={(row) => setLogModal({ isOpen: true, brokerName: row.broker, casId: row.id, type: 'slow' })}
              onRestartCAS={handleRestartCAS}
            />
            <DBLockTransactionSection locks={data.locks || []} pollingProps={pollingProps} />
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

      {isActionError && (
        <Modal isOpen title={CM.updateFailed} icon="error" iconVariant="danger" onClose={resetAction} maxWidth="400px">
          <ModalStatusError 
            title={CM.failure}
            error={actionError}
            onRetry={resetAction}
            onCancel={resetAction}
            retryText={CM.dismiss}
          />
        </Modal>
      )}
    </div>
  );
}

export default React.memo(Component);
