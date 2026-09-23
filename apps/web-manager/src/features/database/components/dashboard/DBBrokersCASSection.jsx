import React, { useState, useEffect, useRef, useMemo } from 'react';
import { useDispatch } from 'react-redux';
import { fetchDashboardCAS } from '../../databaseSlice';
import { Icon } from '../../../../components/ds/foundation/Icon';
import { Table } from '../../../../components/ds/layout/Table';
import { Card } from '../../../../components/ds/layout/Card';
import { StatusBadge } from '../../../../components/ds/foundation/StatusBadge';
import { useCM } from '../../../../constants/useCM';

export default function DBBrokersCASSection({ brokersCAS, pollingProps, onViewSQLLog, onViewSlowQueryLog, onRestartCAS }) {
  const CM = useCM();
  const dispatch = useDispatch();
  const [isCollapsed, setIsCollapsed] = useState(false);
  const { hostUid, dbname, isTabActive, autoRefresh, refreshInterval } = pollingProps;

  const refresh = () => {
    if (hostUid && dbname) dispatch(fetchDashboardCAS({ hostUid, dbname }));
  };

  const wasActiveAndExpanded = useRef(isTabActive && !isCollapsed);
  useEffect(() => {
    const currentActiveAndExpanded = isTabActive && !isCollapsed;
    if (currentActiveAndExpanded && !wasActiveAndExpanded.current) {
      refresh();
    }
    wasActiveAndExpanded.current = currentActiveAndExpanded;
  }, [isTabActive, isCollapsed, hostUid, dbname]);

  useEffect(() => {
    let interval;
    if (isTabActive && !isCollapsed && autoRefresh && hostUid && dbname) {
      interval = setInterval(refresh, refreshInterval * 1000);
    }
    return () => clearInterval(interval);
  }, [isTabActive, isCollapsed, autoRefresh, refreshInterval, hostUid, dbname]);

  const readyCount = brokersCAS.filter(c => c.status === 'READY').length;
  const busyCount  = brokersCAS.length - readyCount;

  const columns = useMemo(() => [
    {
      header: CM.broker,
      accessor: 'broker',
      render: (val) => <span className="font-mono text-14 font-semibold text-slate-700 dark:text-slate-200 uppercase">{val}</span>
    },
    { header: 'CAS', accessor: 'id',  sortAccessor: '_idNum',  render: (val) => <span className="font-mono text-14 text-slate-400">{val}</span> },
    { header: 'PID', accessor: 'pid', sortAccessor: '_pidNum', render: (val) => <span className="font-mono text-14 text-slate-400">{val}</span> },
    { header: CM.qps, accessor: 'qps', sortAccessor: '_qpsNum', render: (val) => <span className="font-mono text-14 text-amber-600 dark:text-amber-400 font-semibold">{val ?? '—'}</span> },
    { header: 'LQS', accessor: 'lqs', sortAccessor: '_lqsNum', render: (val) => <span className="font-mono text-14 text-slate-500">{val}</span> },
    {
      header: CM.status,
      accessor: 'status',
      render: (val) => {
        const ready = val === 'READY';
        return (
          <StatusBadge 
            label={val} 
            variant={ready ? 'emerald' : 'amber'} 
            pulse={ready} 
          />
        );
      }
    },
    { header: CM.lastConn, accessor: 'lastConn', render: (val) => <span className="font-mono text-13 text-slate-400">{val}</span> },
    {
      header: CM.actions,
      accessor: 'actions',
      align: 'center',
      render: (_, row) => (
        <div className="flex items-center gap-1">
          <button onClick={() => onRestartCAS?.(row)} title={CM.restartCasTitle} className="p-1.5 rounded-sm hover:bg-slate-100 dark:hover:bg-white/5 text-slate-400 hover:text-amber-500 transition-colors">
            <Icon name="restart_alt" size="sm" weight={300} />
          </button>
          <button onClick={() => onViewSQLLog?.(row)} title={CM.sqlLogs} className="p-1.5 rounded-sm hover:bg-slate-100 dark:hover:bg-white/5 text-slate-400 hover:text-sky-500 transition-colors">
            <Icon name="terminal" size="sm" weight={300} />
          </button>
          <button onClick={() => onViewSlowQueryLog?.(row)} title={CM.slowQueryLogs} className="p-1.5 rounded-sm hover:bg-slate-100 dark:hover:bg-white/5 text-slate-400 hover:text-rose-500 transition-colors">
            <Icon name="timer_off" size="sm" weight={300} />
          </button>
        </div>
      )
    },
  ], [CM, onRestartCAS, onViewSQLLog, onViewSlowQueryLog]);

  return (
    <Card
      testId="db-dashboard-cas"
      title={
        <div className="flex items-center gap-3">
          <Icon name="dns" size="sm" weight={300} className="text-amber-500" />
          <span className="text-sm font-semibold text-slate-800 dark:text-slate-100">{CM.casBrokers}</span>
          <div className="flex items-center gap-2 ml-2">
            <StatusBadge label={CM.readyCount(readyCount)} variant="emerald" pulse={true} className="border-none bg-transparent dark:bg-transparent" />
            <span className="text-slate-200 dark:text-white/10">·</span>
            <StatusBadge label={CM.busyCount(busyCount)} variant="amber" pulse={true} className="border-none bg-transparent dark:bg-transparent" />
          </div>
        </div>
      }
      bodyClassName="p-0"
      collapsible
      isCollapsed={isCollapsed}
      onToggle={(v) => setIsCollapsed(v)}
    >
      <Table columns={columns} data={brokersCAS} sortable />
    </Card>
  );
}
