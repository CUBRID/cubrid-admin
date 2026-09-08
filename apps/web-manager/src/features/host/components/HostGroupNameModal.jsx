import { useEffect, useState } from 'react';
import { useDispatch, useSelector, shallowEqual } from 'react-redux';
import {
  closeCreateGroupModal,
  closeRenameGroupModal,
  createHostGroup,
  updateHostGroup,
  clearHostError,
} from '../hostSlice';
import { Modal } from '../../../components/ds/layout/Modal';
import { Input } from '../../../components/ds/forms/Input';
import { Button } from '../../../components/ds/foundation/Button';
import { Icon } from '../../../components/ds/foundation/Icon';
import { Typography } from '../../../components/ds/foundation/Typography';
import { useCM } from '../../../constants/useCM';

export default function HostGroupNameModal() {
  const CM = useCM();
  const dispatch = useDispatch();
  const {
    isCreateGroupModalOpen,
    isRenameGroupModalOpen,
    groupToEditId,
    groupToEditName,
    loading,
    error: apiError,
  } = useSelector((state) => state.host, shallowEqual);

  const isOpen = isCreateGroupModalOpen || isRenameGroupModalOpen;
  const isRename = isRenameGroupModalOpen;

  const [name, setName] = useState('');
  const [localError, setLocalError] = useState('');

  useEffect(() => {
    if (!isOpen) return;
    setName(isRename ? (groupToEditName || '') : '');
    setLocalError('');
  }, [isOpen, isRename, groupToEditName]);

  if (!isOpen) return null;

  const handleClose = () => {
    if (isRename) dispatch(closeRenameGroupModal());
    else dispatch(closeCreateGroupModal());
    dispatch(clearHostError());
  };

  const handleSubmit = async () => {
    const trimmed = (name || '').trim();
    if (!trimmed) {
      setLocalError(CM.groupNameRequired);
      return;
    }
    setLocalError('');
    try {
      if (isRename) {
        await dispatch(updateHostGroup({ groupId: groupToEditId, payload: { name: trimmed } })).unwrap();
      } else {
        await dispatch(createHostGroup({ name: trimmed })).unwrap();
      }
    } catch (e) {
      // handled by slice
    }
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={handleClose}
      title={isRename ? CM.renameGroup : CM.createGroup}
      icon={isRename ? 'edit' : 'create_new_folder'}
      loading={loading}
      maxWidth="max-w-[480px]"
      testId="group-name"
      onSubmit={handleSubmit}
      footer={
        <div className="flex justify-end gap-3 w-full">
          <Button data-testid="group-name-cancel-btn" variant="secondary" onClick={handleClose} disabled={loading}>
            {CM.cancel}
          </Button>
          <Button data-testid="group-name-submit-btn" variant="primary" onClick={handleSubmit} loading={loading} icon={isRename ? 'check' : 'add'}>
            {isRename ? CM.save : CM.createGroup}
          </Button>
        </div>
      }
    >
      <div className="space-y-4">
        {(apiError || localError) && (
          <div className="flex items-start gap-3 px-4 py-3 bg-rose-500/5 border border-rose-500/15 rounded-xl">
            <Icon name="error_outline" size="sm" weight={300} className="text-rose-500 shrink-0 mt-0.5" />
            <Typography variant="p" className="text-13 text-rose-500 font-medium flex-1 leading-relaxed">
              {localError || apiError}
            </Typography>
          </div>
        )}

        <Input
          label={CM.groupNameLabel}
          name="groupName"
          value={name}
          onChange={(e) => {
            setName(e.target.value);
            if (localError) setLocalError('');
            if (apiError) dispatch(clearHostError());
          }}
          placeholder={CM.groupNamePlaceholderHint}
          autoFocus
        />
      </div>
    </Modal>
  );
}

