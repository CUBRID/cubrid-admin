import React, { useEffect, useCallback, useState } from 'react';
import { useDispatch, useSelector, shallowEqual } from 'react-redux';
import { fetchDatabaseVolumes } from '../../database/databaseSlice';
import { Card } from '../../../components/ds/layout/Card';
import { Table } from '../../../components/ds/layout/Table';
import { Icon } from '../../../components/ds/foundation/Icon';
import { Typography } from '../../../components/ds/foundation/Typography';
import { Spinner } from '../../../components/ds/foundation/Spinner';
import { useCM } from '../../../constants/useCM';

const getSizeFormat = (size) => {
  if (size >= 1024 ** 3) return `${(size / 1024 ** 3).toFixed(1)}GB`;
  if (size >= 1024 ** 2) return `${(size / 1024 ** 2).toFixed(1)}MB`;
  if (size >= 1024) return `${(size / 1024).toFixed(1)}KB`;
  return `${size}B`;
};

const getVolumeColumn = (dbSpace, type) => {
  if (!dbSpace?.spaceinfo) return { display: '-', pct: 0 };
  let totalPage = 0, freePage = 0;
  const pageSize = parseInt(dbSpace.pagesize || 0);
  if (!pageSize) return { display: '-', pct: 0 };
  for (const space of dbSpace.spaceinfo) {
    if (space.type === type) {
      totalPage += parseInt(space.totalpage || 0);
      freePage += parseInt(space.freepage || 0);
    }
  }
  if (totalPage > 0) {
    const used = (totalPage - freePage) * pageSize;
    const total = totalPage * pageSize;
    const freePct = ((freePage * 100) / totalPage).toFixed(0);
    return { display: `${getSizeFormat(used)} / ${getSizeFormat(total)} / ${freePct}%`, pct: 100 - parseInt(freePct) };
  }
  return { display: '-', pct: 0 };
};

const getLogColumnRaw = (dbSpace, type) => {
  let totalPage = 0;
  // Log volumes use logpagesize, not the data pagesize.
  const pageSize = parseInt(dbSpace.logpagesize || dbSpace.pagesize || 0);
  if (!pageSize) return 0;
  for (const space of dbSpace.spaceinfo) {
    if (space.type === type) totalPage += parseInt(space.totalpage || 0);
  }
  return totalPage * pageSize;
};

const getLogColumn = (dbSpace, type) => {
  let totalPage = 0;
  const pageSize = parseInt(dbSpace.logpagesize || dbSpace.pagesize || 0);
  if (!pageSize) return '-';
  for (const space of dbSpace.spaceinfo) {
    if (space.type === type) totalPage += parseInt(space.totalpage || 0);
  }
  return totalPage > 0 ? getSizeFormat(totalPage * pageSize) : '-';
};

const BarCell = ({ val }) => {
  const getProgressColor = (pct) => {
    if (pct > 85) return 'bg-rose-500 shadow-[0_0_8px_rgba(244,63,94,0.4)]';
    if (pct > 50) return 'bg-amber-500 shadow-[0_0_8px_rgba(245,158,11,0.3)]';
    return 'bg-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.3)]';
  };

  return (
    <div className="flex flex-col gap-1 min-w-[160px]">
      <div className="flex items-center justify-between pr-2">
        <span className="text-14 font-mono font-semibold text-slate-600 dark:text-slate-300">{val.display}</span>
      </div>
      <div className="w-full h-1 bg-slate-100 dark:bg-white/6 overflow-hidden rounded-full">
        <div 
          className={`h-full ${getProgressColor(val.pct)} transition-all duration-700 ease-out`} 
          style={{ width: `${val.pct}%` }} 
        />
      </div>
    </div>
  );
};

