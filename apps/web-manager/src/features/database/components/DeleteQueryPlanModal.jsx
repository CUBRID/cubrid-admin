import React, { useEffect } from 'react';
import { useDispatch, useSelector, shallowEqual } from 'react-redux';
import { closeDeleteQueryPlanModal, removeAutoExecQueryPlan, fetchQueryPlan } from '../databaseSlice';

import { Icon } from '../../../components/ds/foundation/Icon';
import { Modal } from '../../../components/ds/layout/Modal';
import { Button } from '../../../components/ds/foundation/Button';
import { Typography } from '../../../components/ds/foundation/Typography';
import { InfoBanner } from '../../../components/ds/foundation/InfoBanner';
import { useActionState } from '../../../infrastructure/hooks/useActionState';
import {
  ModalStatusLoading,
  ModalStatusSuccess,
  ModalStatusError
} from '../../../components/ds/feedback/ActionStatus';
import { useCM } from '../../../constants/useCM';

export default function DeleteQueryPlanModal() {
  const CM = useCM();
  const dispatch = useDispatch();
  const { isDeleteQueryPlanModalOpen, selectedQueryPlanId } = useSelector((state) => state.databaseUI, shallowEqual);
  const { selectedDatabase } = useSelector((state) => state.database, shallowEqual);
  const { selectedHostUid } = useSelector((state) => state.host, shallowEqual);
  
  const {
    error: actionError,
    startAction,
    endSuccess,
    endError,
    resetAction,
    isLoading,
    isSuccess,
    isError
  } = useActionState();

  useEffect(() => {
    if (isDeleteQueryPlanModalOpen) {
      resetAction();
    }
  }, [isDeleteQueryPlanModalOpen, resetAction]);

  if (!isDeleteQueryPlanModalOpen) return null;

  const handleDelete = async () => {
    if (!selectedHostUid || !selectedDatabase || !selectedQueryPlanId) return;
    
    startAction();

    try {
      await dispatch(removeAutoExecQueryPlan({
        hostUid: selectedHostUid,
        dbname: selectedDatabase,
        queryId: selectedQueryPlanId
      })).unwrap();
      
      endSuccess(CM.queryPlanRemovedMsg);
      dispatch(fetchQueryPlan({ hostUid: selectedHostUid, dbname: selectedDatabase }));
    } catch (err) {
      endError(typeof err === 'string' ? err : (err.message || CM.deleteQueryPlanRejectedMsg));
    }
  };

  const handleClose = () => dispatch(closeDeleteQueryPlanModal());

  /* ─── LOADING view ─── */
  if (isLoading) {
    return (
      <Modal isOpen title={CM.deletingQueryPlan} icon="delete_forever" iconVariant="danger" onClose={handleClose} maxWidth="440px" showCloseButton={false} testId="delete-query-plan">
        <ModalStatusLoading title={CM.deletingLabel} subtitle={`"${selectedQueryPlanId}"`} variant="danger" />
      </Modal>
    );
  }

  /* ─── SUCCESS view ─── */
  if (isSuccess) {
    return (
      <Modal isOpen title={CM.deletionSuccess} icon="verified" iconVariant="success" onClose={handleClose} maxWidth="440px" testId="delete-query-plan">
        <ModalStatusSuccess title={CM.queryPlanDeletedTitle} message={CM.queryPlanRemovedMsg} onConfirm={handleClose} confirmText={CM.ok} />
      </Modal>
    );
  }

  /* ─── ERROR view ─── */
  if (isError) {
    return (
      <Modal isOpen title={CM.deletionFailed} icon="error" iconVariant="danger" onClose={resetAction} maxWidth="440px" testId="delete-query-plan">
        <ModalStatusError
          title={CM.operationInterrupted}
          error={actionError}
          guidance={CM.deleteQueryPlanFailedMsg}
          onRetry={handleDelete}
          onCancel={resetAction}
          retryText={CM.retryDeletion}
          cancelText={CM.dismiss}
        />
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
          <Typography variant="h4" className="text-[16px] font-black text-slate-900 dark:text-white tracking-tight">{CM.deleteQueryPlanPrompt}</Typography>
          <Typography variant="p" className="text-[11.5px] text-slate-500 dark:text-slate-400 leading-relaxed max-w-[320px] mx-auto">
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
