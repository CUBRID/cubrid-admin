import { useState } from 'react';
import { useDispatch } from 'react-redux';
import { Modal } from '../../../components/ds/layout/Modal';
import { Button } from '../../../components/ds/foundation/Button';
import { Input } from '../../../components/ds/forms/Input';
import { Icon } from '../../../components/ds/foundation/Icon';
import { useCM } from '../../../constants/useCM';
import { requestErrorText } from '../../../infrastructure/errors/serverErrorText';
import { isValidAccountPassword } from '../../admin/accountPasswordPolicy';
import { authApi } from '../authApi';
import { logoutUser, passwordChangeCompleted } from '../authSlice';

/**
 * Shown instead of the dashboard while an admin-set (temporary) password is
 * still in place: the server refuses every other request until the user sets
 * their own. The temporary password isn't asked again: it was just used to
 * log in. Logging out is the only other way out.
 */
export default function ForcedPasswordChangePage() {
  const CM = useCM();
  const dispatch = useDispatch();
  const [next, setNext] = useState('');
  const [confirm, setConfirm] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);

  const nextOk = isValidAccountPassword(next);
  const canSubmit = !busy && nextOk && next === confirm;

  const handleSubmit = async () => {
    if (!canSubmit) return;
    setBusy(true);
    setError(null);
    try {
      await authApi.setInitialPassword(next);
      dispatch(passwordChangeCompleted());
    } catch (err) {
      setError(requestErrorText(err, CM));
      setBusy(false);
    }
  };

  const handleLogout = async () => {
    await dispatch(logoutUser());
    window.location.href = '/login';
  };

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-background-dark">
      <Modal
        isOpen
        onClose={() => undefined}
        showCloseButton={false}
        title={CM.forcedPasswordTitle}
        icon="lock_reset"
        maxWidth="max-w-[420px]"
        testId="forced-password-change"
        onSubmit={handleSubmit}
        submitDisabled={!canSubmit}
        footer={
          <>
            <Button variant="ghost" icon="logout" onClick={handleLogout} disabled={busy}>
              {CM.logout}
            </Button>
            <Button
              data-testid="forced-password-submit-btn"
              icon="check_circle"
              loading={busy}
              disabled={!canSubmit}
              onClick={handleSubmit}
            >
              {CM.forcedPasswordSubmit}
            </Button>
          </>
        }
      >
        <div className="space-y-3 p-1">
          <p className="text-13 text-slate-500 dark:text-slate-400 leading-relaxed">{CM.forcedPasswordMsg}</p>
          {error && (
            <div role="alert" className="flex items-start gap-3 px-4 py-3 bg-rose-500/5 border border-rose-500/15 rounded-xl">
              <Icon name="error_outline" size="sm" weight={300} className="text-rose-500 shrink-0 mt-0.5" />
              <p className="text-13 text-rose-500 font-medium flex-1 leading-relaxed">{error}</p>
            </div>
          )}
          <Input
            data-testid="forced-password-new-input"
            type="password"
            label={CM.newPassword}
            autoFocus
            icon={next && nextOk ? 'verified_user' : 'key'}
            value={next}
            onChange={(e) => setNext(e.target.value)}
            disabled={busy}
            placeholder="••••••••"
            error={next && !nextOk ? CM.passwordPolicyHint : null}
          />
          <Input
            data-testid="forced-password-confirm-input"
            type="password"
            label={CM.confirmNewPassword}
            icon="key_vertical"
            value={confirm}
            onChange={(e) => setConfirm(e.target.value)}
            disabled={busy}
            placeholder="••••••••"
            error={confirm && next !== confirm ? CM.passwordsDoNotMatch : null}
          />
        </div>
      </Modal>
    </div>
  );
}
