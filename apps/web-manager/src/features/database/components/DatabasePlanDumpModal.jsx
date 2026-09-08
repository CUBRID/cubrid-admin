import React, { useState, useEffect } from 'react';
import { useDispatch, useSelector, shallowEqual } from 'react-redux';
import { closePlanDumpModal, fetchDatabasePlanDump, resetPlanDumpState } from '../databaseSlice';
import { dbKey } from '../dbKey';
import LoadingOverlay from '../../../components/common/LoadingOverlay';
import ErrorOverlay from '../../../components/common/ErrorOverlay';
import { useCM } from '../../../constants/useCM';

import { Icon } from '../../../components/ds/foundation/Icon';
import { Modal } from '../../../components/ds/layout/Modal';
import { Button } from '../../../components/ds/foundation/Button';
import { Toggle } from '../../../components/ds/forms/Toggle';
import { StatusBadge } from '../../../components/ds/foundation/StatusBadge';
import { Typography } from '../../../components/ds/foundation/Typography';
import { SectionHeader } from '../../../components/ds/foundation/SectionHeader';
import { EmptyState } from '../../../components/ds/feedback/EmptyState';

export default function DatabasePlanDumpModal() {
  const CM = useCM();
  const dispatch = useDispatch();
  const { isPlanDumpModalOpen } = useSelector((state) => state.databaseUI, shallowEqual);
  const { selectedDatabase } = useSelector((state) => state.database, shallowEqual);
  const { planDumpData, planDumpLoading, planDumpError } = useSelector((state) => state.databaseConfiguration, shallowEqual);
  const { selectedHostUid } = useSelector((state) => state.host, shallowEqual);

  const [step, setStep] = useState('setup');
  const [planDrop, setPlanDrop] = useState(false);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (isPlanDumpModalOpen) {
      setStep('setup');
      setPlanDrop(false);
    }
  }, [isPlanDumpModalOpen]);

  if (!isPlanDumpModalOpen) return null;

  const handleRunDump = () => {
    if (selectedHostUid && selectedDatabase) {
      dispatch(fetchDatabasePlanDump({
        hostUid: selectedHostUid,
        dbname: selectedDatabase,
        plandrop: planDrop ? 'y' : 'n'
      })).unwrap().then(() => {
        setStep('results');
      });
    }
  };

  const handleClose = () => {
    dispatch(resetPlanDumpState());
    dispatch(closePlanDumpModal());
  };

  const results = planDumpData[dbKey(selectedHostUid, selectedDatabase)] || {};
  let lines = [];
  if (results.log && Array.isArray(results.log) && results.log.length > 0) {
    lines = results.log[0].line || [];
  } else if (results.lines) {
    lines = results.lines;
  } else if (Array.isArray(results)) {
    lines = results;
  }

  // Parse stats from lines
  const stats = {};
  lines.forEach(l => {
    if (l && l.includes(':') && !l.includes('sql info')) {
      const [k, ...vParts] = l.split(':');
      if (k && vParts.length) stats[k.trim()] = vParts.join(':').trim();
    }
  });
  const hitRatio = stats['Hits'] && stats['Lookups']
    ? ((parseInt(stats['Hits']) / (parseInt(stats['Lookups']) || 1)) * 100).toFixed(1)
    : null;

  const statCards = [
    { label: CM.hitRatioLabel, value: hitRatio ? `${hitRatio}%` : '—', color: 'text-amber-500' },
    { label: CM.hitsLabel, value: stats['Hits'] || '0', color: 'text-emerald-500' },
    { label: CM.missesLabel, value: stats['Miss'] || '0', color: 'text-rose-500' },
  ];
  const planSteps = [
    { icon: 'query_stats', label: CM.inspectStepLabel },
    { icon: 'schema', label: CM.extractStepLabel },
    { icon: 'analytics', label: CM.aggregateStepLabel },
  ];


  const visibleLines = lines.filter(l => l && l.trim());

  const handleCopy = () => {
    navigator.clipboard.writeText(visibleLines.join('\n')).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    });
  };

  return (
    <Modal
      isOpen={isPlanDumpModalOpen}
      onClose={handleClose}
      title={CM.planCacheDumpTitle}
      subtitle={CM.displayQueryPlan}
      icon="schema"
      maxWidth={step === 'results' ? 'max-w-[780px]' : 'max-w-[460px]'}
      testId="plan-dump"
      footer={
        <div className="flex justify-end gap-3 w-full">
          <Button data-testid="plan-dump-close-btn" variant="secondary" onClick={handleClose}>
            {step === 'setup' ? CM.cancel : CM.close}
          </Button>
          {step === 'setup' ? (
            <Button data-testid="plan-dump-run-btn" variant="primary" onClick={handleRunDump} loading={planDumpLoading} icon="play_circle">
              {CM.runDumpBtn}
            </Button>
          ) : (
            <Button
              data-testid="plan-dump-back-btn"
              variant="secondary"
              onClick={() => setStep('setup')}
              icon="arrow_back"
            >
              {CM.back}
            </Button>
          )}
        </div>
      }
    >
      <div className={`relative ${planDumpLoading || planDumpError ? 'min-h-[340px]' : ''}`}>
        <LoadingOverlay
          isVisible={planDumpLoading}
          title={CM.dumpingPlanCache}
          subtitle={CM.dumpingPlanCacheSubtitle}
        />
        <ErrorOverlay
          isVisible={!!planDumpError}
          error={planDumpError}
          onRetry={handleRunDump}
          onClose={() => dispatch(resetPlanDumpState())}
        />

        {step === 'setup' ? (
          <div className="space-y-6 animate-in fade-in zoom-in-95 duration-300">
            {/* Minimal Target Display */}
            <div className="flex items-center justify-between p-4 bg-slate-50 dark:bg-white/3 border border-slate-200 dark:border-white/10 rounded-2xl">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-amber-500/10 border border-amber-500/20 flex items-center justify-center text-amber-500 shadow-sm">
                  <Icon name="database" size="sm" weight={300} />
                </div>
                <div>
                  <Typography variant="caption" className="text-12 font-black text-slate-400 uppercase tracking-widest">{CM.selectedInstance}</Typography>
                  <Typography variant="p" className="text-16 font-black text-slate-900 dark:text-white font-mono leading-none">{selectedDatabase}</Typography>
                </div>
              </div>
              <StatusBadge label={CM.xaslCache} variant="amber" />
            </div>

            {/* Horizontal Pipeline */}
            <div className="flex items-center justify-between px-2 bg-slate-50/50 dark:bg-white/2 py-3 rounded-xl border border-dashed border-slate-200 dark:border-white/5">
              {planSteps.map((s, i) => (
                <React.Fragment key={i}>
                  <div className="flex items-center gap-2 group">
                    <div className="w-6 h-6 rounded-lg bg-amber-500/10 border border-amber-500/20 flex items-center justify-center text-amber-500">
                      <Icon name={s.icon} size="13px" weight={400} />
                    </div>
                    <Typography variant="caption" className="text-12 font-bold uppercase tracking-tight text-slate-500">{s.label}</Typography>
                  </div>
                  {i < planSteps.length - 1 && (
                    <div className="flex-1 h-px bg-slate-200 dark:bg-white/10 mx-2" />
                  )}
                </React.Fragment>
              ))}
            </div>

            {/* Focused Options */}
            <div className="space-y-4">
              <SectionHeader title={CM.configuration} icon="tune" />
              <div 
                className={`p-4 rounded-2xl border transition-all cursor-pointer select-none group
                  ${planDrop 
                    ? 'bg-rose-500/5 border-rose-500/20 shadow-xs' 
                    : 'bg-white dark:bg-white/2 border-slate-200 dark:border-white/10 hover:border-slate-300 dark:hover:border-white/20'
                  }`}
                onClick={() => setPlanDrop(!planDrop)}
              >
                <div className="flex items-center gap-4">
                  <div className={`w-9 h-9 rounded-xl flex items-center justify-center border transition-all
                    ${planDrop ? 'bg-rose-500/10 border-rose-500/20 text-rose-500' : 'bg-slate-100 dark:bg-white/5 border-slate-200 dark:border-white/5 text-slate-400'}
                  `}>
                    <Icon name="delete_sweep" size="xs" weight={300} />
                  </div>
                  <div className="flex-1">
                    <Typography variant="p" className={`font-bold text-14 ${planDrop ? 'text-rose-500' : 'text-slate-900 dark:text-white'}`}>{CM.flushCacheAfterExport}</Typography>
                    <Typography variant="caption" className="text-slate-400 text-12 block mt-0.5">{CM.clearsXaslEntries}</Typography>
                  </div>
                  <div onClick={(e) => e.stopPropagation()}>
                    <Toggle checked={planDrop} onChange={setPlanDrop} />
                  </div>
                </div>
              </div>

              {planDrop && (
                <div className="flex items-start gap-2.5 px-3 py-2.5 bg-rose-50/50 dark:bg-rose-500/5 border border-rose-200 dark:border-rose-500/20 rounded-xl animate-in fade-in slide-in-from-top-2">
                  <Icon name="warning" size="xs" weight={300} className="text-rose-500 shrink-0 mt-0.5" />
                  <Typography variant="caption" className="text-rose-600 dark:text-rose-400 font-medium leading-relaxed text-12">
                    {CM.clearCachedPlansWarning}
                  </Typography>
                </div>
              )}
            </div>

          </div>


        ) : (
          /* Results View */
          <div className="flex flex-col -m-5 h-[560px]">
            {/* Stats Bar */}
            {Object.keys(stats).length > 0 && (
              <div className="grid grid-cols-4 border-b border-slate-100 dark:border-white/5 shrink-0">
                {statCards.map((card, i) => (
                  <div
                    key={i}
                    className={`px-6 py-3 ${i < statCards.length - 1 ? 'border-r border-slate-100 dark:border-white/5' : ''}`}
                  >
                    <Typography variant="label" className="text-11 font-bold uppercase tracking-widest text-slate-400">
                      {card.label}
                    </Typography>
                    <Typography variant="h2" className={`text-20 font-black font-mono leading-tight mt-0.5 ${card.color}`}>
                      {card.value}
                    </Typography>
                  </div>
                ))}
              </div>
            )}

            {/* Header row */}
            <div className="px-6 py-2 flex items-center justify-between bg-slate-50/80 dark:bg-white/2 border-b border-slate-100 dark:border-white/5 shrink-0">
              <div className="flex items-center gap-2">
                <Icon name="list_alt" size="sm" weight={300} className="text-slate-400" />
                <Typography variant="label" className="text-12 font-black uppercase tracking-widest text-slate-500">
                  {CM.queryPlanEntriesLabel}
                </Typography>
              </div>
              <div className="flex items-center gap-2">
                <span className={`px-2 py-0.5 rounded-full text-11 font-black uppercase tracking-widest border ${visibleLines.length > 0 ? 'bg-emerald-500/10 text-emerald-500 border-emerald-500/20' : 'bg-slate-100 dark:bg-white/5 text-slate-400 border-slate-200 dark:border-white/10'}`}>
                  {visibleLines.length > 0 ? CM.linesCountLabel(visibleLines.length) : CM.emptyLabel}
                </span>
                {visibleLines.length > 0 && (
                  <button
                    type="button"
                    onClick={handleCopy}
                    title={CM.copyToClipboard}
                    className="w-6 h-6 rounded-lg flex items-center justify-center text-slate-400 hover:text-amber-500 hover:bg-amber-500/10 transition-all"
                  >
                    <Icon name={copied ? 'check' : 'content_copy'} size="15px" weight={300} className={copied ? 'text-emerald-500' : ''} />
                  </button>
                )}
              </div>
            </div>

            {/* Output */}
            <div className="flex-1 overflow-y-auto custom-scrollbar">
              {visibleLines.length > 0 ? (
                visibleLines.map((line, idx) => {
                  const isHeader = line.includes('XASL_ID') || line.includes('SQL_ID');
                  const isPlanLine = line.startsWith('  ') && !isHeader;
                  const isStatLine = line.includes(':') && !isHeader && !isPlanLine;

                  return (
                    <div
                      key={idx}
                      className={`px-6 py-1.5 flex gap-3 border-b border-slate-50 dark:border-white/3 last:border-0
                        ${isHeader ? 'bg-amber-500/3 dark:bg-amber-500/5' : 'hover:bg-slate-50/80 dark:hover:bg-white/2'}`}
                    >
                      <span className="shrink-0 w-7 text-11 font-mono text-slate-300 dark:text-slate-700 mt-0.5 tabular-nums">
                        {(idx + 1).toString().padStart(3, '0')}
                      </span>
                      <span className={`text-14 font-mono leading-snug break-all
                        ${isHeader ? 'text-amber-600 dark:text-amber-400 font-bold' :
                          isPlanLine ? 'text-sky-600 dark:text-sky-400 pl-2 border-l border-sky-500/20' :
                            isStatLine ? 'text-slate-600 dark:text-slate-300' :
                              'text-slate-500 dark:text-slate-500'}`}
                      >
                        {line}
                      </span>
                    </div>
                  );
                })
              ) : (
                <EmptyState
                  icon="topic"
                  title={CM.noPlanData}
                  subtitle={CM.runDumpHint}
                  py="py-12"
                />
              )}
            </div>
          </div>
        )}
      </div>
    </Modal>
  );
}
