import React, { useState, useEffect } from 'react';
import { useDispatch, useSelector, shallowEqual } from 'react-redux';
import { closeDeleteQueryPlanModal, removeAutoExecQueryPlan, fetchQueryPlan } from '../databaseSlice';

import { Icon } from '../../../components/ds/foundation/Icon';
import { EmptyState } from '../../../components/ds/feedback/EmptyState';
import { Modal } from '../../../components/ds/layout/Modal';
import { Button } from '../../../components/ds/foundation/Button';
import { Typography } from '../../../components/ds/foundation/Typography';
import { InfoBanner } from '../../../components/ds/foundation/InfoBanner';
import { useCM } from '../../../constants/useCM';

// view states
const VIEW_FORM    = 'form';
const VIEW_LOADING = 'loading';
const VIEW_SUCCESS = 'success';
const VIEW_ERROR   = 'error';

export default function DeleteQueryPlanModal() {
  const CM = useCM();
  const dispatch = useDispatch();
  const { isDeleteQueryPlanModalOpen, selectedQueryPlanId } = useSelector((state) => state.databaseUI, shallowEqual);
  const { selectedDatabase } = useSelector((state) => state.database, shallowEqual);
  const { selectedHostUid } = useSelector((state) => state.host, shallowEqual);
  
  const [view, setView] = useState(VIEW_FORM);
  const [errorMsg, setErrorMsg] = useState('');

  useEffect(() => {
    if (isDeleteQueryPlanModalOpen) {
      setView(VIEW_FORM);
      setErrorMsg('');
    }
  }, [isDeleteQueryPlanModalOpen]);

  if (!isDeleteQueryPlanModalOpen) return null;

  const handleDelete = async () => {
    if (!selectedHostUid || !selectedDatabase || !selectedQueryPlanId) return;
    
    setView(VIEW_LOADING);
    setErrorMsg('');

    try {
      await dispatch(removeAutoExecQueryPlan({
        hostUid: selectedHostUid,
        dbname: selectedDatabase,
        queryId: selectedQueryPlanId
      })).unwrap();
      
      setView(VIEW_SUCCESS);
      dispatch(fetchQueryPlan({ hostUid: selectedHostUid, dbname: selectedDatabase }));
      
      // Auto close after brief success
      setTimeout(() => {
        dispatch(closeDeleteQueryPlanModal());
      }, 1000);
    } catch (err) {
      setErrorMsg(typeof err === 'string' ? err : (err.message || CM.deleteQueryPlanRejectedMsg));
      setView(VIEW_ERROR);
    }
  };

  const handleClose = () => dispatch(closeDeleteQueryPlanModal());

  /* ─── LOADING view ─── */
  if (view === VIEW_LOADING) {
    return (
      <Modal isOpen title={CM.deletingQueryPlan} icon="delete_forever" onClose={handleClose} maxWidth="440px" showCloseButton={false} testId="delete-query-plan">
        <div className="flex flex-col items-center justify-center py-12 space-y-6 animate-in fade-in duration-200">
          <div className="relative w-16 h-16">
            <div className="absolute inset-0 rounded-full border-2 border-rose-500/10" />
            <div className="absolute inset-0 rounded-full border-2 border-transparent border-t-rose-500 animate-spin" style={{ animationDuration: '0.9s' }} />
            <div className="absolute inset-0 flex items-center justify-center text-rose-500">
              <Icon name="delete_forever" size="md" weight={400} className="animate-pulse" />
            </div>
          </div>
          <div className="text-center space-y-1.5 px-8">
            <Typography variant="h4" className="text-16 font-black text-rose-500 tracking-tight">{CM.deletingLabel}</Typography>
            <Typography variant="p" className="text-13 text-slate-500 font-medium leading-relaxed max-w-[280px] mx-auto text-center">
              {CM.deletingQueryPlanMsg(selectedQueryPlanId)}
            </Typography>
          </div>
        </div>
      </Modal>
    );
  }

  /* ─── SUCCESS view ─── */
  if (view === VIEW_SUCCESS) {
    return (
      <Modal isOpen title={CM.deletionSuccess} icon="verified" iconVariant="success" onClose={handleClose} maxWidth="440px" testId="delete-query-plan">
        <div className="flex flex-col items-center justify-center py-12 gap-7 text-center animate-in fade-in duration-200">
          <div className="w-16 h-16 bg-emerald-500 rounded-full flex items-center justify-center shadow-[0_0_24px_rgba(16,185,129,0.3)]">
            <Icon name="done_all" size="lg" weight={700} className="text-white" />
          </div>
          <div className="space-y-1 px-8">
            <Typography variant="h4" className="text-17 font-black text-slate-900 dark:text-white tracking-tight">{CM.queryPlanDeletedTitle}</Typography>
            <Typography variant="p" className="text-13 text-slate-500 font-medium leading-relaxed">{CM.queryPlanRemovedMsg}</Typography>
          </div>
        </div>
      </Modal>
    );
  }

  /* ─── ERROR view ─── */
  if (view === VIEW_ERROR) {
    return (
      <Modal isOpen title={CM.deletionFailed} icon="error" iconVariant="danger" onClose={handleClose} maxWidth="440px" testId="delete-query-plan">
        <div className="flex flex-col items-center justify-center py-10 gap-6 text-center animate-in fade-in duration-200">
          <div className="relative w-14 h-14 bg-rose-500 rounded-full flex items-center justify-center shadow-[0_0_20px_rgba(244,63,94,0.3)]">
            <Icon name="emergency_home" size="md" weight={300} className="text-white" />
          </div>
          <div className="space-y-2 px-6">
            <Typography variant="h4" className="text-17 font-black text-slate-900 dark:text-white tracking-tight text-rose-500">{CM.deletionFailed}</Typography>
            <Typography variant="p" className="text-13 text-slate-500 font-medium leading-relaxed">{CM.deleteQueryPlanFailedMsg}</Typography>
          </div>
          <div className="w-full max-w-[340px] bg-rose-500/5 border border-rose-500/15 rounded-xl px-4 py-3 text-left">
             <Typography variant="caption" className="text-rose-400 font-mono leading-relaxed break-words block text-center uppercase tracking-widest text-12 font-bold">
              {errorMsg}
            </Typography>
          </div>
          <div className="flex items-center gap-3">
            <Button variant="secondary" onClick={handleClose}>{CM.dismiss}</Button>
            <Button variant="primary" icon="refresh" onClick={() => { setView(VIEW_FORM); setErrorMsg(''); }}>{CM.retryDeletion}</Button>
          </div>
        </div>
      </Modal>
    );
  }

  /* ─── FORM view ─── */
  return (
    <Modal
      isOpen={isDeleteQueryPlanModalOpen}
      onClose={handleClose}
      title={CM.deleteQueryPlan}
      subtitle={CM.deleteQueryPlanSubtitle}
      icon="delete_forever"
      maxWidth="440px"
      testId="delete-query-plan"
      footer={
        <div className="flex justify-end gap-3 w-full">
          <Button data-testid="delete-query-plan-cancel-btn" variant="ghost" onClick={handleClose}>{CM.cancel}</Button>
          <Button data-testid="delete-query-plan-confirm-btn" variant="danger" onClick={handleDelete} icon="delete" className="min-w-[130px]">{CM.confirmDelete}</Button>
        </div>
      }
    >
      <div className="flex flex-col items-center justify-center py-6 gap-6 text-center animate-in fade-in slide-in-from-bottom-2 duration-300">
        <div className="w-16 h-16 bg-rose-500/5 rounded-full flex items-center justify-center border border-rose-500/10 shadow-inner">
           <Icon name="warning" size="md" weight={300} className="text-3xl text-rose-500 animate-pulse" />
        </div>
        
        <div className="space-y-2">
          <Typography variant="h4" className="text-18 font-black text-slate-900 dark:text-white tracking-tight">{CM.deleteQueryPlanPrompt}</Typography>
          <Typography variant="p" className="text-13 text-slate-500 dark:text-slate-400 leading-relaxed max-w-[320px] mx-auto">
            You are about to permanently remove the query plan <span className="text-rose-500 font-black uppercase tracking-tight">"{selectedQueryPlanId}"</span>. Automated capture for <span className="font-bold text-slate-900 dark:text-white">"{selectedDatabase}"</span> will cease immediately.
          </Typography>
        </div>

        <InfoBanner title={CM.deleteQueryPlan}>
          {CM.logsNotPurgedNotice}
        </InfoBanner>
      </div>
    </Modal>
  );
}
