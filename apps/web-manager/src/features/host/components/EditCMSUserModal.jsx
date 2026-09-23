import { useState, useEffect } from 'react';
import { useSelector, useDispatch, shallowEqual } from 'react-redux';
import {
  addCmsUser,
  updateCmsUser,
  setHostPassword,
  fetchCmsUsers,
  closeEditCmsUserModal
} from '../hostSlice';

import { Modal } from '../../../components/ds/layout/Modal';
import { Button } from '../../../components/ds/foundation/Button';
import { Input } from '../../../components/ds/forms/Input';
import { Select } from '../../../components/ds/forms/Select';
import { SectionHeader } from '../../../components/ds/foundation/SectionHeader';
import { InfoBanner } from '../../../components/ds/foundation/InfoBanner';
import { useActionState } from '../../../infrastructure/hooks/useActionState';
import {
  ModalStatusLoading,
  ModalStatusSuccess,
  ModalStatusError
} from '../../../components/ds/feedback/ActionStatus';
import { useCM } from '../../../constants/useCM';

export default function EditCMSUserModal() {
  const CM = useCM();
  const AUTH_OPTIONS = [
    { value: 'none', label: CM.noAccess },
    { value: 'monitor', label: CM.monitorOnly },
    { value: 'admin', label: CM.fullControl },
  ];
  const DB_CREATE_OPTIONS = [
    { value: 'none', label: CM.noAccess },
    { value: 'admin', label: CM.fullControl },
  ];
  const dispatch = useDispatch();
  const {
    isEditCmsUserModalOpen,
    selectedHostUid,
    cmsUserToEdit,
  } = useSelector((state) => state.host, shallowEqual);

  const isOpen = isEditCmsUserModalOpen;
  const isEditMode = !!cmsUserToEdit?.user;
  const editUser = cmsUserToEdit?.user;
  const username = isEditMode ? (editUser?.id || editUser?.name || editUser['@id'] || editUser.targetid || '') : '';
  const isAdmin = isEditMode && username === 'admin';

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

  const [formData, setFormData] = useState({
    targetid: '',
    password: '',
    confirmPassword: '',
    casauth: 'none',
    dbcreate: 'none',
    statusmonitorauth: 'none',
  });

  useEffect(() => {
    if (isOpen) {
      resetAction();
      if (isEditMode && editUser) {
        const id = editUser.id || editUser.name || editUser['@id'] || editUser.targetid || '';
        const cas = editUser.casauth || editUser['@casauth'] || 'none';
        const dbc = editUser.dbcreate || editUser['@dbcreate'] || 'none';
        const sm = editUser.statusmonitorauth || editUser['@statusmonitorauth'] || 'none';

        setFormData({
          targetid: id,
          password: '',
          confirmPassword: '',
          casauth: cas,
          dbcreate: dbc,
          statusmonitorauth: sm,
        });
      } else {
        setFormData({
          targetid: '',
          password: '',
          confirmPassword: '',
          casauth: 'none',
          dbcreate: 'none',
          statusmonitorauth: 'none',
        });
      }
    }
  }, [isOpen, isEditMode, editUser, resetAction]);

  const passwordMismatch = formData.password !== formData.confirmPassword;
  const canSave = formData.targetid && (!isEditMode ? !!formData.password : true) && !passwordMismatch;

  const handleSave = async () => {
    if (!canSave) return;
    startAction();
    try {
      if (isEditMode) {
        if (formData.password) {
          await dispatch(setHostPassword({
            hostUid: selectedHostUid,
            payload: { targetid: formData.targetid, newpassword: formData.password }
          })).unwrap();
        }
        if (!isAdmin) {
          await dispatch(updateCmsUser({
            hostUid: selectedHostUid,
            payload: {
              targetid: formData.targetid,
              casauth: formData.casauth,
              dbcreate: formData.dbcreate,
              statusmonitorauth: formData.statusmonitorauth,
              dbauth: editUser.dbauth ?? editUser['@dbauth'] ?? [],
            }
          })).unwrap();
        }
        endSuccess(CM.userUpdatedSuccessMsg(formData.targetid));
      } else {
        await dispatch(addCmsUser({
          hostUid: selectedHostUid,
          payload: {
            targetid: formData.targetid,
            password: formData.password,
            casauth: formData.casauth,
            dbcreate: formData.dbcreate,
            statusmonitorauth: formData.statusmonitorauth,
          }
        })).unwrap();
        endSuccess(CM.userCreatedSuccessMsg(formData.targetid));
      }
      dispatch(fetchCmsUsers(selectedHostUid));
    } catch (err) {
      endError(err?.message || CM.synchronizationFailed);
    }
  };

  const handleClose = () => dispatch(closeEditCmsUserModal());

  if (!isOpen) return null;

  if (isLoading) return (
    <Modal isOpen title={isEditMode ? CM.savingChanges : CM.creatingUser} icon="person" onClose={resetAction} maxWidth="500px" showCloseButton={false}>
      <ModalStatusLoading title={isEditMode ? CM.updating : CM.creating} />
    </Modal>
  );

  if (isSuccess) return (
    <Modal isOpen title={CM.success} icon="check_circle" iconVariant="success" onClose={handleClose} maxWidth="500px" testId="edit-cms-user">
      <ModalStatusSuccess title={CM.operationComplete} onConfirm={handleClose} />
    </Modal>
  );

  if (isError) return (
    <Modal isOpen title={CM.error} icon="error" iconVariant="danger" onClose={resetAction} maxWidth="500px">
      <ModalStatusError title={CM.failure} error={actionError} guidance={CM.cmsUserGuidance} onRetry={handleSave} onCancel={resetAction} />
    </Modal>
  );

  return (
    <Modal
      isOpen={isOpen}
      onClose={handleClose}
      onSubmit={handleSave}
      submitDisabled={!canSave}
      title={isEditMode ? CM.editUser : CM.addUser}
      subtitle={isEditMode ? CM.editingUser(username) : CM.createManagementAccount}
      icon={isEditMode ? 'manage_accounts' : 'person_add'}
      maxWidth="540px"
      testId="edit-cms-user"
      footer={
        <div className="flex justify-end gap-2 w-full">
          <Button data-testid="edit-cms-user-cancel-btn" variant="ghost" onClick={handleClose}>{CM.cancel}</Button>
          <Button data-testid="edit-cms-user-save-btn" onClick={handleSave} disabled={!canSave}>
            {isEditMode ? CM.saveChanges : CM.addUser}
          </Button>
        </div>
      }
    >
      <div className="space-y-6">
        {isAdmin && (
          <div className="px-1">
            <InfoBanner title={CM.administratorAccount}>
              {CM.primaryAdminNotice}
            </InfoBanner>
          </div>
        )}

        {/* Account Info */}
        <section>
          <SectionHeader title={CM.accountInformation} icon="person" />
          <div className="space-y-4 px-1">
            <Input
              data-testid="edit-cms-user-targetid-input"
              label={CM.loginIdLabel}
              value={formData.targetid}
              onChange={(e) => setFormData(p => ({ ...p, targetid: e.target.value }))}
              disabled={isEditMode}
              icon="badge"
              required
            />
            <div className="grid grid-cols-2 gap-4">
              <Input
                data-testid="edit-cms-user-password-input"
                label={CM.password}
                type="password"
                value={formData.password}
                onChange={(e) => setFormData(p => ({ ...p, password: e.target.value }))}
                placeholder={isEditMode ? CM.passwordConfirm : CM.password}
                icon="lock"
                required={!isEditMode}
                error={passwordMismatch && formData.confirmPassword ? CM.passwordsDoNotMatch : null}
              />
              <Input
                data-testid="edit-cms-user-confirm-password-input"
                label={CM.passwordConfirm}
                type="password"
                value={formData.confirmPassword}
                onChange={(e) => setFormData(p => ({ ...p, confirmPassword: e.target.value }))}
                placeholder={CM.repeatPassword}
                icon="lock_clock"
                required={!!formData.password}
                error={passwordMismatch && formData.confirmPassword ? CM.passwordsDoNotMatch : null}
              />
            </div>
          </div>
        </section>

        {/* Permissions */}
        {!isAdmin && (
          <section>
            <SectionHeader title={CM.permissions} icon="shield" />
            <div className="px-1">
              <div className="rounded-xl border border-slate-200 dark:border-white/10 bg-slate-50/70 dark:bg-white/2 p-4">
                <div className="grid grid-cols-1 gap-4">
                  <Select
                    testId="edit-cms-user-dbcreate-select"
                    label={CM.dbCreatePermission}
                    options={DB_CREATE_OPTIONS}
                    value={formData.dbcreate}
                    onChange={(e) => setFormData(p => ({ ...p, dbcreate: e.target.value }))}
                    icon="storage"
                  />
                  <Select
                    label={CM.brokerPermission}
                    options={AUTH_OPTIONS}
                    value={formData.casauth}
                    onChange={(e) => setFormData(p => ({ ...p, casauth: e.target.value }))}
                    icon="hub"
                  />
                  <Select
                    label={CM.monitoringPermission}
                    options={DB_CREATE_OPTIONS}
                    value={formData.statusmonitorauth}
                    onChange={(e) => setFormData(p => ({ ...p, statusmonitorauth: e.target.value }))}
                    icon="monitor_heart"
                  />
                </div>
              </div>
            </div>
          </section>
        )}
      </div>
    </Modal>
  );
}
