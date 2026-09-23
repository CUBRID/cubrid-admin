import React, { useState, useEffect, useRef } from 'react';
import { useDispatch, useSelector, shallowEqual } from 'react-redux';
import { closeTransactionInfoModal, openKillTransactionModal } from '../databaseSlice';
import { databaseApi } from '../databaseApi';
import { extractTransactionList, isHaReplicationProcess } from '../transactionUtils';
import { Icon } from '../../../components/ds/foundation/Icon';
import { Modal } from '../../../components/ds/layout/Modal';
import { Button } from '../../../components/ds/foundation/Button';
import { Typography } from '../../../components/ds/foundation/Typography';
import { EmptyState } from '../../../components/ds/feedback/EmptyState';
import { ModalStatusLoading } from '../../../components/ds/feedback/ActionStatus';
import { useCM } from '../../../constants/useCM';

const VIEW_LOADING = 'loading';
const VIEW_SUCCESS = 'success';
const VIEW_ERROR = 'error';

export default function TransactionInfoModal() {
  const CM = useCM();
  const dispatch = useDispatch();
  const { isTransactionInfoModalOpen, transactionKillSignal } = useSelector((state) => state.databaseUI, shallowEqual);
  const { selectedDatabase, activeDatabases } = useSelector((state) => state.database, shallowEqual);
  const { selectedHostUid } = useSelector((state) => state.host, shallowEqual);

  const isActive = selectedDatabase && activeDatabases?.includes(selectedDatabase);

  const [view, setView] = useState(VIEW_LOADING);
  const [transactions, setTransactions] = useState([]);
  const [errorMsg, setErrorMsg] = useState('');
  const [selectedTranIndex, setSelectedTranIndex] = useState(null);

  // killtransaction/gettransactioninfo (CUBRID 11+) don't take dbuser/dbpasswd —
  // they run under the already-authenticated CMS session, so there's nothing
  // for a user to log into here. Kept as fixed defaults purely for CMS's
  // pre-11 legacy branch, which does still read them.
  const fetchTransactionInfo = async () => {
    if (!selectedHostUid || !selectedDatabase) return;
    if (!isActive) {
      setErrorMsg('Database is stopped. Transaction information is only available when the database is running.');
      setView(VIEW_ERROR);
      return;
    }

    setView(VIEW_LOADING);
    setErrorMsg('');

    try {
      const response = await databaseApi.getTransactionInfo(selectedHostUid, selectedDatabase, {
        dbuser: 'dba',
        dbpasswd: '',
      });
      setTransactions(extractTransactionList(response));
      setView(VIEW_SUCCESS);
    } catch (err) {
      setErrorMsg(err.response?.data?.note || err.response?.data?.message || CM.error);
      setView(VIEW_ERROR);
    }
  };

  useEffect(() => {
    if (isTransactionInfoModalOpen) {
      setSelectedTranIndex(null);
      fetchTransactionInfo();
    }
  }, [isTransactionInfoModalOpen, selectedHostUid, selectedDatabase]);

  // A kill only ever happens from a transaction list this modal already fetched,
  // so the credentials are known-good — safe to silently refetch instead of
  // dropping the user back to the auth screen.
  const lastSeenKillSignal = useRef(transactionKillSignal);
  useEffect(() => {
    if (!isTransactionInfoModalOpen || view !== VIEW_SUCCESS) return;
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

  if (view === VIEW_LOADING) {
    return (
      <Modal isOpen title={CM.transactionInformation} icon="swap_horiz" onClose={handleClose} maxWidth="540px" showCloseButton={false}>
        <ModalStatusLoading title={CM.transactionInformation} subtitle={CM.loggingInto(selectedDatabase)} />
      </Modal>
    );
  }

  if (view === VIEW_ERROR) {
    return (
      <Modal isOpen title={CM.transactionInformation} icon="error" iconVariant="danger" onClose={handleClose} maxWidth="540px" testId="transaction-info">
        <div className="py-8 space-y-4 text-center">
          <Typography variant="p" className="text-15 text-slate-600 dark:text-slate-300">
            {CM.error}
          </Typography>
          <Typography variant="caption" className="text-rose-500 font-mono block break-words px-4">
            {errorMsg}
          </Typography>
          <div className="flex justify-center gap-3">
            <Button data-testid="transaction-info-close-btn" variant="ghost" onClick={handleClose}>{CM.close}</Button>
            <Button data-testid="transaction-info-retry-btn" variant="primary" icon="refresh" onClick={fetchTransactionInfo}>{CM.refresh}</Button>
          </div>
        </div>
      </Modal>
    );
  }

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
          <Button data-testid="transaction-info-kill-btn" variant="danger" disabled={!selectedTranIndex} onClick={handleKill} icon="cancel">
            {CM.killTransaction}
          </Button>
          <div className="flex gap-2">
            <Button data-testid="transaction-info-close-btn" variant="ghost" onClick={handleClose}>{CM.close}</Button>
            <Button data-testid="transaction-info-refresh-btn" onClick={fetchTransactionInfo} icon="refresh">{CM.refresh}</Button>
          </div>
        </div>
      }
    >
      <div className="flex flex-col h-[540px] animate-in fade-in slide-in-from-bottom-4 duration-400">
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

        <div className="rounded-lg border border-slate-200 dark:border-white/10 overflow-hidden flex-1 overflow-y-auto min-h-0">
          {transactions.length === 0 ? (
            <EmptyState icon="info" title={CM.transactionInformation} subtitle={CM.activeTransactionsOf} py="py-12" />
          ) : (
            <table className="w-full text-left text-14">
              <thead className="bg-slate-50 dark:bg-white/5 text-12 uppercase text-slate-500 sticky top-0">
                <tr>
                  <th className="px-4 py-2">{CM.tranIndex}</th>
                  <th className="px-4 py-2">{CM.userNameCol}</th>
                  <th className="px-4 py-2">{CM.host}</th>
                  <th className="px-4 py-2">{CM.processId}</th>
                  <th className="px-4 py-2">{CM.programName}</th>
                  <th className="px-4 py-2 text-right">{CM.queryTime}</th>
                  <th className="px-4 py-2 text-right">{CM.tranTime}</th>
                  <th className="px-4 py-2 text-right">{CM.waitHolder}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-white/5">
                {transactions.map((tran, idx) => {
                  const tranIndex = tran.tranindex;
                  const isSelected = String(selectedTranIndex) === String(tranIndex);
                  const isHaProcess = isHaReplicationProcess(tran.program);
                  return (
                    <tr
                      key={idx}
                      className={`cursor-pointer ${isSelected ? 'bg-amber-500/10' : isHaProcess ? 'bg-amber-500/4 hover:bg-amber-500/8' : 'hover:bg-slate-50 dark:hover:bg-white/5'}`}
                      onClick={() => setSelectedTranIndex(tranIndex)}
                    >
                      <td className="px-4 py-2 font-mono">{tranIndex}</td>
                      <td className="px-4 py-2">{tran['@user'] || '-'}</td>
                      <td className="px-4 py-2 font-mono">{tran.host || '-'}</td>
                      <td className="px-4 py-2 font-mono">{tran.pid || '-'}</td>
                      <td className="px-4 py-2">
                        <span className="inline-flex items-center gap-1">
                          {isHaProcess && (
                            <Icon name="warning" size="13px" weight={400} className="text-amber-500" title={CM.haReplicationProcessWarning} />
                          )}
                          {tran.program || '-'}
                        </span>
                      </td>
                      <td className="px-4 py-2 text-right font-mono">{tran.query_time ?? '-'}</td>
                      <td className="px-4 py-2 text-right font-mono">{tran.tran_time ?? '-'}</td>
                      <td className="px-4 py-2 text-right font-mono">{tran.wait_for_lock_holder ?? '-'}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </Modal>
  );
}
