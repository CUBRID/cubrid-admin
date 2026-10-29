import React, { useState, useEffect, useRef, useMemo } from 'react';
import { useDispatch, useSelector, shallowEqual } from 'react-redux';
import { closeTransactionInfoModal, openKillTransactionModal } from '../databaseSlice';
import { databaseApi } from '../databaseApi';
import { extractTransactionList, isHaReplicationProcess, parseTranIndex } from '../transactionUtils';
import { Icon } from '../../../components/ds/foundation/Icon';
import { Modal } from '../../../components/ds/layout/Modal';
import { Button } from '../../../components/ds/foundation/Button';
import { Typography } from '../../../components/ds/foundation/Typography';
import { Table } from '../../../components/ds/layout/Table';
import { ContentLoadingOverlay } from '../../../components/ds/feedback/ContentLoadingOverlay';
import { TablePagination } from '../../../components/ds/feedback/Pagination';
import { useCM } from '../../../constants/useCM';
import { useClientPagination } from '../../../infrastructure/hooks/useClientPagination';

const PAGE_SIZE = 20;

export default function TransactionInfoModal() {
  const CM = useCM();
  const dispatch = useDispatch();
  const { isTransactionInfoModalOpen, transactionKillSignal } = useSelector((state) => state.databaseUI, shallowEqual);
  const { selectedDatabase, activeDatabasesByHost } = useSelector((state) => state.database, shallowEqual);
  const { selectedHostUid } = useSelector((state) => state.host, shallowEqual);
  const activeDatabases = activeDatabasesByHost[selectedHostUid] || [];

  const isActive = selectedDatabase && activeDatabases?.includes(selectedDatabase);

  // One modal frame for every state: the list (or error) stays mounted and a
  // spinner overlays it while a fetch is in flight, instead of swapping in a
  // separate loading modal on each refresh.
  const [transactions, setTransactions] = useState([]);
  const [hasLoaded, setHasLoaded] = useState(false);
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');
  const [selectedTranIndex, setSelectedTranIndex] = useState(null);
  // Drops a response that lands after the modal was closed or retargeted.
  const requestIdRef = useRef(0);
  // Sorted here rather than by Table: Table only sees the current page. The
  // index arrives as "6(ACTIVE)", so compare its number, not the string.
  const [sortDirection, setSortDirection] = useState(null);
  const sortedTransactions = useMemo(() => {
    if (!sortDirection) return transactions;
    const sign = sortDirection === 'asc' ? 1 : -1;
    return [...transactions].sort((a, b) => sign * (Number(parseTranIndex(a.tranindex)) - Number(parseTranIndex(b.tranindex))));
  }, [transactions, sortDirection]);
  const pager = useClientPagination(sortedTransactions, PAGE_SIZE, `${isTransactionInfoModalOpen}:${selectedHostUid}:${selectedDatabase}`);

  // killtransaction/gettransactioninfo (CUBRID 11+) don't take dbuser/dbpasswd —
  // they run under the already-authenticated CMS session, so there's nothing
  // for a user to log into here. Kept as fixed defaults purely for CMS's
  // pre-11 legacy branch, which does still read them.
  const fetchTransactionInfo = async () => {
    if (!selectedHostUid || !selectedDatabase) return;
    const requestId = ++requestIdRef.current;
    if (!isActive) {
      setErrorMsg('Database is stopped. Transaction information is only available when the database is running.');
      setLoading(false);
      return;
    }

    setLoading(true);

    try {
      const response = await databaseApi.getTransactionInfo(selectedHostUid, selectedDatabase, {
        dbuser: 'dba',
        dbpasswd: '',
      });
      if (requestId !== requestIdRef.current) return;
      setTransactions(extractTransactionList(response));
      setHasLoaded(true);
      setErrorMsg('');
    } catch (err) {
      if (requestId !== requestIdRef.current) return;
      setErrorMsg(err.response?.data?.note || err.response?.data?.message || CM.error);
    } finally {
      if (requestId === requestIdRef.current) setLoading(false);
    }
  };

  useEffect(() => {
    if (isTransactionInfoModalOpen) {
      setSelectedTranIndex(null);
      fetchTransactionInfo();
    } else {
      // Reset while hidden so the next open starts on the loading state
      // rather than the previous database's list.
      requestIdRef.current += 1;
      setTransactions([]);
      setHasLoaded(false);
      setLoading(false);
      setErrorMsg('');
    }
  }, [isTransactionInfoModalOpen, selectedHostUid, selectedDatabase]);

  // A kill only ever happens from a transaction list this modal already fetched,
  // so the credentials are known-good — safe to silently refetch instead of
  // dropping the user back to the auth screen.
  const lastSeenKillSignal = useRef(transactionKillSignal);
  useEffect(() => {
    if (!isTransactionInfoModalOpen || !hasLoaded || errorMsg) return;
    if (lastSeenKillSignal.current === transactionKillSignal) return;
    lastSeenKillSignal.current = transactionKillSignal;
    fetchTransactionInfo();
  }, [transactionKillSignal]);

  if (!isTransactionInfoModalOpen) return null;

  const handleClose = () => dispatch(closeTransactionInfoModal());

  const handleKill = () => {
    const selectedTran = transactions.find((t) => String(t.tranindex) === String(selectedTranIndex));
    if (selectedTran) dispatch(openKillTransactionModal(selectedTran));
  };

  const columns = [
    {
      accessor: 'tranindex',
      header: CM.tranIndex,
      sortable: true,
      onHeaderClick: () => setSortDirection((dir) => (dir === 'asc' ? 'desc' : 'asc')),
      sortDirection,
      cellClassName: 'font-mono',
    },
    { accessor: '@user', header: CM.userNameCol, render: (value) => value || '-' },
    { accessor: 'host', header: CM.host, render: (value) => value || '-', cellClassName: 'font-mono' },
    { accessor: 'pid', header: CM.processId, render: (value) => value || '-', cellClassName: 'font-mono' },
    {
      accessor: 'program',
      header: CM.programName,
      render: (value, row) => (
        <span className="inline-flex items-center gap-1">
          {isHaReplicationProcess(row.program) && (
            <Icon name="warning" size="12px" weight={400} className="text-amber-500" title={CM.haReplicationProcessWarning} />
          )}
          {value || '-'}
        </span>
      ),
    },
    { accessor: 'query_time', header: CM.queryTime, align: 'right', render: (value) => value ?? '-', cellClassName: 'font-mono' },
    { accessor: 'tran_time', header: CM.tranTime, align: 'right', render: (value) => value ?? '-', cellClassName: 'font-mono' },
    { accessor: 'wait_for_lock_holder', header: CM.waitHolder, align: 'right', render: (value) => value ?? '-', cellClassName: 'font-mono' },
  ];

  // Nothing settled yet (first open): spinner from the very first frame,
  // before the fetch effect has even run.
  const showSpinner = loading || (!hasLoaded && !errorMsg);
  const showError = Boolean(errorMsg) && !loading;

  return (
    <Modal
      isOpen={isTransactionInfoModalOpen}
      onClose={handleClose}
      title={CM.transactionInformation}
      subtitle={`${CM.activeTransactionsOf} ${selectedDatabase}`}
      icon="swap_horiz"
      maxWidth="1100px"
      testId="transaction-info"
      footer={
        <div className="flex items-center justify-between w-full">
          <Button data-testid="transaction-info-kill-btn" variant="danger" disabled={!selectedTranIndex || showSpinner || showError} onClick={handleKill} icon="cancel">
            {CM.killTransaction}
          </Button>
          <div className="flex gap-2">
            <Button data-testid="transaction-info-close-btn" variant="ghost" onClick={handleClose}>{CM.close}</Button>
            <Button data-testid="transaction-info-refresh-btn" onClick={fetchTransactionInfo} disabled={showSpinner} icon="refresh">{CM.refresh}</Button>
          </div>
        </div>
      }
    >
      <div className="relative flex flex-col h-[540px]">
        <ContentLoadingOverlay show={showSpinner} testId="transaction-info-loading" />
        <div className="mb-4 flex items-center justify-between bg-slate-50/80 dark:bg-black/20 border border-slate-200 dark:border-white/8 rounded-xl px-4 py-3 shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg bg-emerald-500/10 flex items-center justify-center text-emerald-500 border border-emerald-500/20">
              <Icon name="sensors" size="sm" weight={300} />
            </div>
            <div className="min-w-0">
              <Typography variant="label" className="text-slate-400 uppercase tracking-widest font-bold text-13 block leading-none">
                {CM.activeTransactionsOf} <span className="text-emerald-500 ml-1">{transactions.length}</span>
              </Typography>
            </div>
          </div>
        </div>

        {showError ? (
          <div data-testid="transaction-info-error" className="flex-1 flex flex-col items-center justify-center gap-4 text-center">
            <Icon name="error" size="md" weight={300} className="text-rose-500" />
            <Typography variant="p" className="text-15 text-slate-600 dark:text-slate-300">
              {CM.error}
            </Typography>
            <Typography variant="caption" className="text-rose-500 font-mono block break-words px-4">
              {errorMsg}
            </Typography>
            <Button data-testid="transaction-info-retry-btn" variant="primary" icon="refresh" onClick={fetchTransactionInfo}>{CM.refresh}</Button>
          </div>
        ) : (
          <div className="rounded-lg border border-slate-200 dark:border-white/10 overflow-hidden flex-1 overflow-y-auto min-h-0">
            {hasLoaded && (
              <Table
                columns={columns}
                data={pager.pageRows}
                emptyMessage={CM.activeTransactionsOf}
                onRowClick={(tran) => setSelectedTranIndex(tran.tranindex)}
                isRowSelected={(tran) => String(selectedTranIndex) === String(tran.tranindex)}
                getRowAriaLabel={(tran) => `${CM.tranIndex} ${tran.tranindex}`}
                stickyHeader
                selectable
                showEmptyStateAsRow
              />
            )}
          </div>
        )}
        {!showError && hasLoaded && (
          <TablePagination pager={pager} testId="transaction-info-pages" className="mt-3 shrink-0" />
        )}
      </div>
    </Modal>
  );
}
