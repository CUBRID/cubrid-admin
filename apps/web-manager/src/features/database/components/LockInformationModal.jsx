import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import { closeLockInformationModal } from '../databaseSlice';
import { databaseApi } from '../databaseApi';

import { Modal } from '../../../components/ds/layout/Modal';
import { Button } from '../../../components/ds/foundation/Button';
import { TabGroup } from '../../../components/ds/layout/TabGroup';
import { SectionHeader } from '../../../components/ds/foundation/SectionHeader';
import { MetricCard } from '../../../components/ds/foundation/MetricCard';
import { StatusBadge } from '../../../components/ds/foundation/StatusBadge';
import { ProgressBar } from '../../../components/ds/foundation/ProgressBar';
import { Table } from '../../../components/ds/layout/Table';
import { Icon } from '../../../components/ds/foundation/Icon';
import { Typography } from '../../../components/ds/foundation/Typography';
import { ContentLoadingOverlay } from '../../../components/ds/feedback/ContentLoadingOverlay';
import { useCM } from '../../../constants/useCM';

function buildObjectLockRows(lot) {
  const entries = lot?.entry;
  if (!Array.isArray(entries)) return [];
  const rows = [];
  entries.forEach((entry) => {
    const holders = entry?.lock_holders;
    if (!Array.isArray(holders) || holders.length === 0) return;
    holders.forEach((h) => {
      rows.push({
        oid: entry.oid ?? '-',
        class_name: entry.ob_type ?? entry.class_name ?? '-',
        holder: h.tran_index ?? h['@user'] ?? '-',
        mode: h.granted_mode ?? h.mode ?? '-',
        waiters: entry.waiters?.length ?? 0,
      });
    });
  });
  return rows;
}