export default function DatabaseVolumes({ hostUid, activeDatabases = [] }) {
  const CM = useCM();
  const dispatch = useDispatch();
  const { authorizedHosts } = useSelector((state) => state.host, shallowEqual);
  // Fetched into local state (not the shared `state.databaseMonitoring.volumes`
  // slice) so multiple simultaneously-open dashboard tabs don't clobber each other.
  const [volumes, setVolumes] = useState([]);
  const [loading, setLoading] = useState(false);

  const fetchVolumes = useCallback(async () => {
    if (!hostUid || !authorizedHosts.includes(hostUid) || activeDatabases.length === 0) {
      // Stopping the last active database shrinks activeDatabases to empty —
      // without this, the last fetch's result just lingers in local state
      // showing a now-stopped database's stale volume info as if current.
      setVolumes([]);
      return;
    }
    setLoading(true);
    try {
      const result = await dispatch(fetchDatabaseVolumes({ hostUid, activeDatabases })).unwrap();
      setVolumes(result);
    } finally {
      setLoading(false);
    }
  }, [hostUid, authorizedHosts, activeDatabases, dispatch]);

  useEffect(() => { fetchVolumes(); }, [fetchVolumes]);

  const volumeData = React.useMemo(() => volumes?.map((result) => {
    if (!result?.spaceinfo) return { id: result.dbname, db: result.dbname, permanent: { display: '-', pct: 0 }, temporary: { display: '-', pct: 0 }, activeLog: '-', archiveLog: '-', storageFree: '-', _permanentPct: 0, _temporaryPct: 0, _activeLogRaw: 0, _archiveLogRaw: 0, _storageFreeRaw: 0 };
    const perm = getVolumeColumn(result, 'PERMANENT');
    const temp = getVolumeColumn(result, 'TEMPORARY');
    return {
      id: result.dbname,
      db: result.dbname,
      permanent: perm,
      temporary: temp,
      activeLog: getLogColumn(result, 'Active_log'),
      archiveLog: getLogColumn(result, 'Archive_log'),
      storageFree: result.freespace ? getSizeFormat(parseInt(result.freespace) * 1024) : '-',
      // raw numeric values used by sortAccessor for correct ordering
      _permanentPct: perm.pct,
      _temporaryPct: temp.pct,
      _activeLogRaw: getLogColumnRaw(result, 'Active_log'),
      _archiveLogRaw: getLogColumnRaw(result, 'Archive_log'),
      _storageFreeRaw: result.freespace ? parseInt(result.freespace) : 0,
    };
  }) || [], [volumes]);

  const columns = React.useMemo(() => [
    {
      header: CM.database,
      accessor: 'db',
      render: (val) => <span className="font-mono text-14 font-semibold text-slate-700 dark:text-slate-200">{val}</span>
    },
    { header: CM.permanent,   accessor: 'permanent',   sortAccessor: '_permanentPct',   render: (val) => <BarCell val={val} /> },
    { header: CM.temporary,   accessor: 'temporary',   sortAccessor: '_temporaryPct',   render: (val) => <BarCell val={val} /> },
    { header: CM.activeLog,   accessor: 'activeLog',   sortAccessor: '_activeLogRaw',   render: (val) => <span className="font-mono text-14 text-slate-500">{val}</span> },
    { header: CM.archiveLog,  accessor: 'archiveLog',  sortAccessor: '_archiveLogRaw',  render: (val) => <span className="font-mono text-14 text-slate-500">{val}</span> },
    { header: CM.freeStorage, accessor: 'storageFree', sortAccessor: '_storageFreeRaw', render: (val) => <span className="font-mono text-14 text-emerald-600 dark:text-emerald-400 font-semibold">{val}</span> },
  ], [CM]);

  return (
    <Card
      testId="server-dashboard-storage-volumes"
      title={
        <div className="flex items-center gap-2">
          <Icon name="storage" size="sm" weight={300} className="text-amber-500" />
          <span className="text-sm font-semibold text-slate-800 dark:text-slate-100">{CM.storageVolumes}</span>
          {loading && <Spinner size="xs" className="ml-1" />}
        </div>
      }
      bodyClassName="p-0"
      collapsible
    >
      <Table
        columns={columns}
        data={volumeData}
        loading={loading}
        className="text-14"
        emptyMessage={activeDatabases.length === 0 ? CM.storageVolumesRequireOnlineDbMsg : undefined}
      />
    </Card>
  );
}
