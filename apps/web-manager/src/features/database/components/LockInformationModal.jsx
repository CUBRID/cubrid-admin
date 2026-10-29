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
import { VirtualTable } from '../../../components/ds/layout/VirtualTable';
import { Icon } from '../../../components/ds/foundation/Icon';
import { Typography } from '../../../components/ds/foundation/Typography';
import { ContentLoadingOverlay } from '../../../components/ds/feedback/ContentLoadingOverlay';
import { useCM } from '../../../constants/useCM';

// The engine prints "Timeout_period : <value>" and CMS keeps only the second
// word, so the timeout always arrives as ":". Nothing better to show then.
const timeoutText = (value) => (value && value !== ':' ? value : '-');

// The engine prints the lock table size in bytes, or with K or M (1024-based).
function lockTableSize(sizelock) {
  const match = /^(\d+)([KM]?)$/.exec(sizelock || '');
  if (!match) return { value: sizelock || '-', unit: '' };
  return { value: match[1], unit: { K: 'KiB', M: 'MiB' }[match[2]] ?? 'B' };
}

const EMPTY_OVERVIEW = { esc: '', dinterval: '', numlocked: '', numallocated: '', sizelock: '', maxnumlock: '', transactions: [] };

export default function LockInformationModal() {
  const CM = useCM();
  const dispatch = useDispatch();
  const { isLockInformationModalOpen: isLockInfoModalOpen } = useSelector((s) => s.databaseUI);
  const { selectedDatabase, activeDatabasesByHost } = useSelector((s) => s.database);
  const { selectedHostUid } = useSelector((s) => s.host);
  const activeDatabases = activeDatabasesByHost[selectedHostUid] || [];

  const isActive = selectedDatabase && activeDatabases?.includes(selectedDatabase);

  const [activeTab, setActiveTab] = useState('sessions');
  const [overview, setOverview] = useState(EMPTY_OVERVIEW);
  const [summaryRows, setSummaryRows] = useState([]);
  // Per-object rows are fetched only when that view is opened: with a bulk
  // insert they run to tens of thousands.
  const [lockView, setLockView] = useState('summary');
  const [objects, setObjects] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  // False until the first fetch succeeds: the tables only render once there
  // is real data, so an empty list never flashes before the first response.
  const [hasLoaded, setHasLoaded] = useState(false);
  // Drops a response that lands after the modal was closed or retargeted.
  const requestIdRef = useRef(0);

  const fetchLockInfo = useCallback(async ({ withObjects = false } = {}) => {
    if (!selectedHostUid || !selectedDatabase) return;
    const requestId = ++requestIdRef.current;
    if (!isActive) {
      setError('Database is stopped. Locking information is only available when the database is running.');
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      const [response, objectResponse] = await Promise.all([
        databaseApi.getLockInfo(selectedHostUid, selectedDatabase, { summary: true }),
        withObjects ? databaseApi.getLockInfo(selectedHostUid, selectedDatabase, { objects: true }) : null,
      ]);
      if (requestId !== requestIdRef.current) return;
      setOverview(response?.overview ?? EMPTY_OVERVIEW);
      setSummaryRows(response?.summary?.rows ?? []);
      // A refresh of the summary alone would leave per-object rows from before.
      setObjects(withObjects ? objectResponse?.objects ?? [] : null);
      setHasLoaded(true);
      setError(null);
    } catch (err) {
      if (requestId !== requestIdRef.current) return;
      setError(err.response?.data?.note || err.response?.data?.message || CM.failedToGetLockInfo);
    } finally {
      if (requestId === requestIdRef.current) setLoading(false);
    }
  }, [selectedHostUid, selectedDatabase, isActive, CM]);

  const refresh = () => fetchLockInfo({ withObjects: lockView === 'objects' });
  const showObjects = () => {
    setLockView('objects');
    if (objects == null) fetchLockInfo({ withObjects: true });
  };

  useEffect(() => {
    if (isLockInfoModalOpen) {
      setActiveTab('sessions');
      setLockView('summary');
      fetchLockInfo();
    } else {
      // Reset while hidden so the next open starts on the loading state
      // rather than the previous database's locks.
      requestIdRef.current += 1;
      setOverview(EMPTY_OVERVIEW);
      setSummaryRows([]);
      setObjects(null);
      setHasLoaded(false);
      setLoading(false);
      setError(null);
    }
  }, [isLockInfoModalOpen, selectedHostUid, selectedDatabase]);

  const transactions = useMemo(() => {
    const counts = new Map();
    summaryRows.forEach((row) => counts.set(row.index, (counts.get(row.index) ?? 0) + row.count));
    return overview.transactions.map((tran) => ({ ...tran, locks: counts.get(tran.index) ?? 0 }));
  }, [overview, summaryRows]);
  const sessionColumns = useMemo(() => [
    { accessor: 'index', header: CM.lockIndex, cellClassName: 'font-mono' },
    { accessor: 'program', header: CM.pname, render: (value) => value || '-' },
    { accessor: 'user', header: CM.uid, render: (value) => value || '-', cellClassName: 'font-mono' },
    { accessor: 'host', header: CM.host, render: (value) => value || '-', cellClassName: 'font-mono' },
    { accessor: 'pid', header: CM.pid, render: (value) => value || '-', cellClassName: 'font-mono' },
    { accessor: 'isolation', header: CM.isolationLevel, render: (value) => <StatusBadge label={value || '-'} variant="sky" /> },
    { accessor: 'timeout', header: CM.timeOut, align: 'right', render: timeoutText, cellClassName: 'font-mono' },
    { accessor: 'locks', header: CM.locks, align: 'right', cellClassName: 'font-mono' },
  ], [CM]);
  const summaryColumns = useMemo(() => [
    { accessor: 'index', header: CM.lockIndex, cellClassName: 'font-mono' },
    { accessor: 'user', header: CM.userNameCol, cellClassName: 'font-mono' },
    { accessor: 'program', header: CM.programName },
    { accessor: 'obj', header: CM.objectType, cellClassName: 'font-mono' },
    { accessor: 'mode', header: CM.lockMode, cellClassName: 'font-mono' },
    { accessor: 'count', header: CM.lockCountCol, align: 'right', cellClassName: 'font-mono' },
  ], [CM]);
  const objectColumns = useMemo(() => [
    { accessor: 'oid', header: CM.oid, width: '140px', cellClassName: 'font-mono' },
    { accessor: 'obj', header: CM.objectType, cellClassName: 'font-mono' },
    {
      accessor: 'holders',
      header: CM.lockHolders,
      width: '200px',
      cellClassName: 'font-mono',
      render: (holders) => (holders.length ? holders.map((h) => `${h.index}: ${h.mode}`).join(', ') : '-'),
    },
    { accessor: 'numHolders', header: CM.numHolders, width: '110px', align: 'right', cellClassName: 'font-mono' },
    { accessor: 'numBlockedHolders', header: CM.numBlockedHolders, width: '110px', align: 'right', cellClassName: 'font-mono' },
    { accessor: 'numWaiters', header: CM.numWaiters, width: '110px', align: 'right', cellClassName: 'font-mono' },
  ], [CM]);

  if (!isLockInfoModalOpen) return null;

  const handleClose = () => dispatch(closeLockInformationModal());

  // Spinner from the first frame of the first open (before the fetch effect
  // runs) and over the current content on every refresh.
  const showSpinner = loading || (!hasLoaded && !error);
  const size = lockTableSize(overview.sizelock);
  const showError = Boolean(error) && !loading;

  const TABS = [
    { id: 'sessions', label: CM.lockSettingClientInfo, icon: 'person', badge: transactions.length },
    { id: 'objects', label: CM.objectLockTable, icon: 'lock', badge: Number(overview.numlocked) || null },
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
          <Button data-testid="lock-information-refresh-btn" variant="primary" onClick={refresh} loading={loading} disabled={showSpinner} icon="refresh">{CM.refresh}</Button>
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
              <Button data-testid="lock-information-retry-btn" variant="primary" icon="refresh" onClick={refresh}>{CM.refresh}</Button>
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
                <MetricCard icon="lock" label={CM.currentLockedObjNum} value={overview.numlocked || '-'} unit="" accent="amber" isLoading={loading} />
                {overview.numallocated ? (
                  <MetricCard icon="view_list" label={CM.allocatedLockObjNum} value={overview.numallocated} unit="" accent="sky" isLoading={loading} />
                ) : (
                  <MetricCard icon="view_list" label={CM.maxLockedObjNum} value={overview.maxnumlock || '-'} unit="" accent="sky" isLoading={loading} />
                )}
                <MetricCard icon="memory" label={CM.allocatedLockObjSize} value={size.value} unit={size.unit} accent="violet" isLoading={loading} />
              </div>
              <div className="flex items-center gap-2">
                <Button data-testid="lock-information-summary-view" size="sm" variant={lockView === 'summary' ? 'secondary' : 'ghost'} onClick={() => setLockView('summary')}>
                  {CM.lockSummaryView}
                </Button>
                <Button data-testid="lock-information-object-view" size="sm" variant={lockView === 'objects' ? 'secondary' : 'ghost'} onClick={showObjects} title={CM.lockObjectDetailHint}>
                  {CM.lockObjectDetailView}
                </Button>
              </div>
              <div className="rounded-lg border border-slate-200 dark:border-white/10 overflow-hidden overflow-x-auto">
                {lockView === 'summary' ? (
                  <Table columns={summaryColumns} data={summaryRows} emptyMessage={CM.noHeldObjectLocks} stickyHeader selectable showEmptyStateAsRow maxRows={15} />
                ) : objects ? (
                  <VirtualTable columns={objectColumns} data={objects} emptyMessage={CM.noHeldObjectLocks} testId="lock-information-objects" />
                ) : (
                  <div className="min-h-[200px]" />
                )}
              </div>
            </div>
          )}

          {!showError && hasLoaded && activeTab === 'params' && (
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-3">
                <MetricCard icon="timer" label={CM.runDeadlockInterval} value={overview.dinterval || '-'} unit="s" accent="sky" isLoading={loading} />
                <MetricCard icon="trending_up" label={CM.lockEscalation} value={overview.esc || '-'} unit={CM.lockEscalationUnit} accent="amber" isLoading={loading} />
              </div>
              {Number(overview.numallocated) > 0 && (
                <>
                  <SectionHeader title={CM.objectLockTable} icon="table_rows" />
                  <ProgressBar
                    pct={(Number(overview.numlocked) || 0) / Number(overview.numallocated) * 100}
                    label={CM.currentLockedObjNum}
                    showValue
                    valueLabel={`${overview.numlocked || 0} / ${overview.numallocated}`}
                  />
                </>
              )}
            </div>
          )}
        </div>
      </div>
    </Modal>
  );
}
