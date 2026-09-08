import React from 'react';
import { Card } from '../../../../components/ds/layout/Card';
import { Table } from '../../../../components/ds/layout/Table';
import { Icon } from '../../../../components/ds/foundation/Icon';
import { Typography } from '../../../../components/ds/foundation/Typography';
import { StatusBadge } from '../../../../components/ds/foundation/StatusBadge';
import { useCM } from '../../../../constants/useCM';

export default function DatabaseListSection({ dbListDisplay }) {
  const CM = useCM();
  const columns = [
    {
      header: CM.database,
      accessor: 'db',
      render: (val, row) => (
        <div className="flex items-center gap-2">
          <Icon name="database" size="sm" weight={300} className="text-slate-300 dark:text-slate-600 shrink-0" />
          <span className="font-mono text-14 font-semibold text-slate-700 dark:text-slate-200">{val}</span>
          {row.isHA && (
            <span className="px-1 py-0.5 rounded-sm bg-amber-500/10 border border-amber-500/20 text-10 font-bold text-amber-600 dark:text-amber-400 tracking-wide uppercase leading-none">
              {CM.haBadge}
            </span>
          )}
        </div>
      )
    },
    {
      // Read-only on the dashboard by design — this changes cubrid.conf's
      // service autostart list, which belongs in a config editor, not a
      // one-click dashboard toggle (and is meaningless for HA databases
      // anyway: CUBRID refuses to start those through it, see
      // autoStartHaDisabledHint).
      header: CM.autoStartup,
      accessor: 'autoStart',
      className: 'text-center',
      render: (val) => (
        <StatusBadge
          label={val ? CM.statusOn : CM.statusOff}
          variant={val ? 'emerald' : 'slate'}
        />
      )
    },
    {
      header: CM.runningStatus,
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
          <span className="text-12 text-slate-400 font-normal ml-1">({dbListDisplay.length})</span>
        </div>
      }
      bodyClassName="p-0"
      collapsible
    >
      <Table columns={columns} data={dbListDisplay} />
    </Card>
  );
}
