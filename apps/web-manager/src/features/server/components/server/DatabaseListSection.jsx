import React from 'react';
import { Card } from '../../../../components/ds/layout/Card';
import { Table } from '../../../../components/ds/layout/Table';
import { Icon } from '../../../../components/ds/foundation/Icon';
import { Typography } from '../../../../components/ds/foundation/Typography';
import { StatusBadge } from '../../../../components/ds/foundation/StatusBadge';
import { useCM } from '../../../../constants/useCM';

export default function DatabaseListSection({ dbListDisplay, handleAutoStartToggle, autoStartReady = false, updatingAutoStart = false }) {
  const CM = useCM();
  const columns = [
    {
      header: CM.database,
      accessor: 'db',
      render: (val, row) => (
        <div className="flex items-center gap-2">
          <Icon name="database" size="sm" weight={300} className="text-slate-300 dark:text-slate-600 shrink-0" />
          <span className="font-mono text-[12px] font-semibold text-slate-700 dark:text-slate-200">{val}</span>
          {row.isHA && (
            <span className="px-1 py-0.5 rounded-sm bg-amber-500/10 border border-amber-500/20 text-[8px] font-bold text-amber-600 dark:text-amber-400 tracking-wide uppercase leading-none">
              {CM.haBadge}
            </span>
          )}
        </div>
      )
    },
    {
      header: CM.autoStartup,
      accessor: 'autoStart',
      className: 'text-center',
      render: (val, row) => (
        <button
          type="button"
          role="switch"
          aria-checked={val}
          aria-label={`${CM.autoStartup}: ${row.db}`}
          aria-busy={updatingAutoStart}
          disabled={!autoStartReady || updatingAutoStart}
          onClick={() => handleAutoStartToggle(row.db, val)}
          className={`relative inline-flex h-4 w-7 shrink-0 cursor-pointer items-center rounded-full border transition-colors duration-200 focus:outline-none focus-visible:ring-2 focus-visible:ring-amber-500/50 disabled:cursor-wait disabled:opacity-50
            ${val
              ? 'bg-amber-500 border-amber-500'
              : 'bg-slate-200 dark:bg-white/10 border-slate-300 dark:border-white/15'
            }`}
        >
          <span
            className={`inline-block h-2.5 w-2.5 rounded-full bg-white shadow-sm transform transition-transform duration-200
              ${val ? 'translate-x-3' : 'translate-x-0.5'}`}
          />
        </button>
      )
    },
    {
      header: CM.status,
      accessor: 'status',
      render: (val) => (
        <StatusBadge 
          label={val} 
          variant={val === CM.statusOn ? 'emerald' : 'rose'} 
          pulse={val === CM.statusOn} 
        />
      )
    },
  ];

  return (
    <Card
      testId="server-dashboard-database-list"
      title={
        <div className="flex items-center gap-2">
          <Icon name="database" size="sm" weight={300} className="text-amber-500" />
          <span className="text-sm font-semibold text-slate-800 dark:text-slate-100">{CM.databases}</span>
          <span className="text-[10px] text-slate-400 font-normal ml-1">({dbListDisplay.length})</span>
        </div>
      }
      bodyClassName="p-0"
      collapsible
    >
      <Table columns={columns} data={dbListDisplay} />
    </Card>
  );
}
