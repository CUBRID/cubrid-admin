import { useState, useEffect, useMemo } from 'react';
import { useDispatch, useSelector, shallowEqual } from 'react-redux';
import { closeManageGroupMembersModal, moveHost } from '../hostSlice';
import { flattenHostsFromGroups, findGroupIdForHost, UNGROUPED_GROUP_ID } from '../hostGroupUtils';
import { Modal } from '../../../components/ds/layout/Modal';
import { Button } from '../../../components/ds/foundation/Button';
import { Input } from '../../../components/ds/forms/Input';
import { Checkbox } from '../../../components/ds/forms/Checkbox';
import { Table } from '../../../components/ds/layout/Table';
import { Typography } from '../../../components/ds/foundation/Typography';
import { Icon } from '../../../components/ds/foundation/Icon';
import { useCM } from '../../../constants/useCM';

export default function ManageGroupMembersModal() {
  const CM = useCM();
  const dispatch = useDispatch();
  const {
    isManageGroupMembersModalOpen,
    groupToEditId,
    groupToEditName,
    hostGroups,
  } = useSelector((state) => state.host, shallowEqual);

  const [selectedUids, setSelectedUids] = useState(() => new Set());
  const [initialUids, setInitialUids] = useState(() => new Set());
  const [filter, setFilter] = useState('');
  const [isSaving, setIsSaving] = useState(false);
  const [saveError, setSaveError] = useState('');

  const allHosts = useMemo(() => flattenHostsFromGroups(hostGroups), [hostGroups]);

  useEffect(() => {
    if (isManageGroupMembersModalOpen && groupToEditId) {
      const currentMembers = new Set(
        allHosts.filter((h) => findGroupIdForHost(hostGroups, h.uid) === groupToEditId).map((h) => h.uid)
      );
      setSelectedUids(new Set(currentMembers));
      setInitialUids(currentMembers);
      setFilter('');
      setSaveError('');
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isManageGroupMembersModalOpen, groupToEditId]);

  if (!isManageGroupMembersModalOpen) return null;

  const toggleHost = (uid) => {
    setSelectedUids((prev) => {
      const next = new Set(prev);
      if (next.has(uid)) next.delete(uid);
      else next.add(uid);
      return next;
    });
  };

  const rows = allHosts
    .map((host) => {
      const currentGroupId = findGroupIdForHost(hostGroups, host.uid);
      return {
        uid: host.uid,
        name: host.alias || host.id,
        address: host.address,
        port: host.port,
        currentGroup: currentGroupId === UNGROUPED_GROUP_ID
          ? CM.ungroupedHosts
          : (hostGroups?.[currentGroupId]?.name || ''),
      };
    })
    .filter((row) => {
      const q = filter.trim().toLowerCase();
      if (!q) return true;
      return row.name.toLowerCase().includes(q) || (row.address || '').toLowerCase().includes(q);
    });

  const columns = [
    {
      header: '',
      accessor: 'selected',
      width: '36px',
      render: (_, row) => (
        <div onClick={(e) => e.stopPropagation()} data-testid={`manage-group-members-checkbox-${row.uid}`}>
          <Checkbox checked={selectedUids.has(row.uid)} onChange={() => toggleHost(row.uid)} />
        </div>
      ),
    },
    { header: CM.friendlyName, accessor: 'name' },
    { header: CM.ipAddressDomain, accessor: 'address' },
    { header: CM.port, accessor: 'port' },
    { header: CM.groupLabel, accessor: 'currentGroup' },
  ];

  const handleClose = () => dispatch(closeManageGroupMembersModal());

  const handleSave = async () => {
    const toAdd = [...selectedUids].filter((uid) => !initialUids.has(uid));
    const toRemove = [...initialUids].filter((uid) => !selectedUids.has(uid));
    if (toAdd.length === 0 && toRemove.length === 0) {
      handleClose();
      return;
    }

    setIsSaving(true);
    setSaveError('');
    const failedNames = [];

    const attemptMove = async (uid, targetGroupId) => {
      try {
        await dispatch(moveHost({ hostUid: uid, targetGroupId })).unwrap();
      } catch {
        const host = allHosts.find((h) => h.uid === uid);
        failedNames.push(host?.alias || host?.id || uid);
      }
    };

    for (const uid of toAdd) {
      await attemptMove(uid, groupToEditId);
    }
    for (const uid of toRemove) {
      await attemptMove(uid, UNGROUPED_GROUP_ID);
    }

    setIsSaving(false);

    if (failedNames.length > 0) {
      // Some hosts failed to move (e.g. group deleted in another session) —
      // keep the modal open and report which ones so the user isn't left
      // believing the checkbox state matches the server. Retrying is safe:
      // moveHost is a no-op for hosts that already reached their target group.
      setSaveError(CM.moveHostFailedError(failedNames.join(', ')));
      return;
    }

    handleClose();
  };

  const changedCount = [...selectedUids].filter((uid) => !initialUids.has(uid)).length
    + [...initialUids].filter((uid) => !selectedUids.has(uid)).length;

  return (
    <Modal
      isOpen={isManageGroupMembersModalOpen}
      onClose={handleClose}
      title={CM.manageGroupMembersTitle(groupToEditName)}
      icon="group_work"
      maxWidth="max-w-[620px]"
      testId="manage-group-members"
      onSubmit={handleSave}
      footer={
        <div className="flex justify-end gap-3 w-full">
          <Button data-testid="manage-group-members-cancel-btn" variant="secondary" onClick={handleClose} disabled={isSaving}>
            {CM.cancel}
          </Button>
          <Button
            data-testid="manage-group-members-save-btn"
            variant="primary"
            onClick={handleSave}
            loading={isSaving}
            icon="save_as"
            className="min-w-[140px]"
          >
            {changedCount > 0 ? CM.saveChangesCount(changedCount) : CM.saveChanges}
          </Button>
        </div>
      }
    >
      <div className="space-y-4 p-1">
        {saveError && (
          <div className="flex items-start gap-3 px-4 py-3 bg-rose-500/5 border border-rose-500/15 rounded-xl">
            <Icon name="error_outline" size="sm" weight={300} className="text-rose-500 shrink-0 mt-0.5" />
            <Typography variant="p" className="text-13 text-rose-500 font-medium flex-1 leading-relaxed">
              {saveError}
            </Typography>
          </div>
        )}

        <Typography variant="caption" className="text-slate-400 dark:text-slate-500">
          {CM.manageGroupMembersDesc}
        </Typography>

        <Input
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
          placeholder={CM.searchHostsPlaceholder}
          icon="search"
        />

        <div className="max-h-[360px] overflow-y-auto border border-slate-200 dark:border-white/10 rounded-lg">
          <Table
            columns={columns}
            data={rows}
            onRowClick={(row) => toggleHost(row.uid)}
            bordered
          />
        </div>
      </div>
    </Modal>
  );
}
