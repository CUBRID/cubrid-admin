import { useEffect, useState } from 'react';
import { useSelector, useDispatch, shallowEqual } from 'react-redux';
import { 
  fetchCmsUsers, 
  deleteCmsUser,
  openEditCmsUserModal,
  closeCmsUserManagementModal 
} from '../hostSlice';
import { showStatusModal } from '../../layout/layoutSlice';

import { Icon } from '../../../components/ds/foundation/Icon';
import { Modal } from '../../../components/ds/layout/Modal';
import { EmptyState } from '../../../components/ds/layout/EmptyState';
import { Button } from '../../../components/ds/foundation/Button';
import { Typography } from '../../../components/ds/foundation/Typography';
import { SectionHeader } from '../../../components/ds/foundation/SectionHeader';
import { useCM } from '../../../constants/useCM';
import { useConfirm } from '../../../infrastructure/hooks/useConfirm';
import { Table } from '../../../components/ds/layout/Table';
import {
  DEFAULT_CMS_USER_SORT,
  cmsUserName,
  nextCmsUserSort,
  sortCmsUserRows,
  toCmsUserRow,
} from '../cmsUserRows';

export default function CMSUserManagementModal() {
  const CM = useCM();
  const dispatch = useDispatch();
  const confirm = useConfirm();
  const [deletingUser, setDeletingUser] = useState(null);
  const [userSort, setUserSort] = useState(DEFAULT_CMS_USER_SORT);
  const { 
    isCmsUserManagementModalOpen, 
    cmsUserManagementHostUid: hostUid, 
    hosts,
    cmsUsers, 
    cmsUsersLoading 
  } = useSelector((state) => state.host, shallowEqual);

  const isOpen = isCmsUserManagementModalOpen;
  const userlist = cmsUsers[hostUid] || [];
  const isLoading = cmsUsersLoading[hostUid];
  const selectedHost = hosts.find(h => h.uid === hostUid);

  useEffect(() => {
    if (isOpen && hostUid) {
      dispatch(fetchCmsUsers(hostUid));
    }
  }, [isOpen, hostUid, dispatch]);

  const handleAddUser = () => {
    dispatch(openEditCmsUserModal({ hostUid: hostUid, user: null }));
  };

  const handleEditUser = (user) => {
    dispatch(openEditCmsUserModal({ hostUid: hostUid, user }));
  };

  const handleDeleteUser = async (username) => {
    if (username === 'admin') {
      dispatch(showStatusModal({ type: 'info', title: CM.deleteUser, message: CM.primaryAdminCannotDelete }));
      return;
    }

    const accepted = await confirm({
      title: CM.deleteUser,
      description: CM.confirmDeleteCmsUser(username),
      confirmLabel: CM.deleteUser,
      variant: 'danger',
    });
    if (!accepted) return;

    setDeletingUser(username);
    try {
      await dispatch(deleteCmsUser({ hostUid: hostUid, targetid: username })).unwrap();
      dispatch(showStatusModal({
        type: 'success',
        title: CM.success,
        message: CM.cmsUserDeletedMessage(username),
      }));
    } catch (error) {
      dispatch(showStatusModal({
        type: 'error',
        title: CM.operationFailed,
        message: CM.operationCouldNotBeCompleted,
        detail: typeof error === 'string' ? error : error?.message,
      }));
    } finally {
      setDeletingUser(null);
    }
  };

  if (!isOpen) return null;

  const adminUsers = userlist.filter((u) => cmsUserName(u).toLowerCase() === 'admin');
  // The other users in a table sorted as in CA; admin stays on top in its own section.
  const regularRows = sortCmsUserRows(
    userlist
      .filter((u) => {
        const name = cmsUserName(u);
        return name.toLowerCase() !== 'admin' && name !== '';
      })
      .map(toCmsUserRow),
    userSort
  );
  const sortableColumn = (key, header) => ({
    header,
    accessor: key,
    onHeaderClick: () => setUserSort((prev) => nextCmsUserSort(prev, key)),
    sortDirection: userSort.key === key ? userSort.direction : null,
  });
  const authority = (value) => (
    <span className="font-mono text-13 text-slate-600 dark:text-slate-300">{value}</span>
  );
  // The authority titles wrap (long in English) so the table fits the window.
  const wrapHeader = '!whitespace-normal [&>div>span:first-child]:!whitespace-normal [&>div>span:first-child]:break-keep';
  const authorityColumn = (key, header) => ({ ...sortableColumn(key, header), className: wrapHeader, render: authority });
  const userColumns = [
    {
      ...sortableColumn('name', CM.userIdLabel),
      render: (name) => (
        <span className="flex items-center gap-2 min-w-0" data-testid={`cms-user-${name}`}>
          <Icon name="person" size="15px" weight={300} className="text-slate-400 shrink-0" />
          <span title={name} className="truncate">{name}</span>
        </span>
      ),
    },
    authorityColumn('dbcreate', CM.dbCreatePermission),
    authorityColumn('casauth', CM.brokerPermission),
    authorityColumn('statusmonitorauth', CM.monitoringPermission),
    {
      header: CM.actions,
      accessor: 'actions',
      align: 'right',
      render: (_, row) => (
        <div className="flex items-center justify-end gap-1">
          <button
            type="button"
            data-testid={`cms-user-${row.name}-edit-btn`}
            onClick={() => handleEditUser(row.user)}
            className="w-8 h-8 rounded-lg flex items-center justify-center text-slate-400 hover:text-amber-500 hover:bg-amber-500/10 transition-all"
            title={CM.editUser}
            aria-label={CM.editUser}
          >
            <Icon name="edit" size="15px" weight={300} />
          </button>
          <button
            type="button"
            data-testid={`cms-user-${row.name}-delete-btn`}
            onClick={() => handleDeleteUser(row.name)}
            disabled={deletingUser === row.name}
            className="w-8 h-8 rounded-lg flex items-center justify-center text-slate-400 hover:text-rose-500 hover:bg-rose-500/10 transition-all disabled:opacity-50 disabled:pointer-events-none"
            title={CM.deleteUser}
            aria-label={CM.deleteUser}
          >
            <Icon name={deletingUser === row.name ? 'progress_activity' : 'delete'} size="14px" weight={300} className={deletingUser === row.name ? 'animate-spin' : ''} />
          </button>
        </div>
      ),
    },
  ];

  // The admin account: a card of its own, above the table, never deleted.
  const renderAdmin = (user) => {
    const username = cmsUserName(user) || CM.unknownFallback;
    return (
      <div
        key={username}
        data-testid="cms-user-admin"
        className="group relative flex items-center gap-4 px-4 py-3.5 rounded-2xl border transition-all duration-200 cursor-default bg-amber-500/4 border-amber-500/20 hover:border-amber-500/40"
      >
        <div className="w-10 h-10 rounded-xl flex items-center justify-center shrink-0 border transition-all bg-amber-500 border-amber-500/40 shadow-[0_0_12px_rgba(245,158,11,0.2)]">
          <Icon name="verified_user" size="17px" weight={400} className="text-slate-900" />
        </div>

        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-0.5">
            <Typography title={username} variant="p" className="font-black text-15 text-slate-800 dark:text-white truncate">
              {username}
            </Typography>
            <span className="shrink-0 text-11 font-black px-1.5 py-0.5 rounded-sm bg-amber-500/10 border border-amber-500/20 text-amber-500 uppercase tracking-wider">
              {CM.admin}
            </span>
          </div>
          <span className="text-12 text-slate-400 font-medium">{CM.fullSystemAuthorization}</span>
        </div>

        {/* Edit appears on hover */}
        <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity duration-150 shrink-0">
          <button
            type="button"
            data-testid={`cms-user-${username}-edit-btn`}
            onClick={() => handleEditUser(user)}
            className="w-8 h-8 rounded-lg flex items-center justify-center text-slate-400 hover:text-amber-500 hover:bg-amber-500/10 transition-all"
            title={CM.editUser}
            aria-label={CM.editUser}
          >
            <Icon name="edit" size="15px" weight={300} />
          </button>
        </div>
      </div>
    );
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={() => dispatch(closeCmsUserManagementModal())}
      title={CM.userManagement}
      subtitle={selectedHost?.alias || hostUid}
      icon="manage_accounts"
      maxWidth="680px"
      testId="cms-user-management"
      footer={
        <div className="flex justify-between items-center w-full">
          <Typography variant="caption" className="text-slate-400 font-medium">
            {CM.managementAccountsRegistered(userlist.length)}
          </Typography>
          <div className="flex items-center gap-2">
            <Button variant="ghost" onClick={() => dispatch(closeCmsUserManagementModal())}>
              {CM.close}
            </Button>
            <Button data-testid="cms-user-management-add-btn" icon="person_add" onClick={handleAddUser}>
              {CM.addManagementUserBtn}
            </Button>
          </div>
        </div>
      }
    >
      <div className="space-y-8 pb-2 animate-in fade-in slide-in-from-bottom-2 duration-300">

        {isLoading && userlist.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20 opacity-70">
            <div className="size-10 border-2 border-amber-500/30 border-t-amber-500 rounded-full animate-spin mb-4" />
            <Typography variant="caption" className="font-bold uppercase tracking-widest">
              {CM.synchronizingRegistry}
            </Typography>
          </div>
        ) : userlist.length === 0 ? (
          <EmptyState
            icon="person_off"
            title={CM.noUsersFound}
            description={CM.managementRegistryEmpty}
          />
        ) : (
          <>
            {/* Admin accounts */}
            {adminUsers.length > 0 && (
              <div>
                <SectionHeader title={CM.systemAdministrator} icon="verified_user" badge={adminUsers.length} />
                <div className="space-y-2">
                  {adminUsers.map(renderAdmin)}
                </div>
              </div>
            )}

            {/* Regular user accounts */}
            {regularRows.length > 0 && (
              <div>
                <SectionHeader title={CM.managementUsers} icon="group" badge={regularRows.length} />
                <div data-testid="cms-user-table" className="rounded-xl border border-slate-100 dark:border-white/5 overflow-hidden">
                  <Table columns={userColumns} data={regularRows} />
                </div>
              </div>
            )}

            {regularRows.length === 0 && adminUsers.length > 0 && (
              <div>
                <SectionHeader title={CM.managementUsers} icon="group" />
                <button
                  onClick={handleAddUser}
                  className="w-full flex items-center gap-3 px-4 py-3.5 rounded-2xl border border-dashed border-slate-200 dark:border-white/8 bg-slate-50/50 dark:bg-white/1 text-slate-400 hover:border-amber-500/50 hover:text-amber-500 hover:bg-amber-500/4 transition-all group/add"
                >
                  <div className="w-8 h-8 rounded-lg border border-dashed border-slate-300 dark:border-white/10 flex items-center justify-center group-hover/add:border-amber-500/50 transition-all">
                    <Icon name="add" size="15px" weight={300} />
                  </div>
                  <span className="text-15 font-bold">{CM.addManagementUserBtn}</span>
                </button>
              </div>
            )}
          </>
        )}
      </div>
    </Modal>
  );
}
