import React, { useState, useEffect, useRef, useMemo } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import {
  fetchDashboardLocks,
  setSelectedDatabase,
  openKillTransactionModal,
  openTransactionInfoModal,
} from '../../databaseSlice';
import ContextMenuWrapper from '../../../../components/common/ContextMenuWrapper';
import { MenuItem } from '../../../../components/common/DropdownMenu';
import { Icon } from '../../../../components/ds/foundation/Icon';
import { Table } from '../../../../components/ds/layout/Table';
import { Card } from '../../../../components/ds/layout/Card';
import { StatusBadge } from '../../../../components/ds/foundation/StatusBadge';
import { EmptyState } from '../../../../components/ds/feedback/EmptyState';
import { useCM } from '../../../../constants/useCM';

/** lockdb dashboard row → gettransactioninfo / killtransaction shape */
function lockRowToTransaction(row) {
  const index = row?.index != null ? String(row.index) : '';
  return {
    tranindex: index.includes('(') ? index : `${index}(ACTIVE)`,
    '@user': row?.user && row.user !== '-' ? row.user : '',
    host: row?.host && row.host !== '-' ? row.host : '',
    pid: row?.pid && row.pid !== '-' ? row.pid : '',
    program: row?.program || '—',
  };
}

export default function DBLockTransactionSection({ locks, pollingProps }) {
  const CM = useCM();
  const dispatch = useDispatch();
  const [isCollapsed, setIsCollapsed] = useState(false);
  const [rowMenu, setRowMenu] = useState(null);
  const { hostUid, dbname, isTabActive, autoRefresh, refreshInterval } = pollingProps;

  const refresh = () => {
    if (hostUid && dbname) dispatch(fetchDashboardLocks({ hostUid, dbname }));
  };

  const transactionKillSignal = useSelector((state) => state.databaseUI.transactionKillSignal);
  const lastSeenKillSignal = useRef(transactionKillSignal);
  useEffect(() => {
    if (lastSeenKillSignal.current === transactionKillSignal) return;
    lastSeenKillSignal.current = transactionKillSignal;
    refresh();
  }, [transactionKillSignal, hostUid, dbname]);

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

  useEffect(() => {
    if (!rowMenu) return;
    const closeOnOutside = (e) => {
      if (e.target.closest('.context-menu-container')) return;
      setRowMenu(null);
    };
    document.addEventListener('mousedown', closeOnOutside, true);
    return () => document.removeEventListener('mousedown', closeOnOutside, true);
  }, [rowMenu]);

  const handleRowContextMenu = (e, row) => {
    if (!row?.index || row.index === '-') return;
    e.preventDefault();
    setRowMenu({ mouseX: e.clientX, mouseY: e.clientY, row });
  };

  const openTransactionInfo = () => {
    if (dbname) dispatch(setSelectedDatabase(dbname));
    dispatch(openTransactionInfoModal());
    setRowMenu(null);
  };

  const openKillForRow = () => {
    if (!rowMenu?.row) return;
    const payload = lockRowToTransaction(rowMenu.row);
    if (dbname) dispatch(setSelectedDatabase(dbname));
    setRowMenu(null);
    dispatch(openKillTransactionModal(payload));
  };

  const columns = useMemo(() => [
    { header: '#', accessor: 'index', render: (val) => <span className="font-mono text-14 text-slate-400">{val}</span> },
    { header: CM.userNameCol, accessor: 'user', render: (val) => <span className="font-mono text-14 font-semibold text-slate-700 dark:text-slate-200">{val}</span> },
    { header: CM.host, accessor: 'host', render: (val) => <span className="font-mono text-14 text-slate-400">{val}</span> },
    { header: CM.pid, accessor: 'pid', render: (val) => <span className="font-mono text-14 text-slate-400">{val}</span> },
    { header: CM.objectType, accessor: 'obj', render: (val) => <span className="font-mono text-14 text-slate-500 max-w-[280px] truncate block" title={val}>{val}</span> },
    {
      header: CM.lockMode,
      accessor: 'mode',
      render: (val) => {
        const isX = val?.includes('X_');
        return (
          <StatusBadge 
            label={val} 
            variant={isX ? 'rose' : 'amber'} 
            pulse={isX} 
          />
        );
      }
    },
  ], [CM]);

  return (
    <>
      <Card
        testId="db-dashboard-lock-transaction"
        title={
          <div className="flex items-center gap-2">
            <Icon name="lock" size="sm" weight={300} className="text-amber-500" />
            <span className="text-sm font-semibold text-slate-800 dark:text-slate-100">{CM.lockAndTransaction}</span>
            {locks.length > 0 && (
              <span className="ml-1 px-1.5 py-0.5 rounded-sm bg-rose-50 dark:bg-rose-500/10 text-rose-600 dark:text-rose-400 border border-rose-200 dark:border-rose-500/20 text-12 font-bold">
                {locks.length}
              </span>
            )}
          </div>
        }
        bodyClassName="p-0"
        collapsible
        isCollapsed={isCollapsed}
        onToggle={(v) => setIsCollapsed(v)}
      >
        <Table
          columns={columns}
          data={locks}
          onRowContextMenu={handleRowContextMenu}
          emptyState={
            <EmptyState
              icon="verified_user"
              title={CM.lockAndTransaction}
              subtitle={CM.loadingLockAndTransaction}
              py="py-12"
            />
          }
        />
      </Card>

      {rowMenu && (
        <ContextMenuWrapper
          x={rowMenu.mouseX}
          y={rowMenu.mouseY}
          onClose={() => setRowMenu(null)}
          width="w-52"
        >
          <MenuItem icon="swap_horiz" label={`${CM.transactionInformation}…`} onClick={openTransactionInfo} />
          <MenuItem icon="cancel" label={`${CM.killTransaction}…`} onClick={openKillForRow} />
        </ContextMenuWrapper>
      )}
    </>
  );
}
