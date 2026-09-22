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

  const isValidNewPassword = (password) =>
    password.trim().length >= 8 && /[A-Za-z]/.test(password) && /\d/.test(password);

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
      if (!isValidNewPassword(passwords.newPassword)) {
        setError(CM.weakNewPasswordMsg);
        return;
      }
      setLoading(true);
      await authApi.updatePassword(passwords.oldPassword, passwords.newPassword);
      setPasswords({ oldPassword: '', newPassword: '', confirmPassword: '' });
      setEditMode(null);
      setLoading(false);
    } catch (err) {
      const code = err.response?.data?.code;
      if (code === 'OLD_PASSWORD_MISMATCH') {
        setError(CM.currentPasswordIncorrectMsg);
      } else if (code === 'BAD_NEW_PASSWORD') {
        setError(CM.weakNewPasswordMsg);
      } else {
        setError(CM.unexpectedErrorMsg);
      }
      setLoading(false);
    }
  };

  const handleCancel = () => {
    setPasswords({ oldPassword: '', newPassword: '', confirmPassword: '' });
    setEditMode(null);
    setError(null);
  };

  // Blocks the same three conditions handleSave itself checks on submit
  // (empty fields, mismatch, policy) client-side, ahead of any request —
  // handleSave's own checks stay as-is as the authoritative guard (e.g.
  // against a stale click), this only keeps the button disabled until they
  // would pass.
  const canSubmitPassword =
    !!passwords.oldPassword &&
    !!passwords.newPassword &&
    !!passwords.confirmPassword &&
    passwords.newPassword === passwords.confirmPassword &&
    isValidNewPassword(passwords.newPassword);

  const footer = editMode ? (
    <>
      <Button variant="ghost" onClick={handleCancel} disabled={loading || globalLoading}>
        {CM.cancel}
      </Button>
      <Button
        data-testid="change-password-submit-btn"
        onClick={handleSave}
        loading={loading || globalLoading}
        disabled={!canSubmitPassword}
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
      submitDisabled={!canSubmitPassword || loading || globalLoading}
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
                data-testid="change-password-old-input"
                type="password"
                label={CM.currentPasswordLabel}
                icon="lock"
                value={passwords.oldPassword}
                onChange={(e) => setPasswords((prev) => ({ ...prev, oldPassword: e.target.value }))}
                disabled={loading || globalLoading}
                placeholder="••••••••"
              />
              <Input
                data-testid="change-password-new-input"
                type="password"
                label={CM.newPassword}
                icon={passwords.newPassword && isValidNewPassword(passwords.newPassword) ? 'verified_user' : 'key'}
                value={passwords.newPassword}
                onChange={(e) => setPasswords((prev) => ({ ...prev, newPassword: e.target.value }))}
                disabled={loading || globalLoading}
                placeholder="••••••••"
              />

              {/* Live pass/fail hint against the actual password policy —
                  same rule and pattern as RegisterPage's live hint. Hidden
                  once the banner is already showing this exact message, so
                  the same fact isn't said twice on screen. */}
              {passwords.newPassword && error !== CM.weakNewPasswordMsg && (
                <div className="flex items-center gap-1.5 -mt-1.5 animate-in fade-in duration-200">
                  <Icon
                    name={isValidNewPassword(passwords.newPassword) ? 'check_circle' : 'cancel'}
                    size="xs"
                    weight={300}
                    className={isValidNewPassword(passwords.newPassword) ? 'text-emerald-500' : 'text-rose-500'}
                  />
                  <p className={`text-11 font-bold uppercase tracking-widest font-mono ${isValidNewPassword(passwords.newPassword) ? 'text-emerald-500' : 'text-rose-500'}`}>
                    {isValidNewPassword(passwords.newPassword) ? CM.passwordMeetsRequirements : CM.passwordPolicyHint}
                  </p>
                </div>
              )}

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
