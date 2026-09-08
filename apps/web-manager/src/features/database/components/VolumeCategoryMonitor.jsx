import { usePollingRefresh } from '../../../infrastructure/hooks/usePollingRefresh';
import React, { useMemo, memo } from 'react';
import { useSelector, shallowEqual } from 'react-redux';
import { fetchDatabaseSpaceInfo } from '../databaseSlice';
import MonitoringSettingsPopover from '../../user/components/MonitoringSettingsPopover';
import { formatPagesToSize } from '../../../infrastructure/utils/format';

import { Icon } from '../../../components/ds/foundation/Icon';
import { Typography } from '../../../components/ds/foundation/Typography';
import { Table } from '../../../components/ds/layout/Table';
import { Card } from '../../../components/ds/layout/Card';
import { useCM } from '../../../constants/useCM';

// ── Helpers ──
// Built as a function (not a plain object) because two of the labels are
// locale-aware and must be resolved from a `CM` pack supplied by the caller,
// which is only available inside a component via useCM().
const getCategoryMeta = (CM) => ({
  Permanent_PermanentData: { label: CM.permanentDataLabel, icon: 'hard_drive', color: 'text-sky-500', bg: 'bg-sky-500/10', border: 'border-sky-500/20', dot: 'bg-sky-500' },
  Permanent_TemporaryData: { label: CM.permanentTemp, icon: 'storage', color: 'text-violet-500', bg: 'bg-violet-500/10', border: 'border-violet-500/20', dot: 'bg-violet-500' },
  Temporary_TemporaryData: { label: CM.temporaryDataLabel, icon: 'timer', color: 'text-amber-500', bg: 'bg-amber-500/10', border: 'border-amber-500/20', dot: 'bg-amber-500' },
  Active: { label: CM.activeLog, icon: 'article', color: 'text-emerald-500', bg: 'bg-emerald-500/10', border: 'border-emerald-500/20', dot: 'bg-emerald-500' },
  Archive: { label: CM.archiveLog, icon: 'inventory_2', color: 'text-slate-400', bg: 'bg-slate-500/10', border: 'border-slate-400/20', dot: 'bg-slate-400' },
});


const formatMB = (pages, pageSize) => ((parseInt(pages) * pageSize) / (1024 * 1024)).toFixed(1);

// ── Sub-components (Memoized) ──

const CategoryHeader = memo(({ meta, summary, usageSeverity, pageSize, onRefresh, dashboardInterval, isLoading, lastRefreshed, dbname }) => {
  const CM = useCM();
  return (
  <header className="px-6 py-2.5 border-b border-slate-100 dark:border-white/4 flex items-center justify-between shrink-0 bg-white dark:bg-background-dark sticky top-0 z-10">
    <div className="flex items-center gap-3">
      <div className="w-8 h-8 rounded-lg bg-amber-500/10 border border-amber-500/20 flex items-center justify-center shrink-0 shadow-sm">
        <Icon name={meta.icon} size="sm" weight={300} className="text-amber-500" />
      </div>
      <div>
        <div className="flex items-center gap-2">
          <Typography variant="h1" className="text-15 font-bold text-slate-800 dark:text-slate-100 leading-tight">
            {CM.volumeCategoryMonitor}
          </Typography>
          <div className={`px-2 py-0.5 rounded-full border flex items-center gap-1.5 shrink-0 transition-all duration-300 ${dashboardInterval > 0 ? 'bg-emerald-500/10 border-emerald-500/30' : 'bg-slate-100 dark:bg-white/5 border-slate-200 dark:border-white/10'}`}>
            <div className={`w-1 h-1 rounded-full ${dashboardInterval > 0 ? 'bg-emerald-500 animate-pulse' : 'bg-slate-400'}`} />
            <span className={`text-11 font-bold ${dashboardInterval > 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-slate-500 dark:text-slate-400'}`}>
              {dashboardInterval > 0 ? CM.live : CM.paused}
            </span>
          </div>
        </div>
        <div className="flex items-center gap-1.5 mt-0.5">
          <Typography variant="label" className="text-11 text-slate-400 font-mono tracking-tight">{dbname}</Typography>
          <span className="text-slate-300 dark:text-slate-700">·</span>
          <Typography variant="label" className={`text-11 font-bold uppercase tracking-widest ${meta.color}`}>
            {meta.label}
          </Typography>
        </div>
      </div>
    </div>

    <div className="flex items-center gap-1.5">
      <div className="hidden lg:flex items-center gap-6 mr-4 opacity-80">
        <div className="text-right">
          <Typography variant="label" className="text-10 text-slate-400 font-bold uppercase tracking-widest block mb-0.5">{CM.capacity}</Typography>
          <Typography variant="p" className="text-14 font-black text-slate-700 dark:text-slate-200 font-mono leading-none">{formatPagesToSize(summary.total, pageSize)}</Typography>
        </div>
        <div className="w-px h-6 bg-slate-200 dark:bg-white/6" />
        <div className="text-right">
          <Typography variant="label" className="text-10 text-slate-400 font-bold uppercase tracking-widest block mb-0.5">{CM.usageLabel}</Typography>
          <Typography variant="p" className={`text-14 font-black font-mono leading-none ${usageSeverity}`}>{summary.pct.toFixed(1)}%</Typography>
        </div>
      </div>

      <Typography variant="label" className="text-12 text-slate-400 font-mono tracking-tight hidden lg:block mr-2">
        {CM.syncedAt(lastRefreshed.toLocaleTimeString('en-US', { hour12: true }))}
      </Typography>

      <button
        onClick={onRefresh}
        disabled={isLoading}
        className={`w-9 h-9 flex items-center justify-center rounded-lg border transition-all active:scale-[0.98]
          ${isLoading
            ? 'bg-slate-100 dark:bg-white/5 text-slate-300 dark:text-slate-600 border-slate-200 dark:border-white/5 cursor-not-allowed opacity-50'
            : 'bg-slate-50 dark:bg-white/[0.03] border-slate-200 dark:border-white/10 text-slate-400 hover:text-amber-600 dark:hover:text-amber-500 hover:border-amber-500/50 hover:bg-white dark:hover:bg-white/5'}`}
        title={CM.refreshCategoryMetrics}
      >
        <Icon name="refresh" size="19px" className={isLoading ? 'animate-spin' : ''} />
      </button>

      <div className="w-[1px] h-4 bg-slate-200 dark:bg-white/10 mx-0.5" />
      <MonitoringSettingsPopover />
    </div>
  </header>
  );
});

