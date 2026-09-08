import React, { useState, useEffect } from 'react';
import { useDispatch, useSelector, shallowEqual } from 'react-redux';
import { closeDeleteBackupPlanModal, deleteBackupSchedule, fetchBackupSchedule } from '../databaseSlice';
import { useCM } from '../../../constants/useCM';

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

// view states
const VIEW_FORM    = 'form';
const VIEW_LOADING = 'loading';
const VIEW_SUCCESS = 'success';
const VIEW_ERROR   = 'error';

export default function DeleteBackupPlanModal() {
  const CM = useCM();
  const dispatch = useDispatch();
  const { isDeleteBackupPlanModalOpen, selectedBackupId } = useSelector((state) => state.databaseUI, shallowEqual);
  const { selectedDatabase } = useSelector((state) => state.database, shallowEqual);
  const { selectedHostUid } = useSelector((state) => state.host, shallowEqual);
  
  const { 
    state, 
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
    if (isDeleteBackupPlanModalOpen) {
      resetAction();
    }
  }, [isDeleteBackupPlanModalOpen, resetAction]);

  if (!isDeleteBackupPlanModalOpen) return null;

  const handleDelete = async () => {
    if (!selectedHostUid || !selectedDatabase || !selectedBackupId) return;
    
    startAction();

    try {
      await dispatch(deleteBackupSchedule({ 
        hostUid: selectedHostUid, 
        dbname: selectedDatabase, 
        payload: { backupid: selectedBackupId } 
      })).unwrap();
      
      endSuccess(CM.backupPlanRemovedMsg(selectedBackupId));
      dispatch(fetchBackupSchedule({ hostUid: selectedHostUid, dbname: selectedDatabase }));

      // Auto close after brief success
      setTimeout(() => {
        dispatch(closeDeleteBackupPlanModal());
      }, 1500);
    } catch (err) {
      endError(typeof err === 'string' ? err : (err.message || CM.deleteBackupPlanRejectedMsg));
    }
  };

  const handleClose = () => dispatch(closeDeleteBackupPlanModal());

  /* ─── LOADING view ─── */
  if (isLoading) {
    return (
      <Modal isOpen title={CM.deletingBackupPlan} icon="delete_forever" onClose={handleClose} maxWidth="440px" iconVariant="danger">
        <ModalStatusLoading
          title={CM.deletingLabel}
          subtitle={`"${selectedBackupId}"`}
          variant="danger"
          onBackground={handleClose}
        />
      </Modal>
    );
  }

  /* ─── SUCCESS view ─── */
  if (isSuccess) {
    return (
      <Modal isOpen title={CM.deletionSuccess} icon="verified" iconVariant="success" onClose={handleClose} maxWidth="440px">
        <ModalStatusSuccess
          title={CM.backupPlanDeleted}
          message={CM.backupPlanRemovedMsg(selectedBackupId)}
          onConfirm={handleClose}
          confirmText={CM.ok}
        />
      </Modal>
    );
  }

  /* ─── ERROR view ─── */
  if (isError) {
    return (
      <Modal isOpen title={CM.deleteBackupPlanFailed} icon="error" iconVariant="danger" onClose={resetAction} maxWidth="440px">
        <ModalStatusError
          title={CM.operationInterrupted}
          error={actionError}
          guidance={CM.deleteBackupPlanGuidance}
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
      isOpen={isDeleteBackupPlanModalOpen}
      onClose={handleClose}
      title={CM.deleteBackupPlan}
      subtitle={CM.permanentRemovalBackup}
      icon="delete_forever"
      maxWidth="440px"
      testId="delete-backup-plan"
      footer={
        <div className="flex justify-end gap-3 w-full">
          <Button data-testid="delete-backup-plan-cancel-btn" variant="ghost" onClick={handleClose}>{CM.cancel}</Button>
          <Button data-testid="delete-backup-plan-confirm-btn" variant="danger" onClick={handleDelete} icon="delete" className="min-w-[140px]">{CM.confirmDelete}</Button>
        </div>
      }
    >
      <div className="flex flex-col items-center justify-center py-6 gap-6 text-center animate-in fade-in slide-in-from-bottom-2 duration-300">
        <div className="w-16 h-16 bg-rose-500/5 rounded-full flex items-center justify-center border border-rose-500/10 shadow-inner">
          <Icon name="warning" size="md" weight={300} className="text-3xl text-rose-500 animate-pulse" />
        </div>

        <div className="space-y-2">
          <Typography variant="h4" className="text-18 font-black text-slate-900 dark:text-white tracking-tight">{CM.deleteBackupPlanPrompt}</Typography>
          <Typography variant="p" className="text-13 text-slate-500 dark:text-slate-400 leading-relaxed max-w-[320px] mx-auto">
            <span className="text-rose-500 font-black">"{selectedBackupId}"</span> — <span className="font-bold text-slate-900 dark:text-white">{selectedDatabase}</span>
          </Typography>
        </div>

        <InfoBanner>
          {CM.backupScheduleNote}
        </InfoBanner>
      </div>
    </Modal>
  );
}
