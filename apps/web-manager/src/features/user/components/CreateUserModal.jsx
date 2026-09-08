import { useState, useEffect, useRef } from 'react';
import { useSelector, useDispatch, shallowEqual } from 'react-redux';
import { createDatabaseUser, updateDatabaseUser, fetchDatabaseUsers } from '../userSlice';
import { dbKey } from '../../database/dbKey';

import { Icon } from '../../../components/ds/foundation/Icon';
import { Modal } from '../../../components/ds/layout/Modal';
import { Button } from '../../../components/ds/foundation/Button';
import { Input } from '../../../components/ds/forms/Input';
import { Typography } from '../../../components/ds/foundation/Typography';
import { useActionState } from '../../../infrastructure/hooks/useActionState';
import {
  ModalStatusLoading,
  ModalStatusSuccess,
  ModalStatusError
} from '../../../components/ds/feedback/ActionStatus';
import { useCM } from '../../../constants/useCM';

export default function CreateUserModal({ isOpen, onClose, dbname, editingUser }) {
  const CM = useCM();
  const dispatch = useDispatch();
  const isEditMode = !!editingUser;
  const { selectedHostUid } = useSelector((state) => state.host, shallowEqual);
  const { databaseUsers: allUsers } = useSelector((state) => state.user, shallowEqual);
  const databaseUsers = allUsers[dbKey(selectedHostUid, dbname)] || [];

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
    name: '',
    password: '',
    confirmPassword: '',
    memo: '',
  });
  const [errors, setErrors] = useState({});

  // Runs once per modal opening — NOT on every databaseUsers change. A prior
  // version depended on databaseUsers.length here, so the post-save
  // dispatch(fetchDatabaseUsers(...)) below (which changes that length) kept
  // re-triggering this effect and calling resetAction(), silently reverting
  // the just-shown success screen back to a blank form.
  const hasInitializedRef = useRef(false);
  useEffect(() => {
    if (!isOpen) {
      hasInitializedRef.current = false;
      return;
    }
    if (hasInitializedRef.current) return;
    hasInitializedRef.current = true;
    setErrors({});

    if (dbname && selectedHostUid) {
      resetAction();
      dispatch(fetchDatabaseUsers({ hostUid: selectedHostUid, dbname }));
    }

    if (!isEditMode) {
      setFormData({ name: '', password: '', confirmPassword: '', memo: '' });
    }
  }, [isOpen, dbname, selectedHostUid, isEditMode, resetAction]);

  // Reacts to the user list arriving (it may still be loading when the modal
  // opens) — in edit mode, prefills the form. Uses a guard ref instead of
  // depending on databaseUsers.length directly, so it doesn't clobber
  // in-progress edits on later refetches.
  const prefilledEditUserRef = useRef(null);
  useEffect(() => {
    if (!isOpen || !isEditMode || databaseUsers.length === 0) return;
    if (prefilledEditUserRef.current === editingUser) return;
    const userToEdit = databaseUsers.find(u => (u.name || u) === editingUser);
    if (!userToEdit) return;
    prefilledEditUserRef.current = editingUser;

    setFormData({
      name: userToEdit.name || userToEdit,
      password: '',
      confirmPassword: '',
      memo: userToEdit.comment || '',
    });
  }, [isOpen, databaseUsers, isEditMode, editingUser]);

  useEffect(() => {
    if (!isOpen) prefilledEditUserRef.current = null;
  }, [isOpen]);

  if (!isOpen) return null;

  const handleInputChange = (e) => {
    const { name, value } = e.target;
    setFormData(prev => ({ ...prev, [name]: value }));
    if (errors[name]) setErrors(prev => ({ ...prev, [name]: '' }));
  };

  // Password is required when creating a new user; when editing, blank means
  // "leave unchanged" (see the leaveBlankToKeep hint), so it's optional there.
  const validate = () => {
    const errs = {};
    if (!formData.name.trim()) errs.name = CM.usernameRequired;
    if (!isEditMode && !formData.password) errs.password = CM.passwordRequired;
    if (formData.password && formData.password !== formData.confirmPassword) {
      errs.confirmPassword = CM.passwordsDoNotMatch;
    }
    return errs;
  };

  const handleSave = async () => {
    const errs = validate();
    if (Object.keys(errs).length > 0) {
      setErrors(errs);
      return;
    }
    startAction();
    // Groups/members and per-object authorization are deprecated CMS
    // functionality — CMS still requires the fields to be present, so keep
    // sending empty defaults rather than dropping them from the request.
    try {
      if (isEditMode) {
        await dispatch(updateDatabaseUser({ hostUid: selectedHostUid, dbname, userName: editingUser, payload: { userpass: formData.password, groups: { group: [] }, authorization: [] } })).unwrap();
        endSuccess(CM.userUpdatedSuccessMsg(editingUser));
      } else {
        await dispatch(createDatabaseUser({ hostUid: selectedHostUid, dbname, payload: { username: formData.name, userpass: formData.password, groups: { group: [] }, authorization: [] } })).unwrap();
        endSuccess(CM.userCreatedSuccessMsg(formData.name));
      }
      dispatch(fetchDatabaseUsers({ hostUid: selectedHostUid, dbname }));
    } catch (err) {
      endError(typeof err === 'string' ? err : (err.message || CM.identitySyncFailedMsg));
    }
  };

  // ─── Lifecycle states ───────────────────────────────────────────────────────
  if (isLoading) {
    return (
      <Modal isOpen title={isEditMode ? CM.savingChanges : CM.creatingUser} icon="person_add" onClose={onClose} maxWidth="max-w-[520px]" showCloseButton={false}>
        <ModalStatusLoading title={isEditMode ? CM.savingChanges : CM.creatingUser} subtitle={`@${formData.name || editingUser} → ${dbname}`} />
      </Modal>
    );
  }

  if (isSuccess) {
    return (
      <Modal isOpen title={CM.success} icon="check_circle" iconVariant="success" onClose={onClose} maxWidth="max-w-[520px]" testId="create-user">
        <ModalStatusSuccess
          title={isEditMode ? CM.userUpdated : CM.userCreated}
          message={`@${isEditMode ? editingUser : formData.name}`}
          onConfirm={onClose}
          confirmText={CM.ok}
        />
      </Modal>
    );
  }

  if (isError) {
    return (
      <Modal isOpen title={CM.error} icon="error" iconVariant="danger" onClose={resetAction} maxWidth="max-w-[520px]">
        <ModalStatusError title={CM.operationFailed} error={actionError} guidance={!isEditMode ? CM.createUserGuidance : undefined} onRetry={handleSave} onCancel={resetAction} retryText={CM.retry} cancelText={CM.dismiss} />
      </Modal>
    );
  }

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      onSubmit={handleSave}
      title={isEditMode ? CM.editUser : CM.createUser}
      subtitle={dbname}
      icon={isEditMode ? 'manage_accounts' : 'person_add'}
      maxWidth="max-w-[520px]"
      testId="create-user"
      footer={
        <div className="flex items-center justify-between w-full">
          <div className="flex items-center gap-2 text-13 text-slate-400 font-medium">
            <Icon name="database" size="xs" className="opacity-40" />
            <span className="opacity-60 font-mono">{dbname}</span>
          </div>
          <div className="flex gap-2">
            <Button data-testid="create-user-cancel-btn" variant="ghost" onClick={onClose}>{CM.cancel}</Button>
            <Button data-testid="create-user-save-btn" onClick={handleSave} icon={isEditMode ? 'save' : 'person_add'} disabled={!formData.name} className="min-w-[140px]">
              {isEditMode ? CM.saveChanges : CM.createUser}
            </Button>
          </div>
        </div>
      }
    >
      <div className="space-y-6">

        {/* Identity hero card */}
        <div className="flex items-center gap-4 p-4 rounded-2xl bg-gradient-to-r from-amber-500/8 to-transparent border border-amber-500/15">
          <div className="w-12 h-12 rounded-2xl bg-amber-500/15 border border-amber-500/25 flex items-center justify-center shrink-0">
            <Icon name={isEditMode ? 'manage_accounts' : 'person_add'} size="md" className="text-amber-500" />
          </div>
          <div>
            <p className="text-15 font-black text-slate-800 dark:text-white">
              {isEditMode ? CM.editingUser(editingUser) : CM.newDatabaseUserTitle}
            </p>
            <p className="text-13 text-slate-400 mt-0.5">
              {isEditMode
                ? CM.updateCredentialsSubtitle
                : CM.defineIdentitySubtitle}
            </p>
          </div>
        </div>

        {/* ── Account details ─────────────────────────────────────────── */}
        <section className="space-y-3">
          <div className="flex items-center gap-2.5 mb-1">
            <span className="w-1 h-3.5 rounded-full bg-amber-500 shrink-0" />
            <Typography variant="caption" className="font-black text-slate-600 dark:text-slate-300 uppercase tracking-widest text-12">
              {CM.accountSectionLabel}
            </Typography>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <Input
              data-testid="create-user-username-input"
              label={CM.username}
              name="name"
              value={formData.name}
              onChange={handleInputChange}
              error={errors.name}
              placeholder={CM.usernamePlaceholderHint}
              disabled={isEditMode}
              required
            />
            <Input
              label={CM.description}
              name="memo"
              value={formData.memo}
              onChange={handleInputChange}
              placeholder={CM.rolePurposePlaceholder}
            />
          </div>
        </section>

        {/* ── Security credentials ─────────────────────────────────────── */}
        <section className="space-y-3">
          <div className="flex items-center gap-2.5 mb-1">
            <span className="w-1 h-3.5 rounded-full bg-slate-400 shrink-0" />
            <Typography variant="caption" className="font-black text-slate-600 dark:text-slate-300 uppercase tracking-widest text-12">
              {CM.password}
            </Typography>
            {isEditMode && (
              <span className="text-11 font-bold text-slate-400 bg-slate-100 dark:bg-white/5 px-2 py-0.5 rounded-full">
                {CM.leaveBlankToKeep}
              </span>
            )}
          </div>
          <div className="grid grid-cols-2 gap-4">
            <Input data-testid="create-user-password-input" label={CM.newPassword} type="password" name="password" value={formData.password} onChange={handleInputChange} error={errors.password} placeholder="••••••••" required={!isEditMode} />
            <Input data-testid="create-user-confirm-password-input" label={CM.passwordConfirm} type="password" name="confirmPassword" value={formData.confirmPassword} onChange={handleInputChange} error={errors.confirmPassword} placeholder="••••••••" required={!isEditMode} />
          </div>
          {formData.password && formData.confirmPassword && formData.password !== formData.confirmPassword && (
            <div className="flex items-center gap-2 text-13 text-rose-500 font-bold px-1">
              <Icon name="error" size="xs" />
              {CM.passwordsDoNotMatch}
            </div>
          )}
        </section>
      </div>
    </Modal>
  );
}
