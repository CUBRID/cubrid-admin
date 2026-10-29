import React from 'react';
import { Card } from '../../../components/ds/layout/Card';
import { Table } from '../../../components/ds/layout/Table';
import { Typography } from '../../../components/ds/foundation/Typography';
import { Icon } from '../../../components/ds/foundation/Icon';
import { StatusBadge } from '../../../components/ds/foundation/StatusBadge';
import { useCM } from '../../../constants/useCM';

export default function Databases() {
  const CM = useCM();
  const columns = [
    { header: CM.database, accessor: 'dbname', className: 'font-bold' },
    {
      header: CM.autoStartup,
      accessor: 'autoStart',
      render: (val) => (
        <StatusBadge
          label={val}
          variant={val === 'On' ? 'emerald' : 'slate'}
        />
      )
    },
    {
      header: CM.status,
      accessor: 'status',
      render: (val) => (
        <StatusBadge
          label={val}
          variant={val === 'Active' ? 'sky' : 'rose'}
          pulse={val === 'Active'}
        />
      )
    },
  ];

  const data = [
    { id: 1, dbname: 'demodb', autoStart: 'On', status: 'Active' },
    { id: 2, dbname: 'db1', autoStart: 'Off', status: 'Inactive' },
  ];

  const cardTitle = (
    <div className="flex items-center gap-2">
      <Icon name="database" size="sm" className="text-bk-yellow"  weight={300} />
      <Typography variant="span" className="font-bold">{CM.databases}</Typography>
    </div>
  );

  return (
    <Card title={cardTitle} className="lg:col-span-2 shadow-2xl shadow-black/5" bodyClassName="p-0">
      <Table columns={columns} data={data} sortable={true} maxRows={15} />
    </Card>
  );
}
