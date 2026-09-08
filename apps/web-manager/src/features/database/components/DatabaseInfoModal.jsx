import React, { useState, useEffect } from 'react';
import { useDispatch, useSelector, shallowEqual } from 'react-redux';
import { closeDatabaseInfoModal, fetchDatabaseParamDump } from '../databaseSlice';
import { dbKey } from '../dbKey';

import { Icon } from '../../../components/ds/foundation/Icon';
import { Modal } from '../../../components/ds/layout/Modal';
import { Button } from '../../../components/ds/foundation/Button';
import { Input } from '../../../components/ds/forms/Input';
import { Toggle } from '../../../components/ds/forms/Toggle';
import { Typography } from '../../../components/ds/foundation/Typography';
import { StatusBadge } from '../../../components/ds/foundation/StatusBadge';
import { Table } from '../../../components/ds/layout/Table';
import { useCM } from '../../../constants/useCM';

// view states
const VIEW_FORM    = 'form';
const VIEW_LOADING = 'loading';
const VIEW_SUCCESS = 'success';
const VIEW_ERROR   = 'error';

export default function DatabaseInfoModal() {
  const CM = useCM();
  const dispatch = useDispatch();
  const { isDatabaseInfoModalOpen } = useSelector((state) => state.databaseUI, shallowEqual);
  const { selectedDatabase, activeDatabases } = useSelector((state) => state.database, shallowEqual);
  const { databaseInfoData } = useSelector((state) => state.databaseConfiguration, shallowEqual);
  const { selectedHostUid } = useSelector((state) => state.host, shallowEqual);

  const [view, setView] = useState(VIEW_FORM);
  const [dumpBoth, setDumpBoth] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');

  const isActive = activeDatabases.includes(selectedDatabase);

  // Reset state when modal opens
  useEffect(() => {
    if (isDatabaseInfoModalOpen) {
      setView(VIEW_FORM);
      setDumpBoth(false);
      setErrorMsg('');
    }
  }, [isDatabaseInfoModalOpen]);

  if (!isDatabaseInfoModalOpen) return null;

  const handleRunDump = async () => {
    if (!selectedHostUid || !selectedDatabase) return;
    
    setView(VIEW_LOADING);
    setErrorMsg('');

    try {
      await dispatch(fetchDatabaseParamDump({ 
        hostUid: selectedHostUid, 
        dbname: selectedDatabase, 
        both: dumpBoth ? 'y' : 'n' 
      })).unwrap();
      setView(VIEW_SUCCESS);
    } catch (err) {
      setErrorMsg(typeof err === 'string' ? err : (err.message || CM.failedToGetDbParams));
      setView(VIEW_ERROR);
    }
  };

  const handleClose = () => {
    dispatch(closeDatabaseInfoModal());
  };

  const rawData = databaseInfoData[dbKey(selectedHostUid, selectedDatabase)] || {};
  const serverParams = (rawData.server && rawData.server.length > 0) ? rawData.server[0] : {};
  const clientParams = (rawData.client && rawData.client.length > 0) ? rawData.client[0] : null;

  // Merge keys
  const allKeys = Array.from(new Set([
    ...Object.keys(serverParams),
    ...(clientParams ? Object.keys(clientParams) : [])
  ])).sort();

  const paramList = allKeys.map(key => ({
    name: key,
    server: serverParams[key] !== undefined ? (typeof serverParams[key] === 'boolean' ? (serverParams[key] ? 'yes' : 'no') : String(serverParams[key])) : '-',
    client: clientParams ? (clientParams[key] !== undefined ? (typeof clientParams[key] === 'boolean' ? (clientParams[key] ? 'yes' : 'no') : String(clientParams[key])) : '-') : null
  }));

  const columns = [
    { header: CM.parameter, accessor: 'name', render: (val) => (
      <Typography variant="label" className="text-slate-900 dark:text-slate-100 font-bold tracking-tight">
        {val}
      </Typography>
    )},
    { header: CM.serverValue, accessor: 'server', className: dumpBoth ? 'w-[200px]' : 'w-[400px]', render: (val) => (
      <Typography variant="span" className="font-mono text-13 text-amber-500 font-bold">{val}</Typography>
    )},
    ...(dumpBoth ? [{ header: CM.clientValue, accessor: 'client', className: 'w-[200px]', render: (val) => (
      <Typography variant="span" className={`font-mono text-13 ${val === '-' ? 'text-slate-300 dark:text-slate-600' : 'text-slate-900 dark:text-slate-100'}`}>{val}</Typography>
    )}] : [])
  ];

  /* ─── LOADING view ─── */
  if (view === VIEW_LOADING) {
    return (
      <Modal isOpen title={CM.usedParameterDump} icon="analytics" onClose={handleClose} maxWidth="900px" showCloseButton={false}>
        <div className="flex flex-col items-center justify-center py-14 space-y-6 animate-in fade-in duration-200">
          <div className="relative w-16 h-16">
            <div className="absolute inset-0 rounded-full border-2 border-slate-100 dark:border-white/5" />
            <div className="absolute inset-0 rounded-full border-2 border-transparent border-t-amber-500 animate-spin" style={{ animationDuration: '0.9s' }} />
            <div className="absolute inset-0 flex items-center justify-center text-amber-500">
              <Icon name="analytics" size="md" weight={400} className="animate-pulse" />
            </div>
          </div>
          <div className="text-center space-y-1.5 px-8">
            <Typography variant="h4" className="text-16 font-bold text-slate-800 dark:text-white">{CM.loadingParameters}</Typography>
            <Typography variant="p" className="text-13 text-slate-500 max-w-[280px] mx-auto">
              {selectedDatabase}
            </Typography>
          </div>
          <div className="w-32 h-[2px] bg-slate-100 dark:bg-white/4 rounded-full overflow-hidden">
            <div className="h-full bg-amber-500 rounded-full" style={{ animation: 'modalSlideTranslate 1.5s ease-in-out infinite' }} />
          </div>
          <style>{`
            @keyframes modalSlideTranslate {
              0%   { transform: translateX(-100%); width: 50%; }
              50%  { transform: translateX(100%);  width: 60%; }
              100% { transform: translateX(200%);  width: 50%; }
            }
          `}</style>
        </div>
      </Modal>
    );
  }

  /* ─── ERROR view ─── */
  if (view === VIEW_ERROR) {
    return (
      <Modal isOpen title={CM.usedParameterDump} icon="analytics" iconVariant="danger" onClose={handleClose} maxWidth="900px">
        <div className="flex flex-col items-center justify-center py-10 gap-6 text-center animate-in fade-in duration-200">
          <div className="relative w-14 h-14 bg-rose-500 rounded-full flex items-center justify-center shadow-[0_0_20px_rgba(244,63,94,0.3)]">
            <Icon name="error" size="md" weight={300} className="text-white" />
          </div>
          <div className="space-y-2 px-6">
            <Typography variant="h4" className="text-17 font-bold text-slate-900 dark:text-white">{CM.failure}</Typography>
            <Typography variant="p" className="text-13 text-slate-500">
              {CM.paramsFetchErrorMsg(selectedDatabase)}
            </Typography>
          </div>
          <div className="w-full max-w-[420px] bg-rose-500/5 border border-rose-500/15 rounded-xl px-4 py-3 text-left">
            <div className="flex items-center gap-2 mb-1.5">
              <Icon name="terminal" size="xs" weight={300} className="text-rose-400" />
              <span className="text-11 font-semibold uppercase tracking-wide text-rose-400">{CM.message}</span>
            </div>
            <Typography variant="caption" className="text-rose-400/80 font-mono leading-relaxed break-words">
              {errorMsg}
            </Typography>
          </div>
          <div className="flex items-center gap-3">
            <Button variant="secondary" onClick={handleClose}>{CM.close}</Button>
            <Button variant="primary" icon="refresh" onClick={() => { setView(VIEW_FORM); setErrorMsg(''); }}>{CM.retry}</Button>
          </div>
        </div>
      </Modal>
    );
  }

  /* ─── FORM & SUCCESS view ─── */
  // Case for RESULTS (SUCCESS)
  if (view === VIEW_SUCCESS) {
    return (
      <Modal
        isOpen={isDatabaseInfoModalOpen}
        onClose={handleClose}
        title={CM.usedParameterDump}
        icon="analytics"
        maxWidth="900px"
        testId="database-info"
        footer={
          <div className="flex justify-end gap-3 w-full">
            <Button data-testid="database-info-back-btn" variant="outline" onClick={() => setView(VIEW_FORM)}>{CM.cancel}</Button>
            <Button data-testid="database-info-close-btn" variant="primary" onClick={handleClose} icon="check_circle">{CM.close}</Button>
          </div>
        }
      >
        <div className="flex flex-col h-[550px] -m-6 animate-in fade-in slide-in-from-bottom-4 duration-400">
          <div className="px-6 py-4 flex items-center justify-between bg-slate-50/80 dark:bg-black/20 border-b border-slate-100 dark:border-white/5 shrink-0">
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 rounded-lg bg-amber-500/10 flex items-center justify-center text-amber-500 border border-amber-500/20">
                <Icon name="bar_chart" size="sm" weight={300} />
              </div>
              <Typography variant="label" className="text-slate-400 uppercase tracking-widest font-bold text-13">
                {CM.databaseName}: <Typography variant="span" className="text-amber-500 ml-1 font-mono">{selectedDatabase}</Typography>
              </Typography>
            </div>
            <div className="flex items-center gap-2">
              <Typography variant="span" className={`px-2 py-0.5 rounded-full text-11 font-black uppercase tracking-tighter ${isActive ? 'bg-emerald-500/10 text-emerald-500' : 'bg-slate-500/10 text-slate-500'}`}>
                {isActive ? CM.activeContext : CM.offlineStatic}
              </Typography>
            </div>
          </div>

          <div className="flex-1 min-h-0 overflow-y-auto custom-scrollbar bg-white dark:bg-transparent flex flex-col">
            <Table
              columns={columns}
              data={paramList}
              emptyMessage={CM.noConfigParameters}
            />
          </div>
        </div>
      </Modal>
    );
  }

  /* ─── FORM view (initial state) ─── */
  return (
    <Modal
      isOpen={isDatabaseInfoModalOpen}
      onClose={handleClose}
      title={CM.usedParameterDump}
      subtitle={CM.parameterDumpSubtitle}
      icon="database"
      maxWidth="900px"
      testId="database-info"
      footer={
        <div className="flex justify-end gap-3 w-full">
          <Button data-testid="database-info-cancel-btn" variant="ghost" onClick={handleClose}>{CM.cancel}</Button>
          <Button data-testid="database-info-run-btn" variant="primary" onClick={handleRunDump} icon="analytics">{CM.ok}</Button>
        </div>
      }
    >
      <div className="space-y-8 py-2">
        <div className="relative overflow-hidden rounded-2xl border border-amber-500/20 bg-linear-to-r from-amber-500/8 to-transparent dark:from-amber-500/10 dark:to-transparent p-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-amber-500/10 border border-amber-500/20 flex items-center justify-center shrink-0">
              <Icon name="database" size="md" weight={300} className="text-amber-500" />
            </div>
            <div className="min-w-0 flex-1">
              <Typography variant="caption" className="font-semibold uppercase tracking-wide text-amber-600/70 dark:text-amber-400/60 mb-0.5">{CM.databaseName}</Typography>
              <Typography variant="h4" className="text-16 font-black text-amber-700 dark:text-amber-400 font-mono truncate">{selectedDatabase}</Typography>
            </div>
            <StatusBadge label={CM.environmentReady} variant="emerald" pulse={true} className="rounded-full" />
          </div>
        </div>

        <div className="space-y-4">
          <div className="flex items-center gap-2 px-1">
            <span className="text-12 font-black uppercase tracking-[0.2em] text-slate-400 dark:text-slate-500">{CM.analysisPipeline}</span>
            <div className="flex-1 h-px bg-slate-100 dark:bg-white/5" />
          </div>

          <div className="space-y-4">
            <div className="p-4 bg-slate-50 dark:bg-white/2 border border-slate-100 dark:border-white/5 rounded-2xl flex gap-4 transition-all">
              <div className="w-10 h-10 rounded-xl bg-slate-100 dark:bg-white/5 flex items-center justify-center text-slate-400 border border-slate-200 dark:border-white/10 shrink-0">
                <Icon name="info" size="md" weight={300} />
              </div>
              <Typography variant="p" className="text-13 text-slate-500 dark:text-slate-400 italic font-medium leading-relaxed">
                {CM.extractionProfileDesc}
              </Typography>
            </div>

            <div 
              className={`flex items-center gap-4 p-4 border rounded-2xl transition-all group ${isActive ? 'bg-white dark:bg-white/2 border-slate-100 dark:border-white/5 cursor-pointer hover:border-amber-500/30 hover:bg-amber-500/5' : 'bg-slate-100/50 dark:bg-white/1 border-transparent opacity-50 cursor-not-allowed'}`}
              onClick={() => isActive && setDumpBoth(!dumpBoth)}
            >
              <div className={`w-10 h-10 rounded-xl flex items-center justify-center border transition-all shrink-0 ${dumpBoth ? 'bg-amber-500 text-white shadow-md shadow-amber-500/20' : 'bg-slate-100 dark:bg-white/5 border-slate-200 dark:border-white/10 text-slate-400'}`}>
                <Icon name="compare_arrows" size="sm" weight={300} />
              </div>
              <div className="flex-1">
                <Typography variant="p" className={`font-bold transition-colors ${dumpBoth ? 'text-amber-500' : 'text-slate-900 dark:text-white'} text-14 tracking-tight`}>{CM.comparativeAnalysis}</Typography>
                <Typography variant="caption" className="text-slate-400 dark:text-slate-500 font-medium block mt-0.5">{CM.comparativeAnalysisDesc}</Typography>
              </div>
              <div className="shrink-0" onClick={(e) => e.stopPropagation()}>
                <Toggle 
                  checked={dumpBoth}
                  onChange={(val) => isActive && setDumpBoth(val)}
                  disabled={!isActive}
                />
              </div>
            </div>
          </div>
        </div>
      </div>
    </Modal>
  );
}
