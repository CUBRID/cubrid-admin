import React, { useState, useEffect, useRef, useMemo } from 'react';
import { useDispatch, useSelector, shallowEqual } from 'react-redux';
import {
  fetchBackupSchedule,
  fetchQueryPlan,
  setSelectedDatabase,
  setSelectedBackupId,
  openEditBackupPlanModal,
  openEditQueryPlanModal,
} from '../../databaseSlice';
import { dbKey } from '../../dbKey';
import { Icon } from '../../../../components/ds/foundation/Icon';
import { Table } from '../../../../components/ds/layout/Table';
import { Card } from '../../../../components/ds/layout/Card';
import { EmptyState } from '../../../../components/ds/feedback/EmptyState';
import { useCM } from '../../../../constants/useCM';

const BACKUP_LEVEL_TITLE_KEY = {
  '0': 'backupLevelFullTitle',
  '1': 'backupLevelIncrL1Title',
  '2': 'backupLevelIncrL2Title',
};

export default function DBJobAutomationSection({ pollingProps }) {
  const CM = useCM();
  const dispatch = useDispatch();
  const [isCollapsed, setIsCollapsed] = useState(false);
  const { hostUid, dbname, isTabActive, autoRefresh, refreshInterval } = pollingProps;

  const { backupSchedules, backupSchedulesLoading, queryPlans, queryPlansLoading } = useSelector(
    (state) => {
      const key = dbKey(hostUid, dbname);
      return {
        backupSchedules: state.databaseOperation.backupSchedules[key],
        backupSchedulesLoading: state.databaseOperation.backupSchedulesLoading[key],
        queryPlans: state.databaseOperation.queryPlans[key],
        queryPlansLoading: state.databaseOperation.queryPlansLoading[key],
      };
    },
    shallowEqual
  );

  const refresh = () => {
    if (!hostUid || !dbname) return;
    dispatch(fetchBackupSchedule({ hostUid, dbname }));
    dispatch(fetchQueryPlan({ hostUid, dbname }));
  };

  const wasActiveAndExpanded = useRef(false);
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

  const openBackupDetail = (row) => {
    dispatch(setSelectedDatabase(dbname));
    dispatch(setSelectedBackupId(row.backupid));
    dispatch(openEditBackupPlanModal());
  };

  const openQueryDetail = (row) => {
    dispatch(setSelectedDatabase(dbname));
    dispatch(openEditQueryPlanModal(row.query_id));
  };

  const backupColumns = useMemo(() => [
    {
      header: CM.planIdLabel,
      accessor: 'backupid',
      render: (v) => <span className="font-mono text-14 font-semibold text-slate-700 dark:text-slate-200">{v}</span>,
    },
    {
      header: CM.path,
      accessor: 'path',
      render: (v) => <span className="font-mono text-13 text-slate-500 truncate block max-w-[240px]">{v}</span>,
    },
    {
      header: CM.backupLevelColumn,
      accessor: 'level',
      render: (v) => <span className="text-13 text-slate-600 dark:text-slate-300">{CM[BACKUP_LEVEL_TITLE_KEY[v]] || v}</span>,
    },
    { header: CM.rotationLabel, accessor: 'period_type' },
    {
      header: CM.targetTime,
      accessor: 'time',
      render: (v) => <span className="font-mono text-13 text-slate-400">{v}</span>,
    },
    {
      header: CM.actions,
      accessor: 'actions',
      align: 'center',
      render: (_, row) => (
        <button
          onClick={(e) => { e.stopPropagation(); openBackupDetail(row); }}
          title={CM.editBackupPlan}
          className="p-1.5 rounded-sm hover:bg-slate-100 dark:hover:bg-white/5 text-slate-400 hover:text-amber-500 transition-colors"
        >
          <Icon name="visibility" size="sm" weight={300} />
        </button>
      ),
    },
  ], [CM]);

  const queryColumns = useMemo(() => [
    {
      header: CM.queryIdentifierLabel,
      accessor: 'query_id',
      render: (v) => <span className="font-mono text-14 font-semibold text-slate-700 dark:text-slate-200">{v}</span>,
    },
    {
      header: CM.databaseUsernameLabel,
      accessor: 'username',
      render: (v) => <span className="text-13 text-slate-500">{v || 'public'}</span>,
    },
    { header: CM.recurrenceFrequency, accessor: 'period' },
    {
      header: 'SQL',
      accessor: 'query_string',
      render: (v) => <span className="font-mono text-13 text-slate-500 truncate block max-w-[280px]">{v}</span>,
    },
    {
      header: CM.actions,
      accessor: 'actions',
      align: 'center',
      render: (_, row) => (
        <button
          onClick={(e) => { e.stopPropagation(); openQueryDetail(row); }}
          title={CM.editQueryPlan}
          className="p-1.5 rounded-sm hover:bg-slate-100 dark:hover:bg-white/5 text-slate-400 hover:text-amber-500 transition-colors"
        >
          <Icon name="visibility" size="sm" weight={300} />
        </button>
      ),
    },
  ], [CM]);

  return (
    <Card
      testId="db-dashboard-job-automation"
      title={
        <div className="flex items-center gap-3">
          <Icon name="bolt" size="sm" weight={300} className="text-amber-500" />
          <span className="text-sm font-semibold text-slate-800 dark:text-slate-100">{CM.jobAutomation}</span>
        </div>
      }
      bodyClassName="p-0"
      collapsible
      isCollapsed={isCollapsed}
      onToggle={(v) => setIsCollapsed(v)}
    >
      <div className="p-4 space-y-2 border-b border-slate-100 dark:border-white/5">
        <div className="flex items-center gap-2">
          <Icon name="backup" size="xs" weight={300} className="text-slate-400" />
          <span className="text-13 font-bold uppercase tracking-widest text-slate-500 dark:text-slate-400">{CM.backupPlan}</span>
        </div>
      </div>
      {(backupSchedules?.length ?? 0) === 0 ? (
        <EmptyState
          icon="backup"
          title={CM.noBackupPlansTitle}
          subtitle={CM.noBackupPlansMsg}
          py="py-8"
        />
      ) : (
        <Table
          columns={backupColumns}
          data={backupSchedules}
          onRowClick={openBackupDetail}
          loading={backupSchedulesLoading}
        />
      )}

      <div className="p-4 space-y-2 border-t border-b border-slate-100 dark:border-white/5">
        <div className="flex items-center gap-2">
          <Icon name="schema" size="xs" weight={300} className="text-slate-400" />
          <span className="text-13 font-bold uppercase tracking-widest text-slate-500 dark:text-slate-400">{CM.queryPlan}</span>
        </div>
      </div>
      {(queryPlans?.length ?? 0) === 0 ? (
        <EmptyState
          icon="schema"
          title={CM.noQueryPlansTitle}
          subtitle={CM.noQueryPlansMsg}
          py="py-8"
        />
      ) : (
        <Table
          columns={queryColumns}
          data={queryPlans}
          onRowClick={openQueryDetail}
          loading={queryPlansLoading}
        />
      )}
    </Card>
  );
}
