import React, { useState, useEffect, useMemo } from 'react';
import { useDispatch } from 'react-redux';
import { fetchDashboardPerformance } from '../../databaseSlice';
import { Icon } from '../../../../components/ds/foundation/Icon';
import { Table } from '../../../../components/ds/layout/Table';
import { Typography } from '../../../../components/ds/foundation/Typography';
import { Card } from '../../../../components/ds/layout/Card';
import { ProgressBar } from '../../../../components/ds/foundation/ProgressBar';
import { useCM } from '../../../../constants/useCM';
import { useRefreshWhenShown } from './useRefreshWhenShown';
import { formatBytes1 } from '../../dbMemorySegments';

export default function DBPerformanceSection({ dbStats, pollingProps }) {
  const CM = useCM();
  const dispatch = useDispatch();
  const [isCollapsed, setIsCollapsed] = useState(false);
  const { hostUid, dbname, isTabActive, autoRefresh, refreshInterval } = pollingProps;

  // Manual refresh helper
  const refresh = () => {
    if (hostUid && dbname) dispatch(fetchDashboardPerformance({ hostUid, dbname }));
  };

  // Logic: Refresh once when becoming visible AND expanded
  useRefreshWhenShown({ hostUid, dbname, isTabActive, isCollapsed, refreshInterval, collapsedSections: pollingProps.collapsedSections, section: 'performance' }, refresh);

  // Logic: Interval polling when active AND expanded AND autoRefresh enabled
  useEffect(() => {
    let interval;
    if (isTabActive && !isCollapsed && autoRefresh && hostUid && dbname) {
      interval = setInterval(refresh, refreshInterval * 1000);
    }
    return () => clearInterval(interval);
  }, [isTabActive, isCollapsed, autoRefresh, refreshInterval, hostUid, dbname]);

  const columns = useMemo(() => [
    {
      header: CM.cpu,
      accessor: 'cpu',
      render: (val, row) => row.cpuNote ? (
        <span className="font-mono text-14 text-slate-400 cursor-help" title={row.cpuNote} aria-label={row.cpuNote}>{val}</span>
      ) : (
        <div className="min-w-[90px] pr-4">
          <ProgressBar 
            pct={row.cpuPct} 
            showValue 
            valueLabel={val} 
            variant="auto"
          />
        </div>
      )
    },
    {
      header: CM.memory,
      accessor: 'memory',
      // The CAS memory, over a bar of the host's memory: host use without
      // this database's CAS, the CAS, and free (dbMemorySegments.js). No bar
      // while the host's memory is unknown.
      render: (val, row) => {
        const seg = row.memSegments;
        if (!seg) return <span className="font-mono text-14 text-slate-700 dark:text-slate-200">{val}</span>;
        const summary = `${CM.dbMemHostLabel} ${formatBytes1(seg.host)} · ${CM.dbMemCasLabel} ${formatBytes1(seg.cas)} · ${CM.dbMemFreeLabel} ${formatBytes1(seg.free)} / ${CM.dbMemTotalLabel} ${formatBytes1(seg.total)}`;
        return (
          <div className="min-w-[100px] pr-4 space-y-1.5" title={summary} aria-label={summary} data-testid="db-mem-bar">
            <div className="px-0.5 text-12 font-mono font-black text-slate-700 dark:text-slate-200">{val}</div>
            <div className="w-full h-1.5 bg-slate-100 dark:bg-white/5 rounded-full overflow-hidden flex">
              <div className="h-full bg-slate-400 dark:bg-slate-500" style={{ width: `${seg.hostPct}%` }} title={`${CM.dbMemHostHint}: ${formatBytes1(seg.host)}`} data-segment="host" />
              <div className="h-full bg-sky-500" style={{ width: `${seg.casPct}%` }} title={`${CM.dbMemCasLabel}: ${formatBytes1(seg.cas)}`} data-segment="cas" />
              <div className="h-full" style={{ width: `${seg.freePct}%` }} title={`${CM.dbMemFreeLabel}: ${formatBytes1(seg.free)}`} data-segment="free" />
            </div>
          </div>
        );
      }
    },
    {
      header: CM.tps,
      accessor: 'tps',
      render: (val) => {
        const v = parseFloat(val);
        const color = v > 0 ? 'text-emerald-500' : 'text-slate-400';
        return (
          <div className="flex flex-col">
            <span className={`font-mono text-20 font-black leading-none transition-colors duration-500 ${color}`}>{val}</span>
            <span className="text-11 text-slate-400 uppercase tracking-widest font-bold mt-0.5">{CM.transPerSec}</span>
          </div>
        );
      }
    },
    {
      header: CM.qps,
      accessor: 'qps',
      render: (val) => {
        const v = parseInt(val.replace(/,/g, ''));
        const color = v > 0 ? 'text-rose-500' : 'text-slate-400';
        return (
          <div className="flex flex-col">
            <span className={`font-mono text-20 font-black leading-none transition-colors duration-500 ${color}`}>{val}</span>
            <span className="text-11 text-slate-400 uppercase tracking-widest font-bold mt-0.5">{CM.queriesPerSec}</span>
          </div>
        );
      }
    },
    {
      header: CM.bufferHit,
      accessor: 'hitRatio',
      render: (val, row) => (
        row.hitPct == null ? <span className="font-mono text-14 text-slate-400">-</span> : (
          <div className="min-w-[100px] pr-4">
            <ProgressBar 
              pct={row.hitPct} 
              showValue 
              valueLabel={val} 
              variant={row.hitPct < 85 ? 'rose' : 'emerald'}
            />
          </div>
        )
      )
    },
    { header: CM.fetchesPerSec, accessor: 'fetch',    render: (val) => <span className="font-mono text-14 text-slate-500">{val}</span> },
    { header: CM.dirtyPerSec,   accessor: 'dirty',    render: (val) => <span className="font-mono text-14 text-slate-500">{val}</span> },
    { header: CM.ioReadsPerSec, accessor: 'ioReads',  render: (val) => <span className="font-mono text-14 text-slate-500">{val}</span> },
    { header: CM.ioWritesPerSec, accessor: 'ioWrites', render: (val) => <span className="font-mono text-14 text-slate-500">{val}</span> },
  ], [CM]);

  return (
    <Card
      testId="db-dashboard-performance"
      title={
        <div className="flex items-center gap-2">
          <Icon name="monitoring" size="sm" weight={300} className="text-amber-500" />
          <span className="text-sm font-semibold text-slate-800 dark:text-slate-100">{CM.performanceMetrics}</span>
          <span className="text-12 text-slate-400 font-normal ml-1">· {CM.realTime}</span>
        </div>
      }
      bodyClassName="p-0"
      collapsible
      isCollapsed={isCollapsed}
      onToggle={(v) => setIsCollapsed(v)}
    >
      <Table columns={columns} data={dbStats} hoverable={false} />
    </Card>
  );
}
