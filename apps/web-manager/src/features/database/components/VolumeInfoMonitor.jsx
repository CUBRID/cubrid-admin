import { usePollingRefresh } from '../../../infrastructure/hooks/usePollingRefresh';
import React, { useMemo } from 'react';
import { useDispatch, useSelector, shallowEqual } from 'react-redux';
import { fetchDatabaseSpaceInfo } from '../databaseSlice';
import MonitoringSettingsPopover from '../../user/components/MonitoringSettingsPopover';

import { Icon } from '../../../components/ds/foundation/Icon';
import { Typography } from '../../../components/ds/foundation/Typography';
import { PageLoader } from '../../../components/ds/feedback/PageLoader';
import { EmptyState } from '../../../components/ds/feedback/EmptyState';
import { useCM } from '../../../constants/useCM';

const parseNumber = (value) => {
  if (typeof value === 'number') return value;
  if (!value) return 0;
  return parseInt(value.toString().trim().replace(/,/g, '').split(/\s+/)[0], 10) || 0;
};

const formatNumber = (value) => parseNumber(value).toLocaleString();

const formatMegabytes = (value) => `${value.toFixed(2)} MB`;

const clampPercent = (value) => Math.min(100, Math.max(0, value));

export default function VolumeInfoMonitor({ tabId }) {
  const CM = useCM();
  const dispatch = useDispatch();
  const { preferences } = useSelector((state) => state.user, shallowEqual);
  const [, hostUid, dbname, volname] = tabId.split(':');

  const { spaceInfo, spaceInfoLoading } = useSelector((state) => state.databaseMonitoring || {}, shallowEqual);
  const dbSpace = spaceInfo?.[`${hostUid}:${dbname}`];
  const isLoading = spaceInfoLoading?.[`${hostUid}:${dbname}`];

  const { isManualRefreshing: isRefreshing, lastRefreshed, handleRefresh } = usePollingRefresh({
    hostUid,
    tabId,
    pollingIntervalSeconds: preferences.dashboardInterval,
    onFetch: () => () => dispatch(fetchDatabaseSpaceInfo({ hostUid, dbname }))
  });

  const volume = useMemo(() => {
    if (!dbSpace) return null;
    return dbSpace.volumes.find(v => v.spacename === volname);
  }, [dbSpace, volname]);

  const pageSize = parseNumber(dbSpace?.summary?.[0]?.pagesize) || 4096;

  if (isLoading && !volume) {
    return (
      <div className="flex-1 flex h-full bg-white dark:bg-background-dark">
        <PageLoader
          title={CM.loadingVolumeInfo}
          subtitle={CM.loadingVolumeInfoSub}
          icon="storage"
        />
      </div>
    );
  }

  if (!volume) {
    return (
      <div className="flex-1 flex h-full bg-white dark:bg-background-dark">
        <EmptyState
          icon="inventory_2"
          title={CM.volumeNotFound}
          subtitle={`"${volname}" was not found in ${dbname}.`}
        />
      </div>
    );
  }

  const freePages  = parseNumber(volume.freepage);
  const totalPages = parseNumber(volume.totalpage);
  const usedPages  = Math.max(0, totalPages - freePages);
  const freeM      = (freePages  * pageSize) / (1024 * 1024);
  const totalM     = (totalPages * pageSize) / (1024 * 1024);
  const usedM      = (usedPages  * pageSize) / (1024 * 1024);
  const usedPct    = totalPages > 0 ? clampPercent((usedPages / totalPages) * 100) : 0;
  const freePct    = totalPages > 0 ? clampPercent((freePages / totalPages) * 100) : 0;

  const severity = usedPct > 85 ? 'text-rose-500' : usedPct > 60 ? 'text-amber-500' : 'text-emerald-500';
  const barColor = usedPct > 85 ? 'bg-rose-500' : usedPct > 60 ? 'bg-amber-500' : 'bg-emerald-500';

  const volumeName = volume.spacename?.split(/[/\\]/).pop() || volume.spacename;
  const infoRows = [
    { label: CM.volNameRow, value: volumeName, icon: 'storage' },
    { label: CM.locationRow,    value: volume.location, icon: 'folder' },
    { label: CM.purposeRow,     value: volume.purpose || '-', icon: 'flag' },
    { label: CM.pageSizeRow,   value: `${formatNumber(pageSize)} B`, icon: 'data_array' },
    { label: CM.totalPagesRow, value: formatNumber(totalPages), icon: 'article' },
    { label: CM.usedPagesRow,  value: formatNumber(usedPages), icon: 'inventory' },
    { label: CM.freePagesRow,  value: formatNumber(freePages), icon: 'inventory_2' },
    { label: CM.totalSizeRow,  value: formatMegabytes(totalM), icon: 'straighten' },
  ];

  return (
    <div className="flex-1 flex flex-col h-full bg-white dark:bg-background-dark overflow-hidden select-none animate-in fade-in duration-300">

      {/* ── Header ── */}
      <header className="px-6 py-2.5 border-b border-slate-100 dark:border-white/4 flex items-center justify-between shrink-0 bg-white dark:bg-background-dark sticky top-0 z-10">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-lg bg-amber-500/10 border border-amber-500/20 flex items-center justify-center shrink-0 shadow-sm">
            <Icon name="hard_drive" size="sm" weight={300} className="text-amber-500" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <Typography variant="h1" className="text-15 font-bold text-slate-800 dark:text-slate-100 tracking-tight leading-tight">{CM.volumeInfo}</Typography>
              <div className={`px-2 py-0.5 rounded-full border flex items-center gap-1.5 shrink-0 transition-all duration-300 ${preferences.dashboardInterval > 0 ? 'bg-emerald-500/10 border-emerald-500/30' : 'bg-slate-100 dark:bg-white/5 border-slate-200 dark:border-white/10'}`}>
                <div className={`w-1 h-1 rounded-full ${preferences.dashboardInterval > 0 ? 'bg-emerald-500 animate-pulse' : 'bg-slate-400'}`} />
                <span className={`text-11 font-bold ${preferences.dashboardInterval > 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-slate-500 dark:text-slate-400'}`}>
                  {preferences.dashboardInterval > 0 ? CM.live : CM.paused}
                </span>
              </div>
            </div>
            <div className="flex items-center gap-1.5 mt-0.5">
              <div className="w-1.5 h-1.5 rounded-full bg-amber-500/60" />
              <Typography variant="label" className="text-12 text-slate-400 font-mono leading-none truncate max-w-sm">
                {volume.location}
              </Typography>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-1.5">
          <Typography variant="label" className="text-12 text-slate-400 font-mono tracking-tight hidden lg:block mr-2">
            {CM.syncedAt(lastRefreshed.toLocaleTimeString('en-US', { hour12: true }))}
          </Typography>

          <button
            onClick={handleRefresh}
            disabled={isLoading || isRefreshing}
            className={`w-9 h-9 flex items-center justify-center rounded-lg border transition-all active:scale-[0.98]
              ${(isLoading || isRefreshing)
                ? 'bg-slate-100 dark:bg-white/5 text-slate-300 dark:text-slate-600 border-slate-200 dark:border-white/5 cursor-not-allowed opacity-50'
                : 'bg-slate-50 dark:bg-white/[0.03] border-slate-200 dark:border-white/10 text-slate-400 hover:text-amber-600 dark:hover:text-amber-500 hover:border-amber-500/50 hover:bg-white dark:hover:bg-white/5'}`}
            title={CM.refreshVolumeData}
          >
            <Icon name="refresh" size="19px" className={(isLoading || isRefreshing) ? 'animate-spin' : ''} />
          </button>

          <div className="w-[1px] h-4 bg-slate-200 dark:bg-white/10 mx-0.5" />
          <MonitoringSettingsPopover />
        </div>
      </header>

      {/* ── Body ── */}
      <div className="flex-1 min-h-0 overflow-y-auto p-5 space-y-4">
        <section className="border border-slate-200 dark:border-white/6 bg-white dark:bg-white/2 rounded-sm p-4 space-y-4">
          <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <Icon name="bar_chart" size="sm" weight={300} className="text-amber-500" />
                <Typography variant="p" className="text-14 font-semibold text-slate-800 dark:text-slate-100">
                  {CM.volumeUsage}
                </Typography>
              </div>
              <Typography variant="label" className="mt-1 block text-12 text-slate-400 font-mono truncate" title={volumeName}>
                {volumeName}
              </Typography>
            </div>

            <div className="grid grid-cols-3 gap-2 w-full lg:w-auto lg:min-w-[360px]">
              <div className="border border-slate-100 dark:border-white/6 bg-slate-50 dark:bg-white/[0.03] rounded-sm p-2">
                <Typography variant="label" className="text-11 text-slate-400 font-bold uppercase tracking-widest">{CM.usedLabel}</Typography>
                <Typography variant="p" className="text-15 font-black text-slate-700 dark:text-slate-100 font-mono leading-tight">{formatMegabytes(usedM)}</Typography>
              </div>
              <div className="border border-slate-100 dark:border-white/6 bg-slate-50 dark:bg-white/[0.03] rounded-sm p-2">
                <Typography variant="label" className="text-11 text-slate-400 font-bold uppercase tracking-widest">{CM.freeLabel}</Typography>
                <Typography variant="p" className="text-15 font-black text-emerald-500 font-mono leading-tight">{formatMegabytes(freeM)}</Typography>
              </div>
              <div className="border border-slate-100 dark:border-white/6 bg-slate-50 dark:bg-white/[0.03] rounded-sm p-2">
                <Typography variant="label" className="text-11 text-slate-400 font-bold uppercase tracking-widest">{CM.totalLabel}</Typography>
                <Typography variant="p" className="text-15 font-black text-slate-700 dark:text-slate-100 font-mono leading-tight">{formatMegabytes(totalM)}</Typography>
              </div>
            </div>
          </div>

          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <Typography variant="label" className="text-11 text-slate-400 font-bold uppercase tracking-widest">
                {CM.allocationLabel}
              </Typography>
              <Typography variant="label" className={`text-12 font-black font-mono ${severity}`}>
                {CM.percentUsed.replace('{0}', usedPct.toFixed(2))}
              </Typography>
            </div>
            <div className="h-8 w-full bg-slate-100 dark:bg-white/6 border border-slate-200 dark:border-white/6 overflow-hidden rounded-sm flex">
              <div
                className={`${barColor} transition-all duration-1000 ease-out`}
                style={{ width: `${usedPct}%` }}
                title={`${formatMegabytes(usedM)} ${CM.usedLabel.toLowerCase()}`}
              />
              <div
                className="bg-slate-300 dark:bg-white/20 transition-all duration-1000 ease-out"
                style={{ width: `${freePct}%` }}
                title={`${formatMegabytes(freeM)} ${CM.freeLabel.toLowerCase()}`}
              />
            </div>
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="flex items-center gap-4">
                <span className="flex items-center gap-1.5 text-12 text-slate-500 dark:text-slate-400">
                  <span className={`w-2 h-2 rounded-full ${barColor}`} />
                  {CM.usedLabel} {formatMegabytes(usedM)}
                </span>
                <span className="flex items-center gap-1.5 text-12 text-slate-500 dark:text-slate-400">
                  <span className="w-2 h-2 rounded-full bg-slate-300 dark:bg-white/20" />
                  {CM.freeLabel} {formatMegabytes(freeM)}
                </span>
              </div>
              <Typography variant="label" className="text-12 text-slate-400 font-mono">
                {formatNumber(usedPages)} / {formatNumber(totalPages)} {CM.pagesLabel}
              </Typography>
            </div>
          </div>
        </section>

        <section className="grid grid-cols-1 xl:grid-cols-[280px_minmax(0,1fr)] gap-4">
          <div className="border border-slate-200 dark:border-white/6 bg-white dark:bg-white/2 rounded-sm p-4">
            <Typography variant="label" className="text-11 font-bold text-slate-400 uppercase tracking-widest block mb-2">
              {CM.type}
            </Typography>
            <div className="flex items-center gap-2 min-w-0">
              <div className="w-9 h-9 rounded-lg bg-amber-500/10 border border-amber-500/20 flex items-center justify-center shrink-0">
                <Icon name="category" size="sm" weight={300} className="text-amber-500" />
              </div>
              <Typography variant="p" className="text-15 font-black text-slate-700 dark:text-slate-100 font-mono truncate" title={volume.type}>
                {volume.type || '-'}
              </Typography>
            </div>
          </div>

          <div className="border border-slate-200 dark:border-white/6 bg-white dark:bg-white/2 rounded-sm p-4">
            <Typography variant="label" className="text-11 font-bold text-slate-400 uppercase tracking-widest block mb-2">
              {CM.properties}
            </Typography>
            <div className="divide-y divide-slate-100 dark:divide-white/6">
              {infoRows.map((row) => (
                <div key={row.label} className="grid grid-cols-1 sm:grid-cols-[180px_minmax(0,1fr)] gap-1 sm:gap-4 py-2.5 first:pt-0 last:pb-0">
                  <div className="flex items-center gap-1.5 text-slate-400 min-w-0">
                    <Icon name={row.icon} size="xs" weight={300} className="shrink-0" />
                    <Typography variant="label" className="text-11 uppercase tracking-wider font-semibold truncate">
                      {row.label}
                    </Typography>
                  </div>
                  <Typography variant="p" className="text-14 font-semibold text-slate-700 dark:text-slate-200 font-mono break-all" title={row.value}>
                    {row.value}
                  </Typography>
                </div>
              ))}
            </div>
          </div>
        </section>
      </div>
    </div>
  );
}
