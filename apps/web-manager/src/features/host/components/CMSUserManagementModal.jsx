import { useEffect } from 'react';
import { useSelector, useDispatch, shallowEqual } from 'react-redux';
import { 
  fetchCmsUsers, 
  deleteCmsUser,
  openEditCmsUserModal,
  closeCmsUserManagementModal 
} from '../hostSlice';

import { Icon } from '../../../components/ds/foundation/Icon';
import { Modal } from '../../../components/ds/layout/Modal';
import { Button } from '../../../components/ds/foundation/Button';
import { Typography } from '../../../components/ds/foundation/Typography';
import { SectionHeader } from '../../../components/ds/foundation/SectionHeader';
import { useCM } from '../../../constants/useCM';

export default function CMSUserManagementModal() {
  const CM = useCM();
  const dispatch = useDispatch();
  const { 
    isCmsUserManagementModalOpen, 
    selectedHostUid, 
    hosts,
    cmsUsers, 
    cmsUsersLoading 
  } = useSelector((state) => state.host, shallowEqual);

  const isOpen = isCmsUserManagementModalOpen;
  const userlist = cmsUsers[selectedHostUid] || [];
  const isLoading = cmsUsersLoading[selectedHostUid];
  const selectedHost = hosts.find(h => h.uid === selectedHostUid);

  useEffect(() => {
    if (isOpen && selectedHostUid) {
      dispatch(fetchCmsUsers(selectedHostUid));
    }
  }, [isOpen, selectedHostUid, dispatch]);

  const handleAddUser = () => {
    dispatch(openEditCmsUserModal({ hostUid: selectedHostUid, user: null }));
  };

  const handleEditUser = (user) => {
    dispatch(openEditCmsUserModal({ hostUid: selectedHostUid, user }));
  };

  const handleDeleteUser = (username) => {
    if (username === 'admin') {
      alert(CM.primaryAdminCannotDelete);
      return;
    }
    if (window.confirm(CM.confirmDeleteCmsUser(username))) {
      dispatch(deleteCmsUser({ hostUid: selectedHostUid, targetid: username }));
    }
  };

  if (!isOpen) return null;

  const adminUsers = userlist.filter(u => {
    const name = typeof u === 'string' ? u : (u.name || u.id || u['@id'] || u.targetid || '');
    return name.toLowerCase() === 'admin';
  });
  const regularUsers = userlist.filter(u => {
    const name = typeof u === 'string' ? u : (u.name || u.id || u['@id'] || u.targetid || '');
    return name.toLowerCase() !== 'admin' && name !== '';
  });

  const renderUser = (user) => {
    // CMS often uses @id or targetid for the username in the response
    const username = typeof user === 'string' 
      ? user 
      : (user.name || user.id || user['@id'] || user.targetid || 'Unknown');
    const isAdmin = username.toLowerCase() === 'admin';
    const casauth = user?.casauth || user?.['@casauth'] || 'none';
    const dbcreate = user?.dbcreate || user?.['@dbcreate'] || 'none';
    const statusmonitorauth = user?.statusmonitorauth || user?.['@statusmonitorauth'] || 'none';

    return (
      <div
        key={username}
        data-testid={`cms-user-${username.toLowerCase() === 'admin' ? 'admin' : username}`}
        className={`group relative flex items-center gap-4 px-4 py-3.5 rounded-2xl border transition-all duration-200 cursor-default ${
          isAdmin
            ? 'bg-amber-500/4 border-amber-500/20 hover:border-amber-500/40'
            : 'bg-white dark:bg-white/1 border-slate-100 dark:border-white/5 hover:border-slate-200 dark:hover:border-white/12 hover:shadow-xs'
        }`}
      >
        {/* Avatar */}
        <div className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 border transition-all ${
          isAdmin
            ? 'bg-amber-500 border-amber-500/40 shadow-[0_0_12px_rgba(245,158,11,0.2)]'
            : 'bg-slate-100 dark:bg-white/5 border-slate-200 dark:border-white/8 group-hover:bg-amber-500/8 group-hover:border-amber-500/20'
        }`}>
          <Icon
            name={isAdmin ? 'verified_user' : 'person'}
            size="17px"
            weight={isAdmin ? 400 : 300}
            className={isAdmin ? 'text-slate-900' : 'text-slate-400 group-hover:text-amber-500'}
          />
        </div>

        {/* Info */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-0.5">
            <Typography variant="p" className="font-black text-15 text-slate-800 dark:text-white truncate">
              {username}
            </Typography>
            {isAdmin && (
              <span className="shrink-0 text-11 font-black px-1.5 py-0.5 rounded-sm bg-amber-500/10 border border-amber-500/20 text-amber-500 uppercase tracking-wider">
                {CM.admin}
              </span>
            )}
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {!isAdmin && (
              <>
                <span className="flex items-center gap-1 text-12 text-slate-400 font-medium">
                  <Icon name="storage" size="11px" weight={300} />
                  <span>{CM.dbCreatePermission}: <span className="font-bold text-slate-600 dark:text-slate-300 capitalize">{dbcreate}</span></span>
                </span>
                <span className="w-px h-3 bg-slate-200 dark:bg-white/8" />
                <span className="flex items-center gap-1 text-12 text-slate-400 font-medium">
                  <Icon name="hub" size="11px" weight={300} />
                  <span>{CM.brokerPermission}: <span className="font-bold text-slate-600 dark:text-slate-300 capitalize">{casauth}</span></span>
                </span>
                <span className="w-px h-3 bg-slate-200 dark:bg-white/8" />
                <span className="flex items-center gap-1 text-12 text-slate-400 font-medium">
                  <Icon name="monitor_heart" size="11px" weight={300} />
                  <span>{CM.monitoringPermission}: <span className="font-bold text-slate-600 dark:text-slate-300 capitalize">{statusmonitorauth}</span></span>
                </span>
              </>
            )}
            {isAdmin && (
              <span className="text-12 text-slate-400 font-medium">{CM.fullSystemAuthorization}</span>
            )}
          </div>
        </div>

        {/* Actions — appear on hover */}
        <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity duration-150 shrink-0">
          <button
            data-testid={`cms-user-${username}-edit-btn`}
            onClick={() => handleEditUser(user)}
            className="w-8 h-8 rounded-lg flex items-center justify-center text-slate-400 hover:text-amber-500 hover:bg-amber-500/10 transition-all"
            title={CM.editUser}
          >
            <Icon name="edit" size="15px" weight={300} />
          </button>
          {!isAdmin && (
            <button
              data-testid={`cms-user-${username}-delete-btn`}
              onClick={() => handleDeleteUser(username)}
              className="w-8 h-8 rounded-lg flex items-center justify-center text-slate-400 hover:text-rose-500 hover:bg-rose-500/10 transition-all"
              title={CM.deleteUser}
            >
              <Icon name="delete" size="15px" weight={300} />
            </button>
          )}
        </div>
      </div>
    );
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={() => dispatch(closeCmsUserManagementModal())}
      title={CM.userManagement}
      subtitle={selectedHost?.alias || selectedHostUid}
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
              {CM.addUser}
            </Button>
          </div>
        </div>
      }
    >
      <div className="space-y-8 pb-2 animate-in fade-in slide-in-from-bottom-2 duration-300">

        {isLoading && userlist.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20 opacity-30">
            <div className="size-10 border-2 border-amber-500/30 border-t-amber-500 rounded-full animate-spin mb-4" />
            <Typography variant="caption" className="font-bold uppercase tracking-widest">
              {CM.synchronizingRegistry}
            </Typography>
          </div>
        ) : userlist.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20 opacity-20">
            <Icon name="person_off" size="xl" className="mb-3" />
            <Typography variant="p" className="font-black uppercase tracking-widest text-13">
              {CM.noUsersFound}
            </Typography>
            <Typography variant="caption" className="mt-1">
              {CM.managementRegistryEmpty}
            </Typography>
          </div>
        ) : (
          <>
            {/* Admin accounts */}
            {adminUsers.length > 0 && (
              <div>
                <SectionHeader title={CM.systemAdministrator} icon="verified_user" badge={adminUsers.length} />
                <div className="space-y-2">
                  {adminUsers.map(renderUser)}
                </div>
              </div>
            )}

            {/* Regular user accounts */}
            {regularUsers.length > 0 && (
              <div>
                <SectionHeader title={CM.managementUsers} icon="group" badge={regularUsers.length} />
                <div className="space-y-2">
                  {regularUsers.map(renderUser)}
                </div>
              </div>
            )}

            {regularUsers.length === 0 && adminUsers.length > 0 && (
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
