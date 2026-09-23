import { useDispatch, useSelector, shallowEqual } from 'react-redux';
import { closeDeleteGroupModal, deleteHostGroup, clearHostError } from '../hostSlice';
import { Modal } from '../../../components/ds/layout/Modal';
import { Button } from '../../../components/ds/foundation/Button';
import { Typography } from '../../../components/ds/foundation/Typography';
import { Icon } from '../../../components/ds/foundation/Icon';
import { useCM } from '../../../constants/useCM';

export default function DeleteHostGroupModal() {
  const CM = useCM();
  const dispatch = useDispatch();
  const {
    isDeleteGroupModalOpen,
    groupToEditId,
    groupToEditName,
    loading,
    error: apiError,
    hostGroups,
  } = useSelector((state) => state.host, shallowEqual);

  if (!isDeleteGroupModalOpen) return null;

  const hostsInGroup = Object.values(hostGroups?.[groupToEditId]?.hosts || {});

  const handleDelete = async () => {
    if (groupToEditId) {
      dispatch(deleteHostGroup(groupToEditId));
    }
  };

  const handleClose = () => {
    dispatch(closeDeleteGroupModal());
    dispatch(clearHostError());
  };

  return (
    <Modal
      isOpen={isDeleteGroupModalOpen}
      onClose={handleClose}
      title={CM.deleteGroup}
      icon="delete_forever"
      iconVariant="danger"
      loading={loading}
      maxWidth="420px"
      testId="delete-group"
      footer={
        <div className="flex justify-end gap-3 w-full">
          <Button data-testid="delete-group-cancel-btn" variant="secondary" onClick={handleClose} disabled={loading}>
            {CM.cancel}
          </Button>
          <Button data-testid="delete-group-confirm-btn" variant="danger" onClick={handleDelete} loading={loading} icon="delete_forever">
            {CM.confirmDelete}
          </Button>
        </div>
      }
    >
      <div className="space-y-5">
        {apiError && (
          <div className="flex items-start gap-3 px-4 py-3 bg-rose-500/5 border border-rose-500/15 rounded-xl">
            <div className="w-7 h-7 rounded-lg bg-rose-500/10 flex items-center justify-center shrink-0 border border-rose-500/20">
              <Icon name="error" size="xs" weight={300} className="text-rose-500" />
            </div>
            <div className="flex-1 min-w-0 pt-0.5">
              <Typography variant="p" className="text-rose-500 font-bold text-13 leading-snug">{apiError}</Typography>
            </div>
          </div>
        )}

        <div className="flex flex-col items-center text-center py-2">
          <div className="w-14 h-14 rounded-2xl bg-rose-500/10 border border-rose-500/20 flex items-center justify-center shadow-lg shadow-rose-500/5 mb-4">
            <Icon name="warning" size="lg" weight={300} className="text-rose-500" />
          </div>
          <Typography variant="p" className="text-15 text-slate-900 dark:text-white font-bold leading-relaxed">
            {CM.deleteGroupConfirmTitle(groupToEditName || groupToEditId)}
          </Typography>
          <Typography variant="caption" className="text-slate-400 dark:text-slate-500 font-medium mt-1 max-w-[320px] leading-relaxed">
            {CM.deleteGroupConfirmDesc}
          </Typography>
        </div>

        {hostsInGroup.length > 0 && (
          <div className="px-4 py-3 bg-amber-500/5 border border-amber-500/15 rounded-xl">
            <Typography variant="caption" className="text-amber-600 dark:text-amber-500 font-bold text-13 leading-snug block mb-2">
              {CM.deleteGroupHostsWarning(hostsInGroup.length)}
            </Typography>
            <ul className="space-y-0.5 max-h-[120px] overflow-y-auto">
              {hostsInGroup.map((host) => (
                <li key={host.uid} className="text-13 text-slate-600 dark:text-slate-400 font-mono truncate">
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

