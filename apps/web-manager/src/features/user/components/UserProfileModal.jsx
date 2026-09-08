import { useState, useEffect } from 'react';
import { useSelector, shallowEqual } from 'react-redux';
import { authApi } from '../../auth/authApi';

import { Icon } from '../../../components/ds/foundation/Icon';
import { Modal } from '../../../components/ds/layout/Modal';
import { Button } from '../../../components/ds/foundation/Button';
import { Input } from '../../../components/ds/forms/Input';
import { SectionHeader } from '../../../components/ds/foundation/SectionHeader';
import { useCM } from '../../../constants/useCM';

export default function UserProfileModal({ isOpen, onClose }) {
  const CM = useCM();
  const { user } = useSelector((state) => state.auth, shallowEqual);
  const [editMode, setEditMode] = useState(null); // 'password' | null

  const [profile, setProfile] = useState({ id: user?.id || '' });
  const [passwords, setPasswords] = useState({
    oldPassword: '',
    newPassword: '',
    confirmPassword: '',
  });

  useEffect(() => {
    if (isOpen) {
      setProfile({ id: user?.id || '' });
      setPasswords({ oldPassword: '', newPassword: '', confirmPassword: '' });
      setEditMode(null);
      setError(null);
    }
  }, [isOpen, user]);

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const globalLoading = useSelector((state) => state.auth.loading);
  const globalError = useSelector((state) => state.auth.error);

  if (!isOpen) return null;

  const handleSave = async () => {
    setError(null);
    try {
      if (!passwords.oldPassword || !passwords.newPassword || !passwords.confirmPassword) {
        setError(CM.fillAllPasswordFieldsMsg);
        return;
      }
      if (passwords.newPassword !== passwords.confirmPassword) {
        setError(CM.newPasswordsDoNotMatchMsg);
        return;
      }
      setLoading(true);
      await authApi.updatePassword(passwords.oldPassword, passwords.newPassword);
      setPasswords({ oldPassword: '', newPassword: '', confirmPassword: '' });
      setEditMode(null);
      setLoading(false);
    } catch (err) {
      setError(err.response?.data?.message || CM.unexpectedErrorMsg);
      setLoading(false);
    }
  };

  const handleCancel = () => {
    setPasswords({ oldPassword: '', newPassword: '', confirmPassword: '' });
    setEditMode(null);
    setError(null);
  };

  const footer = editMode ? (
    <>
      <Button variant="ghost" onClick={handleCancel} disabled={loading || globalLoading}>
        {CM.cancel}
      </Button>
      <Button
        onClick={handleSave}
        loading={loading || globalLoading}
        icon="check_circle"
        className="min-w-[120px]"
      >
        {CM.updatePasswordBtn}
      </Button>
    </>
  ) : (
    <div className="flex gap-2 w-full">
      <Button variant="ghost" className="flex-1" onClick={() => setEditMode('password')}>
        {CM.changePassword}
      </Button>
    </div>
  );

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={editMode === 'password' ? CM.changePassword : CM.accountProfile}
      icon={editMode === 'password' ? 'lock_reset' : 'account_circle'}
      maxWidth="max-w-[420px]"
      onSubmit={editMode ? handleSave : undefined}
      footer={footer}
    >
      <div className="space-y-4 p-1">

        {/* Error Banner */}
        {(error || globalError) && (
          <div className="flex items-start gap-3 px-4 py-3 bg-rose-500/5 border border-rose-500/15 rounded-xl">
            <Icon name="error_outline" size="sm" weight={300} className="text-rose-500 shrink-0 mt-0.5" />
            <p className="text-13 text-rose-500 font-medium flex-1 leading-relaxed">{error || globalError}</p>
          </div>
        )}

        {/* View Mode */}
        {!editMode && (
          <>
            {/* Avatar / Identity Card */}
            <div className="flex items-center gap-4 p-4 rounded-xl bg-amber-500/5 border border-amber-500/10">
              <div className="w-12 h-12 rounded-xl bg-amber-500 flex items-center justify-center shrink-0 shadow-sm shadow-amber-500/30">
                <Icon name="person" size="25px" weight={400} className="text-white" />
              </div>
              <div className="min-w-0">
                <p className="text-16 font-black text-slate-800 dark:text-white tracking-tight truncate">
                  {profile.id || '—'}
                </p>
                <p className="text-12 font-semibold text-amber-600 dark:text-amber-400 uppercase tracking-widest mt-0.5">
                  {CM.administratorLabel}
                </p>
              </div>
            </div>

            {/* Info Card */}
            <div>
              <SectionHeader title={CM.accountDetails} icon="info" />
              <div className="rounded-xl border border-slate-200 dark:border-white/8 overflow-hidden">
              <div className="divide-y divide-slate-100 dark:divide-white/5">
                <div className="flex items-center px-4 py-3 gap-3">
                  <Icon name="badge" size="17px" weight={300} className="text-slate-400 shrink-0" />
                  <span className="text-13 text-slate-400 dark:text-slate-500 w-24 shrink-0">{CM.userIdLabel}</span>
                  <span className="text-13 font-bold text-slate-700 dark:text-slate-200 truncate">{profile.id || '—'}</span>
                </div>
              </div>
              </div>
            </div>
          </>
        )}

        {/* Change Password Mode */}
        {editMode === 'password' && (
          <div>
            <SectionHeader title={CM.securitySettings} icon="lock" />
            <div className="rounded-xl border border-slate-200 dark:border-white/8 overflow-hidden">
            <div className="p-4 space-y-3">
              <Input
                type="password"
                label={CM.currentPasswordLabel}
                icon="lock"
                value={passwords.oldPassword}
                onChange={(e) => setPasswords((prev) => ({ ...prev, oldPassword: e.target.value }))}
                disabled={loading || globalLoading}
                placeholder="••••••••"
              />
              <Input
                type="password"
                label={CM.newPassword}
                icon="key"
                value={passwords.newPassword}
                onChange={(e) => setPasswords((prev) => ({ ...prev, newPassword: e.target.value }))}
                disabled={loading || globalLoading}
                placeholder="••••••••"
              />
              <Input
                type="password"
                label={CM.confirmNewPassword}
                icon="key_vertical"
                value={passwords.confirmPassword}
                onChange={(e) => setPasswords((prev) => ({ ...prev, confirmPassword: e.target.value }))}
                disabled={loading || globalLoading}
                placeholder="••••••••"
              />
            </div>
          </div>
        </div>
      )}

      </div>
    </Modal>
  );
}
