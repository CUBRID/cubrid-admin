import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import { closeLockInformationModal } from '../databaseSlice';
import { databaseApi } from '../databaseApi';

import { Modal } from '../../../components/ds/layout/Modal';
import { Button } from '../../../components/ds/foundation/Button';
import { TabGroup } from '../../../components/ds/layout/TabGroup';
import { Typography } from '../../../components/ds/foundation/Typography';
import { SectionHeader } from '../../../components/ds/foundation/SectionHeader';
import { MetricCard } from '../../../components/ds/foundation/MetricCard';
import { StatusBadge } from '../../../components/ds/foundation/StatusBadge';
import { ProgressBar } from '../../../components/ds/foundation/ProgressBar';
import { EmptyState } from '../../../components/ds/feedback/EmptyState';
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
  const { selectedDatabase, activeDatabases } = useSelector((s) => s.database);
  const { selectedHostUid } = useSelector((s) => s.host);

  const isActive = selectedDatabase && activeDatabases?.includes(selectedDatabase);

  const [activeTab, setActiveTab] = useState('sessions');
  const [settings, setSettings] = useState({});
  const [lot, setLot] = useState({});
  const [transactions, setTransactions] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const fetchLockInfo = useCallback(async () => {
    if (!selectedHostUid || !selectedDatabase) return;
    if (!isActive) {
      setError('Database is stopped. Locking information is only available when the database is running.');
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const response = await databaseApi.getLockInfo(selectedHostUid, selectedDatabase);
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
    } catch (err) {
      setError(err.response?.data?.note || err.response?.data?.message || CM.failedToGetLockInfo);
    } finally {
      setLoading(false);
    }
  }, [selectedHostUid, selectedDatabase]);

  useEffect(() => {
    if (isLockInfoModalOpen) {
      setActiveTab('sessions');
      fetchLockInfo();
    }
  }, [isLockInfoModalOpen, selectedHostUid, selectedDatabase]);

  const objectRows = useMemo(() => buildObjectLockRows(lot), [lot]);

  if (!isLockInfoModalOpen) return null;

  const handleClose = () => dispatch(closeLockInformationModal());

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
      loading={loading && transactions.length === 0}
      error={error}
      onErrorClose={() => setError(null)}
      onErrorRetry={fetchLockInfo}
      testId="lock-information"
      footer={
        <div className="flex justify-end gap-2 w-full">
          <Button data-testid="lock-information-close-btn" variant="ghost" onClick={handleClose} disabled={loading}>{CM.close}</Button>
          <Button data-testid="lock-information-refresh-btn" variant="primary" onClick={fetchLockInfo} loading={loading} icon="refresh">{CM.refresh}</Button>
        </div>
      }
    >
      <div className="space-y-4">
        <TabGroup tabs={TABS} active={activeTab} onChange={setActiveTab} testId="lock-information-tab" />

        <div className="min-h-[300px]">
          {activeTab === 'sessions' && (
            transactions.length === 0 ? (
              <EmptyState icon="info" title={CM.noSessions} subtitle={CM.noActiveTransactions} py="py-12" />
            ) : (
              <div className="rounded-lg border border-slate-200 dark:border-white/10 overflow-hidden overflow-x-auto">
                <table className="w-full text-left text-14">
                  <thead className="bg-slate-50 dark:bg-white/5 text-12 uppercase text-slate-500">
                    <tr>
                      {[CM.lockIndex, CM.pname, CM.uid, CM.host, CM.pid, CM.isolationLevel, CM.timeOut, CM.locks].map((h) => (
                        <th key={h} className="px-3 py-2 whitespace-nowrap">{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 dark:divide-white/5 font-mono">
                    {transactions.map((t, idx) => {
                      const holdCount = Array.isArray(t.lock) ? t.lock.length : t.lock ? 1 : 0;
                      const isWaiting = !!t.waitfor;
                      return (
                        <tr key={idx} className={isWaiting ? 'bg-rose-50/40 dark:bg-rose-500/5' : ''}>
                          <td className="px-3 py-2">{t.index ?? idx}</td>
                          <td className="px-3 py-2 font-sans">{t.pname || '-'}{isWaiting ? CM.waitingSuffix : ''}</td>
                          <td className="px-3 py-2">{t['@uid'] ?? '-'}</td>
                          <td className="px-3 py-2">{t.host ?? '-'}</td>
                          <td className="px-3 py-2">{t.pid ?? '-'}</td>
                          <td className="px-3 py-2">
                            <StatusBadge label={t.isolevel || '-'} variant="sky" />
                          </td>
                          <td className="px-3 py-2 text-right">{t.timeout ?? '-'}</td>
                          <td className="px-3 py-2 text-center">{holdCount || '-'}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )
          )}

          {activeTab === 'objects' && (
            <div className="space-y-3">
              <div className="grid grid-cols-3 gap-3">
                <MetricCard icon="lock" label={CM.currentLockedObjNum} value={lot.numlocked ?? 0} unit="" accent="amber" isLoading={loading} />
                <MetricCard icon="view_list" label={CM.maxLockedObjNum} value={lot.numallocated ?? 0} unit="" accent="sky" isLoading={loading} />
                <MetricCard icon="memory" label={CM.size} value={lot.sizelock ?? '-'} unit="bytes" accent="violet" isLoading={loading} />
              </div>
              {objectRows.length === 0 ? (
                <EmptyState icon="info" title={CM.noObjectLocks} subtitle={CM.noHeldObjectLocks} py="py-10" />
              ) : (
                <div className="rounded-lg border border-slate-200 dark:border-white/10 overflow-hidden overflow-x-auto">
                  <table className="w-full text-left text-14">
                    <thead className="bg-slate-50 dark:bg-white/5 text-12 uppercase text-slate-500">
                      <tr>
                        {[CM.oid, CM.objectType, CM.mode, CM.numHolders, CM.numWaiters].map((h) => (
                          <th key={h} className="px-3 py-2">{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 dark:divide-white/5 font-mono">
                      {objectRows.map((row, idx) => (
                        <tr key={idx}>
                          <td className="px-3 py-2">{row.oid}</td>
                          <td className="px-3 py-2 font-sans">{row.class_name}</td>
                          <td className="px-3 py-2">{row.holder}</td>
                          <td className="px-3 py-2">{row.mode}</td>
                          <td className="px-3 py-2 text-right">{row.waiters}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}

          {activeTab === 'params' && (
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