const CategoryStats = memo(({ volumes, summary, pageSize }) => {
  const CM = useCM();
  return (
    <div className="grid grid-cols-3 gap-3">
      {[
        { label: CM.volumesLabel, val: volumes.length, icon: 'layers', color: 'text-sky-500' },
        { label: CM.totalLabel, val: formatPagesToSize(summary.total, pageSize), icon: 'dns', color: 'text-slate-600' },
        { label: CM.spaceUsage, val: `${summary.pct.toFixed(1)}%`, icon: 'donut_small', color: 'text-amber-500' },
      ].map((stat, i) => (
        <div key={i} className="bg-white dark:bg-white/2 border border-slate-200 dark:border-white/5 rounded-sm p-3.5 flex flex-col gap-1.5 shadow-xs">
          <Typography variant="label" className="text-11 text-slate-400 font-bold uppercase tracking-widest">{stat.label}</Typography>
          <Typography variant="p" className={`text-15 font-bold font-mono tracking-tight truncate ${stat.color === 'text-slate-600' ? 'text-slate-700 dark:text-slate-200' : stat.color}`}>{stat.val}</Typography>
        </div>
      ))}
    </div>
  );
});

const UtilizationBar = memo(({ summary, usageSeverity, pageSize }) => {
  const CM = useCM();
  return (
    <div className="bg-white dark:bg-white/2 border border-slate-200 dark:border-white/5 rounded-sm px-5 py-4">
      <div className="flex items-center justify-between mb-2">
        <Typography variant="label" className="text-12 font-bold text-slate-500 uppercase tracking-widest">{CM.overallUtilization}</Typography>
        <Typography variant="label" className={`text-12 font-black font-mono ${usageSeverity}`}>{summary.pct.toFixed(2)}%</Typography>
      </div>
      <div className="w-full h-2 bg-slate-100 dark:bg-white/5 rounded-none overflow-hidden">
        <div
          className="h-full bg-amber-500 transition-all duration-1s ease-out relative"
          style={{ width: `${summary.pct}%` }}
        >
          <div className="absolute inset-0 bg-white/20" />
        </div>
      </div>
      <div className="flex justify-between mt-1.5">
        <Typography variant="label" className="text-11 text-slate-400 font-mono">{formatPagesToSize(summary.used, pageSize)} {CM.usedLabel}</Typography>
        <Typography variant="label" className="text-11 text-slate-400 font-mono">{formatPagesToSize(summary.free, pageSize)} {CM.freeLabel}</Typography>
      </div>
    </div>
  );
});