export default function LockInformationModal() {
  const CM = useCM();
  const dispatch = useDispatch();
  const { isLockInformationModalOpen: isLockInfoModalOpen } = useSelector((s) => s.databaseUI);
  const { selectedDatabase, activeDatabasesByHost } = useSelector((s) => s.database);
  const { selectedHostUid } = useSelector((s) => s.host);
  const activeDatabases = activeDatabasesByHost[selectedHostUid] || [];

  const isActive = selectedDatabase && activeDatabases?.includes(selectedDatabase);

  const [activeTab, setActiveTab] = useState('sessions');
  const [settings, setSettings] = useState({});
  const [lot, setLot] = useState({});
  const [transactions, setTransactions] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  // False until the first fetch succeeds: the tables only render once there
  // is real data, so an empty list never flashes before the first response.
  const [hasLoaded, setHasLoaded] = useState(false);
  // Drops a response that lands after the modal was closed or retargeted.
  const requestIdRef = useRef(0);

  const fetchLockInfo = useCallback(async () => {
    if (!selectedHostUid || !selectedDatabase) return;
    const requestId = ++requestIdRef.current;
    if (!isActive) {
      setError('Database is stopped. Locking information is only available when the database is running.');
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      const response = await databaseApi.getLockInfo(selectedHostUid, selectedDatabase);
      if (requestId !== requestIdRef.current) return;
      if (response?.lockinfo?.length > 0) {
        const { dinterval, esc, lot: lotArr, transaction } = response.lockinfo[0];
        setSettings({ dinterval, esc });
        setLot(lotArr?.[0] || {});
        setTransactions(Array.isArray(transaction) ? transaction : transaction ? [transaction] : []);
      } else {
        setSettings({});
        setLot({});
        setTransactions([]);
      }
      setHasLoaded(true);
      setError(null);
    } catch (err) {
      if (requestId !== requestIdRef.current) return;
      setError(err.response?.data?.note || err.response?.data?.message || CM.failedToGetLockInfo);
    } finally {
      if (requestId === requestIdRef.current) setLoading(false);
    }
  }, [selectedHostUid, selectedDatabase, isActive, CM]);

  useEffect(() => {
    if (isLockInfoModalOpen) {
      setActiveTab('sessions');
      fetchLockInfo();
    } else {
      // Reset while hidden so the next open starts on the loading state
      // rather than the previous database's locks.
      requestIdRef.current += 1;
      setSettings({});
      setLot({});
      setTransactions([]);
      setHasLoaded(false);
      setLoading(false);
      setError(null);
    }
  }, [isLockInfoModalOpen, selectedHostUid, selectedDatabase]);

  const objectRows = useMemo(() => buildObjectLockRows(lot), [lot]);
  const sessionColumns = useMemo(() => [
    { accessor: 'index', header: CM.lockIndex, cellClassName: 'font-mono' },
    { accessor: 'pname', header: CM.pname, render: (value, row) => `${value || '-'}${row.waitfor ? CM.waitingSuffix : ''}` },
    { accessor: '@uid', header: CM.uid, render: (value) => value ?? '-', cellClassName: 'font-mono' },
    { accessor: 'host', header: CM.host, render: (value) => value ?? '-', cellClassName: 'font-mono' },
    { accessor: 'pid', header: CM.pid, render: (value) => value ?? '-', cellClassName: 'font-mono' },
    { accessor: 'isolevel', header: CM.isolationLevel, render: (value) => <StatusBadge label={value || '-'} variant="sky" /> },
    { accessor: 'timeout', header: CM.timeOut, align: 'right', render: (value) => value ?? '-', cellClassName: 'font-mono' },
    { accessor: 'lock', header: CM.locks, align: 'center', render: (value) => Array.isArray(value) ? value.length : value ? 1 : '-' },
  ], [CM]);
  const objectColumns = useMemo(() => [
    { accessor: 'oid', header: CM.oid, cellClassName: 'font-mono' },
    { accessor: 'class_name', header: CM.objectType },
    { accessor: 'holder', header: CM.numHolders, cellClassName: 'font-mono' },
    { accessor: 'mode', header: CM.mode, cellClassName: 'font-mono' },
    { accessor: 'waiters', header: CM.numWaiters, align: 'right', cellClassName: 'font-mono' },
  ], [CM]);

  if (!isLockInfoModalOpen) return null;

  const handleClose = () => dispatch(closeLockInformationModal());

  // Spinner from the first frame of the first open (before the fetch effect
  // runs) and over the current content on every refresh.
  const showSpinner = loading || (!hasLoaded && !error);
  const showError = Boolean(error) && !loading;

  const TABS = [
    { id: 'sessions', label: CM.lockSettingClientInfo, icon: 'person', badge: transactions.length },
    { id: 'objects', label: CM.objectLockTable, icon: 'lock', badge: objectRows.length || null },
    { id: 'params', label: CM.lockEscalation, icon: 'tune' },
  ];

  return (
    <Modal
      isOpen={isLockInfoModalOpen}
      onClose={handleClose}
      title={CM.lockingInformation}
      subtitle={selectedDatabase}
      icon="lock"
      maxWidth="max-w-[900px]"
      testId="lock-information"
      footer={
        <div className="flex justify-end gap-2 w-full">
          <Button data-testid="lock-information-close-btn" variant="ghost" onClick={handleClose} disabled={loading}>{CM.close}</Button>
          <Button data-testid="lock-information-refresh-btn" variant="primary" onClick={fetchLockInfo} loading={loading} disabled={showSpinner} icon="refresh">{CM.refresh}</Button>
        </div>
      }
    >
      <div className="space-y-4">
        <TabGroup tabs={TABS} active={activeTab} onChange={setActiveTab} testId="lock-information-tab" />

        {/* Fixed minimum height so the first load and the empty/error states
            don't make the modal jump; real rows may still grow it. */}
        <div className="relative min-h-[300px]">
          <ContentLoadingOverlay show={showSpinner} testId="lock-information-loading" />
          {showError && (
            <div data-testid="lock-information-error" className="min-h-[300px] flex flex-col items-center justify-center gap-4 text-center">
              <Icon name="error" size="md" weight={300} className="text-rose-500" />
              <Typography variant="p" className="text-15 text-slate-600 dark:text-slate-300">
                {CM.failedToGetLockInfo}
              </Typography>
              {error !== CM.failedToGetLockInfo && (
                <Typography variant="caption" className="text-rose-500 font-mono block break-words px-4">
                  {error}
                </Typography>
              )}
              <Button data-testid="lock-information-retry-btn" variant="primary" icon="refresh" onClick={fetchLockInfo}>{CM.refresh}</Button>
            </div>
          )}
          {!showError && hasLoaded && activeTab === 'sessions' && (
            <div className="rounded-lg border border-slate-200 dark:border-white/10 overflow-hidden overflow-x-auto">
              <Table columns={sessionColumns} data={transactions} emptyMessage={CM.noActiveTransactions} stickyHeader selectable showEmptyStateAsRow />
            </div>
          )}

          {!showError && hasLoaded && activeTab === 'objects' && (
            <div className="space-y-3">
              <div className="grid grid-cols-3 gap-3">
                <MetricCard icon="lock" label={CM.currentLockedObjNum} value={lot.numlocked ?? 0} unit="" accent="amber" isLoading={loading} />
                <MetricCard icon="view_list" label={CM.maxLockedObjNum} value={lot.numallocated ?? 0} unit="" accent="sky" isLoading={loading} />
                <MetricCard icon="memory" label={CM.size} value={lot.sizelock ?? '-'} unit="bytes" accent="violet" isLoading={loading} />
              </div>
              <div className="rounded-lg border border-slate-200 dark:border-white/10 overflow-hidden overflow-x-auto">
                <Table columns={objectColumns} data={objectRows} emptyMessage={CM.noHeldObjectLocks} stickyHeader selectable showEmptyStateAsRow />
              </div>
            </div>
          )}

          {!showError && hasLoaded && activeTab === 'params' && (
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-3">
                <MetricCard icon="timer" label={CM.runDeadlockInterval} value={settings.dinterval ?? '-'} unit="ms" accent="sky" isLoading={loading} />
                <MetricCard icon="trending_up" label={CM.lockEscalation} value={settings.esc ?? '-'} unit="pages" accent="amber" isLoading={loading} />
              </div>
              <SectionHeader title={CM.objectLockTable} icon="table_rows" />
              <ProgressBar
                pct={lot.numallocated > 0 ? ((lot.numlocked || 0) / lot.numallocated) * 100 : 0}
                label={CM.currentLockedObjNum}
                showValue
                valueLabel={`${lot.numlocked || 0} / ${lot.numallocated || 0}`}
              />
            </div>
          )}
        </div>
      </div>
    </Modal>
  );
}
