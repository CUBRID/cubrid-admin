import React, { useState, useEffect, useRef, useMemo } from 'react';
import { useDispatch } from 'react-redux';
import { fetchDashboardPerformance } from '../../databaseSlice';
import { Icon } from '../../../../components/ds/foundation/Icon';
import { Table } from '../../../../components/ds/layout/Table';
import { Typography } from '../../../../components/ds/foundation/Typography';
import { Card } from '../../../../components/ds/layout/Card';
import { ProgressBar } from '../../../../components/ds/foundation/ProgressBar';
import { useCM } from '../../../../constants/useCM';

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
  const wasActiveAndExpanded = useRef(isTabActive && !isCollapsed);
  useEffect(() => {
    const currentActiveAndExpanded = isTabActive && !isCollapsed;
    if (currentActiveAndExpanded && !wasActiveAndExpanded.current) {
      refresh();
    }
    wasActiveAndExpanded.current = currentActiveAndExpanded;
  }, [isTabActive, isCollapsed, hostUid, dbname]);

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
      render: (val, row) => (
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
      render: (val, row) => (
        <div className="min-w-[100px] pr-4">
          <ProgressBar 
            pct={row.memPct} 
            showValue 
            valueLabel={val} 
            variant="auto"
          />
        </div>
      )
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
        <div className="min-w-[100px] pr-4">
          <ProgressBar 
            pct={row.hitPct} 
            showValue 
            valueLabel={val} 
            variant={row.hitPct < 85 ? 'rose' : 'emerald'}
          />
        </div>
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
