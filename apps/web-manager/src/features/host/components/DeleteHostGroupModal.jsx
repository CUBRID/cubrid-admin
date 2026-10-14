import { useEffect } from 'react';
import { useDispatch, useSelector, shallowEqual } from 'react-redux';
import { closeDeleteGroupModal, deleteHostGroup, clearHostError } from '../hostSlice';
import { Modal } from '../../../components/ds/layout/Modal';
import { Button } from '../../../components/ds/foundation/Button';
import { Typography } from '../../../components/ds/foundation/Typography';
import { Icon } from '../../../components/ds/foundation/Icon';
import { useActionState } from '../../../infrastructure/hooks/useActionState';
import {
  ModalStatusLoading,
  ModalStatusSuccess,
  ModalStatusError
} from '../../../components/ds/feedback/ActionStatus';
import { useCM } from '../../../constants/useCM';

export default function DeleteHostGroupModal() {
  const CM = useCM();
  const dispatch = useDispatch();
  const {
    isDeleteGroupModalOpen,
    groupToEditId,
    groupToEditName,
    hostGroups,
  } = useSelector((state) => state.host, shallowEqual);
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
    if (isDeleteGroupModalOpen) resetAction();
  }, [isDeleteGroupModalOpen, resetAction]);

  if (!isDeleteGroupModalOpen) return null;

  const hostsInGroup = Object.values(hostGroups?.[groupToEditId]?.hosts || {});

  const handleDelete = async () => {
    if (groupToEditId) {
      startAction();
      try {
        await dispatch(deleteHostGroup(groupToEditId)).unwrap();
        endSuccess(groupToEditName || groupToEditId);
      } catch (err) {
        endError(typeof err === 'string' ? err : (err.message || CM.operationFailed));
      }
    }
  };

  const handleClose = () => {
    dispatch(closeDeleteGroupModal());
    dispatch(clearHostError());
  };

  if (isLoading) {
    return (
      <Modal isOpen title={CM.deleteGroup} icon="delete_forever" iconVariant="danger" onClose={handleClose} maxWidth="420px" showCloseButton={false} testId="delete-group">
        <ModalStatusLoading title={CM.deletingLabel} subtitle={groupToEditName || groupToEditId} variant="danger" />
      </Modal>
    );
  }

  if (isSuccess) {
    return (
      <Modal isOpen title={CM.deletionSuccess} icon="verified" iconVariant="success" onClose={handleClose} maxWidth="420px" testId="delete-group">
        <ModalStatusSuccess title={CM.deletionSuccess} message={groupToEditName || groupToEditId} onConfirm={handleClose} confirmText={CM.ok} />
      </Modal>
    );
  }

  if (isError) {
    return (
      <Modal isOpen title={CM.operationFailed} icon="error" iconVariant="danger" onClose={resetAction} maxWidth="420px" testId="delete-group">
        <ModalStatusError
          title={CM.operationInterrupted}
          error={actionError}
          guidance={CM.deleteGroupConfirmDesc}
          onRetry={handleDelete}
          onCancel={resetAction}
          retryText={CM.retryDeletion}
          cancelText={CM.dismiss}
        />
      </Modal>
    );
  }

  return (
    <Modal
      isOpen={isDeleteGroupModalOpen}
      onClose={handleClose}
      title={CM.deleteGroup}
      icon="delete_forever"
      iconVariant="danger"
      maxWidth="420px"
      testId="delete-group"
      footer={
        <div className="flex justify-end gap-3 w-full">
          <Button data-testid="delete-group-cancel-btn" variant="secondary" onClick={handleClose}>
            {CM.cancel}
          </Button>
          <Button data-testid="delete-group-confirm-btn" variant="danger" onClick={handleDelete} icon="delete_forever">
            {CM.confirmDelete}
          </Button>
        </div>
      }
    >
      <div className="space-y-5">
        <div className="flex flex-col items-center text-center py-2">
          <div className="w-14 h-14 rounded-2xl bg-rose-500/10 border border-rose-500/20 flex items-center justify-center shadow-lg shadow-rose-500/5 mb-4">
            <Icon name="warning" size="lg" weight={300} className="text-rose-500" />
          </div>
          <Typography variant="p" className="text-[13px] text-slate-900 dark:text-white font-bold leading-relaxed">
            {CM.deleteGroupConfirmTitle(groupToEditName || groupToEditId)}
          </Typography>
          <Typography variant="caption" className="text-slate-400 dark:text-slate-500 font-medium mt-1 max-w-[320px] leading-relaxed">
            {CM.deleteGroupConfirmDesc}
          </Typography>
        </div>

        {hostsInGroup.length > 0 && (
          <div className="px-4 py-3 bg-amber-500/5 border border-amber-500/15 rounded-xl">
            <Typography variant="caption" className="text-amber-600 dark:text-amber-500 font-bold text-[11px] leading-snug block mb-2">
              {CM.deleteGroupHostsWarning(hostsInGroup.length)}
            </Typography>
            <ul className="space-y-0.5 max-h-[120px] overflow-y-auto">
              {hostsInGroup.map((host) => (
                <li key={host.uid} className="text-[11px] text-slate-600 dark:text-slate-400 font-mono truncate">
                  {host.alias || host.id} ({host.address}:{host.port})
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>
    </Modal>
  );
}
