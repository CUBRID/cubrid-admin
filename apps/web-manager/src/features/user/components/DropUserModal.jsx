import { useDispatch, useSelector, shallowEqual } from 'react-redux';
import { closeDropUserModal, dropDatabaseUser, fetchDatabaseUsers } from '../userSlice';

import { Icon } from '../../../components/ds/foundation/Icon';
import { Modal } from '../../../components/ds/layout/Modal';
import { Button } from '../../../components/ds/foundation/Button';
import { SectionHeader } from '../../../components/ds/foundation/SectionHeader';
import { useActionState } from '../../../infrastructure/hooks/useActionState';
import { 
  ModalStatusLoading, 
  ModalStatusSuccess, 
  ModalStatusError 
} from '../../../components/ds/feedback/ActionStatus';
import { useCM } from '../../../constants/useCM';

export default function DropUserModal() {
  const CM = useCM();
  const dispatch = useDispatch();
  const { isDropUserModalOpen, dropUserData } = useSelector((state) => state.user, shallowEqual);
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

  if (!isDropUserModalOpen || !dropUserData) return null;

  const handleDrop = async () => {
    startAction();
    try {
      await dispatch(dropDatabaseUser({ 
        hostUid: selectedHostUid, 
        dbname: dropUserData.dbname, 
        userName: dropUserData.userName 
      })).unwrap();
      endSuccess(CM.identityPurgedMsg(dropUserData.userName, dropUserData.dbname));
      dispatch(fetchDatabaseUsers({ hostUid: selectedHostUid, dbname: dropUserData.dbname }));
    } catch (err) {
      endError(typeof err === 'string' ? err : (err.message || CM.purgeRejectedMsg));
    }
  };

  const handleClose = () => {
    resetAction();
    dispatch(closeDropUserModal());
  };

  if (isLoading) {
    return (
      <Modal isOpen title={CM.dropDatabaseUser} icon="person_remove" onClose={handleClose} maxWidth="400px" showCloseButton={false}>
        <ModalStatusLoading
          title={CM.droppingUser}
          subtitle={`@${dropUserData.userName}`}
        />
      </Modal>
    );
  }

  if (isSuccess) {
    return (
      <Modal isOpen title={CM.deletionSuccess} icon="check_circle" iconVariant="success" onClose={handleClose} maxWidth="400px">
        <ModalStatusSuccess
          title={CM.userDropped}
          message={`@${dropUserData.userName}`}
          onConfirm={handleClose}
          confirmText={CM.ok}
        />
      </Modal>
    );
  }

  if (isError) {
    return (
      <Modal isOpen title={CM.executionError} icon="error" iconVariant="danger" onClose={resetAction} maxWidth="400px">
        <ModalStatusError
          title={CM.operationInterrupted}
          error={actionError}
          guidance={CM.dropUserGuidance}
          onRetry={handleDrop}
          onCancel={resetAction}
          retryText={CM.retry}
          cancelText={CM.dismiss}
        />
      </Modal>
    );
  }

  return (
    <Modal
      isOpen={isDropUserModalOpen}
      onClose={handleClose}
      title={CM.dropDatabaseUser}
      icon="person_remove"
      maxWidth="400px"
      testId="drop-user"
      footer={
        <div className="flex gap-3 w-full">
          <Button data-testid="drop-user-cancel-btn" variant="ghost" onClick={handleClose} className="flex-1">{CM.cancel}</Button>
          <Button data-testid="drop-user-confirm-btn" variant="danger" onClick={handleDrop} icon="delete_forever" className="flex-1">{CM.dropUserBtn}</Button>
        </div>
      }
    >
      <div className="flex flex-col items-center text-center p-2">
        <div className="w-16 h-16 rounded-3xl bg-rose-500/10 flex items-center justify-center mb-6 border border-rose-500/20 shadow-[0_0_20px_rgba(244,63,94,0.1)]">
          <Icon name="person_remove" size="lg" weight={300} className="text-rose-500" />
        </div>
        <SectionHeader title={CM.dropUserConfirmSection} icon="person_remove" />
        <p className="text-sm text-slate-500 dark:text-slate-400 mb-2 leading-relaxed">
          <span className="font-black text-slate-900 dark:text-white">"@{dropUserData.userName}"</span>
        </p>
        <div className="px-3 py-1.5 rounded-xl bg-slate-100 dark:bg-white/5 border border-slate-200 dark:border-white/5 inline-flex items-center gap-2 mb-4">
           <Icon name="database" size="xs" className="text-slate-400" />
           <span className="text-13 font-bold text-slate-500 uppercase tracking-widest">{dropUserData.dbname}</span>
        </div>
        <p className="text-13 text-rose-500 font-bold uppercase tracking-widest bg-rose-500/5 px-4 py-2 rounded-xl border border-rose-500/10">
          {CM.dropUserWarning}
        </p>
      </div>
    </Modal>
  );
}