const VolumeTableContainer = memo(({ volumes, pageSize }) => {
  const CM = useCM();
  return (
    <Card bodyClassName="p-0 overflow-hidden" className="border-slate-200 dark:border-white/5 shadow-xs bg-white dark:bg-white/1 rounded-sm">
      <Table
        selectable
        columns={[
          {
            header: CM.volumeName,
            accessor: 'spacename',
            render: (val) => {
              const fileName = val?.split(/[/\\]/).pop() || val;
              return (
                <div className="flex items-center gap-3 py-0.5">
                  <div className="w-7 h-7 rounded-sm bg-slate-100 dark:bg-white/5 flex items-center justify-center text-slate-400 shrink-0">
                    <Icon name="draft" size="sm" weight={300} />
                  </div>
                  <span className="text-15 font-semibold text-slate-700 dark:text-slate-200 font-mono" title={val}>
                    {fileName}
                  </span>
                </div>
              );
            }
          },
          {
            header: CM.spaceUsage,
            accessor: 'usedpage',
            render: (val, row) => {
              const usedPages = parseInt(val || 0);
              const totalPages = parseInt(row.totalpage || 0);
              const pct = totalPages > 0 ? (usedPages / totalPages) * 100 : 0;
              const barColor = pct > 85 ? 'bg-rose-500' : pct > 60 ? 'bg-amber-500' : 'bg-blue-500';
              return (
                <div className="flex flex-col gap-1.5 py-1 min-w-[240px]">
                  <div className="w-full h-1.5 bg-slate-100 dark:bg-white/6 overflow-hidden">
                    <div className={`h-full ${barColor} transition-all duration-700ms`} style={{ width: `${pct}%` }} />
                  </div>
                  <div className="flex justify-between">
                    <span className="text-12 font-bold font-mono text-slate-500">{formatMB(usedPages, pageSize)} MB {CM.usedLabel}</span>
                    <span className="text-12 font-bold font-mono text-slate-400">{pct.toFixed(1)}%</span>
                  </div>
                </div>
              );
            }
          },
          {
            header: CM.totalLabel,
            accessor: 'totalpage',
            className: 'text-right',
            render: (val) => (
              <span className="text-15 font-bold text-slate-600 dark:text-slate-300 font-mono">{formatPagesToSize(val, pageSize)}</span>
            )
          },
          {
            header: CM.pagesLabel,
            accessor: 'totalpage',
            className: 'text-right pr-4',
            render: (val) => (
              <span className="text-14 text-slate-400 font-mono">
                {parseInt(val).toLocaleString()}
              </span>
            )
          }
        ]}
        data={volumes}
      />
    </Card>
  );
});

// ── Main Component ──

const Component = function VolumeCategoryMonitor({ hostUid, dbname, category }) {
  const CM = useCM();
  const { spaceInfo, spaceInfoLoading } = useSelector((state) => state.databaseMonitoring || {}, shallowEqual);
  const { preferences } = useSelector((state) => state.user, shallowEqual);

  const tabId = `vol_category:${hostUid}:${dbname}:${category}`;
  const { isManualRefreshing: isRefreshing, lastRefreshed, handleRefresh } = usePollingRefresh({
    hostUid,
    tabId,
    pollingIntervalSeconds: preferences?.dashboardInterval || 0,
    onFetch: () => (dispatch) => dispatch(fetchDatabaseSpaceInfo({ hostUid, dbname }))
  });

  const dbSpace = spaceInfo[`${hostUid}:${dbname}`];
  const isLoading = spaceInfoLoading?.[`${hostUid}:${dbname}`];
  const meta = useMemo(() => {
    const categoryMeta = getCategoryMeta(CM);
    return categoryMeta[category] || categoryMeta.Permanent_PermanentData;
  }, [category, CM]);

  const volumes = useMemo(() => {
    if (!dbSpace || !dbSpace.volumes) return [];
    const allVolumes = dbSpace.volumes;
    switch (category) {
      case 'Permanent_PermanentData': return allVolumes.filter(v => v.type === 'PERMANENT' && (v.purpose === 'PERMANENT' || !v.purpose));
      case 'Permanent_TemporaryData': return allVolumes.filter(v => v.type === 'PERMANENT' && v.purpose === 'TEMPORARY');
      case 'Temporary_TemporaryData': return allVolumes.filter(v => v.type === 'TEMPORARY');
      case 'Active': return allVolumes.filter(v => v.type === 'Active_log');
      case 'Archive': return allVolumes.filter(v => v.type === 'Archive_log');
      default: return [];
    }
  }, [dbSpace, category]);

  const pageSize = parseInt(dbSpace?.pagesize || 4096);

  const summary = useMemo(() => {
    let total = 0, used = 0;
    volumes.forEach(v => {
      total += parseInt(v.totalpage || 0);
      used += parseInt(v.usedpage || 0);
    });
    return { total, used, free: total - used, pct: total > 0 ? (used / total) * 100 : 0 };
  }, [volumes]);

  const usageSeverity = summary.pct > 85 ? 'text-rose-500' : summary.pct > 60 ? 'text-amber-500' : 'text-emerald-500';

  return (
    <div className="flex-1 flex flex-col h-full bg-white dark:bg-background-dark overflow-hidden select-none animate-in fade-in duration-300">
      <CategoryHeader
        meta={meta}
        summary={summary}
        usageSeverity={usageSeverity}
        pageSize={pageSize}
        isLoading={isLoading || isRefreshing}
        onRefresh={handleRefresh}
        dashboardInterval={preferences?.dashboardInterval || 0}
        lastRefreshed={lastRefreshed}
        dbname={dbname}
      />

      <div className="flex-1 overflow-auto p-6">
        <div className="max-w-7xl mx-auto space-y-5">
          <CategoryStats volumes={volumes} summary={summary} pageSize={pageSize} />
          <UtilizationBar summary={summary} usageSeverity={usageSeverity} pageSize={pageSize} />
          <VolumeTableContainer volumes={volumes} pageSize={pageSize} />
        </div>
      </div>

    </div>
  );
}

export default React.memo(Component);
